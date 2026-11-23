import { getEditor } from "./store";
import {
	frameAt,
	frameOf,
	frameRect,
	isFreeform,
	type Rect,
	viewportRect,
} from "./freeform";
import type { FrameLayer } from "./types";

export type InsertionArea = Rect & { frame?: FrameLayer };

/**
 * Where newly added content should go.
 * - Default mode: the artboard.
 * - FreeForm: the selected frame (or the frame of the selected layer), else
 *   the frame under the middle of the screen, else the visible viewport.
 */
export function getInsertionArea(): InsertionArea {
	const { doc, selectedIds } = getEditor();
	if (!doc) return { x: 0, y: 0, width: 1080, height: 1080 };
	if (!isFreeform(doc)) {
		return { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height };
	}
	const byId = new Map(doc.layers.map((l) => [l.id, l]));
	for (const id of selectedIds) {
		const layer = byId.get(id);
		const frame = layer ? frameOf(doc.layers, layer) : undefined;
		if (frame?.type === "frame") return { ...frameRect(frame), frame };
	}
	const view = viewportRect();
	if (view) {
		const center = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
		const frame = frameAt(doc.layers, center);
		if (frame) return { ...frameRect(frame), frame };
		// Leave a margin so new items don't touch the screen edges.
		return {
			x: view.x + view.width * 0.2,
			y: view.y + view.height * 0.2,
			width: view.width * 0.6,
			height: view.height * 0.6,
		};
	}
	return { x: 0, y: 0, width: 800, height: 600 };
}

/** Center a box of the given size inside the insertion area. */
export function centerIn(area: Rect, width: number, height: number) {
	return {
		x: Math.round(area.x + (area.width - width) / 2),
		y: Math.round(area.y + (area.height - height) / 2),
	};
}
