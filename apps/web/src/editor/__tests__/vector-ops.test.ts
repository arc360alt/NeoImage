import { beforeEach, describe, expect, test } from "bun:test";
import { booleanSubpaths, outlineStroke, shapeSubpaths, worldGeometry } from "../vector-ops";
import { booleanSelection, flattenSelection, outlineStrokeSelection } from "../vector-actions";
import { pathArea, pathBounds, polygonSubpath, rectSubpath, worldSubpaths } from "../path";
import { createFrameLayer, createGroupLayer, createPathLayer, createShapeLayer, solid } from "../defaults";
import { getEditor, useEditorStore } from "../store";
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
	});
}

const layers = () => getEditor().doc?.layers ?? [];
const area = (l: PathLayer) => Math.abs(pathArea(l.subpaths));

const a = rectSubpath(0, 0, 100, 100);
const b = rectSubpath(50, 50, 100, 100);

describe("boolean operations on two overlapping squares", () => {
	test("union", async () => {
		const out = await booleanSubpaths("union", [{ subpaths: [a] }, { subpaths: [b] }]);
		expect(Math.abs(pathArea(out))).toBeCloseTo(17500, 0);
		expect(pathBounds(out)).toEqual({ x: 0, y: 0, width: 150, height: 150 });
	});

	test("subtract removes the upper shape from the bottom one", async () => {
		const out = await booleanSubpaths("subtract", [{ subpaths: [a] }, { subpaths: [b] }]);
		expect(Math.abs(pathArea(out))).toBeCloseTo(7500, 0);
		expect(pathBounds(out)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
	});

	test("intersect", async () => {
		const out = await booleanSubpaths("intersect", [{ subpaths: [a] }, { subpaths: [b] }]);
		expect(Math.abs(pathArea(out))).toBeCloseTo(2500, 0);
		expect(pathBounds(out)).toEqual({ x: 50, y: 50, width: 50, height: 50 });
	});

	test("exclude keeps what isn't shared", async () => {
		const out = await booleanSubpaths("exclude", [{ subpaths: [a] }, { subpaths: [b] }]);
		// Two L-shapes; signed areas of the pieces add up to 15000.
		const total = out.reduce((sum, s) => sum + Math.abs(pathArea([s])), 0);
		expect(total).toBeCloseTo(15000, 0);
	});

	test("curves survive: a circle minus a square keeps bezier handles", async () => {
		const circle = createShapeLayer("ellipse", { width: 100, height: 100 });
		const out = await booleanSubpaths("subtract", [
			{ subpaths: worldGeometry(circle) },
			{ subpaths: [rectSubpath(50, 0, 100, 100)] },
		]);
		expect(out.some((s) => s.anchors.some((p) => p.handleIn || p.handleOut))).toBe(true);
		expect(Math.abs(pathArea(out))).toBeCloseTo((Math.PI * 2500) / 2, -1);
	});
});

describe("outline stroke", () => {
	const line = [polygonSubpath([0, 0, 100, 0], false)];

	test("butt caps give a plain rectangle", async () => {
		const out = await outlineStroke(line, { width: 10, cap: "butt" });
		expect(Math.abs(pathArea(out))).toBeCloseTo(1000, 0);
		const bounds = pathBounds(out);
		expect(bounds.x).toBeCloseTo(0);
		expect(bounds.y).toBeCloseTo(-5);
		expect(bounds.width).toBeCloseTo(100);
		expect(bounds.height).toBeCloseTo(10);
	});

	test("square caps extend by half the width", async () => {
		const out = await outlineStroke(line, { width: 10, cap: "square" });
		expect(Math.abs(pathArea(out))).toBeCloseTo(1100, 0);
	});

	test("round caps add half circles", async () => {
		const out = await outlineStroke(line, { width: 10, cap: "round" });
		expect(Math.abs(pathArea(out))).toBeCloseTo(1000 + Math.PI * 25, 0);
	});

	test("a closed square's miter stroke is a frame", async () => {
		const out = await outlineStroke([rectSubpath(0, 0, 100, 100)], { width: 10, join: "miter" });
		// 110² − 90² with the hole.
		expect(Math.abs(pathArea(out))).toBeCloseTo(110 * 110 - 90 * 90, 0);
		const box = pathBounds(out);
		expect(box.x).toBeCloseTo(-5);
		expect(box.y).toBeCloseTo(-5);
		expect(box.width).toBeCloseTo(110);
		expect(box.height).toBeCloseTo(110);
	});

	test("bevel joins cut the corners", async () => {
		const out = await outlineStroke([rectSubpath(0, 0, 100, 100)], { width: 10, join: "bevel" });
		expect(Math.abs(pathArea(out))).toBeCloseTo(110 * 110 - 90 * 90 - 4 * 12.5, 0);
	});
});

describe("selection commands", () => {
	beforeEach(() => load([]));

	test("flatten turns a shape preset into an identical path, keeping rotation", () => {
		const star = createShapeLayer("star", { x: 40, y: 50, width: 120, height: 100, rotation: 30, fill: solid("#ff0000") });
		load([star]);
		getEditor().select([star.id]);
		expect(flattenSelection()).toBe(true);
		const path = layers()[0] as PathLayer;
		expect(path.type).toBe("path");
		expect(path.rotation).toBe(30);
		expect(path.fill).toEqual(solid("#ff0000"));
		const expected = worldGeometry(star)[0].anchors;
		const actual = worldSubpaths(path)[0].anchors;
		expect(actual).toHaveLength(expected.length);
		for (let i = 0; i < expected.length; i++) {
			expect(actual[i].x).toBeCloseTo(expected[i].x);
			expect(actual[i].y).toBeCloseTo(expected[i].y);
		}
		getEditor().undo();
		expect(layers()[0].type).toBe("shape");
	});

	test("flatten converts lines and arrows (both strokes become subpaths)", () => {
		const arrow = createShapeLayer("arrow", { width: 200 });
		load([arrow]);
		getEditor().select([arrow.id]);
		flattenSelection();
		const path = layers()[0] as PathLayer;
		expect(path.subpaths).toHaveLength(2);
		expect(path.fill.type).toBe("transparent");
		expect(path.stroke.enabled).toBe(true);
	});

	test("flatten merges several paths into one at the bottom-most layer's place", () => {
		const frame = createFrameLayer({ width: 500, height: 500 });
		const under = createShapeLayer("rect", { name: "under", parentId: frame.id });
		const p1 = createShapeLayer("rect", { x: 0, y: 0, width: 10, height: 10, parentId: frame.id, fill: solid("#00ff00") });
		const mid = createShapeLayer("rect", { name: "mid", parentId: frame.id });
		const p2 = createShapeLayer("ellipse", { x: 50, y: 50, width: 10, height: 10, parentId: frame.id });
		load([frame, under, p1, mid, p2]);
		getEditor().select([p2.id, p1.id]);
		flattenSelection();
		const names = layers().map((l) => l.name);
		const merged = layers()[2] as PathLayer;
		expect(names).toEqual(["Frame", "under", merged.name, "mid"]);
		expect(merged.subpaths).toHaveLength(2);
		expect(merged.parentId).toBe(frame.id);
		expect(merged.fill).toEqual(solid("#00ff00"));
		expect(pathBounds(worldSubpaths(merged))).toEqual({ x: 0, y: 0, width: 60, height: 60 });
	});

	test("flattening a group of shapes replaces the group", () => {
		const g = createGroupLayer();
		const r = createShapeLayer("rect", { parentId: g.id });
		const e = createShapeLayer("ellipse", { parentId: g.id });
		load([r, e, g], "default");
		getEditor().select([g.id]);
		flattenSelection();
		expect(layers()).toHaveLength(1);
		expect(layers()[0].type).toBe("path");
	});

	test("boolean union replaces the selection with one path in the bottom layer's style", async () => {
		const r1 = createShapeLayer("rect", { x: 0, y: 0, width: 100, height: 100, fill: solid("#123456"), opacity: 0.8 });
		const r2 = createShapeLayer("rect", { x: 50, y: 50, width: 100, height: 100, fill: solid("#ffffff") });
		load([r1, r2], "default");
		getEditor().select([r2.id, r1.id]);
		await booleanSelection("union");
		expect(layers()).toHaveLength(1);
		const out = layers()[0] as PathLayer;
		expect(out.name).toBe("Union");
		expect(out.fill).toEqual(solid("#123456"));
		expect(out.opacity).toBe(0.8);
		expect(area(out)).toBeCloseTo(17500, 0);
		expect({ x: out.x, y: out.y, width: out.width, height: out.height }).toEqual({ x: 0, y: 0, width: 150, height: 150 });
		getEditor().undo();
		expect(layers()).toHaveLength(2);
	});

	test("boolean ops respect rotation and paths", async () => {
		const p = createPathLayer({ x: 0, y: 0, width: 100, height: 100, subpaths: [rectSubpath(0, 0, 100, 100)], fill: solid("#000000") });
		const r = createShapeLayer("rect", { x: 50, y: 0, width: 100, height: 100, rotation: 90 });
		load([p, r], "default");
		getEditor().select([p.id, r.id]);
		await booleanSelection("intersect");
		// The rect rotated 90° about (50,0) covers x ∈ [-50, 50], y ∈ [0, 100].
		expect(area(layers()[0] as PathLayer)).toBeCloseTo(5000, 0);
	});

	test("outline stroke turns a stroke into a filled path above the fill", async () => {
		const shape = createShapeLayer("rect", {
			width: 100,
			height: 100,
			stroke: { enabled: true, color: "#ff0000", width: 10, join: "miter" },
		});
		load([shape], "default");
		getEditor().select([shape.id]);
		await outlineStrokeSelection();
		expect(layers()).toHaveLength(2);
		const [fill, outline] = layers() as [Layer, PathLayer];
		expect(fill.type === "shape" && fill.stroke.enabled).toBe(false);
		expect(outline.fill).toEqual(solid("#ff0000"));
		expect(outline.stroke.enabled).toBe(false);
		expect(area(outline)).toBeCloseTo(110 * 110 - 90 * 90, 0);
	});

	test("shapeSubpaths matches the canvas geometry of every preset", () => {
		for (const kind of ["rect", "ellipse", "triangle", "star", "polygon", "heart"] as const) {
			const layer = createShapeLayer(kind, { width: 200, height: 100 });
			const bounds = pathBounds(shapeSubpaths(layer));
			expect(bounds.width).toBeLessThanOrEqual(200 + 1e-6);
			expect(bounds.width).toBeGreaterThan(150);
			expect(bounds.height).toBeGreaterThan(80);
		}
	});
});
