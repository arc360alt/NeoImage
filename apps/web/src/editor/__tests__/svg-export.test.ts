import { beforeEach, describe, expect, test } from "bun:test";
import { useEditorStore } from "../store";
import { createDrawingLayer, createFrameLayer, createShapeLayer, solid } from "../defaults";
import { artboardToSvg, layerToSvg } from "../svg-export";
import type { Layer, ProjectDoc } from "../types";

function load(layers: Layer[], mode: ProjectDoc["mode"] = "default") {
	useEditorStore.setState({
		projectId: "p1",
		doc: {
			id: "p1",
			name: "Test",
			mode,
			createdAt: 0,
			updatedAt: 0,
			canvas: { width: 800, height: 600, background: solid("#fafafa") },
			layers,
			version: 1,
		},
	});
}

/** Minimal well-formedness check: every opened tag is closed in order. */
function assertBalanced(svg: string) {
	const stack: string[] = [];
	const body = svg.replace(/<\?xml[^>]*\?>/, "");
	for (const match of body.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
		const [, closing, name, selfClosing] = match;
		if (selfClosing) continue;
		if (closing) expect(stack.pop()).toBe(name);
		else stack.push(name);
	}
	expect(stack).toEqual([]);
}

describe("SVG export", () => {
	beforeEach(() => load([]));

	test("artboard: real vector elements, gradients, transforms", async () => {
		const rect = createShapeLayer("rect", {
			name: "Card",
			x: 10,
			y: 20,
			width: 200,
			height: 100,
			rotation: 45,
			cornerRadius: 12,
			opacity: 0.5,
			fill: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff80" }] },
			stroke: { enabled: true, color: "#000000", width: 2 },
		});
		const star = createShapeLayer("star", { x: 300, y: 300, width: 100, height: 100, blendMode: "multiply" });
		const hidden = createShapeLayer("ellipse", { visible: false });
		load([rect, star, hidden]);
		const svg = await artboardToSvg({ scale: 2 });
		assertBalanced(svg);
		expect(svg).toContain('width="1600" height="1200" viewBox="0 0 800 600"');
		expect(svg).toContain('<rect id="background" width="800" height="600" fill="#fafafa"/>');
		expect(svg).toContain('transform="translate(10 20) rotate(45)"');
		expect(svg).toMatch(/<rect width="200" height="100" rx="12" fill="url\(#g\d+\)" stroke="#000000"/);
		// 8-digit hex is split into color + opacity for compatibility.
		expect(svg).toContain('stop-color="#0000ff" stop-opacity="0.502"');
		expect(svg).toContain('id="Card" opacity="0.5"');
		expect(svg).toContain("<polygon points=");
		expect(svg).toContain("mix-blend-mode:multiply");
		expect(svg).not.toContain("<ellipse");
		expect(svg).not.toContain("data:image/png"); // no rasterized content
	});

	test("transparent background is omitted", async () => {
		load([createShapeLayer("rect")]);
		expect(await artboardToSvg({ transparent: true })).not.toContain('id="background"');
	});

	test("frame exports its region, clipped, with its children", async () => {
		const frame = createFrameLayer({ id: "f", name: "Frame 1", x: 100, y: 50, width: 300, height: 200, cornerRadius: 8 });
		const child = createShapeLayer("ellipse", { parentId: "f", x: 350, y: 60, width: 100, height: 100 });
		const outside = createShapeLayer("rect", { x: 900, y: 900 });
		load([frame, child, outside], "freeform");
		const svg = await layerToSvg("f");
		assertBalanced(svg);
		expect(svg).toContain('viewBox="100 50 300 200"');
		expect(svg).toMatch(/<clipPath id="c\d+"><rect x="100" y="50" width="300" height="200" rx="8"\/><\/clipPath>/);
		expect(svg).toContain("<ellipse");
		expect((svg.match(/<rect /g) ?? []).length).toBe(2); // frame + clip, not the outside rect
	});

	test("drawing: smooth paths, eraser strokes become a mask over earlier strokes", async () => {
		const drawing = createDrawingLayer({
			width: 400,
			height: 400,
			strokes: [
				{ id: "a", points: [0, 0, 50, 50, 100, 0, 150, 50], color: "#ff0000", size: 8, opacity: 1, mode: "brush" },
				{ id: "b", points: [0, 25, 150, 25], color: "#000000", size: 10, opacity: 1, mode: "eraser" },
				{ id: "c", points: [0, 100, 100, 100], color: "#00ff00", size: 4, opacity: 0.5, mode: "highlighter" },
			],
		});
		load([drawing]);
		const svg = await artboardToSvg();
		assertBalanced(svg);
		expect(svg).toMatch(/<path d="M0 0Q[^"]*C[^"]*Q[^"]*" fill="none" stroke="#ff0000"/);
		expect(svg).toMatch(/<mask id="m\d+"/);
		// Brush stroke is inside the masked group; the later highlighter is not.
		expect(svg).toMatch(/<g mask="url\(#m\d+\)"><path[^>]*stroke="#ff0000"[^>]*\/><\/g><path[^>]*stroke="#00ff00"[^>]*stroke-linecap="square"[^>]*opacity="0.4"/);
	});
});
