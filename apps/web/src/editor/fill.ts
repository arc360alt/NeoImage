import type { Fill, GradientStop } from "./types";

/** Converts a Fill into Konva fill props for a box of the given size. */
export function fillToKonva(
	fill: Fill,
	width: number,
	height: number,
	origin: { x: number; y: number } = { x: 0, y: 0 },
): Record<string, unknown> {
	switch (fill.type) {
		case "transparent":
			return { fillEnabled: false };
		case "solid":
			return { fill: fill.color, fillEnabled: true, fillPriority: "color" };
		case "linear": {
			const rad = ((fill.angle - 90) * Math.PI) / 180;
			const cx = origin.x + width / 2;
			const cy = origin.y + height / 2;
			const half =
				(Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad))) /
				2;
			return {
				fillEnabled: true,
				fillPriority: "linear-gradient",
				fillLinearGradientStartPoint: {
					x: cx - Math.cos(rad) * half,
					y: cy - Math.sin(rad) * half,
				},
				fillLinearGradientEndPoint: {
					x: cx + Math.cos(rad) * half,
					y: cy + Math.sin(rad) * half,
				},
				fillLinearGradientColorStops: flattenStops(fill.stops),
			};
		}
		case "radial": {
			const cx = origin.x + width / 2;
			const cy = origin.y + height / 2;
			return {
				fillEnabled: true,
				fillPriority: "radial-gradient",
				fillRadialGradientStartPoint: { x: cx, y: cy },
				fillRadialGradientEndPoint: { x: cx, y: cy },
				fillRadialGradientStartRadius: 0,
				fillRadialGradientEndRadius: Math.max(width, height) / 2,
				fillRadialGradientColorStops: flattenStops(fill.stops),
			};
		}
	}
}

function flattenStops(stops: GradientStop[]) {
	return [...stops]
		.sort((a, b) => a.offset - b.offset)
		.flatMap((s) => [s.offset, s.color]);
}

/** CSS background for previews/swatches. */
export function fillToCss(fill: Fill): string {
	switch (fill.type) {
		case "transparent":
			return "transparent";
		case "solid":
			return fill.color;
		case "linear":
			return `linear-gradient(${fill.angle}deg, ${fill.stops
				.map((s) => `${s.color} ${s.offset * 100}%`)
				.join(", ")})`;
		case "radial":
			return `radial-gradient(circle, ${fill.stops
				.map((s) => `${s.color} ${s.offset * 100}%`)
				.join(", ")})`;
	}
}

export function primaryColor(fill: Fill): string {
	if (fill.type === "solid") return fill.color;
	if (fill.type === "transparent") return "#000000";
	return fill.stops[0]?.color ?? "#000000";
}

export const SOLID_SWATCHES = [
	"#000000",
	"#545454",
	"#a6a6a6",
	"#ffffff",
	"#ef4444",
	"#f97316",
	"#f59e0b",
	"#eab308",
	"#84cc16",
	"#22c55e",
	"#14b8a6",
	"#06b6d4",
	"#3b82f6",
	"#6366f1",
	"#8b5cf6",
	"#d946ef",
	"#ec4899",
	"#f43f5e",
	"#fde68a",
	"#bbf7d0",
	"#bfdbfe",
	"#e9d5ff",
	"#fecdd3",
	"#1e293b",
];

export const GRADIENT_SWATCHES: Fill[] = [
	["#ff9a9e", "#fecfef"],
	["#a18cd1", "#fbc2eb"],
	["#fad0c4", "#ffd1ff"],
	["#ffecd2", "#fcb69f"],
	["#ff8177", "#b12a5b"],
	["#84fab0", "#8fd3f4"],
	["#a1c4fd", "#c2e9fb"],
	["#d4fc79", "#96e6a1"],
	["#667eea", "#764ba2"],
	["#f093fb", "#f5576c"],
	["#4facfe", "#00f2fe"],
	["#43e97b", "#38f9d7"],
	["#fa709a", "#fee140"],
	["#30cfd0", "#330867"],
	["#0f2027", "#2c5364"],
	["#141e30", "#243b55"],
	["#ff512f", "#dd2476"],
	["#f7971e", "#ffd200"],
	["#00c6ff", "#0072ff"],
	["#232526", "#414345"],
].map(([a, b], i) => ({
	type: "linear" as const,
	angle: i % 3 === 0 ? 135 : i % 3 === 1 ? 180 : 90,
	stops: [
		{ offset: 0, color: a },
		{ offset: 1, color: b },
	],
}));
