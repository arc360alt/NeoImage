import { getStage } from "./stage";
import type { FrameLayer, Layer, ProjectDoc } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

export function isFreeform(doc: Pick<ProjectDoc, "mode"> | null | undefined) {
	return doc?.mode === "freeform";
}

export function isFrame(layer: Layer | undefined): layer is FrameLayer {
	return layer?.type === "frame";
}

/** Axis-aligned bounds of a layer in world space (uses the live node when available). */
export function layerBounds(layer: Layer): Rect {
	const stage = getStage();
	const group = stage?.findOne(".content-group");
	const node = stage?.findOne(`#${layer.id}`);
	if (node && group) {
		return node.getClientRect({ relativeTo: group as never, skipShadow: true });
	}
	const height =
		layer.type === "text"
			? layer.fontSize * layer.lineHeight * Math.max(1, layer.text.split("\n").length)
			: Math.max(layer.height, 1);
	const w = layer.width * layer.scaleX;
	const h = height * layer.scaleY;
	return {
		x: Math.min(layer.x, layer.x + w),
		y: Math.min(layer.y, layer.y + h),
		width: Math.abs(w),
		height: Math.abs(h),
	};
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

export function childrenOf(layers: Layer[], frameId: string) {
	return layers.filter((l) => l.parentId === frameId);
}

/** Which frame should a layer belong to, based on where its center sits. */
export function parentFor(layers: Layer[], layer: Layer): string | undefined {
	if (layer.type === "frame") return undefined;
	const b = layerBounds(layer);
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
	return unionBounds(layers.filter((l) => l.visible && !l.parentId).map(layerBounds));
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
