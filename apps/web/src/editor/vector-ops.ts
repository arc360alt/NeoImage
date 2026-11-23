/**
 * Vector operations: converting layers to editable paths (Flatten), turning
 * strokes into filled outlines (Outline stroke), and boolean operations.
 *
 * Shape outlines use the same math the canvas draws with (layer-nodes.tsx),
 * so converted paths match what's on screen. Boolean operations run on
 * paper.js, which is loaded lazily the first time one is used.
 */
import { compose, type Vec } from "./matrix";
import { polygonPoints, starPoints, trianglePoints } from "./geometry";
import {
	classifyAnchor,
	ellipseSubpath,
	mapSubpaths,
	polygonSubpath,
	rectSubpath,
	segmentsOf,
	cubicAt,
	type Segment,
} from "./path";
import type { Layer, PathAnchor, PathLayer, ShapeLayer, Stroke, Subpath } from "./types";

/* ------------------------------ Conversions ------------------------------ */

/** The heart from layer-nodes.tsx (drawHeart) as anchors. */
function heartSubpath(w: number, h: number): Subpath {
	const a = (x: number, y: number, hin: Vec, hout: Vec): PathAnchor => ({
		x,
		y,
		handleIn: { x: hin.x - x, y: hin.y - y },
		handleOut: { x: hout.x - x, y: hout.y - y },
		type: "corner",
	});
	return {
		closed: true,
		anchors: [
			a(w / 2, h * 0.95, { x: w * 0.85, y: h * 0.68 }, { x: w * 0.15, y: h * 0.68 }),
			a(w * 0.12, h * 0.16, { x: -w * 0.05, y: h * 0.38 }, { x: w * 0.27, y: -h * 0.02 }),
			a(w / 2, h * 0.22, { x: w * 0.45, y: h * 0.05 }, { x: w * 0.55, y: h * 0.05 }),
			a(w * 0.88, h * 0.16, { x: w * 0.73, y: -h * 0.02 }, { x: w * 1.05, y: h * 0.38 }),
		],
	};
}

/** A shape preset's outline in its local box (what drawShapePath draws). */
export function shapeSubpaths(layer: ShapeLayer): Subpath[] {
	const { width: w, height: h } = layer;
	switch (layer.shape) {
		case "rect":
			return [rectSubpath(0, 0, w, h, layer.cornerRadius)];
		case "ellipse":
			return [ellipseSubpath(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2))];
		case "triangle":
			return [polygonSubpath(trianglePoints(w, h))];
		case "polygon":
			return [polygonSubpath(polygonPoints(w, h, layer.sides))];
		case "star":
			return [polygonSubpath(starPoints(w, h, layer.sides, layer.innerRatio))];
		case "heart":
			return [heartSubpath(w, h)];
		case "line":
		case "arrow": {
			const strokeWidth = layer.stroke.enabled ? layer.stroke.width : 0;
			const y = Math.max(strokeWidth, 1) / 2;
			const out: Subpath[] = [polygonSubpath([0, y, w, y], false)];
			if (layer.shape === "arrow") {
				const size = Math.max(strokeWidth * 3, 12);
				out.push(polygonSubpath([w - size, y - size * 0.7, w, y, w - size, y + size * 0.7], false));
			}
			return out;
		}
	}
}

/** Layers that can become paths (text needs glyph outlines; see textOutlines). */
export function isVectorLayer(layer: Layer): layer is ShapeLayer | PathLayer {
	return layer.type === "shape" || layer.type === "path";
}

/** Local-space geometry of a vector layer. */
export function localSubpaths(layer: ShapeLayer | PathLayer): Subpath[] {
	return layer.type === "path" ? layer.subpaths : shapeSubpaths(layer);
}

/** World-space geometry of a vector layer. */
export function worldGeometry(layer: ShapeLayer | PathLayer): Subpath[] {
	return mapSubpaths(localSubpaths(layer), compose(layer));
}

/* ------------------------------ paper.js glue ---------------------------- */

type Paper = typeof import("paper/dist/paper-core");
type PaperScope = InstanceType<Paper["PaperScope"]>;
type PathItem = InstanceType<Paper["PathItem"]>;

let scopePromise: Promise<PaperScope> | null = null;

/** Loads paper.js on first use and sets up a canvas-less scope for geometry. */
export function loadPaper(): Promise<PaperScope> {
	scopePromise ??= import("paper/dist/paper-core").then((mod) => {
		const paper = (mod as unknown as { default: Paper }).default ?? (mod as unknown as Paper);
		const scope = new paper.PaperScope();
		scope.setup(new scope.Size(1, 1));
		return scope;
	});
	return scopePromise;
}

const pt = (scope: PaperScope, v?: Vec) => (v ? new scope.Point(v.x, v.y) : undefined);

export function toPaper(
	scope: PaperScope,
	subpaths: Subpath[],
	fillRule: "nonzero" | "evenodd" = "nonzero",
): PathItem {
	const paths = subpaths
		.filter((s) => s.anchors.length > 0)
		.map(
			(s) =>
				new scope.Path({
					segments: s.anchors.map(
						(a) => new scope.Segment(new scope.Point(a.x, a.y), pt(scope, a.handleIn), pt(scope, a.handleOut)),
					),
					// Booleans work on filled areas, so every subpath counts as closed.
					closed: true,
					insert: false,
				}),
		);
	const item: PathItem =
		paths.length === 1 ? paths[0] : new scope.CompoundPath({ children: paths, insert: false });
	item.fillRule = fillRule;
	return item;
}

export function fromPaper(item: PathItem): Subpath[] {
	const children = (item as unknown as { children?: PathItem[] }).children;
	const paths = (children && children.length > 0 ? children : [item]) as InstanceType<Paper["Path"]>[];
	return paths
		.filter((p) => p.segments && p.segments.length > 0)
		.map((p) => ({
			closed: p.closed,
			anchors: p.segments.map((seg: InstanceType<Paper["Segment"]>) => {
				const hin = seg.handleIn.isZero() ? undefined : { x: seg.handleIn.x, y: seg.handleIn.y };
				const hout = seg.handleOut.isZero() ? undefined : { x: seg.handleOut.x, y: seg.handleOut.y };
				return { x: seg.point.x, y: seg.point.y, handleIn: hin, handleOut: hout, type: classifyAnchor(hin, hout) };
			}),
		}));
}

/* ------------------------------- Booleans -------------------------------- */

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";

export const BOOLEAN_LABELS: Record<BooleanOp, string> = {
	union: "Union",
	subtract: "Subtract",
	intersect: "Intersect",
	exclude: "Exclude",
};

/**
 * Combines shapes, bottom-most first (Figma's order: Subtract removes every
 * upper shape from the bottom one). Inputs and output are world-space subpaths.
 */
export async function booleanSubpaths(
	op: BooleanOp,
	shapes: { subpaths: Subpath[]; fillRule?: "nonzero" | "evenodd" }[],
): Promise<Subpath[]> {
	if (shapes.length === 0) return [];
	const scope = await loadPaper();
	const items = shapes.map((s) => toPaper(scope, s.subpaths, s.fillRule));
	let acc = items[0];
	for (const next of items.slice(1)) {
		const options = { insert: false };
		acc =
			op === "union"
				? acc.unite(next, options)
				: op === "subtract"
					? acc.subtract(next, options)
					: op === "intersect"
						? acc.intersect(next, options)
						: acc.exclude(next, options);
	}
	return fromPaper(acc);
}

/* ----------------------------- Outline stroke ---------------------------- */

export type StrokeStyle = Pick<Stroke, "width"> & {
	cap?: "butt" | "round" | "square";
	join?: "miter" | "round" | "bevel";
	miterLimit?: number;
};

const norm = (v: Vec): Vec => {
	const l = Math.hypot(v.x, v.y);
	return l > 1e-12 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};
const perp = (v: Vec): Vec => ({ x: -v.y, y: v.x });
const addv = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** Unit tangent at t (falls back to the next control point when a handle is zero-length). */
function tangentAt(s: Segment, t: number): Vec {
	const mt = 1 - t;
	const d = {
		x: 3 * mt * mt * (s.c1.x - s.p0.x) + 6 * mt * t * (s.c2.x - s.c1.x) + 3 * t * t * (s.p3.x - s.c2.x),
		y: 3 * mt * mt * (s.c1.y - s.p0.y) + 6 * mt * t * (s.c2.y - s.c1.y) + 3 * t * t * (s.p3.y - s.c2.y),
	};
	if (Math.hypot(d.x, d.y) > 1e-9) return norm(d);
	return norm({ x: s.p3.x - s.p0.x, y: s.p3.y - s.p0.y });
}

/** One side of a segment offset by `d`, as a cubic chain (the curve is split into short pieces). */
function offsetSide(s: Segment, d: number): PathAnchor[] {
	if (!s.curve) {
		const n = perp(norm({ x: s.p3.x - s.p0.x, y: s.p3.y - s.p0.y }));
		return [
			{ ...addv(s.p0, n, d), type: "corner" },
			{ ...addv(s.p3, n, d), type: "corner" },
		];
	}
	const pieces = 12;
	const pts: { q: Vec; tan: Vec }[] = [];
	for (let i = 0; i <= pieces; i++) {
		const t = i / pieces;
		const tan = tangentAt(s, t);
		pts.push({ q: addv(cubicAt(s, t), perp(tan), d), tan });
	}
	return pts.map(({ q, tan }, i) => {
		// Handles along the tangent, a third of the offset chord on each side.
		const lenIn = i > 0 ? Math.hypot(q.x - pts[i - 1].q.x, q.y - pts[i - 1].q.y) / 3 : 0;
		const lenOut = i < pieces ? Math.hypot(pts[i + 1].q.x - q.x, pts[i + 1].q.y - q.y) / 3 : 0;
		return {
			x: q.x,
			y: q.y,
			handleIn: lenIn ? { x: -tan.x * lenIn, y: -tan.y * lenIn } : undefined,
			handleOut: lenOut ? { x: tan.x * lenOut, y: tan.y * lenOut } : undefined,
			type: "smooth" as const,
		};
	});
}

/** A closed band around one segment; `extendStart`/`extendEnd` make square caps. */
function segmentOutline(s: Segment, half: number, extendStart: boolean, extendEnd: boolean): Subpath {
	const left = offsetSide(s, half);
	// The reversed segment's left side is this segment's right side.
	const right = offsetSide({ p0: s.p3, c1: s.c2, c2: s.c1, p3: s.p0, curve: s.curve, from: s.to, to: s.from }, half);
	const tStart = tangentAt(s, 0);
	const tEnd = tangentAt(s, 1);
	const shift = (a: PathAnchor, v: Vec, k: number): PathAnchor => ({ ...a, ...addv(a, v, k) });
	if (extendEnd) {
		left[left.length - 1] = shift(left[left.length - 1], tEnd, half);
		right[0] = shift(right[0], tEnd, half);
	}
	if (extendStart) {
		left[0] = shift(left[0], tStart, -half);
		right[right.length - 1] = shift(right[right.length - 1], tStart, -half);
	}
	return { anchors: [...left, ...right], closed: true };
}

/** Wedge filling the outer gap of a corner between two segments (miter or bevel). */
function joinWedge(p: Vec, tIn: Vec, tOut: Vec, half: number, join: "miter" | "bevel", limit: number): Subpath | null {
	const cross = tIn.x * tOut.y - tIn.y * tOut.x;
	if (Math.abs(cross) < 1e-9) return null;
	// The outer side is to the left of travel for a right turn and vice versa.
	const side = cross > 0 ? -1 : 1;
	const a = addv(p, perp(tIn), half * side);
	const b = addv(p, perp(tOut), half * side);
	const pts = [p, a];
	if (join === "miter") {
		const cos = tIn.x * tOut.x + tIn.y * tOut.y;
		const miterLen = 1 / Math.sqrt(Math.max(1e-9, (1 + cos) / 2));
		if (miterLen <= limit) {
			const bis = norm(addv(perp(tIn), perp(tOut)));
			pts.push(addv(p, bis, half * side * miterLen));
		}
	}
	pts.push(b);
	return polygonSubpath(pts.flatMap((q) => [q.x, q.y]));
}

/**
 * The area covered by a stroke, as world-space subpaths (Outline stroke).
 * Each segment becomes a closed outline; corners get round caps or miter /
 * bevel wedges; then everything is united so the result is one clean shape.
 */
export async function outlineStroke(subpaths: Subpath[], style: StrokeStyle): Promise<Subpath[]> {
	const half = style.width / 2;
	if (half <= 0) return [];
	const cap = style.cap ?? "round";
	const join = style.join ?? "round";
	const limit = style.miterLimit ?? 4;
	const pieces: Subpath[] = [];
	for (const sub of subpaths) {
		const segs = segmentsOf(sub).filter(
			(s) => s.curve || Math.hypot(s.p3.x - s.p0.x, s.p3.y - s.p0.y) > 1e-9,
		);
		const dot = (p: Vec) => ellipseSubpath(p.x, p.y, half, half);
		segs.forEach((s, i) => {
			const isFirst = i === 0 && !sub.closed;
			const isLast = i === segs.length - 1 && !sub.closed;
			pieces.push(segmentOutline(s, half, isFirst && cap === "square", isLast && cap === "square"));
			// Round caps and round joins are circles at the segment ends.
			if (isFirst && cap === "round") pieces.push(dot(s.p0));
			if ((isLast && cap === "round") || (!isLast && join === "round")) pieces.push(dot(s.p3));
			const next = segs[i + 1] ?? (sub.closed ? segs[0] : undefined);
			if (next && join !== "round" && !isLast) {
				const wedge = joinWedge(s.p3, tangentAt(s, 1), tangentAt(next, 0), half, join, limit);
				if (wedge) pieces.push(wedge);
			}
		});
		if (segs.length === 0 && sub.anchors.length > 0 && cap !== "butt") {
			// A single dot still paints a cap.
			const p = sub.anchors[0];
			pieces.push(cap === "round" ? ellipseSubpath(p.x, p.y, half, half) : rectSubpath(p.x - half, p.y - half, half * 2, half * 2));
		}
	}
	if (pieces.length === 0) return [];
	const scope = await loadPaper();
	let acc = toPaper(scope, [pieces[0]]);
	for (const piece of pieces.slice(1)) acc = acc.unite(toPaper(scope, [piece]), { insert: false });
	return fromPaper(acc);
}

