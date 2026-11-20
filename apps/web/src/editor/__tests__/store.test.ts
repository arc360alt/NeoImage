import { beforeEach, describe, expect, test } from "bun:test";
import { useEditorStore, getEditor } from "../store";
import { createShapeLayer, createTextLayer, solid } from "../defaults";
import type { ProjectDoc } from "../types";

function loadDoc() {
	const doc: ProjectDoc = {
		id: "p1",
		name: "Test",
		createdAt: 0,
		updatedAt: 0,
		canvas: { width: 1000, height: 1000, background: solid("#ffffff") },
		layers: [],
		version: 1,
	};
	useEditorStore.setState({
		projectId: "p1",
		doc,
		past: [],
		future: [],
		pending: null,
		selectedIds: [],
		clipboard: [],
		assets: [],
	});
}

describe("editor history", () => {
	beforeEach(loadDoc);

	test("discrete edits can be undone and redone", () => {
		const layer = createShapeLayer("rect");
		getEditor().addLayers([layer]);
		getEditor().updateLayer(layer.id, { x: 50 });
		expect(getEditor().doc?.layers[0].x).toBe(50);

		getEditor().undo();
		expect(getEditor().doc?.layers[0].x).toBe(0);
		getEditor().undo();
		expect(getEditor().doc?.layers).toHaveLength(0);

		getEditor().redo();
		getEditor().redo();
		expect(getEditor().doc?.layers[0].x).toBe(50);
	});

	test("transient edits collapse into a single history entry", () => {
		const layer = createShapeLayer("rect");
		getEditor().addLayers([layer]);
		const before = getEditor().past.length;
		for (let i = 1; i <= 10; i++) {
			getEditor().updateLayer(layer.id, { opacity: 1 - i * 0.05 }, { transient: true });
		}
		getEditor().commit();
		expect(getEditor().past.length).toBe(before + 1);
		getEditor().undo();
		expect(getEditor().doc?.layers[0].opacity).toBe(1);
	});

	test("undo removes selection of layers that no longer exist", () => {
		const layer = createTextLayer();
		getEditor().addLayers([layer]);
		expect(getEditor().selectedIds).toEqual([layer.id]);
		getEditor().undo();
		expect(getEditor().selectedIds).toEqual([]);
	});
});

describe("layer ordering", () => {
	beforeEach(loadDoc);

	test("moveLayers up/down/top/bottom", () => {
		const [a, b, c] = ["a", "b", "c"].map((name) => createShapeLayer("rect", { name }));
		getEditor().addLayers([a, b, c]);
		const names = () => getEditor().doc?.layers.map((l) => l.name).join("");

		getEditor().moveLayers([a.id], "up");
		expect(names()).toBe("bac");
		getEditor().moveLayers([a.id], "top");
		expect(names()).toBe("bca");
		getEditor().moveLayers([a.id], "bottom");
		expect(names()).toBe("abc");
		getEditor().moveLayers([c.id], "down");
		expect(names()).toBe("acb");
	});

	test("duplicate inserts copies above the originals and selects them", () => {
		const layer = createShapeLayer("ellipse");
		getEditor().addLayers([layer]);
		getEditor().duplicateLayers([layer.id]);
		const layers = getEditor().doc?.layers ?? [];
		expect(layers).toHaveLength(2);
		expect(layers[1].id).not.toBe(layer.id);
		expect(layers[1].x).toBe(layer.x + 24);
		expect(getEditor().selectedIds).toEqual([layers[1].id]);
	});

	test("copy and paste creates new layers", () => {
		const layer = createTextLayer({ text: "Hi" });
		getEditor().addLayers([layer]);
		getEditor().copy();
		getEditor().paste();
		const layers = getEditor().doc?.layers ?? [];
		expect(layers).toHaveLength(2);
		expect(new Set(layers.map((l) => l.id)).size).toBe(2);
	});
});
