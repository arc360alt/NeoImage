/**
 * Selection-level vector commands: Flatten (Ctrl/Cmd+E), Outline stroke
 * (Ctrl/Cmd+Alt+O) and boolean operations. Each is a single undo step.
 */
import { toast } from "sonner";
import { getEditor } from "./store";
import { createPathLayer } from "./defaults";
import { descendantsOf, topmostIds } from "./freeform";
import { compose } from "./matrix";
import { mapSubpaths, pathFromWorld, pathPatchForLocal } from "./path";
import {
	BOOLEAN_LABELS,
	type BooleanOp,
	booleanSubpaths,
	isVectorLayer,
	localSubpaths,
	outlineStroke,
	worldGeometry,
} from "./vector-ops";
import type { Layer, PathLayer, ShapeLayer, Subpath } from "./types";

type VectorLayer = ShapeLayer | PathLayer;

/**
 * The vector layers a command works on: selected shapes/paths, plus the
 * contents of selected groups when those are entirely vector.
 */
export function vectorTargets(layers: Layer[], selectedIds: string[]) {
	const roots = topmostIds(layers, selectedIds)
		.map((id) => layers.find((l) => l.id === id))
		.filter((l): l is Layer => !!l && !l.locked);
	const vectors: VectorLayer[] = [];
	const remove: string[] = [];
	for (const layer of roots) {
		if (isVectorLayer(layer)) {
			vectors.push(layer);
			remove.push(layer.id);
		} else if (layer.type === "group") {
			const inside = descendantsOf(layers, layer.id);
			if (inside.length === 0 || !inside.every((l) => l.type === "group" || isVectorLayer(l))) continue;
			// Keep stacking order.
			const ids = new Set(inside.map((l) => l.id));
			vectors.push(...layers.filter((l): l is VectorLayer => ids.has(l.id) && isVectorLayer(l) && l.visible));
			remove.push(layer.id, ...inside.map((l) => l.id));
		}
	}
	// Bottom-most first, by position in the layer list.
	const order = new Map(layers.map((l, i) => [l.id, i]));
	vectors.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
	return { vectors, remove, roots };
}

export function canFlatten(layers: Layer[], selectedIds: string[]) {
	return vectorTargets(layers, selectedIds).vectors.length > 0;
}

export function canBoolean(layers: Layer[], selectedIds: string[]) {
	return vectorTargets(layers, selectedIds).vectors.length >= 2;
}

/** A path layer that takes over `source`'s look and place. */
function pathLike(source: Layer, geometry: Pick<PathLayer, "x" | "y" | "width" | "height" | "subpaths">, extra: Partial<PathLayer> = {}) {
	const vector = isVectorLayer(source) ? source : undefined;
	const isLine = vector?.type === "shape" && (vector.shape === "line" || vector.shape === "arrow");
	return createPathLayer({
		name: source.name,
		parentId: source.parentId,
		opacity: source.opacity,
		blendMode: source.blendMode,
		shadow: structuredClone(source.shadow),
		adjustments: structuredClone(source.adjustments),
		visible: source.visible,
		exportSettings: source.exportSettings && structuredClone(source.exportSettings),
		fill: vector && !isLine ? structuredClone(vector.fill) : { type: "transparent" },
		stroke: vector ? structuredClone(vector.stroke) : { enabled: false, color: "#000000", width: 1 },
		fillRule: vector?.type === "path" ? vector.fillRule : "nonzero",
		...geometry,
		...extra,
	});
}

/** Removes `remove` and puts `added` where the bottom-most removed layer was. */
function replaceLayers(layers: Layer[], remove: string[], added: Layer[], anchorId: string) {
	const gone = new Set(remove);
	const at = layers.findIndex((l) => l.id === anchorId);
	const before = layers.slice(0, Math.max(0, at)).filter((l) => !gone.has(l.id));
	const after = layers.slice(Math.max(0, at)).filter((l) => !gone.has(l.id));
	return [...before, ...added, ...after];
}

/** Ctrl/Cmd+E. Returns false when nothing in the selection can be flattened. */
export function flattenSelection(): boolean {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return false;
	const { vectors, remove, roots } = vectorTargets(doc.layers, editor.selectedIds);
	if (vectors.length === 0) return false;
	const bottom = vectors[0];
	const anchorRoot = rootOf(doc.layers, roots, bottom);
	let result: PathLayer;
	if (vectors.length === 1 && anchorRoot.id === bottom.id) {
		// A single layer keeps its rotation and flip; only its geometry becomes editable.
		if (bottom.type === "path") return true;
		result = pathLike(bottom, pathPatchForLocal(bottom, localSubpaths(bottom)), {
			rotation: bottom.rotation,
			scaleX: bottom.scaleX,
			scaleY: bottom.scaleY,
		});
	} else {
		// Several layers merge into one path (all their subpaths, in world space).
		result = pathLike(bottom, pathFromWorld(vectors.flatMap((v) => worldGeometry(v))), {
			name: roots.length === 1 ? roots[0].name : bottom.name,
			parentId: anchorRoot.parentId,
		});
	}
	editor.transformLayers((layers) => replaceLayers(layers, remove, [result], anchorRoot.id));
	editor.select([result.id]);
	return true;
}

/** The selected root (the layer itself or the group around it) the bottom-most vector came from. */
function rootOf(layers: Layer[], roots: Layer[], layer: Layer) {
	return roots.find((r) => r.id === layer.id || descendantsOf(layers, r.id).some((d) => d.id === layer.id)) ?? layer;
}

/** Ctrl/Cmd+Alt+O: strokes become filled shapes. A filled layer keeps its fill underneath. */
export async function outlineStrokeSelection(): Promise<boolean> {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return false;
	const { vectors } = vectorTargets(doc.layers, editor.selectedIds);
	const stroked = vectors.filter((v) => v.stroke.enabled && v.stroke.width > 0);
	if (stroked.length === 0) {
		toast.info("Select a shape or path with a stroke to outline it");
		return false;
	}
	const outlines = await Promise.all(
		stroked.map(async (layer) => {
			const shape = worldStrokeGeometry(layer);
			const closed = isClosed(layer);
			const align = closed ? (layer.stroke.align ?? "center") : "center";
			// Inside/outside strokes: outline at double width, then keep the inner/outer half.
			let geometry = await outlineStroke(shape, {
				width: align === "center" ? layer.stroke.width : layer.stroke.width * 2,
				cap: layer.stroke.cap ?? "round",
				join: layer.stroke.join ?? "round",
			});
			if (align !== "center" && geometry.length > 0) {
				const fillRule = layer.type === "path" ? layer.fillRule : "nonzero";
				geometry = await booleanSubpaths(align === "inside" ? "intersect" : "subtract", [
					{ subpaths: geometry },
					{ subpaths: shape, fillRule },
				]);
			}
			return { layer, geometry };
		}),
	);
	const replacements = new Map<string, Layer[]>();
	const newIds: string[] = [];
	for (const { layer, geometry } of outlines) {
		if (geometry.length === 0) continue;
		const outline = pathLike(layer, pathFromWorld(geometry), {
			name: `${layer.name} outline`,
			fill: { type: "solid", color: layer.stroke.color },
			stroke: { ...layer.stroke, enabled: false },
			fillRule: "nonzero",
		});
		const isLine = layer.type === "shape" && (layer.shape === "line" || layer.shape === "arrow");
		const keepsFill = !isLine && layer.fill.type !== "transparent";
		replacements.set(
			layer.id,
			keepsFill ? [{ ...layer, stroke: { ...layer.stroke, enabled: false } } as Layer, outline] : [outline],
		);
		newIds.push(outline.id);
	}
	if (newIds.length === 0) return false;
	editor.transformLayers((layers) => layers.flatMap((l) => replacements.get(l.id) ?? [l]));
	editor.select(newIds);
	return true;
}

function isClosed(layer: VectorLayer) {
	if (layer.type === "shape") return layer.shape !== "line" && layer.shape !== "arrow";
	return layer.subpaths.length > 0 && layer.subpaths.every((s) => s.closed);
}

/**
 * Geometry whose stroke is outlined, in world space. Inside/outside strokes
 * (Phase 5) are resolved by `outlineStroke` callers via booleans.
 */
function worldStrokeGeometry(layer: VectorLayer): Subpath[] {
	const local = localSubpaths(layer);
	// Strokes don't scale with flips, but they do follow the layer's transform.
	return mapSubpaths(local, compose(layer));
}

/** Union / subtract / intersect / exclude the selection into one path. */
export async function booleanSelection(op: BooleanOp): Promise<boolean> {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return false;
	const { vectors, remove, roots } = vectorTargets(doc.layers, editor.selectedIds);
	if (vectors.length < 2) {
		toast.info("Select two or more shapes or paths");
		return false;
	}
	const result = await booleanSubpaths(
		op,
		vectors.map((v) => ({
			subpaths: worldGeometry(v),
			fillRule: v.type === "path" ? v.fillRule : "nonzero",
		})),
	);
	// The document may have changed while paper.js was loading.
	const current = getEditor().doc;
	if (!current || current !== doc) return false;
	const bottom = vectors[0];
	const anchorRoot = rootOf(doc.layers, roots, bottom);
	if (result.length === 0) {
		toast.info(`${BOOLEAN_LABELS[op]} left nothing behind`);
		editor.transformLayers((layers) => replaceLayers(layers, remove, [], anchorRoot.id));
		editor.clearSelection();
		return true;
	}
	const layer = pathLike(bottom, pathFromWorld(result), {
		name: BOOLEAN_LABELS[op],
		parentId: anchorRoot.parentId,
		// Booleans produce fills; an open line's "fill" would otherwise vanish.
		fill: bottom.type === "shape" && (bottom.shape === "line" || bottom.shape === "arrow")
			? { type: "solid", color: bottom.stroke.color }
			: structuredClone(bottom.fill),
		fillRule: "nonzero",
	});
	editor.transformLayers((layers) => replaceLayers(layers, remove, [layer], anchorRoot.id));
	editor.select([layer.id]);
	return true;
}
