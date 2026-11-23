import { getStage } from "./stage";
import { apply, compose } from "./matrix";
import type { FrameLayer, GroupLayer, Layer, ProjectDoc } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

export function isFreeform(doc: Pick<ProjectDoc, "mode"> | null | undefined) {
	return doc?.mode === "freeform";
}

export function isFrame(layer: Layer | undefined): layer is FrameLayer {
	return layer?.type === "frame";
}

/**
 * Axis-aligned bounds of a layer in world space (uses the live node when available).
 * Groups have no box of their own; without a canvas, pass `layers` so their
 * children can be measured.
 */
export function layerBounds(layer: Layer, layers?: Layer[]): Rect {
	const stage = getStage();
	const group = stage?.findOne(".content-group");
	const node = stage?.findOne(`#${layer.id}`);
	if (node && group) {
		return node.getClientRect({ relativeTo: group as never, skipShadow: true });
	}
	if (layer.type === "group") {
		const all = layers ?? [];
		const leaves = descendantsOf(all, layer.id).filter((l) => l.type !== "group" && l.visible);
		return unionBounds(leaves.map((l) => layerBounds(l, all))) ?? { x: 0, y: 0, width: 0, height: 0 };
	}
	const height =
		layer.type === "text"
			? layer.fontSize * layer.lineHeight * Math.max(1, layer.text.split("\n").length)
			: layer.type === "path"
				? layer.height
				: Math.max(layer.height, 1);
	// Without a live node, use the layer's (possibly rotated) box.
	const m = compose(layer);
	const corners = [
		{ x: 0, y: 0 },
		{ x: layer.width, y: 0 },
		{ x: layer.width, y: height },
		{ x: 0, y: height },
	].map((p) => apply(m, p));
	const xs = corners.map((p) => p.x);
	const ys = corners.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function frameRect(frame: FrameLayer): Rect {
	return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}

export function contains(rect: Rect, point: { x: number; y: number }) {
	return (
		point.x >= rect.x &&
		point.y >= rect.y &&
		point.x <= rect.x + rect.width &&
		point.y <= rect.y + rect.height
	);
}

export function containsRect(outer: Rect, inner: Rect) {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

/** Top-most visible frame under a world point. */
export function frameAt(
	layers: Layer[],
	point: { x: number; y: number },
	excludeIds: Set<string> = new Set(),
): FrameLayer | undefined {
	for (let i = layers.length - 1; i >= 0; i--) {
		const layer = layers[i];
		if (layer.type !== "frame" || !layer.visible || excludeIds.has(layer.id)) continue;
		if (contains(frameRect(layer), point)) return layer;
	}
	return undefined;
}

export function isGroup(layer: Layer | undefined): layer is GroupLayer {
	return layer?.type === "group";
}

/** Direct children of a frame or group. */
export function childrenOf(layers: Layer[], parentId: string) {
	return layers.filter((l) => l.parentId === parentId);
}

/** Children, grandchildren, … of a frame or group (cycle-safe). */
export function descendantsOf(layers: Layer[], id: string): Layer[] {
	const out: Layer[] = [];
	const seen = new Set([id]);
	const queue = [id];
	while (queue.length > 0) {
		const current = queue.shift() as string;
		for (const l of layers) {
			if (l.parentId === current && !seen.has(l.id)) {
				seen.add(l.id);
				out.push(l);
				queue.push(l.id);
			}
		}
	}
	return out;
}

/** The parent chain of a layer, nearest first (cycle-safe; ignores missing parents). */
export function ancestorsOf(layers: Layer[], id: string): Layer[] {
	const byId = new Map(layers.map((l) => [l.id, l]));
	const out: Layer[] = [];
	const seen = new Set([id]);
	let parentId = byId.get(id)?.parentId;
	while (parentId && !seen.has(parentId)) {
		const parent = byId.get(parentId);
		if (!parent) break;
		out.push(parent);
		seen.add(parentId);
		parentId = parent.parentId;
	}
	return out;
}

/** The frame a layer lives in, through any number of groups. */
export function frameOf(layers: Layer[], layer: Layer): FrameLayer | undefined {
	if (layer.type === "frame") return layer;
	return ancestorsOf(layers, layer.id).find(isFrame);
}

/** True when `id` is `ancestorId` or sits somewhere inside it. */
export function isInside(layers: Layer[], id: string, ancestorId: string) {
	return id === ancestorId || ancestorsOf(layers, id).some((l) => l.id === ancestorId);
}

/** Selected ids minus those whose ancestor is selected too (they move with it). */
export function topmostIds(layers: Layer[], ids: string[]) {
	const set = new Set(ids);
	return ids.filter((id) => !ancestorsOf(layers, id).some((a) => set.has(a.id)));
}

/** Which frame should a layer belong to, based on where its center sits. */
export function parentFor(layers: Layer[], layer: Layer): string | undefined {
	if (layer.type === "frame") return undefined;
	const b = layerBounds(layer, layers);
	return frameAt(layers, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, new Set([layer.id]))?.id;
}

export function unionBounds(rects: Rect[]): Rect | null {
	if (rects.length === 0) return null;
	const x1 = Math.min(...rects.map((r) => r.x));
	const y1 = Math.min(...rects.map((r) => r.y));
	const x2 = Math.max(...rects.map((r) => r.x + r.width));
	const y2 = Math.max(...rects.map((r) => r.y + r.height));
	return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function contentBounds(layers: Layer[]): Rect | null {
	return unionBounds(layers.filter((l) => l.visible && !l.parentId).map((l) => layerBounds(l, layers)));
}

/** The visible part of the infinite canvas, in world coordinates. */
export function viewportRect(): Rect | null {
	const stage = getStage();
	if (!stage) return null;
	const zoom = stage.scaleX();
	const pos = stage.position();
	return {
		x: -pos.x / zoom,
		y: -pos.y / zoom,
		width: stage.width() / zoom,
		height: stage.height() / zoom,
	};
}

/** Where to put a new frame: to the right of everything else, like Figma. */
export function nextFramePosition(layers: Layer[]) {
	const bounds = contentBounds(layers);
	if (!bounds) return { x: 0, y: 0 };
	return { x: Math.round(bounds.x + bounds.width + 100), y: Math.round(bounds.y) };
}

export function nextFrameName(layers: Layer[]) {
	const used = new Set(layers.filter((l) => l.type === "frame").map((l) => l.name));
	let n = layers.filter((l) => l.type === "frame").length + 1;
	while (used.has(`Frame ${n}`)) n++;
	return `Frame ${n}`;
}
