/**
 * Applying an affine transform to layers, for transforming groups.
 *
 * Groups have no transform of their own, so moving, scaling, rotating or
 * flipping a group bakes the transform into each child. Paths take the full
 * matrix into their anchors (exact). Other layers keep translate · rotate ·
 * scale (any skew from non-uniform scaling of rotated children is dropped)
 * and fold the scale into their size, like the transformer does.
 */
import { compose, decompose, multiply, type Matrix, translate, scale as scaleM } from "./matrix";
import { mapSubpaths, pathFromWorld } from "./path";
import { descendantsOf } from "./freeform";
import type { DrawingLayer, Layer, PathLayer, ShapeLayer, TextLayer } from "./types";

export type LayerPatch = { id: string; patch: Partial<Layer> };

const isTranslation = (m: Matrix) =>
	Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9;

/** The patch that puts `layer` where `m` (world space) sends it. */
export function transformLayer(layer: Layer, m: Matrix): Partial<Layer> {
	if (layer.type === "group") return {};
	if (isTranslation(m)) return { x: layer.x + m[4], y: layer.y + m[5] };
	const full = multiply(m, compose(layer));
	if (layer.type === "path") {
		// Bake everything into the anchors: exact for any matrix, skew included.
		const g = pathFromWorld(mapSubpaths(layer.subpaths, full));
		return { ...g, rotation: 0, scaleX: 1, scaleY: 1 } as Partial<PathLayer>;
	}
	const d = decompose(full);
	const kx = Math.abs(d.scaleX);
	const ky = Math.abs(d.scaleY);
	const base = {
		x: d.x,
		y: d.y,
		rotation: d.rotation,
		scaleX: 1,
		scaleY: d.scaleY < 0 ? -1 : 1,
	};
	switch (layer.type) {
		case "text":
			return {
				...base,
				width: Math.max(1, layer.width * kx),
				fontSize: Math.max(1, layer.fontSize * ky),
				letterSpacing: layer.letterSpacing * ky,
				stroke: { ...layer.stroke, width: layer.stroke.width * ky },
			} as Partial<TextLayer>;
		case "drawing":
			return {
				...base,
				width: layer.width * kx,
				height: layer.height * ky,
				strokes: layer.strokes.map((s) => ({
					...s,
					size: s.size * Math.sqrt(kx * ky),
					points: s.points.map((v, i) => (i % 2 === 0 ? v * kx : v * ky)),
				})),
			} as Partial<DrawingLayer>;
		case "shape": {
			const isLine = layer.shape === "line" || layer.shape === "arrow";
			return {
				...base,
				width: Math.max(1, layer.width * kx),
				height: isLine ? 0 : Math.max(1, layer.height * ky),
			} as Partial<ShapeLayer>;
		}
		default:
			return { ...base, width: Math.max(1, layer.width * kx), height: Math.max(1, layer.height * ky) };
	}
}

/** Patches that transform everything inside a group (or frame) by `m`. */
export function transformDescendants(layers: Layer[], id: string, m: Matrix): LayerPatch[] {
	return descendantsOf(layers, id)
		.filter((l) => l.type !== "group" && l.type !== "frame")
		.map((l) => ({ id: l.id, patch: transformLayer(l, m) }));
}

/** Scale around a point (for flips and resizing a group from its panel). */
export function scaleAround(sx: number, sy: number, cx: number, cy: number): Matrix {
	return multiply(multiply(translate(cx, cy), scaleM(sx, sy)), translate(-cx, -cy));
}

/** Maps rect `from` onto rect `to` (resizing a group to a new box). */
export function rectToRect(
	from: { x: number; y: number; width: number; height: number },
	to: { x: number; y: number; width: number; height: number },
): Matrix {
	const sx = from.width > 1e-9 ? to.width / from.width : 1;
	const sy = from.height > 1e-9 ? to.height / from.height : 1;
	return multiply(translate(to.x, to.y), multiply(scaleM(sx, sy), translate(-from.x, -from.y)));
}
