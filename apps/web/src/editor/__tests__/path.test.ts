import { beforeEach, describe, expect, test } from "bun:test";
import {
	deleteAnchors,
	ellipseSubpath,
	insertAnchor,
	layerMatrix,
	mapSubpaths,
	moveHandle,
	nearestOnPath,
	pathArea,
	pathBounds,
	pathFromWorld,
	pathPatchForLocal,
	pathToD,
	rectSubpath,
	segmentsOf,
	snapAngle,
	toggleAnchorType,
	worldSubpaths,
} from "../path";
import { apply } from "../matrix";
import { createPathLayer, solid } from "../defaults";
import { getEditor, useEditorStore } from "../store";
import { artboardToSvg } from "../svg-export";
import { layerBounds } from "../freeform";
import type { PathLayer, ProjectDoc, Subpath } from "../types";

const triangle: Subpath = {
	closed: true,
	anchors: [
		{ x: 0, y: 0, type: "corner" },
		{ x: 100, y: 0, type: "corner" },
		{ x: 50, y: 80, type: "corner" },
	],
};

/** One cubic from (0,0) to (100,0) bulging up to y = -75 at the middle. */
const arch: Subpath = {
	closed: false,
	anchors: [
		{ x: 0, y: 0, handleOut: { x: 0, y: -100 }, type: "corner" },
		{ x: 100, y: 0, handleIn: { x: 0, y: -100 }, type: "corner" },
	],
};

function load(layers: PathLayer[]) {
	const doc: ProjectDoc = {
		id: "p1",
		name: "Test",
		createdAt: 0,
		updatedAt: 0,
		canvas: { width: 400, height: 400, background: solid("#ffffff") },
		layers,
		version: 1,
	};
	useEditorStore.setState({ projectId: "p1", doc, past: [], future: [], pending: null, selectedIds: [] });
}

describe("path data", () => {
	test("straight segments become L, curves become C, closed paths end with Z", () => {
		expect(pathToD([triangle])).toBe("M0 0L100 0L50 80Z");
		expect(pathToD([arch])).toBe("M0 0C0 -100 100 -100 100 0");
		expect(pathToD([triangle, arch])).toBe("M0 0L100 0L50 80ZM0 0C0 -100 100 -100 100 0");
	});

	test("closed subpaths include the closing segment", () => {
		expect(segmentsOf(triangle)).toHaveLength(3);
		expect(segmentsOf({ ...triangle, closed: false })).toHaveLength(2);
		expect(pathToD([{ anchors: [{ x: 1, y: 2, type: "corner" }], closed: false }])).toBe("M1 2");
	});
});

describe("path bounds", () => {
	test("bounds follow the curve, not the handles", () => {
		const b = pathBounds([arch]);
		expect(b.x).toBeCloseTo(0);
		expect(b.width).toBeCloseTo(100);
		// The curve peaks at 3/4 of the handle height.
		expect(b.y).toBeCloseTo(-75);
		expect(b.height).toBeCloseTo(75);
	});

	test("an ellipse made of beziers has the ellipse's bounds", () => {
		const b = pathBounds([ellipseSubpath(50, 40, 50, 40)]);
		expect(b.x).toBeCloseTo(0);
		expect(b.y).toBeCloseTo(0);
		expect(b.width).toBeCloseTo(100);
		expect(b.height).toBeCloseTo(80);
	});

	test("world geometry is normalized to start at the layer origin", () => {
		const g = pathFromWorld([{ ...triangle, anchors: triangle.anchors.map((a) => ({ ...a, x: a.x + 30, y: a.y + 10 })) }]);
		expect(g.x).toBe(30);
		expect(g.y).toBe(10);
		expect(g.width).toBe(100);
		expect(g.height).toBe(80);
		expect(g.subpaths[0].anchors[0]).toMatchObject({ x: 0, y: 0 });
	});

	test("layerBounds uses the path's rotated box without a canvas", () => {
		const layer = createPathLayer({ ...pathFromWorld([triangle]), x: 10, y: 20, rotation: 90 });
		const b = layerBounds(layer);
		expect(b.x).toBeCloseTo(-70);
		expect(b.y).toBeCloseTo(20);
		expect(b.width).toBeCloseTo(80);
		expect(b.height).toBeCloseTo(100);
	});
});

describe("transforms are baked into anchors", () => {
	beforeEach(() => load([]));

	test("resizing a path through the store scales its anchors", () => {
		const layer = createPathLayer({ ...pathFromWorld([triangle]) });
		load([layer]);
		getEditor().updateLayer(layer.id, { width: 200, height: 40 });
		const next = getEditor().doc?.layers[0] as PathLayer;
		expect(next.subpaths[0].anchors.map((a) => [a.x, a.y])).toEqual([
			[0, 0],
			[200, 0],
			[100, 40],
		]);
		expect(pathBounds(next.subpaths)).toEqual({ x: 0, y: 0, width: 200, height: 40 });
		getEditor().undo();
		expect((getEditor().doc?.layers[0] as PathLayer).subpaths[0].anchors[1].x).toBe(100);
	});

	test("handles scale with their anchors", () => {
		const layer = createPathLayer({ ...pathFromWorld([arch]) });
		load([layer]);
		getEditor().updateLayer(layer.id, { width: 50, height: 150 });
		const next = getEditor().doc?.layers[0] as PathLayer;
		expect(next.subpaths[0].anchors[0].handleOut?.x).toBeCloseTo(0);
		expect(next.subpaths[0].anchors[0].handleOut?.y).toBeCloseTo(-200);
		expect(pathBounds(next.subpaths).height).toBeCloseTo(150);
	});

	test("re-normalizing a rotated path keeps it in place on screen", () => {
		const layer = createPathLayer({ ...pathFromWorld([triangle]), x: 100, y: 100, rotation: 30 });
		const before = worldSubpaths(layer);
		// Move the first point left/up in local space so the bounds grow.
		const local = structuredClone(layer.subpaths);
		local[0].anchors[0] = { x: -20, y: -10, type: "corner" };
		const patch = pathPatchForLocal(layer, local);
		const after = worldSubpaths({ ...layer, ...patch });
		expect(patch.subpaths[0].anchors[0]).toMatchObject({ x: 0, y: 0 });
		for (const i of [1, 2]) {
			expect(after[0].anchors[i].x).toBeCloseTo(before[0].anchors[i].x);
			expect(after[0].anchors[i].y).toBeCloseTo(before[0].anchors[i].y);
		}
		const moved = apply(layerMatrix(layer), { x: -20, y: -10 });
		expect(after[0].anchors[0].x).toBeCloseTo(moved.x);
		expect(after[0].anchors[0].y).toBeCloseTo(moved.y);
	});

	test("mirroring keeps handles attached to the curve", () => {
		const flipped = mapSubpaths([arch], [-1, 0, 0, 1, 100, 0]);
		expect(pathToD(flipped)).toBe("M100 0C100 -100 0 -100 0 0");
	});
});

describe("editing", () => {
	test("inserting a point on a curve keeps its shape", () => {
		const hit = nearestOnPath([arch], { x: 50, y: -80 });
		expect(hit).not.toBeNull();
		if (!hit) return;
		expect(hit.point.x).toBeCloseTo(50, 1);
		expect(hit.point.y).toBeCloseTo(-75, 1);
		const { subpaths, key } = insertAnchor([arch], hit.subpath, hit.segment, hit.t);
		expect(key).toBe("0:1");
		expect(subpaths[0].anchors).toHaveLength(3);
		const b = pathBounds(subpaths);
		expect(b.y).toBeCloseTo(-75);
		expect(b.width).toBeCloseTo(100);
	});

	test("inserting on the closing segment appends the point", () => {
		const hit = nearestOnPath([triangle], { x: 20, y: 40 });
		if (!hit) throw new Error("no hit");
		const { subpaths, key } = insertAnchor([triangle], hit.subpath, hit.segment, hit.t);
		expect(key).toBe("0:3");
		expect(subpaths[0].anchors).toHaveLength(4);
	});

	test("deleting points keeps the path connected and drops tiny leftovers", () => {
		const square = rectSubpath(0, 0, 10, 10);
		expect(deleteAnchors([square], new Set(["0:1"]))[0].anchors).toHaveLength(3);
		expect(deleteAnchors([square], new Set(["0:0", "0:1"]))[0].closed).toBe(false);
		expect(deleteAnchors([square], new Set(["0:0", "0:1", "0:2"]))).toEqual([]);
	});

	test("double-click toggles corner and smooth", () => {
		const smooth = toggleAnchorType([triangle], 0, 1);
		const a = smooth[0].anchors[1];
		expect(a.type).toBe("symmetric");
		expect(a.handleIn && a.handleOut).toBeTruthy();
		expect(a.handleIn?.x).toBeCloseTo(-(a.handleOut?.x ?? 0));
		const corner = toggleAnchorType(smooth, 0, 1);
		expect(corner[0].anchors[1]).toEqual({ x: 100, y: 0, type: "corner", handleIn: undefined, handleOut: undefined });
	});

	test("handle moves respect the anchor type", () => {
		const base = { x: 0, y: 0, handleIn: { x: -10, y: 0 }, handleOut: { x: 10, y: 0 } };
		expect(moveHandle({ ...base, type: "symmetric" }, "out", { x: 0, y: 20 }).handleIn).toEqual({ x: -0, y: -20 });
		const smooth = moveHandle({ ...base, type: "smooth" }, "out", { x: 0, y: 30 });
		expect(smooth.handleIn?.y).toBeCloseTo(-10);
		const broken = moveHandle({ ...base, type: "symmetric" }, "out", { x: 0, y: 20 }, true);
		expect(broken.type).toBe("corner");
		expect(broken.handleIn).toEqual({ x: -10, y: 0 });
	});

	test("shift snaps to 45°", () => {
		const p = snapAngle({ x: 0, y: 0 }, { x: 10, y: 9 });
		expect(p.x).toBeCloseTo(p.y);
	});

	test("rect and ellipse primitives enclose the right area", () => {
		expect(Math.abs(pathArea([rectSubpath(0, 0, 100, 50)]))).toBeCloseTo(5000);
		expect(Math.abs(pathArea([ellipseSubpath(0, 0, 10, 10)]))).toBeCloseTo(Math.PI * 100, 0);
	});
});

describe("SVG export of paths", () => {
	test("paths export as a real <path> with transforms, fill rule and stroke", async () => {
		const layer = createPathLayer({
			...pathFromWorld([triangle, arch]),
			name: "Logo mark",
			x: 10,
			y: 20,
			rotation: 15,
			fill: solid("#ff0000"),
			fillRule: "evenodd",
			stroke: { enabled: true, color: "#00000080", width: 3 },
		});
		load([layer]);
		const svg = await artboardToSvg();
		expect(svg).toContain('id="Logo-mark"');
		expect(svg).toContain('transform="translate(10 20) rotate(15)"');
		expect(svg).toMatch(/<path d="M0 75L100 75L50 155ZM0 75C0 -25 100 -25 100 75" fill-rule="evenodd" fill="#ff0000" stroke="#000000" stroke-opacity="0.502" stroke-width="3"/);
	});
});
