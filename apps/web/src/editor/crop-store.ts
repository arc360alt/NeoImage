import { create } from "zustand";
import { getEditor } from "./store";
import type { ImageLayer } from "./types";

export type CropRect = { x: number; y: number; width: number; height: number };

export const CROP_ASPECTS = [
	{ id: "free", label: "Free", ratio: null },
	{ id: "original", label: "Original", ratio: "original" },
	{ id: "1:1", label: "1:1", ratio: 1 },
	{ id: "4:5", label: "4:5", ratio: 4 / 5 },
	{ id: "3:2", label: "3:2", ratio: 3 / 2 },
	{ id: "16:9", label: "16:9", ratio: 16 / 9 },
	{ id: "9:16", label: "9:16", ratio: 9 / 16 },
] as const;

export type CropAspectId = (typeof CROP_ASPECTS)[number]["id"];

interface CropStore {
	/** Crop rectangle in the layer's local (display) coordinates. */
	rect: CropRect | null;
	aspect: CropAspectId;
	setRect: (rect: CropRect | null) => void;
	setAspect: (aspect: CropAspectId) => void;
}

export const useCropStore = create<CropStore>()((set) => ({
	rect: null,
	aspect: "free",
	setRect: (rect) => set({ rect }),
	setAspect: (aspect) => set({ aspect }),
}));

/** Full (uncropped) image geometry in layer-local coordinates. */
export function getCropGeometry(layer: ImageLayer, natural: { width: number; height: number }) {
	const crop = layer.crop ?? { x: 0, y: 0, width: natural.width, height: natural.height };
	const scale = layer.width / crop.width;
	return {
		scale,
		crop,
		full: {
			x: -crop.x * scale,
			y: -crop.y * scale,
			width: natural.width * scale,
			height: natural.height * scale,
		},
	};
}

export function applyCrop(natural: { width: number; height: number }) {
	const editor = getEditor();
	const layer = editor.doc?.layers.find((l) => l.id === editor.cropLayerId);
	const { rect } = useCropStore.getState();
	if (!layer || layer.type !== "image" || !rect) {
		editor.setCropLayerId(null);
		return;
	}
	const { scale, crop } = getCropGeometry(layer, natural);
	const newCrop = {
		x: crop.x + rect.x / scale,
		y: crop.y + rect.y / scale,
		width: rect.width / scale,
		height: rect.height / scale,
	};
	// Move the layer so the cropped region stays where it is on the canvas.
	const rad = (layer.rotation * Math.PI) / 180;
	const lx = rect.x * layer.scaleX;
	const ly = rect.y * layer.scaleY;
	const x = layer.x + lx * Math.cos(rad) - ly * Math.sin(rad);
	const y = layer.y + lx * Math.sin(rad) + ly * Math.cos(rad);
	editor.updateLayer(layer.id, {
		crop: newCrop,
		width: rect.width,
		height: rect.height,
		x,
		y,
	} as Partial<ImageLayer>);
	editor.setCropLayerId(null);
	useCropStore.getState().setRect(null);
}

export function resetCrop() {
	const editor = getEditor();
	const layer = editor.doc?.layers.find((l) => l.id === editor.cropLayerId);
	if (!layer || layer.type !== "image" || !layer.crop) return;
	useCropStore.getState().setRect(null);
	const scale = layer.width / layer.crop.width;
	const lx = -layer.crop.x * scale * layer.scaleX;
	const ly = -layer.crop.y * scale * layer.scaleY;
	const rad = (layer.rotation * Math.PI) / 180;
	const asset = editor.assets.find((a) => a.id === layer.assetId);
	if (!asset) return;
	editor.updateLayer(layer.id, {
		crop: null,
		width: asset.width * scale,
		height: asset.height * scale,
		x: layer.x + lx * Math.cos(rad) - ly * Math.sin(rad),
		y: layer.y + lx * Math.sin(rad) + ly * Math.cos(rad),
	} as Partial<ImageLayer>);
}
