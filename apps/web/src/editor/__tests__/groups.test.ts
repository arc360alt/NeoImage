import { beforeEach, describe, expect, test } from "bun:test";
import { getEditor, useEditorStore } from "../store";
import { createFrameLayer, createGroupLayer, createPathLayer, createShapeLayer, solid } from "../defaults";
import {
	clickTarget,
	doubleClickTarget,
	enteredGroups,
	groupBounds,
	groupLayers,
	groupSelection,
	isReachable,
	setGroupBox,
	ungroupLayers,
	ungroupSelection,
} from "../group-actions";
import { ancestorsOf, descendantsOf, frameOf, layerBounds, topmostIds } from "../freeform";
import { fitFramesToContent, frameSelection, removeSelectedFrames } from "../frame-actions";
import { transformDescendants } from "../transform";
import { rotate } from "../matrix";
import { pathFromWorld, rectSubpath, worldSubpaths } from "../path";
import { artboardToSvg } from "../svg-export";
import { flipSelection } from "../actions";
import type { Layer, PathLayer, ProjectDoc } from "../types";

function load(layers: Layer[], mode: ProjectDoc["mode"] = "freeform") {
	useEditorStore.setState({
		projectId: "p1",
		doc: {
			id: "p1",
			name: "Test",
			mode,
			createdAt: 0,
			updatedAt: 0,
			canvas: { width: 1000, height: 1000, background: solid("#ffffff") },
			layers,
			version: 1,
		},
		past: [],
		future: [],
		pending: null,
		selectedIds: [],
		clipboard: [],
		assets: [],
	});
}

const layers = () => getEditor().doc?.layers ?? [];
const find = (id: string) => layers().find((l) => l.id === id) as Layer;

/** frame ⊃ group ⊃ (a, inner group ⊃ b) */
function nested() {
	const frame = createFrameLayer({ name: "Frame", x: 0, y: 0, width: 500, height: 500 });
	const group = createGroupLayer({ name: "Outer", parentId: frame.id });
	const inner = createGroupLayer({ name: "Inner", parentId: group.id });
	const a = createShapeLayer("rect", { name: "A", x: 10, y: 10, width: 50, height: 50, parentId: group.id });
	const b = createShapeLayer("rect", { name: "B", x: 100, y: 100, width: 50, height: 50, parentId: inner.id });
	return { frame, group, inner, a, b, all: [frame, a, b, inner, group] as Layer[] };
}

describe("tree helpers", () => {
	test("descendants, ancestors and frames work through nested groups", () => {
		const { frame, group, inner, a, b, all } = nested();
		expect(descendantsOf(all, group.id).map((l) => l.id).sort()).toEqual([a.id, b.id, inner.id].sort());
		expect(ancestorsOf(all, b.id).map((l) => l.id)).toEqual([inner.id, group.id, frame.id]);
		expect(frameOf(all, b)?.id).toBe(frame.id);
		expect(topmostIds(all, [b.id, group.id, a.id])).toEqual([group.id]);
	});

	test("group bounds come from their children", () => {
		const { group, all } = nested();
		expect(layerBounds(group, all)).toEqual({ x: 10, y: 10, width: 140, height: 140 });
	});

	test("cycles in parent links don't hang", () => {
		const g1 = createGroupLayer();
		const g2 = createGroupLayer({ parentId: g1.id });
		g1.parentId = g2.id;
		expect(ancestorsOf([g1, g2], g1.id)).toHaveLength(1);
		expect(descendantsOf([g1, g2], g1.id)).toHaveLength(1);
	});
});

describe("grouping", () => {
	beforeEach(() => load([]));

	test("group wraps the selection at the top-most layer's place and parent", () => {
		const frame = createFrameLayer({ width: 400, height: 400 });
		const a = createShapeLayer("rect", { parentId: frame.id });
		const other = createShapeLayer("rect", { parentId: frame.id });
		const b = createShapeLayer("ellipse", { parentId: frame.id });
		const result = groupLayers([frame, a, other, b], [a.id, b.id]);
		if (!result) throw new Error("no group");
		const ids = result.layers.map((l) => l.id);
		expect(ids).toEqual([frame.id, a.id, other.id, b.id, result.groupId]);
		const group = result.layers.find((l) => l.id === result.groupId);
		expect(group?.parentId).toBe(frame.id);
		expect(result.layers.filter((l) => l.parentId === result.groupId).map((l) => l.id)).toEqual([a.id, b.id]);
	});

	test("Ctrl+G / Ctrl+Shift+G round-trip, with one undo step each", () => {
		const a = createShapeLayer("rect", { opacity: 0.5 });
		const b = createShapeLayer("ellipse");
		load([a, b], "default");
		getEditor().select([a.id, b.id]);
		groupSelection();
		const groupId = getEditor().selectedIds[0];
		expect(find(groupId).type).toBe("group");
		expect(find(a.id).parentId).toBe(groupId);
		getEditor().updateLayer(groupId, { opacity: 0.5 });
		ungroupSelection();
		expect(layers().some((l) => l.type === "group")).toBe(false);
		expect(find(a.id).parentId).toBeUndefined();
		// Group opacity is folded into the children.
		expect(find(a.id).opacity).toBeCloseTo(0.25);
		expect(getEditor().selectedIds.sort()).toEqual([a.id, b.id].sort());
		getEditor().undo();
		getEditor().undo();
		expect(find(groupId).type).toBe("group");
		getEditor().undo();
		expect(layers().some((l) => l.type === "group")).toBe(false);
	});

	test("ungrouping keeps the stacking position", () => {
		const below = createShapeLayer("rect", { name: "below" });
		const g = createGroupLayer();
		const a = createShapeLayer("rect", { name: "a", parentId: g.id });
		const above = createShapeLayer("rect", { name: "above" });
		const { layers: out } = ungroupLayers([below, a, g, above], [g.id]);
		expect(out.map((l) => l.name)).toEqual(["below", "a", "above"]);
	});

	test("Ctrl+Shift+G also removes frames", () => {
		const frame = createFrameLayer({ width: 100, height: 100 });
		const a = createShapeLayer("rect", { parentId: frame.id });
		load([frame, a]);
		getEditor().select([frame.id]);
		ungroupSelection();
		expect(layers().map((l) => l.id)).toEqual([a.id]);
		expect(find(a.id).parentId).toBeUndefined();
	});

	test("frames can't be grouped", () => {
		const frame = createFrameLayer({ width: 100, height: 100 });
		load([frame]);
		getEditor().select([frame.id]);
		groupSelection();
		expect(layers()).toHaveLength(1);
	});
});

describe("store operations on nested groups", () => {
	beforeEach(() => load(nested().all));

	test("deleting a group deletes everything inside it", () => {
		const { group, frame, all } = nested();
		load(all);
		getEditor().removeLayers([group.id]);
		expect(layers().map((l) => l.id)).toEqual([frame.id]);
	});

	test("moving a group moves its children; the group stays at the origin", () => {
		const { group, a, b, all } = nested();
		load(all);
		getEditor().updateLayer(group.id, { x: 20, y: -5 });
		expect(find(group.id)).toMatchObject({ x: 0, y: 0 });
		expect(find(a.id)).toMatchObject({ x: 30, y: 5 });
		expect(find(b.id)).toMatchObject({ x: 120, y: 95 });
		getEditor().undo();
		expect(find(a.id)).toMatchObject({ x: 10, y: 10 });
	});

	test("moving a group between frames reparents the group, not its children", () => {
		const { group, inner, a, b, all } = nested();
		const other = createFrameLayer({ name: "Other", x: 1000, y: 0, width: 500, height: 500 });
		load([...all, other]);
		getEditor().updateLayer(group.id, { x: 1000 });
		getEditor().reparentLayers([group.id, a.id, b.id]);
		expect(find(group.id).parentId).toBe(other.id);
		expect(find(a.id).parentId).toBe(group.id);
		expect(find(b.id).parentId).toBe(inner.id);
	});

	test("duplicating a group copies its whole subtree with new ids", () => {
		const { frame, group, all } = nested();
		load(all);
		getEditor().duplicateLayers([group.id]);
		const copyId = getEditor().selectedIds[0];
		const copy = find(copyId);
		expect(copy.type).toBe("group");
		expect(copy.name).toBe("Outer copy");
		expect(copy.parentId).toBe(frame.id);
		const copies = descendantsOf(layers(), copyId);
		expect(copies).toHaveLength(3);
		const originals = new Set(descendantsOf(all, group.id).map((l) => l.id));
		expect(copies.every((l) => !originals.has(l.id))).toBe(true);
		const copyA = copies.find((l) => l.name === "A");
		expect(copyA).toMatchObject({ x: 34, y: 34 });
		const copyInner = copies.find((l) => l.name === "Inner");
		expect(copies.find((l) => l.name === "B")?.parentId).toBe(copyInner?.id);
		// Groups never take an offset themselves.
		expect(copyInner).toMatchObject({ x: 0, y: 0 });
	});

	test("duplicating a frame copies nested groups too", () => {
		const { frame, all } = nested();
		load(all);
		getEditor().duplicateLayers([frame.id]);
		const copyId = getEditor().selectedIds[0];
		expect(descendantsOf(layers(), copyId)).toHaveLength(4);
	});

	test("copy and paste keep the group structure", () => {
		const { group, all } = nested();
		load(all);
		getEditor().select([group.id]);
		getEditor().copy();
		getEditor().paste();
		const pasted = getEditor().selectedIds;
		expect(pasted).toHaveLength(1);
		expect(find(pasted[0]).type).toBe("group");
		expect(descendantsOf(layers(), pasted[0])).toHaveLength(3);
	});

	test("select all picks top-level layers only", () => {
		const { frame, all } = nested();
		const loose = createShapeLayer("rect", { x: 900 });
		load([...all, loose]);
		getEditor().selectAll();
		expect(getEditor().selectedIds.sort()).toEqual([frame.id, loose.id].sort());
	});

	test("arrange moves layers among their siblings", () => {
		const g = createGroupLayer();
		const a = createShapeLayer("rect", { name: "a", parentId: g.id });
		const loose = createShapeLayer("rect", { name: "loose" });
		const b = createShapeLayer("rect", { name: "b", parentId: g.id });
		load([a, loose, b, g], "default");
		getEditor().moveLayers([a.id], "up");
		const order = layers().filter((l) => l.parentId === g.id).map((l) => l.name);
		expect(order).toEqual(["b", "a"]);
		getEditor().moveLayers([a.id], "bottom");
		expect(layers().filter((l) => l.parentId === g.id).map((l) => l.name)).toEqual(["a", "b"]);
	});

	test("a layer can't be reparented into its own descendant", () => {
		const { group, inner, all } = nested();
		load(all);
		getEditor().reorderLayer(group.id, 0, inner.id);
		expect(find(group.id).parentId).not.toBe(inner.id);
	});
});

describe("frame actions with groups", () => {
	test("removing a frame frees the group but keeps its children inside it", () => {
		const { frame, group, a, all } = nested();
		load(all);
		getEditor().select([frame.id]);
		removeSelectedFrames();
		expect(find(group.id).parentId).toBeUndefined();
		expect(find(a.id).parentId).toBe(group.id);
	});

	test("resize to fit measures nested children", () => {
		const { frame, all } = nested();
		load(all);
		fitFramesToContent([frame]);
		expect(find(frame.id)).toMatchObject({ x: 10, y: 10, width: 140, height: 140 });
	});

	test("framing a group puts the group (not its children) in the frame", () => {
		const g = createGroupLayer();
		const a = createShapeLayer("rect", { x: 0, y: 0, width: 10, height: 10, parentId: g.id });
		load([a, g]);
		getEditor().select([g.id, a.id]);
		frameSelection();
		const frameId = getEditor().selectedIds[0];
		expect(find(g.id).parentId).toBe(frameId);
		expect(find(a.id).parentId).toBe(g.id);
	});
});

describe("click targeting", () => {
	const { frame, group, inner, a, b, all } = nested();

	test("a click selects the outer-most group, then steps in once it's entered", () => {
		expect(clickTarget(all, b.id, [])).toBe(group.id);
		expect(clickTarget(all, b.id, [group.id])).toBe(group.id);
		expect(clickTarget(all, b.id, [a.id])).toBe(inner.id);
		expect(clickTarget(all, b.id, [b.id])).toBe(b.id);
		expect(clickTarget(all, b.id, [], true)).toBe(b.id);
		// Frames don't capture clicks: their direct children are selectable.
		expect(clickTarget(all, frame.id, [])).toBe(frame.id);
	});

	test("double-click steps one level in", () => {
		expect(doubleClickTarget(all, b.id, [group.id])).toBe(inner.id);
		expect(doubleClickTarget(all, b.id, [inner.id])).toBe(b.id);
		expect(doubleClickTarget(all, b.id, [b.id])).toBe(b.id);
	});

	test("only layers in entered groups drag themselves", () => {
		expect(isReachable(all, a.id, enteredGroups(all, []))).toBe(false);
		expect(isReachable(all, group.id, enteredGroups(all, []))).toBe(true);
		expect(isReachable(all, a.id, enteredGroups(all, [a.id]))).toBe(true);
		expect(isReachable(all, b.id, enteredGroups(all, [a.id]))).toBe(false);
	});
});

describe("group transforms", () => {
	test("scaling a group scales its children (and path anchors) about the box", () => {
		const g = createGroupLayer();
		const a = createShapeLayer("rect", { x: 0, y: 0, width: 100, height: 100, parentId: g.id });
		const p = createPathLayer({ ...pathFromWorld([rectSubpath(100, 100, 100, 100)]), parentId: g.id });
		load([a, p, g], "default");
		setGroupBox(g.id, { width: 400, height: 100 });
		expect(find(a.id)).toMatchObject({ x: 0, y: 0, width: 200, height: 50 });
		expect(find(p.id)).toMatchObject({ x: 200, y: 50, width: 200, height: 50 });
		expect(groupBounds(layers(), g.id)).toEqual({ x: 0, y: 0, width: 400, height: 100 });
	});

	test("rotating a group rotates children around the same pivot", () => {
		const g = createGroupLayer();
		const a = createShapeLayer("rect", { x: 100, y: 0, width: 10, height: 10, parentId: g.id });
		const p = createPathLayer({ ...pathFromWorld([rectSubpath(100, 0, 10, 10)]), parentId: g.id });
		const patches = transformDescendants([a, p, g], g.id, rotate(90));
		const ra = patches.find((x) => x.id === a.id)?.patch;
		expect(ra?.x).toBeCloseTo(0);
		expect(ra?.y).toBeCloseTo(100);
		expect(ra?.rotation).toBeCloseTo(90);
		const rp = { ...p, ...patches.find((x) => x.id === p.id)?.patch } as PathLayer;
		const corner = worldSubpaths(rp)[0].anchors[0];
		expect(corner.x).toBeCloseTo(0);
		expect(corner.y).toBeCloseTo(100);
	});

	test("flipping a group mirrors its children around its center", () => {
		const g = createGroupLayer();
		const a = createShapeLayer("rect", { x: 0, y: 0, width: 10, height: 10, parentId: g.id });
		const b = createShapeLayer("rect", { x: 90, y: 0, width: 10, height: 10, parentId: g.id });
		load([a, b, g], "default");
		getEditor().select([g.id]);
		flipSelection("x");
		expect(layerBounds(find(a.id)).x).toBeCloseTo(90);
		expect(layerBounds(find(b.id)).x).toBeCloseTo(0);
	});
});

describe("SVG export of groups", () => {
	test("groups become nested <g> elements and their children export once", async () => {
		const g = createGroupLayer({ name: "Icon", opacity: 0.5 });
		const a = createShapeLayer("rect", { name: "Box", parentId: g.id });
		load([a, g], "default");
		const svg = await artboardToSvg();
		expect(svg).toContain('<g id="Icon" opacity="0.5"><g id="Box">');
		expect(svg.match(/id="Box"/g)).toHaveLength(1);
	});
});
