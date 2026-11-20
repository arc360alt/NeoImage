import { useId } from "react";
import type { Template } from "@/editor/templates";
import type { Fill, Layer } from "@/editor/types";
import {
	heartPath,
	pointsToSvg,
	polygonPoints,
	starPoints,
	trianglePoints,
} from "@/editor/geometry";
import { cn } from "@/utils/ui";
import { useMemo } from "react";

/** Lightweight SVG rendering of a template for pickers. */
export function TemplatePreview({
	template,
	className,
}: {
	template: Template;
	className?: string;
}) {
	const { canvas, layers } = useMemo(() => template.build(), [template]);
	const uid = useId().replace(/:/g, "");
	const defs: React.ReactNode[] = [];
	const paint = (fill: Fill, key: string) => {
		if (fill.type === "transparent") return "none";
		if (fill.type === "solid") return fill.color;
		const id = `${uid}-${key}`;
		const stops = fill.stops.map((s) => (
			<stop key={s.offset} offset={s.offset} stopColor={s.color} />
		));
		if (fill.type === "linear") {
			const rad = ((fill.angle - 90) * Math.PI) / 180;
			defs.push(
				<linearGradient
					key={id}
					id={id}
					x1={0.5 - Math.cos(rad) / 2}
					y1={0.5 - Math.sin(rad) / 2}
					x2={0.5 + Math.cos(rad) / 2}
					y2={0.5 + Math.sin(rad) / 2}
				>
					{stops}
				</linearGradient>,
			);
		} else {
			defs.push(
				<radialGradient key={id} id={id}>
					{stops}
				</radialGradient>,
			);
		}
		return `url(#${id})`;
	};

	const background = paint(canvas.background, "bg");
	const elements = layers.map((layer) => renderLayer(layer, paint));

	return (
		<svg
			viewBox={`0 0 ${canvas.width} ${canvas.height}`}
			className={cn("bg-muted aspect-square w-full", className)}
			preserveAspectRatio="xMidYMid meet"
			role="img"
			aria-label={template.name}
		>
			<defs>{defs}</defs>
			<rect width={canvas.width} height={canvas.height} fill={background} />
			{elements}
		</svg>
	);
}

function renderLayer(
	layer: Layer,
	paint: (fill: Fill, key: string) => string,
): React.ReactNode {
	const transform = `translate(${layer.x} ${layer.y}) rotate(${layer.rotation})`;
	if (layer.type === "text") {
		const lines = layer.text.split("\n");
		const anchor =
			layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
		const x =
			layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
		return (
			<g key={layer.id} transform={transform} opacity={layer.opacity}>
				<text
					fill={paint(layer.fill, layer.id)}
					fontFamily={`"${layer.fontFamily}", sans-serif`}
					fontSize={layer.fontSize}
					fontWeight={layer.fontWeight}
					fontStyle={layer.fontStyle}
					letterSpacing={layer.letterSpacing}
					textAnchor={anchor}
					stroke={layer.stroke.enabled ? layer.stroke.color : undefined}
					strokeWidth={layer.stroke.enabled ? layer.stroke.width : undefined}
					paintOrder="stroke"
				>
					{lines.map((line, i) => (
						<tspan
							// biome-ignore lint/suspicious/noArrayIndexKey: static preview
							key={i}
							x={x}
							y={layer.fontSize * (0.85 + i * layer.lineHeight)}
						>
							{line}
						</tspan>
					))}
				</text>
			</g>
		);
	}
	if (layer.type === "shape") {
		const fill = paint(layer.fill, layer.id);
		const stroke = layer.stroke.enabled ? layer.stroke.color : "none";
		const strokeWidth = layer.stroke.enabled ? layer.stroke.width : 0;
		const common = { fill, stroke, strokeWidth, opacity: layer.opacity };
		let shape: React.ReactNode = null;
		const { width: w, height: h } = layer;
		switch (layer.shape) {
			case "rect":
				shape = <rect width={w} height={h} rx={layer.cornerRadius} {...common} />;
				break;
			case "ellipse":
				shape = <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
				break;
			case "triangle":
				shape = <polygon points={pointsToSvg(trianglePoints(w, h))} {...common} />;
				break;
			case "polygon":
				shape = <polygon points={pointsToSvg(polygonPoints(w, h, layer.sides))} {...common} />;
				break;
			case "star":
				shape = (
					<polygon
						points={pointsToSvg(starPoints(w, h, layer.sides, layer.innerRatio))}
						{...common}
					/>
				);
				break;
			case "heart":
				shape = <path d={heartPath(w, h)} {...common} />;
				break;
			case "line":
			case "arrow":
				shape = <line x1={0} y1={0} x2={w} y2={0} {...common} strokeLinecap="round" />;
				break;
		}
		return (
			<g key={layer.id} transform={transform}>
				{shape}
			</g>
		);
	}
	return null;
}
