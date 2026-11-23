import { describe, expect, test } from "bun:test";
import { colorToHex, looksLikeSvg, parseColor, parsePathData, parseSvg, parseTransform, parseXml } from "../svg-parse";
import { placeParsed, wrapRoots } from "../svg-import";
import { layersToSvg } from "../svg-export";
import { pathArea, pathBounds, pathFromWorld, rectSubpath, worldSubpaths } from "../path";
import { apply } from "../matrix";
import { createGroupLayer, createPathLayer, createShapeLayer, solid } from "../defaults";
import { useEditorStore } from "../store";
import type { GroupLayer, Layer, PathLayer, ShapeLayer, TextLayer } from "../types";

const svg = (body: string, attrs = 'width="100" height="100"') =>
	`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe("xml", () => {
	test("elements, attributes, entities, comments, CDATA and doctype", () => {
		const doc = parseXml(
			`<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><!-- hi --><svg a='1' b="x &amp; y"><g/><text>A &lt; B<![CDATA[ & C]]></text></svg>`,
		);
		const root = doc.children[0];
		expect(root.name).toBe("svg");
		expect(root.attrs).toEqual({ a: "1", b: "x & y" });
		expect(root.children.map((c) => c.name)).toEqual(["g", "text"]);
		expect(root.children[1].text).toBe("A < B & C");
	});

	test("namespaced tags lose their prefix", () => {
		expect(parseXml(`<svg:svg><svg:rect/></svg:svg>`).children[0].children[0].name).toBe("rect");
	});

	test("recognises pasted SVG markup", () => {
		expect(looksLikeSvg(`  <?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>`)).toBe(true);
		expect(looksLikeSvg("<svg>")).toBe(true);
		expect(looksLikeSvg("hello <svg>")).toBe(false);
	});
});

describe("path data", () => {
	test("absolute and relative lines, H/V, implicit line-tos and Z", () => {
		const [sub] = parsePathData("M10 10 h20 v20 H10 z");
		expect(sub.closed).toBe(true);
		expect(sub.anchors.map((a) => [a.x, a.y])).toEqual([
			[10, 10],
			[30, 10],
			[30, 30],
			[10, 30],
		]);
		const [poly] = parsePathData("m0 0 10 0 0 10z");
		expect(poly.anchors.map((a) => [a.x, a.y])).toEqual([
			[0, 0],
			[10, 0],
			[10, 10],
		]);
	});

	test("a closing curve back to the start merges into the first anchor", () => {
		const [sub] = parsePathData("M0 0 C 10 -10 20 -10 30 0 C 20 10 10 10 0 0 Z");
		expect(sub.anchors).toHaveLength(2);
		expect(sub.anchors[0].handleIn).toEqual({ x: 10, y: 10 });
	});

	test("S and T reflect the previous control point", () => {
		const [s] = parsePathData("M0 0 C0 -10 10 -10 10 0 S20 10 20 0");
		expect(s.anchors[1].handleOut?.x).toBeCloseTo(0);
		expect(s.anchors[1].handleOut?.y).toBeCloseTo(10);
		const [q] = parsePathData("M0 0 Q 10 -10 20 0 T 40 0");
		expect(q.anchors).toHaveLength(3);
		expect(pathBounds([q]).y).toBeCloseTo(-5);
		expect(pathBounds([q]).height).toBeCloseTo(10);
	});

	test("arcs become cubic curves of the right size", () => {
		const subs = parsePathData("M0 50 A50 50 0 1 1 100 50 A50 50 0 1 1 0 50 Z");
		expect(Math.abs(pathArea(subs))).toBeCloseTo(Math.PI * 2500, -1);
		const b = pathBounds(subs);
		expect(b.x).toBeCloseTo(0, 1);
		expect(b.width).toBeCloseTo(100, 1);
	});

	test("scientific notation and packed numbers", () => {
		const [sub] = parsePathData("M1e1-5L.5.5");
		expect(sub.anchors.map((a) => [a.x, a.y])).toEqual([
			[10, -5],
			[0.5, 0.5],
		]);
	});
});

describe("transforms and colors", () => {
	test("transform lists compose left to right", () => {
		const m = parseTransform("translate(10,20) rotate(90) scale(2)");
		const p = apply(m, { x: 1, y: 0 });
		expect(p.x).toBeCloseTo(10);
		expect(p.y).toBeCloseTo(22);
		const r = apply(parseTransform("rotate(180 50 50)"), { x: 0, y: 0 });
		expect(r.x).toBeCloseTo(100);
		expect(r.y).toBeCloseTo(100);
	});

	test("named, hex, rgb(a) and hsl colors", () => {
		expect(colorToHex(parseColor("tomato") ?? [0, 0, 0, 0])).toBe("#ff6347");
		expect(colorToHex(parseColor("#abc") ?? [0, 0, 0, 0])).toBe("#aabbcc");
		expect(colorToHex(parseColor("rgba(255, 0, 0, 0.5)") ?? [0, 0, 0, 0])).toBe("#ff000080");
		expect(colorToHex(parseColor("rgb(100% 0% 0%)") ?? [0, 0, 0, 0])).toBe("#ff0000");
		expect(colorToHex(parseColor("hsl(120, 100%, 50%)") ?? [0, 0, 0, 0])).toBe("#00ff00");
	});
});

describe("elements", () => {
	test("basic shapes: plain rect/ellipse stay shapes, the rest become paths", () => {
		const { layers } = parseSvg(
			svg(`<rect x="10" y="10" width="30" height="20" rx="4" fill="red"/>
			<circle cx="50" cy="50" r="10" fill="blue"/>
			<polygon points="0,0 10,0 5,10" fill="green"/>
			<line x1="0" y1="0" x2="10" y2="10" stroke="black" stroke-width="2"/>
			<rect width="10" height="10" transform="skewX(30)"/>`),
		);
		expect(layers.map((l) => (l.type === "shape" ? l.shape : l.type))).toEqual(["rect", "ellipse", "path", "path", "path"]);
		const rect = layers[0] as ShapeLayer;
		expect(rect).toMatchObject({ x: 10, y: 10, width: 30, height: 20, cornerRadius: 4, fill: solid("#ff0000") });
		const line = layers[3] as PathLayer;
		expect(line.fill.type).toBe("transparent");
		expect(line.stroke).toMatchObject({ enabled: true, color: "#000000", width: 2 });
	});

	test("rotated rects keep their rotation", () => {
		const { layers } = parseSvg(svg(`<rect width="20" height="10" transform="translate(50 50) rotate(30)"/>`));
		expect(layers[0]).toMatchObject({ type: "shape", x: 50, y: 50, width: 20, height: 10 });
		expect(layers[0].rotation).toBeCloseTo(30);
	});

	test("viewBox scaling is applied to geometry and stroke width", () => {
		const { layers, size } = parseSvg(
			svg(`<path d="M0 0H10V10Z" stroke="#000" stroke-width="1"/>`, 'width="200" height="200" viewBox="0 0 20 20"'),
		);
		expect(size).toEqual({ width: 200, height: 200 });
		const p = layers[0] as PathLayer;
		expect(pathBounds(worldSubpaths(p))).toEqual({ x: 0, y: 0, width: 100, height: 100 });
		expect(p.stroke.width).toBe(10);
	});

	test("groups nest; single-child wrappers fold into their child", () => {
		const { layers } = parseSvg(
			svg(`<g id="Logo" opacity="0.5"><g id="Mark"><path d="M0 0H5V5Z"/></g><circle r="2" cx="20" cy="20"/></g>`),
		);
		const group = layers.find((l) => l.type === "group") as GroupLayer;
		expect(group.name).toBe("Logo");
		expect(group.opacity).toBe(0.5);
		const kids = layers.filter((l) => l.parentId === group.id);
		expect(kids).toHaveLength(2);
		expect(kids[0].name).toBe("Mark");
		expect(kids[0].type).toBe("path");
	});

	test("inherited styles, CSS classes and inline style", () => {
		const { layers } = parseSvg(
			svg(`<style>.st0{fill:#00FF00;stroke:#000;stroke-width:3} #b { fill: blue }</style>
			<g fill="red"><path class="st0" d="M0 0H5V5Z"/><path id="b" d="M0 0H5V5Z"/><path d="M0 0H5V5Z" style="fill: none; stroke: red"/><path d="M0 0H5V5Z"/></g>`),
		);
		const paths = layers.filter((l): l is PathLayer => l.type === "path");
		expect(paths[0].fill).toEqual(solid("#00ff00"));
		expect(paths[0].stroke).toMatchObject({ enabled: true, width: 3 });
		expect(paths[1].fill).toEqual(solid("#0000ff"));
		expect(paths[2].fill.type).toBe("transparent");
		expect(paths[2].stroke.enabled).toBe(true);
		expect(paths[3].fill).toEqual(solid("#ff0000"));
	});

	test("linear and radial gradients become fills", () => {
		const { layers } = parseSvg(
			svg(`<defs>
				<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="100%" stop-color="#000" stop-opacity=".5"/></linearGradient>
				<linearGradient id="v2" href="#v" x2="1" y2="0"/>
				<radialGradient id="r"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient>
			</defs>
			<path d="M0 0H10V10Z" fill="url(#v)"/><path d="M0 0H10V10Z" fill="url(#v2)"/><path d="M0 0H10V10Z" fill="url('#r')"/>`),
		);
		const [a, b, c] = layers as PathLayer[];
		expect(a.fill).toEqual({
			type: "linear",
			angle: 180,
			stops: [
				{ offset: 0, color: "#ffffff" },
				{ offset: 1, color: "#00000080" },
			],
		});
		expect(b.fill.type === "linear" && b.fill.angle).toBe(90);
		expect(c.fill.type).toBe("radial");
	});

	test("text becomes text layers", () => {
		const { layers } = parseSvg(
			svg(`<text x="10" y="40" font-family="'Roboto', sans-serif" font-size="20" font-weight="700" fill="#333"><tspan x="10" y="40">Hello</tspan><tspan x="10" y="64">World</tspan></text>`),
		);
		const text = layers[0] as TextLayer;
		expect(text.type).toBe("text");
		expect(text.text).toBe("Hello\nWorld");
		expect(text).toMatchObject({ fontFamily: "Roboto", fontSize: 20, fontWeight: "bold", fill: solid("#333333") });
		expect(text.y).toBeCloseTo(40 - 19);
	});

	test("use / symbol references are expanded", () => {
		const { layers } = parseSvg(
			svg(`<defs><symbol id="dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></symbol></defs><use href="#dot" x="20" y="20" width="10" height="10"/>`),
		);
		expect(layers).toHaveLength(1);
		expect(layers[0]).toMatchObject({ type: "shape", x: 20, y: 20, width: 10, height: 10 });
	});

	test("unsupported features are dropped and reported", () => {
		const parsed = parseSvg(
			svg(`<defs><filter id="f"/><pattern id="p"/></defs><g filter="url(#f)"><path d="M0 0H5V5Z" fill="url(#p)"/></g><image href="https://x.test/a.png" width="1" height="1"/><image href="data:image/png;base64,AAAA" width="4" height="2"/>`),
		);
		expect(parsed.simplified.sort()).toEqual(["filters", "linked images", "patterns"]);
		expect(parsed.layers.map((l) => l.type)).toEqual(["path", "image"]);
		expect(parsed.images).toHaveLength(1);
	});

	test("hidden elements are skipped", () => {
		const { layers } = parseSvg(svg(`<path d="M0 0H5V5Z" display="none"/><g style="display:none"><path d="M0 0H5V5Z"/></g>`));
		expect(layers).toHaveLength(0);
	});
});

describe("placing imported SVGs", () => {
	test("content is scaled to fit the area and centered", () => {
		const parsed = parseSvg(svg(`<rect width="1000" height="500" stroke="#000" stroke-width="10"/>`, 'width="1000" height="500"'));
		const [rect] = placeParsed(parsed, { x: 0, y: 0, width: 500, height: 500 }) as ShapeLayer[];
		expect(rect.width).toBeCloseTo(400);
		expect(rect.height).toBeCloseTo(200);
		expect(rect.x).toBe(50);
		expect(rect.y).toBe(150);
		expect(rect.stroke.width).toBeCloseTo(4);
	});

	test("several top-level elements are wrapped in one group", () => {
		const parsed = parseSvg(svg(`<rect width="1" height="1"/><rect x="2" width="1" height="1"/>`));
		const out = wrapRoots(parsed.layers, "icon");
		const group = out.find((l) => l.type === "group");
		expect(group?.name).toBe("icon");
		expect(out.filter((l) => l.parentId === group?.id)).toHaveLength(2);
	});
});

describe("round trip: export, then import", () => {
	function load(layers: Layer[]) {
		useEditorStore.setState({
			projectId: "p1",
			doc: {
				id: "p1",
				name: "Test",
				mode: "freeform",
				createdAt: 0,
				updatedAt: 0,
				canvas: { width: 800, height: 800, background: solid("#ffffff") },
				layers,
				version: 1,
			},
		});
	}

	test("paths, groups, fills and strokes survive", async () => {
		const group = createGroupLayer({ name: "Badge", opacity: 0.75 });
		const shape = createShapeLayer("rect", {
			name: "Plate",
			parentId: group.id,
			x: 10,
			y: 20,
			width: 200,
			height: 100,
			rotation: 15,
			cornerRadius: 8,
			fill: { type: "linear", angle: 45, stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] },
			stroke: { enabled: true, color: "#112233", width: 3 },
		});
		const path = createPathLayer({
			name: "Glyph",
			parentId: group.id,
			...pathFromWorld([
				{
					closed: true,
					anchors: [
						{ x: 50, y: 50, handleOut: { x: 30, y: -40 }, type: "corner" },
						{ x: 150, y: 60, type: "corner" },
						{ x: 100, y: 140, handleIn: { x: 20, y: 0 }, handleOut: { x: -20, y: 0 }, type: "symmetric" },
					],
				},
				rectSubpath(70, 70, 20, 20),
			]),
			fill: solid("#00ff0080"),
			fillRule: "evenodd",
			stroke: { enabled: true, color: "#000000", width: 2 },
		});
		load([shape, path, group]);
		const markup = await layersToSvg([group.id]);
		const { layers, simplified } = parseSvg(markup);
		expect(simplified).toEqual([]);

		const g = layers.find((l) => l.type === "group") as GroupLayer;
		expect(g).toMatchObject({ name: "Badge", opacity: 0.75 });
		const kids = layers.filter((l) => l.parentId === g.id);
		expect(kids.map((k) => k.name)).toEqual(["Plate", "Glyph"]);

		// The root viewBox maps the content's corner to (0, 0): compare with that offset.
		const view = /viewBox="([-\d.]+) ([-\d.]+)/.exec(markup);
		const ox = Number(view?.[1]);
		const oy = Number(view?.[2]);

		const plate = kids[0] as ShapeLayer;
		expect(plate.type).toBe("shape");
		expect(plate.shape).toBe("rect");
		expect(plate.x).toBeCloseTo(10 - ox);
		expect(plate.y).toBeCloseTo(20 - oy);
		expect(plate.rotation).toBeCloseTo(15);
		expect(plate.width).toBeCloseTo(200);
		expect(plate.height).toBeCloseTo(100);
		expect(plate.cornerRadius).toBeCloseTo(8);
		expect(plate.fill.type).toBe("linear");
		if (plate.fill.type === "linear") {
			expect(plate.fill.angle).toBeCloseTo(45);
			expect(plate.fill.stops).toEqual(shape.fill.type === "linear" ? shape.fill.stops : []);
		}
		expect(plate.stroke).toMatchObject({ enabled: true, color: "#112233", width: 3 });

		const glyph = kids[1] as PathLayer;
		expect(glyph.type).toBe("path");
		expect(glyph.fillRule).toBe("evenodd");
		expect(glyph.fill).toEqual(solid("#00ff0080"));
		expect(glyph.stroke).toMatchObject({ enabled: true, color: "#000000", width: 2 });
		const before = worldSubpaths(path);
		const after = worldSubpaths(glyph);
		expect(after).toHaveLength(2);
		for (let s = 0; s < before.length; s++) {
			expect(after[s].closed).toBe(before[s].closed);
			expect(after[s].anchors).toHaveLength(before[s].anchors.length);
			before[s].anchors.forEach((a, i) => {
				const b = after[s].anchors[i];
				expect(b.x).toBeCloseTo(a.x - ox, 2);
				expect(b.y).toBeCloseTo(a.y - oy, 2);
				expect(b.handleIn?.x ?? 0).toBeCloseTo(a.handleIn?.x ?? 0, 2);
				expect(b.handleOut?.y ?? 0).toBeCloseTo(a.handleOut?.y ?? 0, 2);
			});
		}
		expect(after[0].anchors[2].type).toBe("symmetric");
	});
});
