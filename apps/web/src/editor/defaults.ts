import { nanoid } from "nanoid";
import type {
	Adjustments,
	DrawingLayer,
	ExportSetting,
	Fill,
	FrameLayer,
	ImageLayer,
	LayoutGrid,
	Shadow,
	ShapeKind,
	ShapeLayer,
	Stroke,
	TextLayer,
} from "./types";

export const DEFAULT_ADJUSTMENTS: Adjustments = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	hue: 0,
	temperature: 0,
	tint: 0,
	fade: 0,
	blur: 0,
	grayscale: 0,
	sepia: 0,
	invert: 0,
	vignette: 0,
	noise: 0,
	pixelate: 0,
	posterize: 0,
};

export const DEFAULT_SHADOW: Shadow = {
	enabled: false,
	color: "#000000",
	blur: 20,
	offsetX: 0,
	offsetY: 8,
	opacity: 0.35,
};

export const DEFAULT_STROKE: Stroke = {
	enabled: false,
	color: "#000000",
	width: 4,
};

export const solid = (color: string): Fill => ({ type: "solid", color });

function base() {
	return {
		id: nanoid(10),
		x: 0,
		y: 0,
		rotation: 0,
		scaleX: 1,
		scaleY: 1,
		opacity: 1,
		visible: true,
		locked: false,
		blendMode: "source-over" as const,
		adjustments: { ...DEFAULT_ADJUSTMENTS },
		shadow: { ...DEFAULT_SHADOW },
	};
}

export function createImageLayer(
	init: Pick<ImageLayer, "assetId" | "width" | "height" | "name"> &
		Partial<ImageLayer>,
): ImageLayer {
	return {
		...base(),
		type: "image",
		crop: null,
		cornerRadius: 0,
		stroke: { ...DEFAULT_STROKE, color: "#ffffff" },
		...init,
	};
}

export function createTextLayer(init: Partial<TextLayer> = {}): TextLayer {
	return {
		...base(),
		type: "text",
		name: init.text?.slice(0, 24) || "Text",
		text: "Add your text",
		width: 600,
		fontFamily: "Inter",
		fontSize: 64,
		fontWeight: "normal",
		fontStyle: "normal",
		underline: false,
		lineThrough: false,
		align: "center",
		lineHeight: 1.2,
		letterSpacing: 0,
		fill: solid("#111111"),
		stroke: { ...DEFAULT_STROKE },
		uppercase: false,
		...init,
	};
}

const SHAPE_NAMES: Record<ShapeKind, string> = {
	rect: "Rectangle",
	ellipse: "Ellipse",
	triangle: "Triangle",
	star: "Star",
	polygon: "Polygon",
	heart: "Heart",
	line: "Line",
	arrow: "Arrow",
};

export function createShapeLayer(
	shape: ShapeKind,
	init: Partial<ShapeLayer> = {},
): ShapeLayer {
	const isLine = shape === "line" || shape === "arrow";
	return {
		...base(),
		type: "shape",
		name: SHAPE_NAMES[shape],
		shape,
		width: 300,
		height: isLine ? 0 : 300,
		fill: isLine ? { type: "transparent" } : solid("#3b82f6"),
		stroke: isLine
			? { enabled: true, color: "#111111", width: 10 }
			: { ...DEFAULT_STROKE },
		cornerRadius: 0,
		sides: shape === "star" ? 5 : 6,
		innerRatio: 0.45,
		...init,
	};
}

export function createDrawingLayer(
	init: Pick<DrawingLayer, "width" | "height"> & Partial<DrawingLayer>,
): DrawingLayer {
	return {
		...base(),
		type: "drawing",
		name: "Drawing",
		strokes: [],
		...init,
	};
}

export function createExportSetting(init: Partial<ExportSetting> = {}): ExportSetting {
	return { id: nanoid(6), scale: 1, format: "png", suffix: "", ...init };
}

export function createFrameLayer(
	init: Pick<FrameLayer, "width" | "height"> & Partial<FrameLayer>,
): FrameLayer {
	return {
		...base(),
		type: "frame",
		name: "Frame",
		fill: solid("#ffffff"),
		stroke: { ...DEFAULT_STROKE, color: "#d4d4d4", width: 1 },
		cornerRadius: 0,
		clipContent: true,
		exportSettings: [createExportSetting()],
		...init,
	};
}

export function createLayoutGrid(type: LayoutGrid["type"] = "grid"): LayoutGrid {
	return {
		id: nanoid(8),
		type,
		visible: true,
		color: type === "grid" ? "#ff0000" : "#ff4d4d",
		opacity: 0.1,
		size: 10,
		count: type === "grid" ? 0 : type === "columns" ? 5 : 3,
		gutter: 20,
		margin: type === "grid" ? 0 : 20,
	};
}
