import { toast } from "sonner";
import { getEditor } from "./store";
import { getSettings } from "./settings-store";
import { createFrameLayer, solid } from "./defaults";
import { childrenOf, isFreeform, layerBounds, nextFrameName, unionBounds } from "./freeform";
import type { FrameLayer, Layer } from "./types";

/** Wraps the selected (non-frame) layers in a new frame that hugs them, like Figma's Ctrl+Alt+G. */
export function frameSelection() {
	const { doc, selectedIds } = getEditor();
	if (!doc || !isFreeform(doc)) return;
	const selected = doc.layers.filter((l) => selectedIds.includes(l.id) && l.type !== "frame");
	if (selected.length === 0) {
		if (selectedIds.length > 0) toast.info("Frames can't be placed inside other frames");
		return;
	}
	const bounds = unionBounds(selected.map(layerBounds));
	if (!bounds) return;
	const settings = getSettings();
	const x = Math.floor(bounds.x);
	const y = Math.floor(bounds.y);
	const frame = createFrameLayer({
		name: nextFrameName(doc.layers),
		x,
		y,
		width: Math.max(1, Math.ceil(bounds.x + bounds.width) - x),
		height: Math.max(1, Math.ceil(bounds.y + bounds.height) - y),
		fill: solid(settings.frameFill),
		clipContent: settings.frameClip,
	});
	const ids = new Set(selected.map((l) => l.id));
	getEditor().transformLayers((layers) => {
		const firstIndex = layers.findIndex((l) => ids.has(l.id));
		const next = layers.map((l) => (ids.has(l.id) ? ({ ...l, parentId: frame.id } as Layer) : l));
		next.splice(Math.max(0, firstIndex), 0, frame);
		return next;
	});
	getEditor().select([frame.id]);
}

/** Deletes the selected frames but keeps what's inside them. */
export function removeSelectedFrames() {
	const { doc, selectedIds } = getEditor();
	if (!doc) return;
	const frameIds = new Set(
		doc.layers.filter((l) => l.type === "frame" && selectedIds.includes(l.id)).map((l) => l.id),
	);
	if (frameIds.size === 0) return;
	const freed = doc.layers.filter((l) => l.parentId && frameIds.has(l.parentId)).map((l) => l.id);
	getEditor().transformLayers((layers) =>
		layers
			.filter((l) => !frameIds.has(l.id))
			.map((l) =>
				l.parentId && frameIds.has(l.parentId) ? ({ ...l, parentId: undefined } as Layer) : l,
			),
	);
	getEditor().select(freed);
}

/** Frames this action applies to: selected frames, or the frames of selected layers. */
function targetFrames(): FrameLayer[] {
	const { doc, selectedIds } = getEditor();
	if (!doc) return [];
	const ids = new Set<string>();
	for (const id of selectedIds) {
		const layer = doc.layers.find((l) => l.id === id);
		if (layer?.type === "frame") ids.add(layer.id);
		else if (layer?.parentId) ids.add(layer.parentId);
	}
	return doc.layers.filter((l): l is FrameLayer => l.type === "frame" && ids.has(l.id));
}

/** Resizes frames to hug their contents (Figma's "Resize to fit"). */
export function fitFramesToContent(frames: FrameLayer[] = targetFrames()) {
	const doc = getEditor().doc;
	if (!doc || frames.length === 0) return;
	const patches = frames
		.map((frame) => {
			const bounds = unionBounds(
				childrenOf(doc.layers, frame.id).filter((l) => l.visible).map(layerBounds),
			);
			if (!bounds) return null;
			const x = Math.floor(bounds.x);
			const y = Math.floor(bounds.y);
			return {
				id: frame.id,
				patch: {
					x,
					y,
					width: Math.max(1, Math.ceil(bounds.x + bounds.width) - x),
					height: Math.max(1, Math.ceil(bounds.y + bounds.height) - y),
				},
			};
		})
		.filter((p): p is NonNullable<typeof p> => p !== null);
	if (patches.length === 0) {
		toast.info("Frame is empty");
		return;
	}
	getEditor().updateLayers(patches);
}

/** Enter: select what's inside the selected frames, or edit the selected text. */
export function selectChildren() {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return;
	const selected = doc.layers.filter((l) => editor.selectedIds.includes(l.id));
	if (selected.length === 1 && selected[0].type === "text" && !selected[0].locked) {
		editor.setEditingTextId(selected[0].id);
		return;
	}
	const children = selected
		.filter((l) => l.type === "frame")
		.flatMap((frame) => childrenOf(doc.layers, frame.id))
		.filter((l) => l.visible && !l.locked)
		.map((l) => l.id);
	if (children.length > 0) editor.select(children);
}

/** Shift+Enter: select the frames that contain the selection. */
export function selectParents() {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return;
	const parents = new Set<string>();
	for (const id of editor.selectedIds) {
		const parentId = doc.layers.find((l) => l.id === id)?.parentId;
		if (parentId && doc.layers.some((l) => l.id === parentId)) parents.add(parentId);
	}
	if (parents.size > 0) editor.select([...parents]);
}

/** Fit the selected layers into view. */
export function zoomToSelection() {
	const { doc, selectedIds, requestFit } = getEditor();
	if (!doc) return;
	const bounds = unionBounds(doc.layers.filter((l) => selectedIds.includes(l.id)).map(layerBounds));
	if (bounds) requestFit(bounds);
}
