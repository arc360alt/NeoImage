import { beforeEach, describe, expect, test } from "bun:test";
import { useEditorStore, getEditor } from "../store";
import { createFrameLayer, createShapeLayer, solid } from "../defaults";
import {
	fitFramesToContent,
	frameSelection,
	removeSelectedFrames,
	selectChildren,
	selectParents,
} from "../frame-actions";
import type { Layer, ProjectDoc } from "../types";

function load(layers: Layer[]) {
	const doc: ProjectDoc = {
		id: "p1",
		name: "Test",
		mode: "freeform",
		createdAt: 0,
		updatedAt: 0,
		canvas: { width: 1000, height: 1000, background: solid("#ffffff") },
		layers,
		version: 1,
	};
	useEditorStore.setState({ projectId: "p1", doc, past: [], future: [], pending: null, selectedIds: [] });
}

describe("frame actions", () => {
	let a: Layer;
	let b: Layer;
	beforeEach(() => {
		a = createShapeLayer("rect", { id: "a", x: 10, y: 20, width: 100, height: 50 });
		b = createShapeLayer("rect", { id: "b", x: 200, y: 100, width: 40, height: 40 });
		load([a, b]);
	});

	test("frameSelection wraps the selection in a hugging frame, as one undo step", () => {
		getEditor().select(["a", "b"]);
		frameSelection();
		const layers = getEditor().doc?.layers ?? [];
		const frame = layers.find((l) => l.type === "frame");
		expect(frame).toMatchObject({ x: 10, y: 20, width: 230, height: 120 });
		expect(layers.filter((l) => l.parentId === frame?.id).map((l) => l.id)).toEqual(["a", "b"]);
		expect(getEditor().selectedIds).toEqual([frame?.id ?? ""]);
		getEditor().undo();
		expect(getEditor().doc?.layers.some((l) => l.type === "frame")).toBe(false);
	});

	test("select children / parent, then remove the frame", () => {
		getEditor().select(["a", "b"]);
		frameSelection();
		const frameId = getEditor().selectedIds[0];
		selectChildren();
		expect(getEditor().selectedIds).toEqual(["a", "b"]);
		selectParents();
		expect(getEditor().selectedIds).toEqual([frameId]);
		removeSelectedFrames();
		const layers = getEditor().doc?.layers ?? [];
		expect(layers.map((l) => l.id)).toEqual(["a", "b"]);
		expect(layers.every((l) => l.parentId === undefined)).toBe(true);
		expect(getEditor().selectedIds).toEqual(["a", "b"]);
	});

	test("fitFramesToContent hugs the children", () => {
		const frame = createFrameLayer({ id: "f", x: 0, y: 0, width: 1000, height: 1000 });
		load([frame, { ...a, parentId: "f" }, { ...b, parentId: "f" }]);
		fitFramesToContent([frame]);
		expect(getEditor().doc?.layers.find((l) => l.id === "f")).toMatchObject({
			x: 10,
			y: 20,
			width: 230,
			height: 120,
		});
	});
});
