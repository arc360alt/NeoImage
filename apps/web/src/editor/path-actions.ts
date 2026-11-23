import { getEditor } from "./store";
import { applyLinear, invert } from "./matrix";
import { deleteAnchors, layerMatrix, pathPatchForLocal, pointKey } from "./path";
import type { PathLayer } from "./types";

function editingPath(): PathLayer | undefined {
	const { doc, editingPathId } = getEditor();
	const layer = doc?.layers.find((l) => l.id === editingPathId);
	return layer?.type === "path" ? layer : undefined;
}

/** Delete in path edit mode: removes the selected points (and the layer once nothing is left). */
export function deleteSelectedPoints() {
	const editor = getEditor();
	const layer = editingPath();
	if (!layer || editor.selectedPoints.length === 0) return;
	const subpaths = deleteAnchors(layer.subpaths, new Set(editor.selectedPoints));
	editor.setSelectedPoints([]);
	if (subpaths.length === 0) {
		editor.setEditingPathId(null);
		editor.removeLayers([layer.id]);
		return;
	}
	editor.updateLayer(layer.id, pathPatchForLocal(layer, subpaths));
}

/** Arrow keys in path edit mode move the selected points (world-space delta). */
export function nudgeSelectedPoints(dx: number, dy: number) {
	const editor = getEditor();
	const layer = editingPath();
	if (!layer || editor.selectedPoints.length === 0) return;
	const local = applyLinear(invert(layerMatrix(layer)), { x: dx, y: dy });
	const keys = new Set(editor.selectedPoints);
	const subpaths = layer.subpaths.map((s, si) => ({
		closed: s.closed,
		anchors: s.anchors.map((a, ai) =>
			keys.has(pointKey(si, ai)) ? { ...a, x: a.x + local.x, y: a.y + local.y } : a,
		),
	}));
	editor.updateLayer(layer.id, pathPatchForLocal(layer, subpaths), { transient: true });
}
