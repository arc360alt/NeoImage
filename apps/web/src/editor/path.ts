/**
 * Vector path geometry: pure helpers shared by the canvas, the pen tool,
 * path editing, outlines, boolean operations and SVG import/export.
 *
 * Anchors live in the layer's local space; handles are offsets from their
 * anchor. A segment between anchors A and B is a cubic bezier with control
 * points A + A.handleOut and B + B.handleIn (a straight line when neither
 * handle is set).
 */
import { apply, applyLinear, compose, type Matrix, type Vec } from "./matrix";
import type { PathAnchor, PathLayer, Subpath } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

export type Segment = {
	p0: Vec;
	c1: Vec;
	c2: Vec;
	p3: Vec;
	/** False for straight lines (no handles on either end). */
	curve: boolean;
	/** Index of the segment's start anchor (the end anchor is `to`). */
	from: number;
	to: number;
};

const add = (a: Vec, b?: Vec): Vec => (b ? { x: a.x + b.x, y: a.y + b.y } : { x: a.x, y: a.y });
const isZero = (v?: Vec) => !v || (Math.abs(v.x) < 1e-9 && Math.abs(v.y) < 1e-9);

/** Compact number formatting for path data (3 decimals, no trailing zeros). */
export const num = (v: number) => {
	if (!Number.isFinite(v)) return "0";
	const r = Math.round(v * 1000) / 1000;
	return String(Object.is(r, -0) ? 0 : r);
};

export const pointKey = (subpath: number, anchor: number) => `${subpath}:${anchor}`;
export function parsePointKey(key: string) {
	const [s, a] = key.split(":").map(Number);
	return { subpath: s, anchor: a };
}

export function segmentsOf(sub: Subpath): Segment[] {
	const { anchors } = sub;
	const out: Segment[] = [];
	const count = sub.closed ? anchors.length : anchors.length - 1;
	for (let i = 0; i < count; i++) {
		const j = (i + 1) % anchors.length;
		if (j === i) break;
		const a = anchors[i];
		const b = anchors[j];
		out.push({
			p0: { x: a.x, y: a.y },
			c1: add(a, a.handleOut),
			c2: add(b, b.handleIn),
			p3: { x: b.x, y: b.y },
			curve: !isZero(a.handleOut) || !isZero(b.handleIn),
			from: i,
			to: j,
		});
	}
	return out;
}

/** SVG path data for the subpaths. */
export function pathToD(subpaths: Subpath[]): string {
	let d = "";
	for (const sub of subpaths) {
		if (sub.anchors.length === 0) continue;
		const first = sub.anchors[0];
		d += `M${num(first.x)} ${num(first.y)}`;
		for (const s of segmentsOf(sub)) {
			// Z draws a straight closing segment by itself.
			if (sub.closed && s.to === 0 && !s.curve) continue;
			d += s.curve
				? `C${num(s.c1.x)} ${num(s.c1.y)} ${num(s.c2.x)} ${num(s.c2.y)} ${num(s.p3.x)} ${num(s.p3.y)}`
				: `L${num(s.p3.x)} ${num(s.p3.y)}`;
		}
		if (sub.closed) d += "Z";
	}
	return d;
}

/** Anything with canvas-like path methods (CanvasRenderingContext2D, Konva.Context, Path2D). */
export type PathSink = {
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
	closePath(): void;
};

export function tracePath(ctx: PathSink, subpaths: Subpath[]) {
	for (const sub of subpaths) {
		if (sub.anchors.length === 0) continue;
		ctx.moveTo(sub.anchors[0].x, sub.anchors[0].y);
		for (const s of segmentsOf(sub)) {
			if (sub.closed && s.to === 0 && !s.curve) continue;
			if (s.curve) ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p3.x, s.p3.y);
			else ctx.lineTo(s.p3.x, s.p3.y);
		}
		if (sub.closed) ctx.closePath();
	}
}

/* ------------------------------- Beziers -------------------------------- */

export function cubicAt(s: Segment, t: number): Vec {
	const mt = 1 - t;
	const a = mt * mt * mt;
	const b = 3 * mt * mt * t;
	const c = 3 * mt * t * t;
	const d = t * t * t;
	return {
		x: a * s.p0.x + b * s.c1.x + c * s.c2.x + d * s.p3.x,
		y: a * s.p0.y + b * s.c1.y + c * s.c2.y + d * s.p3.y,
	};
}

/** Parameters in (0, 1) where one coordinate of the cubic has a turning point. */
function extremaT(p0: number, p1: number, p2: number, p3: number): number[] {
	// Derivative: 3[(p1-p0)(1-t)^2 + 2(p2-p1)(1-t)t + (p3-p2)t^2] → at^2 + bt + c
	const a = -p0 + 3 * p1 - 3 * p2 + p3;
	const b = 2 * (p0 - 2 * p1 + p2);
	const c = p1 - p0;
	const out: number[] = [];
	if (Math.abs(a) < 1e-12) {
		if (Math.abs(b) > 1e-12) out.push(-c / b);
	} else {
		const disc = b * b - 4 * a * c;
		if (disc >= 0) {
			const sq = Math.sqrt(disc);
			out.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
		}
	}
	return out.filter((t) => t > 0 && t < 1);
}

/** Tight bounds of the drawn geometry (curves included, handles excluded). */
export function pathBounds(subpaths: Subpath[]): Rect {
	let x1 = Number.POSITIVE_INFINITY;
	let y1 = Number.POSITIVE_INFINITY;
	let x2 = Number.NEGATIVE_INFINITY;
	let y2 = Number.NEGATIVE_INFINITY;
	const include = (p: Vec) => {
		if (p.x < x1) x1 = p.x;
		if (p.y < y1) y1 = p.y;
		if (p.x > x2) x2 = p.x;
		if (p.y > y2) y2 = p.y;
	};
	for (const sub of subpaths) {
		for (const a of sub.anchors) include(a);
		for (const s of segmentsOf(sub)) {
			if (!s.curve) continue;
			for (const t of extremaT(s.p0.x, s.c1.x, s.c2.x, s.p3.x)) include(cubicAt(s, t));
			for (const t of extremaT(s.p0.y, s.c1.y, s.c2.y, s.p3.y)) include(cubicAt(s, t));
		}
	}
	if (!Number.isFinite(x1)) return { x: 0, y: 0, width: 0, height: 0 };
	return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/* ----------------------------- Transforming ------------------------------ */

export function mapSubpaths(subpaths: Subpath[], m: Matrix): Subpath[] {
	return subpaths.map((sub) => ({
		closed: sub.closed,
		anchors: sub.anchors.map((a) => {
			const p = apply(m, a);
			const next: PathAnchor = { x: p.x, y: p.y, type: a.type };
			if (a.handleIn) next.handleIn = applyLinear(m, a.handleIn);
			if (a.handleOut) next.handleOut = applyLinear(m, a.handleOut);
			return next;
		}),
	}));
}

export const translateSubpaths = (subpaths: Subpath[], dx: number, dy: number) =>
	mapSubpaths(subpaths, [1, 0, 0, 1, dx, dy]);

export const scaleSubpaths = (subpaths: Subpath[], sx: number, sy: number) =>
	mapSubpaths(subpaths, [sx, 0, 0, sy, 0, 0]);

/** The layer's local → world matrix. */
export const layerMatrix = (layer: Pick<PathLayer, "x" | "y" | "rotation" | "scaleX" | "scaleY">) =>
	compose(layer);

/**
 * Turns local geometry (in the layer's current space) into a patch whose
 * geometry starts at (0, 0), moving the layer's origin so nothing shifts on
 * screen.
 */
export function pathPatchForLocal(
	layer: Pick<PathLayer, "x" | "y" | "rotation" | "scaleX" | "scaleY">,
	subpaths: Subpath[],
): Pick<PathLayer, "x" | "y" | "width" | "height" | "subpaths"> {
	const b = pathBounds(subpaths);
	const origin = apply(layerMatrix(layer), { x: b.x, y: b.y });
	return {
		x: origin.x,
		y: origin.y,
		width: b.width,
		height: b.height,
		subpaths: translateSubpaths(subpaths, -b.x, -b.y),
	};
}

/** Geometry given in world space, as an unrotated layer. */
export function pathFromWorld(subpaths: Subpath[]) {
	return pathPatchForLocal({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, subpaths);
}

/** World-space copy of a path layer's geometry. */
export function worldSubpaths(layer: PathLayer): Subpath[] {
	return mapSubpaths(layer.subpaths, layerMatrix(layer));
}

/**
 * Resizing a path scales its anchors, so geometry always matches width × height.
 * Used by the store whenever a path's size is patched without new geometry.
 */
export function resizePath(layer: PathLayer, width: number, height: number): Subpath[] {
	const sx = layer.width > 1e-9 ? width / layer.width : 1;
	const sy = layer.height > 1e-9 ? height / layer.height : 1;
	return scaleSubpaths(layer.subpaths, sx, sy);
}

/* -------------------------------- Editing -------------------------------- */

/** Closest point on the path to `p` (all in the same space). */
export function nearestOnPath(subpaths: Subpath[], p: Vec) {
	let best: { subpath: number; segment: Segment; t: number; point: Vec; distance: number } | null = null;
	subpaths.forEach((sub, si) => {
		for (const seg of segmentsOf(sub)) {
			const steps = seg.curve ? 48 : 1;
			const evalAt = (t: number) =>
				seg.curve
					? cubicAt(seg, t)
					: { x: seg.p0.x + (seg.p3.x - seg.p0.x) * t, y: seg.p0.y + (seg.p3.y - seg.p0.y) * t };
			let bestT = 0;
			if (!seg.curve) {
				const dx = seg.p3.x - seg.p0.x;
				const dy = seg.p3.y - seg.p0.y;
				const len = dx * dx + dy * dy;
				bestT = len > 0 ? Math.max(0, Math.min(1, ((p.x - seg.p0.x) * dx + (p.y - seg.p0.y) * dy) / len)) : 0;
			} else {
				let bestD = Number.POSITIVE_INFINITY;
				for (let i = 0; i <= steps; i++) {
					const t = i / steps;
					const q = evalAt(t);
					const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
					if (d < bestD) {
						bestD = d;
						bestT = t;
					}
				}
				// Refine around the best sample.
				let lo = Math.max(0, bestT - 1 / steps);
				let hi = Math.min(1, bestT + 1 / steps);
				for (let k = 0; k < 24; k++) {
					const m1 = lo + (hi - lo) / 3;
					const m2 = hi - (hi - lo) / 3;
					const d1 = (evalAt(m1).x - p.x) ** 2 + (evalAt(m1).y - p.y) ** 2;
					const d2 = (evalAt(m2).x - p.x) ** 2 + (evalAt(m2).y - p.y) ** 2;
					if (d1 < d2) hi = m2;
					else lo = m1;
				}
				bestT = (lo + hi) / 2;
			}
			const point = evalAt(bestT);
			const distance = Math.hypot(point.x - p.x, point.y - p.y);
			if (!best || distance < best.distance) best = { subpath: si, segment: seg, t: bestT, point, distance };
		}
	});
	return best as { subpath: number; segment: Segment; t: number; point: Vec; distance: number } | null;
}

/** Inserts an anchor at parameter t of a segment without changing the shape (de Casteljau). */
export function insertAnchor(subpaths: Subpath[], subIndex: number, seg: Segment, t: number) {
	const next = structuredClone(subpaths);
	const sub = next[subIndex];
	const a = sub.anchors[seg.from];
	const b = sub.anchors[seg.to];
	const lerp = (p: Vec, q: Vec, k: number) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
	let anchor: PathAnchor;
	if (!seg.curve) {
		const p = lerp(seg.p0, seg.p3, t);
		anchor = { x: p.x, y: p.y, type: "corner" };
	} else {
		const p01 = lerp(seg.p0, seg.c1, t);
		const p12 = lerp(seg.c1, seg.c2, t);
		const p23 = lerp(seg.c2, seg.p3, t);
		const p012 = lerp(p01, p12, t);
		const p123 = lerp(p12, p23, t);
		const mid = lerp(p012, p123, t);
		a.handleOut = { x: p01.x - a.x, y: p01.y - a.y };
		b.handleIn = { x: p23.x - b.x, y: p23.y - b.y };
		anchor = {
			x: mid.x,
			y: mid.y,
			handleIn: { x: p012.x - mid.x, y: p012.y - mid.y },
			handleOut: { x: p123.x - mid.x, y: p123.y - mid.y },
			type: "smooth",
		};
	}
	// Closing segment (last → first) appends; others insert after `from`.
	const index = seg.to === 0 ? sub.anchors.length : seg.from + 1;
	sub.anchors.splice(index, 0, anchor);
	return { subpaths: next, key: pointKey(subIndex, index) };
}

/** Removes anchors, keeping each subpath connected. Subpaths left with < 2 points are dropped. */
export function deleteAnchors(subpaths: Subpath[], keys: Set<string>): Subpath[] {
	return subpaths
		.map((sub, si) => ({
			closed: sub.closed,
			anchors: sub.anchors.filter((_, ai) => !keys.has(pointKey(si, ai))),
		}))
		.filter((sub) => sub.anchors.length >= 2)
		.map((sub) => (sub.anchors.length < 3 ? { ...sub, closed: false } : sub));
}

/** Double-click on an anchor: corner ⇄ smooth (handles derived from the neighbours). */
export function toggleAnchorType(subpaths: Subpath[], subIndex: number, anchorIndex: number): Subpath[] {
	const next = structuredClone(subpaths);
	const sub = next[subIndex];
	const a = sub?.anchors[anchorIndex];
	if (!a) return subpaths;
	const hasHandles = !isZero(a.handleIn) || !isZero(a.handleOut);
	if (hasHandles) {
		a.handleIn = undefined;
		a.handleOut = undefined;
		a.type = "corner";
		return next;
	}
	const n = sub.anchors.length;
	const prev = sub.anchors[anchorIndex - 1] ?? (sub.closed ? sub.anchors[n - 1] : undefined);
	const after = sub.anchors[anchorIndex + 1] ?? (sub.closed ? sub.anchors[0] : undefined);
	const from = prev ?? a;
	const to = after ?? a;
	let dx = to.x - from.x;
	let dy = to.y - from.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-9) return subpaths;
	dx /= len;
	dy /= len;
	const inLen = prev ? Math.hypot(a.x - prev.x, a.y - prev.y) / 3 : 0;
	const outLen = after ? Math.hypot(after.x - a.x, after.y - a.y) / 3 : 0;
	const l = (inLen + outLen) / 2 || Math.max(inLen, outLen);
	a.handleIn = { x: -dx * l, y: -dy * l };
	a.handleOut = { x: dx * l, y: dy * l };
	a.type = "symmetric";
	return next;
}

/**
 * Moves one handle. Symmetric anchors mirror the other handle; smooth anchors
 * keep it collinear; corner anchors (or `breakSymmetry`, Alt) leave it alone.
 */
export function moveHandle(
	anchor: PathAnchor,
	which: "in" | "out",
	offset: Vec,
	breakSymmetry = false,
): PathAnchor {
	const next: PathAnchor = { ...anchor };
	const other = which === "in" ? "handleOut" : "handleIn";
	next[which === "in" ? "handleIn" : "handleOut"] = offset;
	if (breakSymmetry) {
		next.type = "corner";
		return next;
	}
	if (anchor.type === "symmetric") {
		next[other] = { x: -offset.x, y: -offset.y };
	} else if (anchor.type === "smooth") {
		const len = Math.hypot(anchor[other]?.x ?? 0, anchor[other]?.y ?? 0);
		const ol = Math.hypot(offset.x, offset.y);
		if (len > 0 && ol > 0) next[other] = { x: (-offset.x / ol) * len, y: (-offset.y / ol) * len };
	}
	return next;
}

/** Anchor type implied by its handles: collinear → smooth (equal length → symmetric), else corner. */
export function classifyAnchor(hin?: Vec, hout?: Vec): PathAnchor["type"] {
	if (!hin || !hout || isZero(hin) || isZero(hout)) return "corner";
	const cross = hin.x * hout.y - hin.y * hout.x;
	const dot = hin.x * hout.x + hin.y * hout.y;
	const lin = Math.hypot(hin.x, hin.y);
	const lout = Math.hypot(hout.x, hout.y);
	if (dot >= 0 || Math.abs(cross) > 1e-3 * lin * lout) return "corner";
	return Math.abs(lin - lout) < 1e-3 * Math.max(lin, lout) ? "symmetric" : "smooth";
}

/** Snaps `p` so the line from `origin` sits on a multiple of 45°. */
export function snapAngle(origin: Vec, p: Vec, step = 45): Vec {
	const dx = p.x - origin.x;
	const dy = p.y - origin.y;
	const len = Math.hypot(dx, dy);
	if (len === 0) return p;
	const r = (step * Math.PI) / 180;
	const angle = Math.round(Math.atan2(dy, dx) / r) * r;
	return { x: origin.x + Math.cos(angle) * len, y: origin.y + Math.sin(angle) * len };
}

/* ------------------------------ Primitives ------------------------------- */

/** Bezier circle constant: a quarter ellipse is a cubic with handles of length k·r. */
export const KAPPA = 0.5522847498307936;

export function polygonSubpath(points: number[], closed = true): Subpath {
	const anchors: PathAnchor[] = [];
	for (let i = 0; i < points.length; i += 2) anchors.push({ x: points[i], y: points[i + 1], type: "corner" });
	return { anchors, closed };
}

export function rectSubpath(x: number, y: number, w: number, h: number, radius = 0): Subpath {
	const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
	if (r <= 0) return polygonSubpath([x, y, x + w, y, x + w, y + h, x, y + h]);
	const k = r * KAPPA;
	const c = (px: number, py: number, inV?: Vec, outV?: Vec): PathAnchor => ({
		x: px,
		y: py,
		handleIn: inV,
		handleOut: outV,
		type: "corner",
	});
	return {
		closed: true,
		anchors: [
			c(x + r, y, { x: -k, y: 0 }),
			c(x + w - r, y, undefined, { x: k, y: 0 }),
			c(x + w, y + r, { x: 0, y: -k }),
			c(x + w, y + h - r, undefined, { x: 0, y: k }),
			c(x + w - r, y + h, { x: k, y: 0 }),
			c(x + r, y + h, undefined, { x: -k, y: 0 }),
			c(x, y + h - r, { x: 0, y: k }),
			c(x, y + r, undefined, { x: 0, y: -k }),
		],
	};
}

export function ellipseSubpath(cx: number, cy: number, rx: number, ry: number): Subpath {
	const kx = rx * KAPPA;
	const ky = ry * KAPPA;
	const s = (x: number, y: number, hin: Vec, hout: Vec): PathAnchor => ({
		x,
		y,
		handleIn: hin,
		handleOut: hout,
		type: "symmetric",
	});
	return {
		closed: true,
		anchors: [
			s(cx, cy - ry, { x: -kx, y: 0 }, { x: kx, y: 0 }),
			s(cx + rx, cy, { x: 0, y: -ky }, { x: 0, y: ky }),
			s(cx, cy + ry, { x: kx, y: 0 }, { x: -kx, y: 0 }),
			s(cx - rx, cy, { x: 0, y: ky }, { x: 0, y: -ky }),
		],
	};
}

/** A polyline approximation of the path (for areas, hit tests and stroke outlines). */
export function flattenSubpath(sub: Subpath, tolerance = 0.5): Vec[] {
	const pts: Vec[] = [];
	if (sub.anchors.length === 0) return pts;
	pts.push({ x: sub.anchors[0].x, y: sub.anchors[0].y });
	for (const seg of segmentsOf(sub)) {
		if (!seg.curve) {
			pts.push(seg.p3);
			continue;
		}
		const len =
			Math.hypot(seg.c1.x - seg.p0.x, seg.c1.y - seg.p0.y) +
			Math.hypot(seg.c2.x - seg.c1.x, seg.c2.y - seg.c1.y) +
			Math.hypot(seg.p3.x - seg.c2.x, seg.p3.y - seg.c2.y);
		const steps = Math.max(4, Math.min(256, Math.ceil(Math.sqrt(len / Math.max(tolerance, 0.01)) * 2)));
		for (let i = 1; i <= steps; i++) pts.push(cubicAt(seg, i / steps));
	}
	return pts;
}

/** Signed area enclosed by the subpaths (nonzero-ish: subpath areas summed with sign). */
export function pathArea(subpaths: Subpath[]): number {
	let area = 0;
	for (const sub of subpaths) {
		const pts = flattenSubpath(sub, 0.05);
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i];
			const b = pts[(i + 1) % pts.length];
			area += a.x * b.y - b.x * a.y;
		}
	}
	return area / 2;
}
