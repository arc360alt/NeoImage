import type Konva from "konva";
import { getStage } from "./stage";
import { getEditor } from "./store";
import { frameOf, frameRect, isFreeform } from "./freeform";

/** Single layers align to their frame (FreeForm), the artboard, or the viewport. */
function alignTarget(id: string) {
	const doc = getEditor().doc;
	if (!doc) return { x: 0, y: 0, width: 0, height: 0 };
	if (!isFreeform(doc)) return { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height };
	const layer = doc.layers.find((l) => l.id === id);
	const frame = layer && layer.type !== "frame" ? frameOf(doc.layers, layer) : undefined;
	if (frame) return frameRect(frame);
	return getRects([id])[0]?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

function getRects(ids: string[]) {
	const stage = getStage();
	const group = stage?.findOne<Konva.Group>(".content-group");
	if (!stage || !group) return [];
	return ids
		.map((id) => {
			const node = stage.findOne(`#${id}`);
			return node ? { id, rect: node.getClientRect({ relativeTo: group, skipShadow: true }) } : null;
		})
		.filter((r): r is { id: string; rect: { x: number; y: number; width: number; height: number } } => !!r);
}

/** Aligns the selection to the artboard (single) or to the selection bounds (multiple). */
export function alignSelection(mode: AlignMode) {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return;
	const ids = editor.selectedIds.filter((id) => !doc.layers.find((l) => l.id === id)?.locked);
	const rects = getRects(ids);
	if (rects.length === 0) return;

	const bounds =
		rects.length === 1
			? alignTarget(ids[0])
			: (() => {
					const x1 = Math.min(...rects.map((r) => r.rect.x));
					const y1 = Math.min(...rects.map((r) => r.rect.y));
					const x2 = Math.max(...rects.map((r) => r.rect.x + r.rect.width));
					const y2 = Math.max(...rects.map((r) => r.rect.y + r.rect.height));
					return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
				})();

	editor.updateLayers(
		rects.map(({ id, rect }) => {
			const layer = doc.layers.find((l) => l.id === id);
			if (!layer) return { id, patch: {} };
			let dx = 0;
			let dy = 0;
			switch (mode) {
				case "left":
					dx = bounds.x - rect.x;
					break;
				case "center":
					dx = bounds.x + bounds.width / 2 - (rect.x + rect.width / 2);
					break;
				case "right":
					dx = bounds.x + bounds.width - (rect.x + rect.width);
					break;
				case "top":
					dy = bounds.y - rect.y;
					break;
				case "middle":
					dy = bounds.y + bounds.height / 2 - (rect.y + rect.height / 2);
					break;
				case "bottom":
					dy = bounds.y + bounds.height - (rect.y + rect.height);
					break;
			}
			return { id, patch: { x: layer.x + dx, y: layer.y + dy } };
		}),
	);
}

export function distributeSelection(axis: "x" | "y") {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return;
	const rects = getRects(editor.selectedIds);
	if (rects.length < 3) return;
	const sorted = [...rects].sort((a, b) => (axis === "x" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));
	const first = sorted[0].rect;
	const last = sorted[sorted.length - 1].rect;
	const total = sorted.reduce((sum, r) => sum + (axis === "x" ? r.rect.width : r.rect.height), 0);
	const span = axis === "x" ? last.x + last.width - first.x : last.y + last.height - first.y;
	const gap = (span - total) / (sorted.length - 1);
	let cursor = axis === "x" ? first.x : first.y;
	editor.updateLayers(
		sorted.map(({ id, rect }) => {
			const layer = doc.layers.find((l) => l.id === id);
			const target = cursor;
			cursor += (axis === "x" ? rect.width : rect.height) + gap;
			if (!layer) return { id, patch: {} };
			return axis === "x"
				? { id, patch: { x: layer.x + (target - rect.x) } }
				: { id, patch: { y: layer.y + (target - rect.y) } };
		}),
	);
}
