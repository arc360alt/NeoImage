import { beforeEach, describe, expect, test } from "bun:test";
import { getEditor, useEditorStore } from "../store";
import { createFrameLayer, createShapeLayer, solid } from "../defaults";
import type { ProjectDoc } from "../types";

function loadFreeform() {
	const doc: ProjectDoc = {
		id: "p1",
		name: "FreeForm",
		mode: "freeform",
		createdAt: 0,
		updatedAt: 0,
		canvas: { width: 1080, height: 1080, background: solid("#ffffff") },
		layers: [],
		version: 1,
	};
	useEditorStore.setState({ projectId: "p1", doc, past: [], future: [], pending: null, selectedIds: [], clipboard: [], assets: [] });
}

const layers = () => getEditor().doc?.layers ?? [];

describe("FreeForm frames", () => {
	beforeEach(loadFreeform);

	test("layers added inside a frame become its children", () => {
		const frame = createFrameLayer({ width: 400, height: 300 });
		getEditor().addLayers([frame]);
		const inside = createShapeLayer("rect", { x: 50, y: 50, width: 100, height: 100 });
		const outside = createShapeLayer("rect", { x: 900, y: 50, width: 100, height: 100 });
		getEditor().addLayers([inside, outside]);
		expect(layers().find((l) => l.id === inside.id)?.parentId).toBe(frame.id);
		expect(layers().find((l) => l.id === outside.id)?.parentId).toBeUndefined();
	});

	test("deleting a frame deletes its children", () => {
		const frame = createFrameLayer({ width: 400, height: 300 });
		getEditor().addLayers([frame, createShapeLayer("rect", { x: 10, y: 10, width: 50, height: 50 })]);
		expect(layers()).toHaveLength(2);
		getEditor().removeLayers([frame.id]);
		expect(layers()).toHaveLength(0);
	});

	test("duplicating a frame copies its children to the right", () => {
		const frame = createFrameLayer({ width: 400, height: 300 });
		const child = createShapeLayer("rect", { x: 10, y: 10, width: 50, height: 50 });
		getEditor().addLayers([frame, child]);
		getEditor().duplicateLayers([frame.id]);
		const frames = layers().filter((l) => l.type === "frame");
		expect(frames).toHaveLength(2);
		const copy = frames.find((f) => f.id !== frame.id);
		// Right of all existing content (the frame is the right-most item).
		expect(copy?.x).toBe(frame.x + 400 + 80);
		const copiedChild = layers().find((l) => l.parentId === copy?.id);
		expect(copiedChild?.x).toBe(child.x + 480);
	});

	test("copy/paste a frame remaps children to the pasted frame", () => {
		const frame = createFrameLayer({ width: 400, height: 300 });
		getEditor().addLayers([frame, createShapeLayer("rect", { x: 10, y: 10, width: 50, height: 50 })]);
		getEditor().select([frame.id]);
		getEditor().copy();
		getEditor().paste();
		const frames = layers().filter((l) => l.type === "frame");
		const pasted = frames.find((f) => f.id !== frame.id);
		expect(layers().filter((l) => l.parentId === pasted?.id)).toHaveLength(1);
		expect(getEditor().selectedIds).toEqual([pasted?.id ?? ""]);
	});

	test("reparentLayers moves a layer out of a frame when dragged away", () => {
		const frame = createFrameLayer({ width: 400, height: 300 });
		const child = createShapeLayer("rect", { x: 10, y: 10, width: 50, height: 50 });
		getEditor().addLayers([frame, child]);
		getEditor().updateLayer(child.id, { x: 1000 });
		getEditor().reparentLayers([child.id]);
		expect(layers().find((l) => l.id === child.id)?.parentId).toBeUndefined();
	});

	test("reorderLayer can move a layer into a frame from the layers tree", () => {
		const frame = createFrameLayer({ width: 400, height: 300 });
		const loose = createShapeLayer("rect", { x: 900, y: 0, width: 50, height: 50 });
		getEditor().addLayers([frame, loose]);
		getEditor().reorderLayer(loose.id, layers().length, frame.id);
		expect(layers().find((l) => l.id === loose.id)?.parentId).toBe(frame.id);
	});
});
