"use client";

import { PanelView } from "./base-panel";
import { createShapeLayer, solid } from "@/editor/defaults";
import { getEditor } from "@/editor/store";
import { centerIn, getInsertionArea } from "@/editor/insertion";
import type { ShapeKind, ShapeLayer } from "@/editor/types";
import { heartPath, pointsToSvg, polygonPoints, starPoints, trianglePoints } from "@/editor/geometry";

type ElementDef = { id: string; label: string; shape: ShapeKind; init?: Partial<ShapeLayer> };

const SHAPES: ElementDef[] = [
	{ id: "rect", label: "Square", shape: "rect" },
	{ id: "rounded", label: "Rounded", shape: "rect", init: { cornerRadius: 48 } },
	{ id: "ellipse", label: "Circle", shape: "ellipse" },
	{ id: "triangle", label: "Triangle", shape: "triangle" },
	{ id: "star", label: "Star", shape: "star" },
	{ id: "star-burst", label: "Burst", shape: "star", init: { sides: 12, innerRatio: 0.72 } },
	{ id: "hexagon", label: "Hexagon", shape: "polygon", init: { sides: 6 } },
	{ id: "pentagon", label: "Pentagon", shape: "polygon", init: { sides: 5 } },
	{ id: "heart", label: "Heart", shape: "heart", init: { fill: solid("#ef4444") } },
	{ id: "outline-rect", label: "Frame", shape: "rect", init: { fill: { type: "transparent" }, stroke: { enabled: true, color: "#111111", width: 8 } } },
	{ id: "outline-circle", label: "Ring", shape: "ellipse", init: { fill: { type: "transparent" }, stroke: { enabled: true, color: "#111111", width: 8 } } },
	{ id: "pill", label: "Pill", shape: "rect", init: { height: 120, width: 360, cornerRadius: 60 } },
];

const LINES: ElementDef[] = [
	{ id: "line", label: "Line", shape: "line" },
	{ id: "dashed", label: "Thick line", shape: "line", init: { stroke: { enabled: true, color: "#111111", width: 24 } } },
	{ id: "arrow", label: "Arrow", shape: "arrow" },
];

function addElement(def: ElementDef) {
	const doc = getEditor().doc;
	if (!doc) return;
	const area = getInsertionArea();
	const base = Math.round(Math.min(area.width, area.height) * 0.3);
	const layer = createShapeLayer(def.shape, { width: base, height: base, ...def.init });
	if (def.init?.width && def.init.height) {
		const ratio = def.init.height / def.init.width;
		layer.width = Math.round(base * 1.4);
		layer.height = Math.round(layer.width * ratio);
		layer.cornerRadius = layer.height / 2;
	}
	if (def.shape === "line" || def.shape === "arrow") layer.height = 0;
	const pos = centerIn(area, layer.width, Math.max(layer.height, 1));
	layer.x = pos.x;
	layer.y = pos.y;
	getEditor().addLayers([layer]);
}

export function ElementsView() {
	return (
		<PanelView title="Elements">
			<div className="flex flex-col gap-4 pb-4">
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">Shapes</span>
					<div className="grid grid-cols-3 gap-1.5">
						{SHAPES.map((def) => (
							<ElementButton key={def.id} def={def} />
						))}
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">Lines & arrows</span>
					<div className="grid grid-cols-3 gap-1.5">
						{LINES.map((def) => (
							<ElementButton key={def.id} def={def} />
						))}
					</div>
				</div>
			</div>
		</PanelView>
	);
}

function ElementButton({ def }: { def: ElementDef }) {
	const fill = def.init?.fill?.type === "transparent" ? "none" : "currentColor";
	const stroke = def.init?.stroke?.enabled ? "currentColor" : "none";
	const s = 40;
	let icon: React.ReactNode;
	switch (def.shape) {
		case "rect":
			icon = def.init?.height ? (
				<rect x={2} y={12} width={36} height={16} rx={8} fill={fill} />
			) : (
				<rect x={4} y={4} width={32} height={32} rx={def.init?.cornerRadius ? 8 : 0} fill={fill} stroke={stroke} strokeWidth={3} />
			);
			break;
		case "ellipse":
			icon = <circle cx={20} cy={20} r={16} fill={fill} stroke={stroke} strokeWidth={3} />;
			break;
		case "triangle":
			icon = <polygon points={pointsToSvg(trianglePoints(s, s).map((v) => v * 0.8 + 4))} fill={fill} />;
			break;
		case "star":
			icon = <polygon points={pointsToSvg(starPoints(s, s, def.init?.sides ?? 5, def.init?.innerRatio ?? 0.45).map((v) => v * 0.85 + 3))} fill={fill} />;
			break;
		case "polygon":
			icon = <polygon points={pointsToSvg(polygonPoints(s, s, def.init?.sides ?? 6).map((v) => v * 0.85 + 3))} fill={fill} />;
			break;
		case "heart":
			icon = <path d={heartPath(34, 34)} transform="translate(3 4)" fill="#ef4444" />;
			break;
		case "line":
			icon = <line x1={4} y1={20} x2={36} y2={20} stroke="currentColor" strokeWidth={def.init?.stroke?.width ? 7 : 3} strokeLinecap="round" />;
			break;
		case "arrow":
			icon = (
				<g stroke="currentColor" strokeWidth={3} strokeLinecap="round" fill="none">
					<line x1={4} y1={20} x2={36} y2={20} />
					<polyline points="27,12 36,20 27,28" />
				</g>
			);
			break;
	}
	return (
		<button
			type="button"
			onClick={() => addElement(def)}
			title={def.label}
			className="hover:bg-accent text-foreground/80 flex aspect-square items-center justify-center rounded-md border"
		>
			<svg viewBox="0 0 40 40" className="size-9" aria-hidden>
				{icon}
			</svg>
		</button>
	);
}
