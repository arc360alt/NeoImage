"use client";

/**
 * FreeForm vector tools that live on the canvas: the pen tool (draw new
 * paths) and path edit mode (move anchors and handles of an existing path).
 *
 * Both are hooks driven by the stage's pointer events, plus overlays drawn on
 * the editor-only "ui" layer. All coordinates handed in are world space.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Line, Rect, Shape, Circle } from "react-konva";
import { getEditor } from "@/editor/store";
import { getSettings } from "@/editor/settings-store";
import { createPathLayer } from "@/editor/defaults";
import { apply, applyLinear, invert, type Matrix, type Vec } from "@/editor/matrix";
import {
	insertAnchor,
	layerMatrix,
	mapSubpaths,
	moveHandle,
	nearestOnPath,
	parsePointKey,
	pathFromWorld,
	pathPatchForLocal,
	pointKey,
	snapAngle,
	toggleAnchorType,
	tracePath,
} from "@/editor/path";
import type { Guide } from "@/editor/snapping";
import type { PathAnchor, PathLayer, Subpath } from "@/editor/types";

const ACCENT = "#0ea5e9";
/** Screen-pixel radius for grabbing anchors and handles. */
const GRAB = 7;

type MouseLike = { shiftKey: boolean; altKey: boolean };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

function isTyping(target: EventTarget | null) {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
	);
}

function pixelSnap(p: Vec): Vec {
	return getSettings().snapToPixels ? { x: Math.round(p.x), y: Math.round(p.y) } : p;
}

/* -------------------------------- Pen tool ------------------------------- */

type PenDraft = { anchors: PathAnchor[] };

export function usePenTool({ active, zoom }: { active: boolean; zoom: number }) {
	const [draft, setDraftState] = useState<PenDraft | null>(null);
	const [cursor, setCursor] = useState<Vec | null>(null);
	const draftRef = useRef<PenDraft | null>(null);
	const drag = useRef<{ index: number; closing: boolean; moved: boolean } | null>(null);
	const zoomRef = useRef(zoom);
	zoomRef.current = zoom;

	const setDraft = useCallback((next: PenDraft | null) => {
		draftRef.current = next;
		setDraftState(next);
	}, []);

	const finish = useCallback(
		(closed: boolean) => {
			const d = draftRef.current;
			setDraft(null);
			drag.current = null;
			if (!d || d.anchors.length < 2) return;
			const editor = getEditor();
			const settings = getSettings();
			const geometry = pathFromWorld([{ anchors: d.anchors, closed }]);
			const layer = createPathLayer({
				...geometry,
				stroke: { enabled: true, color: settings.lineColor, width: settings.lineWidth },
			});
			editor.addLayers([layer]);
			if (settings.keepToolActive) editor.setTool("pen");
		},
		[setDraft],
	);

	// Switching tools keeps what was drawn so far, like Figma.
	useEffect(() => {
		if (!active && draftRef.current) finish(false);
	}, [active, finish]);

	const hasDraft = draft !== null;
	useEffect(() => {
		if (!hasDraft) return;
		const onKey = (e: KeyboardEvent) => {
			if (isTyping(e.target)) return;
			if (e.key === "Enter" || e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				finish(false);
			} else if (e.key === "Backspace" || e.key === "Delete") {
				// Removes the last point instead of deleting the selection.
				e.preventDefault();
				e.stopImmediatePropagation();
				const d = draftRef.current;
				if (!d) return;
				setDraft(d.anchors.length > 1 ? { anchors: d.anchors.slice(0, -1) } : null);
			}
		};
		// Capture phase so Enter/Escape don't also reach the editor's shortcuts.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [hasDraft, finish, setDraft]);

	const nearFirst = (p: Vec) => {
		const d = draftRef.current;
		return !!d && d.anchors.length >= 2 && dist(d.anchors[0], p) * zoomRef.current < GRAB + 2;
	};

	const onMouseDown = (p: Vec, evt: MouseLike) => {
		const d = draftRef.current;
		if (d && nearFirst(p)) {
			drag.current = { index: 0, closing: true, moved: false };
			return;
		}
		const last = d?.anchors[d.anchors.length - 1];
		const q = pixelSnap(evt.shiftKey && last ? snapAngle(last, p) : p);
		const anchors: PathAnchor[] = [...(d?.anchors ?? []), { x: q.x, y: q.y, type: "corner" }];
		setDraft({ anchors });
		drag.current = { index: anchors.length - 1, closing: false, moved: false };
	};

	const onMouseMove = (p: Vec, evt: MouseLike) => {
		const d = draftRef.current;
		const state = drag.current;
		if (d && state) {
			const a = d.anchors[state.index];
			let v = sub(p, a);
			if (!state.moved && Math.hypot(v.x, v.y) * zoomRef.current < 3) return;
			state.moved = true;
			if (evt.shiftKey) v = snapAngle({ x: 0, y: 0 }, v);
			// Dragging pulls out mirrored handles; Alt moves only the outgoing one.
			const next: PathAnchor = evt.altKey
				? { ...a, handleOut: v, type: "corner" }
				: { ...a, handleOut: v, handleIn: { x: -v.x, y: -v.y }, type: "symmetric" };
			const anchors = [...d.anchors];
			anchors[state.index] = next;
			setDraft({ anchors });
			setCursor(null);
			return;
		}
		const last = d?.anchors[d.anchors.length - 1];
		setCursor(evt.shiftKey && last && !nearFirst(p) ? snapAngle(last, p) : p);
	};

	const onMouseUp = () => {
		const state = drag.current;
		drag.current = null;
		if (state?.closing) finish(true);
	};

	const overlay = active ? (
		<PenOverlay draft={draft} cursor={cursor} zoom={zoom} closing={!!cursor && nearFirst(cursor)} />
	) : null;

	return { onMouseDown, onMouseMove, onMouseUp, overlay, isDrawing: hasDraft, finish };
}

function PenOverlay({
	draft,
	cursor,
	zoom,
	closing,
}: {
	draft: PenDraft | null;
	cursor: Vec | null;
	zoom: number;
	closing: boolean;
}) {
	if (!draft) return null;
	const anchors = draft.anchors;
	const last = anchors[anchors.length - 1];
	const size = 7 / zoom;
	return (
		<Group listening={false}>
			<Shape
				stroke={ACCENT}
				strokeWidth={1.5 / zoom}
				sceneFunc={(ctx, shape) => {
					ctx.beginPath();
					tracePath(ctx, [{ anchors, closed: false }]);
					ctx.strokeShape(shape);
				}}
			/>
			{cursor && last && (
				<Shape
					stroke={ACCENT}
					strokeWidth={1 / zoom}
					opacity={0.7}
					sceneFunc={(ctx, shape) => {
						// Live preview of the next segment (it bends with the last point's handle).
						const target = closing ? anchors[0] : cursor;
						const c1 = last.handleOut ? { x: last.x + last.handleOut.x, y: last.y + last.handleOut.y } : last;
						const c2 =
							closing && anchors[0].handleIn
								? { x: anchors[0].x + anchors[0].handleIn.x, y: anchors[0].y + anchors[0].handleIn.y }
								: target;
						ctx.beginPath();
						ctx.moveTo(last.x, last.y);
						ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, target.x, target.y);
						ctx.strokeShape(shape);
					}}
				/>
			)}
			{last && <HandleLines anchor={last} zoom={zoom} />}
			{anchors.map((a, i) => (
				<Rect
					// biome-ignore lint/suspicious/noArrayIndexKey: anchors have no ids
					key={i}
					x={a.x - size / 2}
					y={a.y - size / 2}
					width={size}
					height={size}
					fill={i === 0 && closing ? ACCENT : "#ffffff"}
					stroke={ACCENT}
					strokeWidth={1.5 / zoom}
				/>
			))}
		</Group>
	);
}

function HandleLines({
	anchor,
	zoom,
	matrix,
	which = ["in", "out"],
}: {
	anchor: PathAnchor;
	zoom: number;
	matrix?: Matrix;
	which?: ("in" | "out")[];
}) {
	const toWorld = (p: Vec) => (matrix ? apply(matrix, p) : p);
	const a = toWorld(anchor);
	const handles = which
		.map((w) => (w === "in" ? anchor.handleIn : anchor.handleOut))
		.filter((h): h is Vec => !!h && (Math.abs(h.x) > 1e-6 || Math.abs(h.y) > 1e-6))
		.map((h) => toWorld({ x: anchor.x + h.x, y: anchor.y + h.y }));
	return (
		<>
			{handles.map((h, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: at most two handles
				<Group key={i}>
					<Line points={[a.x, a.y, h.x, h.y]} stroke={ACCENT} strokeWidth={1 / zoom} />
					<Circle x={h.x} y={h.y} radius={3.5 / zoom} fill="#ffffff" stroke={ACCENT} strokeWidth={1.25 / zoom} />
				</Group>
			))}
		</>
	);
}

/* ---------------------------- Path edit mode ----------------------------- */

type EditDrag =
	| {
			kind: "points";
			start: Vec;
			layer: PathLayer;
			keys: string[];
			primary: string;
			moved: boolean;
			targets: { xs: number[]; ys: number[] };
	  }
	| { kind: "handle"; layer: PathLayer; key: string; which: "in" | "out"; moved: boolean };

type Marquee = { x1: number; y1: number; x2: number; y2: number };

function anchorAt(subpaths: Subpath[], key: string) {
	const { subpath, anchor } = parsePointKey(key);
	return subpaths[subpath]?.anchors[anchor];
}

/** Keys of selected anchors and their neighbours (whose handles are shown). */
function handleKeys(subpaths: Subpath[], selected: string[]) {
	const out = new Set<string>();
	for (const key of selected) {
		const { subpath, anchor } = parsePointKey(key);
		const s = subpaths[subpath];
		if (!s) continue;
		const n = s.anchors.length;
		out.add(key);
		if (anchor > 0 || s.closed) out.add(pointKey(subpath, (anchor - 1 + n) % n));
		if (anchor < n - 1 || s.closed) out.add(pointKey(subpath, (anchor + 1) % n));
	}
	return out;
}

export function usePathEditor({
	layer,
	zoom,
	setGuides,
	snapTargets,
}: {
	layer: PathLayer | undefined;
	zoom: number;
	setGuides: (guides: Guide[]) => void;
	/** Edges and centers of other layers to snap points to (world space). */
	snapTargets: () => { xs: number[]; ys: number[] };
}) {
	const drag = useRef<EditDrag | null>(null);
	const [marquee, setMarquee] = useState<Marquee | null>(null);

	const tolerance = GRAB / zoom;

	const update = (base: PathLayer, subpaths: Subpath[]) => {
		getEditor().updateLayer(base.id, pathPatchForLocal(base, subpaths), { transient: true });
	};

	const onMouseDown = (p: Vec, evt: MouseLike) => {
		if (!layer) return;
		const editor = getEditor();
		const selected = editor.selectedPoints;
		const m = layerMatrix(layer);

		// 1. Handles of the selected points (and their neighbours).
		for (const key of handleKeys(layer.subpaths, selected)) {
			const a = anchorAt(layer.subpaths, key);
			if (!a) continue;
			for (const which of ["out", "in"] as const) {
				const h = which === "in" ? a.handleIn : a.handleOut;
				if (!h) continue;
				if (dist(apply(m, { x: a.x + h.x, y: a.y + h.y }), p) < tolerance) {
					drag.current = { kind: "handle", layer, key, which, moved: false };
					return;
				}
			}
		}

		// 2. Anchors.
		for (let si = 0; si < layer.subpaths.length; si++) {
			const anchors = layer.subpaths[si].anchors;
			for (let ai = anchors.length - 1; ai >= 0; ai--) {
				if (dist(apply(m, anchors[ai]), p) >= tolerance) continue;
				const key = pointKey(si, ai);
				let keys = selected;
				if (evt.shiftKey) keys = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
				else if (!selected.includes(key)) keys = [key];
				editor.setSelectedPoints(keys);
				if (keys.includes(key)) {
					drag.current = { kind: "points", start: p, layer, keys, primary: key, moved: false, targets: snapTargets() };
				}
				return;
			}
		}

		// 3. Segments: clicking the outline inserts a point there.
		const local = apply(invert(m), p);
		const hit = nearestOnPath(layer.subpaths, local);
		if (hit && dist(apply(m, hit.point), p) < tolerance) {
			const { subpaths, key } = insertAnchor(layer.subpaths, hit.subpath, hit.segment, hit.t);
			const patch = pathPatchForLocal(layer, subpaths);
			editor.updateLayer(layer.id, patch, { transient: true });
			editor.setSelectedPoints([key]);
			drag.current = {
				kind: "points",
				start: p,
				layer: { ...layer, ...patch },
				keys: [key],
				primary: key,
				// Inserting already changed the path, so mouse up must commit.
				moved: true,
				targets: snapTargets(),
			};
			return;
		}

		// 4. Empty space: marquee-select points.
		if (!evt.shiftKey) editor.setSelectedPoints([]);
		setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
	};

	const onMouseMove = (p: Vec, evt: MouseLike) => {
		const state = drag.current;
		if (marquee) {
			setMarquee((mq) => (mq ? { ...mq, x2: p.x, y2: p.y } : mq));
			return;
		}
		if (!state) return;
		const base = state.layer;
		const m = layerMatrix(base);
		const inv = invert(m);

		if (state.kind === "handle") {
			const a = anchorAt(base.subpaths, state.key);
			if (!a) return;
			const anchorWorld = apply(m, a);
			const target = pixelSnap(evt.shiftKey ? snapAngle(anchorWorld, p) : p);
			const local = apply(inv, target);
			const moved = moveHandle(a, state.which, sub(local, a), evt.altKey);
			const { subpath, anchor } = parsePointKey(state.key);
			const subpaths = structuredClone(base.subpaths);
			subpaths[subpath].anchors[anchor] = moved;
			state.moved = true;
			update(base, subpaths);
			return;
		}

		let delta = sub(p, state.start);
		if (!state.moved && Math.hypot(delta.x, delta.y) * zoom < 2) return;
		state.moved = true;
		const primary = anchorAt(base.subpaths, state.primary);
		if (!primary) return;
		const origin = apply(m, primary);
		let target = { x: origin.x + delta.x, y: origin.y + delta.y };
		if (evt.shiftKey) {
			// Shift keeps the move horizontal, vertical or diagonal.
			target = snapAngle(origin, target);
		}
		const guides: Guide[] = [];
		const { snapToObjects, snapThreshold } = getSettings();
		if (snapToObjects && !evt.altKey) {
			// Snap to the path's other points and to other layers' edges/centers.
			const xs = [...state.targets.xs];
			const ys = [...state.targets.ys];
			base.subpaths.forEach((s, si) =>
				s.anchors.forEach((a, ai) => {
					if (state.keys.includes(pointKey(si, ai))) return;
					const w = apply(m, a);
					xs.push(w.x);
					ys.push(w.y);
				}),
			);
			const threshold = snapThreshold / zoom;
			const best = (stops: number[], v: number) => {
				let found: number | null = null;
				for (const s of stops) {
					if (Math.abs(s - v) < threshold && (found === null || Math.abs(s - v) < Math.abs(found - v))) found = s;
				}
				return found;
			};
			const sx = best(xs, target.x);
			const sy = best(ys, target.y);
			if (sx !== null) {
				target.x = sx;
				guides.push({ orientation: "V", position: sx });
			}
			if (sy !== null) {
				target.y = sy;
				guides.push({ orientation: "H", position: sy });
			}
		}
		target = pixelSnap(target);
		setGuides(guides);
		delta = sub(target, origin);
		const localDelta = applyLinear(inv, delta);
		const keys = new Set(state.keys);
		const subpaths = base.subpaths.map((s, si) => ({
			closed: s.closed,
			anchors: s.anchors.map((a, ai) =>
				keys.has(pointKey(si, ai)) ? { ...a, x: a.x + localDelta.x, y: a.y + localDelta.y } : a,
			),
		}));
		update(base, subpaths);
	};

	const onMouseUp = (evt: MouseLike) => {
		const state = drag.current;
		drag.current = null;
		setGuides([]);
		if (state?.moved) getEditor().commit();
		if (marquee && layer) {
			const x1 = Math.min(marquee.x1, marquee.x2);
			const x2 = Math.max(marquee.x1, marquee.x2);
			const y1 = Math.min(marquee.y1, marquee.y2);
			const y2 = Math.max(marquee.y1, marquee.y2);
			setMarquee(null);
			if (x2 - x1 < 2 / zoom && y2 - y1 < 2 / zoom) return;
			const m = layerMatrix(layer);
			const hits: string[] = [];
			layer.subpaths.forEach((s, si) =>
				s.anchors.forEach((a, ai) => {
					const w = apply(m, a);
					if (w.x >= x1 && w.x <= x2 && w.y >= y1 && w.y <= y2) hits.push(pointKey(si, ai));
				}),
			);
			const editor = getEditor();
			editor.setSelectedPoints(evt.shiftKey ? [...new Set([...editor.selectedPoints, ...hits])] : hits);
		}
	};

	/** Double-click: toggle corner/smooth on an anchor, or leave edit mode. */
	const onDoubleClick = (p: Vec) => {
		if (!layer) return;
		const m = layerMatrix(layer);
		for (let si = 0; si < layer.subpaths.length; si++) {
			const anchors = layer.subpaths[si].anchors;
			for (let ai = 0; ai < anchors.length; ai++) {
				if (dist(apply(m, anchors[ai]), p) < tolerance) {
					const next = toggleAnchorType(layer.subpaths, si, ai);
					getEditor().updateLayer(layer.id, pathPatchForLocal(layer, next));
					getEditor().setSelectedPoints([pointKey(si, ai)]);
					return;
				}
			}
		}
		const hit = nearestOnPath(layer.subpaths, apply(invert(m), p));
		if (!hit || dist(apply(m, hit.point), p) > tolerance) getEditor().setEditingPathId(null);
	};

	return { onMouseDown, onMouseMove, onMouseUp, onDoubleClick, marquee };
}

export function PathEditOverlay({
	layer,
	selectedPoints,
	zoom,
	marquee,
}: {
	layer: PathLayer;
	selectedPoints: string[];
	zoom: number;
	marquee: Marquee | null;
}) {
	const m = layerMatrix(layer);
	const world = mapSubpaths(layer.subpaths, m);
	const selected = new Set(selectedPoints);
	const withHandles = handleKeys(layer.subpaths, selectedPoints);
	const size = 7 / zoom;
	return (
		<Group listening={false}>
			<Shape
				stroke={ACCENT}
				strokeWidth={1.25 / zoom}
				sceneFunc={(ctx, shape) => {
					ctx.beginPath();
					tracePath(ctx, world);
					ctx.strokeShape(shape);
				}}
			/>
			{layer.subpaths.map((s, si) =>
				s.anchors.map((a, ai) => {
					const key = pointKey(si, ai);
					if (!withHandles.has(key)) return null;
					// Only show the handles that belong to a segment touching a selected point.
					const { anchors } = s;
					const n = anchors.length;
					const prevSel = selected.has(pointKey(si, (ai - 1 + n) % n)) && (ai > 0 || s.closed);
					const nextSel = selected.has(pointKey(si, (ai + 1) % n)) && (ai < n - 1 || s.closed);
					const which: ("in" | "out")[] = selected.has(key)
						? ["in", "out"]
						: [...(prevSel ? (["in"] as const) : []), ...(nextSel ? (["out"] as const) : [])];
					return <HandleLines key={`h${key}`} anchor={a} zoom={zoom} matrix={m} which={which} />;
				}),
			)}
			{world.map((s, si) =>
				s.anchors.map((a, ai) => {
					const key = pointKey(si, ai);
					const isSel = selected.has(key);
					return (
						<Rect
							key={key}
							x={a.x - size / 2}
							y={a.y - size / 2}
							width={size}
							height={size}
							cornerRadius={a.type === "corner" ? 0 : size / 2}
							fill={isSel ? ACCENT : "#ffffff"}
							stroke={ACCENT}
							strokeWidth={1.5 / zoom}
						/>
					);
				}),
			)}
			{marquee && (
				<Rect
					x={Math.min(marquee.x1, marquee.x2)}
					y={Math.min(marquee.y1, marquee.y2)}
					width={Math.abs(marquee.x2 - marquee.x1)}
					height={Math.abs(marquee.y2 - marquee.y1)}
					fill="rgba(14,165,233,0.08)"
					stroke={ACCENT}
					strokeWidth={1 / zoom}
				/>
			)}
		</Group>
	);
}
