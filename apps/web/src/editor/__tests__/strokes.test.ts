import { describe, expect, test } from "bun:test";
import { createPathLayer, createShapeLayer, solid } from "../defaults";
import { useEditorStore, getEditor } from "../store";
import { artboardToSvg } from "../svg-export";
import { outlineStrokeSelection } from "../vector-actions";
import { pathArea, pathFromWorld, polygonSubpath, rectSubpath } from "../path";
import { parseSvg } from "../svg-parse";
import type { Layer, PathLayer, Stroke } from "../types";

function load(layers: Layer[]) {
	useEditorStore.setState({
		projectId: "p1",
		doc: {
			id: "p1",
			name: "Test",
			createdAt: 0,
			updatedAt: 0,
			canvas: { width: 400, height: 400, background: { type: "transparent" } },
			layers,
			version: 1,
		},
		past: [],
		future: [],
		pending: null,
		selectedIds: [],
	});
}

const stroke = (extra: Partial<Stroke>): Stroke => ({ enabled: true, color: "#ff0000", width: 4, ...extra });

describe("stroke options", () => {
	test("old strokes keep round caps and joins and no dashes", async () => {
		load([createShapeLayer("rect", { stroke: stroke({}) })]);
		const svg = await artboardToSvg();
		expect(svg).toContain('stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>');
		expect(svg).not.toContain("stroke-dasharray");
	});

	test("dash, cap and join are exported", async () => {
		const path = createPathLayer({
			...pathFromWorld([polygonSubpath([0, 0, 100, 0, 100, 50], false)]),
			stroke: stroke({ dash: [10, 5], cap: "square", join: "bevel" }),
		});
		load([path]);
		const svg = await artboardToSvg();
		expect(svg).toContain('stroke-linejoin="bevel" stroke-linecap="square" stroke-dasharray="10 5"');
	});

	test("inside strokes are clipped to the shape at double width", async () => {
		load([createShapeLayer("ellipse", { width: 100, height: 50, stroke: stroke({ align: "inside" }) })]);
		const svg = await artboardToSvg();
		expect(svg).toMatch(/<clipPath id="(c\d+)"><ellipse cx="50" cy="25" rx="50" ry="25"\/><\/clipPath>/);
		expect(svg).toMatch(/<g clip-path="url\(#c\d+\)"><ellipse [^>]*fill="none" stroke="#ff0000" stroke-width="8"/);
	});

	test("outside strokes are masked by the shape", async () => {
		load([createShapeLayer("rect", { width: 100, height: 50, fill: solid("#000000"), stroke: stroke({ align: "outside" }) })]);
		const svg = await artboardToSvg();
		expect(svg).toMatch(/<mask id="m\d+"[^>]*><rect [^>]*fill="#ffffff"\/><rect width="100" height="50" fill="#000000"\/><\/mask>/);
		expect(svg).toMatch(/<g mask="url\(#m\d+\)"><rect width="100" height="50" fill="none" stroke="#ff0000" stroke-width="8"/);
	});

	test("open paths ignore inside/outside", async () => {
		const path = createPathLayer({
			...pathFromWorld([polygonSubpath([0, 0, 100, 0], false)]),
			stroke: stroke({ align: "inside" }),
		});
		load([path]);
		const svg = await artboardToSvg();
		expect(svg).not.toContain("clip-path=\"url(#c2");
		expect(svg).toContain('stroke-width="4"');
	});

	test("stroke styles survive an SVG round trip", async () => {
		load([createShapeLayer("rect", { stroke: stroke({ dash: [6, 3], cap: "butt", join: "miter" }) })]);
		const { layers } = parseSvg(await artboardToSvg());
		const rect = layers.find((l) => l.type === "shape" && l.shape === "rect" && l.name !== "background");
		expect(rect && "stroke" in rect && rect.stroke).toMatchObject({ dash: [6, 3], cap: "butt", join: "miter", width: 4 });
	});

	test("outline stroke honours inside and outside", async () => {
		for (const [align, expected] of [
			["inside", 100 * 100 - 92 * 92],
			["outside", 108 * 108 - 100 * 100],
		] as const) {
			const square = createPathLayer({
				...pathFromWorld([rectSubpath(0, 0, 100, 100)]),
				stroke: stroke({ align, join: "miter" }),
			});
			load([square]);
			getEditor().select([square.id]);
			await outlineStrokeSelection();
			const outline = getEditor().doc?.layers.find((l) => l.name.endsWith("outline")) as PathLayer;
			expect(Math.abs(pathArea(outline.subpaths))).toBeCloseTo(expected, 0);
		}
	});
});
