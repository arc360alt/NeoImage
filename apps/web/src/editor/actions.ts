import { toast } from "sonner";
import { createDrawingLayer, createTextLayer } from "./defaults";
import { getEditor } from "./store";
import type { Fill, ImageLayer, Layer } from "./types";
import { getStage } from "./stage";
import { getInsertionArea } from "./insertion";
import { isFreeform } from "./freeform";

/** Adds a text layer centered on the artboard. */
export function addText(init: Partial<Parameters<typeof createTextLayer>[0]> = {}) {
	const { doc, addLayers } = getEditor();
	if (!doc) return;
	const area = getInsertionArea();
	const background = isFreeform(doc)
		? (area.frame?.fill ?? { type: "solid" as const, color: "#ffffff" })
		: doc.canvas.background;
	const fontSize =
		init.fontSize ?? Math.round(Math.max(24, Math.min(area.width, area.height) / 12));
	const width = init.width ?? Math.round(area.width * 0.7);
	const layer = createTextLayer({
		fontSize,
		width,
		fill: { type: "solid", color: contrastColor(background) },
		...init,
	});
	if (init.x === undefined && init.y === undefined) {
		layer.x = Math.round(area.x + (area.width - layer.width) / 2);
		layer.y = Math.round(area.y + area.height / 2 - layer.fontSize / 2);
	}
	addLayers([layer]);
	return layer;
}

function contrastColor(fill: Fill) {
	if (fill.type !== "solid") return "#111111";
	const hex = fill.color.replace("#", "");
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.55 ? "#111111" : "#ffffff";
}

/** Returns the drawing layer brush strokes should go to, creating one if needed. */
export function getOrCreateDrawingLayer(): string | null {
	const { doc, selectedIds, addLayers } = getEditor();
	if (!doc) return null;
	const selected = doc.layers.find(
		(l) => selectedIds.includes(l.id) && l.type === "drawing" && !l.locked,
	);
	if (selected) return selected.id;
	const top = doc.layers[doc.layers.length - 1];
	if (top?.type === "drawing" && !top.locked && top.visible) return top.id;
	// The drawing layer covers the artboard (or, in FreeForm, the target frame / viewport).
	const area = getInsertionArea();
	const layer = createDrawingLayer({
		x: Math.round(area.x),
		y: Math.round(area.y),
		width: Math.round(area.width),
		height: Math.round(area.height),
		parentId: area.frame?.id,
	});
	addLayers([layer], { select: false });
	getEditor().select([layer.id]);
	return layer.id;
}

export function startCrop() {
	const { doc, selectedIds, setCropLayerId } = getEditor();
	if (!doc) return;
	const layer = doc.layers.find(
		(l): l is ImageLayer => l.type === "image" && selectedIds.includes(l.id),
	);
	if (!layer) {
		toast("Select an image to crop");
		return;
	}
	if (layer.locked) {
		toast("Unlock the layer to crop it");
		return;
	}
	setCropLayerId(layer.id);
}

export function flipSelection(axis: "x" | "y") {
	const { doc, selectedIds, updateLayers } = getEditor();
	if (!doc) return;
	const layers = doc.layers.filter((l) => selectedIds.includes(l.id) && !l.locked);
	updateLayers(
		layers.map((layer) => {
			// Flip around the layer's visual center so it stays in place.
			const { width, height } = layerSize(layer);
			const rad = (layer.rotation * Math.PI) / 180;
			if (axis === "x") {
				const dx = width * layer.scaleX;
				return {
					id: layer.id,
					patch: {
						scaleX: -layer.scaleX,
						x: layer.x + dx * Math.cos(rad),
						y: layer.y + dx * Math.sin(rad),
					},
				};
			}
			const dy = height * layer.scaleY;
			return {
				id: layer.id,
				patch: {
					scaleY: -layer.scaleY,
					x: layer.x - dy * Math.sin(rad),
					y: layer.y + dy * Math.cos(rad),
				},
			};
		}),
	);
}

export function layerSize(layer: Layer): { width: number; height: number } {
	const node = getStage()?.findOne(`#${layer.id}`);
	if (node) return { width: node.width(), height: node.height() };
	if (layer.type === "text") {
		const lines = Math.max(1, layer.text.split("\n").length);
		return { width: layer.width, height: lines * layer.fontSize * layer.lineHeight };
	}
	return { width: layer.width, height: Math.max(layer.height, 1) };
}

export function toggleLockSelection() {
	const { doc, selectedIds, updateLayers } = getEditor();
	if (!doc) return;
	const layers = doc.layers.filter((l) => selectedIds.includes(l.id));
	const lock = layers.some((l) => !l.locked);
	updateLayers(layers.map((l) => ({ id: l.id, patch: { locked: lock } })));
}

export function toggleVisibilitySelection() {
	const { doc, selectedIds, updateLayers } = getEditor();
	if (!doc) return;
	const layers = doc.layers.filter((l) => selectedIds.includes(l.id));
	const visible = layers.some((l) => !l.visible);
	updateLayers(layers.map((l) => ({ id: l.id, patch: { visible } })));
}
