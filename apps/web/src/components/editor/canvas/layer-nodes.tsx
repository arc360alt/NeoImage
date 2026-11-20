"use client";

import Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Group, Image as KImage, Line, Rect, Shape, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { adjustmentsToKonva, hasAdjustments } from "@/editor/filters";
import { fillToKonva } from "@/editor/fill";
import { ensureFont } from "@/editor/fonts";
import {
	polygonPoints,
	starPoints,
	trianglePoints,
} from "@/editor/geometry";
import { loadAssetImage } from "@/storage/assets";
import type {
	DrawingLayer,
	FrameLayer,
	ImageLayer,
	LayoutGrid,
	Layer,
	ShapeLayer,
	TextLayer,
} from "@/editor/types";

export type LayerNodeHandlers = {
	onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>, layer: Layer) => void;
	onDragStart: (event: KonvaEventObject<DragEvent>, layer: Layer) => void;
	onDragMove: (event: KonvaEventObject<DragEvent>, layer: Layer) => void;
	onDragEnd: (event: KonvaEventObject<DragEvent>, layer: Layer) => void;
	onDoubleClick: (event: KonvaEventObject<MouseEvent>, layer: Layer) => void;
	onHover: (layer: Layer | null) => void;
};

type NodeProps = {
	layer: Layer;
	interactive: boolean;
	hidden: boolean;
	cacheRatio: number;
	handlers: LayerNodeHandlers;
};

function useAssetImage(assetId: string) {
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	useEffect(() => {
		let alive = true;
		loadAssetImage(assetId)
			.then((img) => {
				if (alive) setImage(img);
			})
			.catch(() => {
				if (alive) setImage(null);
			});
		return () => {
			alive = false;
		};
	}, [assetId]);
	return image;
}

/** Shared Konva props for every layer type. */
function commonProps({ layer, interactive, hidden, handlers }: NodeProps) {
	const shadow = layer.shadow.enabled
		? {
				shadowEnabled: true,
				shadowColor: layer.shadow.color,
				shadowBlur: layer.shadow.blur,
				shadowOffsetX: layer.shadow.offsetX,
				shadowOffsetY: layer.shadow.offsetY,
				shadowOpacity: layer.shadow.opacity,
				shadowForStrokeEnabled: false,
			}
		: { shadowEnabled: false };

	return {
		id: layer.id,
		name: hasAdjustments(layer.adjustments) ? "layer filtered" : "layer",
		x: layer.x,
		y: layer.y,
		rotation: layer.rotation,
		scaleX: layer.scaleX,
		scaleY: layer.scaleY,
		opacity: hidden ? 0 : layer.opacity,
		visible: layer.visible,
		listening: interactive && !layer.locked,
		draggable: interactive && !layer.locked,
		globalCompositeOperation: layer.blendMode,
		perfectDrawEnabled: false,
		...shadow,
		onMouseDown: (e: KonvaEventObject<MouseEvent>) => handlers.onSelect(e, layer),
		onTouchStart: (e: KonvaEventObject<TouchEvent>) => handlers.onSelect(e, layer),
		onDragStart: (e: KonvaEventObject<DragEvent>) => handlers.onDragStart(e, layer),
		onDragMove: (e: KonvaEventObject<DragEvent>) => handlers.onDragMove(e, layer),
		onDragEnd: (e: KonvaEventObject<DragEvent>) => handlers.onDragEnd(e, layer),
		onDblClick: (e: KonvaEventObject<MouseEvent>) => handlers.onDoubleClick(e, layer),
		onMouseEnter: () => handlers.onHover(layer),
		onMouseLeave: () => handlers.onHover(null),
	};
}

/**
 * Applies filters by caching the node. Konva filters only run on cached
 * nodes, so we re-cache whenever the layer (or the zoom bucket) changes.
 */
function useFilters(
	nodeRef: React.RefObject<Konva.Node | null>,
	layer: Layer,
	cacheRatio: number,
	ready: boolean,
	forceCache = false,
) {
	useEffect(() => {
		const node = nodeRef.current;
		if (!node || !ready) return;
		const active = hasAdjustments(layer.adjustments);
		if (!active && !forceCache) {
			node.clearCache();
			node.filters([]);
			node.getLayer()?.batchDraw();
			return;
		}
		const { filters, attrs } = active
			? adjustmentsToKonva(layer.adjustments)
			: { filters: [], attrs: {} };
		node.setAttrs(attrs);
		node.filters(filters);
		const rect = node.getClientRect({ skipTransform: true, skipShadow: true });
		// Keep cache canvases a sensible size for huge layers.
		const maxSide = Math.max(rect.width, rect.height, 1);
		const ratio = Math.max(0.25, Math.min(cacheRatio, 4096 / maxSide));
		try {
			node.cache({ pixelRatio: ratio });
		} catch {
			// Zero-sized nodes can't be cached.
		}
		node.getLayer()?.batchDraw();
	}, [nodeRef, layer, cacheRatio, ready, forceCache]);
}

export function LayerNode(props: NodeProps) {
	switch (props.layer.type) {
		case "image":
			return <ImageNode {...props} layer={props.layer} />;
		case "text":
			return <TextNode {...props} layer={props.layer} />;
		case "shape":
			return <ShapeNode {...props} layer={props.layer} />;
		case "drawing":
			return <DrawingNode {...props} layer={props.layer} />;
		case "frame":
			// Frames are rendered by FrameNode so they can wrap their children.
			return null;
	}
}

/**
 * A FreeForm frame: the frame rectangle plus a group holding its children,
 * clipped to the frame. The clip reads the live rect so it follows drags and
 * resizes before they're committed.
 */
export function FrameNode({
	children,
	suspendClip,
	showLayoutGrids = true,
	...props
}: NodeProps & {
	layer: FrameLayer;
	children: React.ReactNode;
	suspendClip: boolean;
	showLayoutGrids?: boolean;
}) {
	const { layer } = props;
	const ref = useRef<Konva.Rect>(null);
	const common = commonProps(props);
	// Opacity/visibility apply to the frame and its contents together.
	const { opacity, visible, ...rectProps } = common;
	// Transparent frames still need a hit area so they can be clicked and dragged.
	const fill =
		layer.fill.type === "transparent"
			? { fill: "rgba(0,0,0,0)", fillEnabled: true }
			: fillToKonva(layer.fill, layer.width, layer.height);
	const clip = layer.clipContent && !suspendClip;

	return (
		<Group name="frame-wrapper" opacity={opacity} visible={visible}>
			<Rect
				ref={ref}
				{...rectProps}
				name="layer frame"
				width={layer.width}
				height={layer.height}
				cornerRadius={layer.cornerRadius}
				{...fill}
				stroke={layer.stroke.enabled ? layer.stroke.color : undefined}
				strokeWidth={layer.stroke.enabled ? layer.stroke.width : 0}
				strokeEnabled={layer.stroke.enabled}
				strokeScaleEnabled={false}
			/>
			<Group
				clipFunc={
					clip
						? (ctx) => {
								const node = ref.current;
								if (!node) return;
								const w = node.width() * node.scaleX();
								const h = node.height() * node.scaleY();
								const r = Math.min(layer.cornerRadius, Math.abs(w) / 2, Math.abs(h) / 2);
								ctx.beginPath();
								if (r > 0) {
									ctx.roundRect(node.x(), node.y(), w, h, r);
								} else {
									ctx.rect(node.x(), node.y(), w, h);
								}
								ctx.closePath();
							}
						: undefined
				}
			>
				{children}
				{showLayoutGrids && layer.layoutGrids?.some((g) => g.visible) && (
					<Shape
						// Editor-only: hidden when exporting (see editor/stage.ts).
						name="editor-only"
						listening={false}
						sceneFunc={(ctx) => {
							const node = ref.current;
							if (!node) return;
							drawLayoutGrids(ctx, layer.layoutGrids ?? [], {
								x: node.x(),
								y: node.y(),
								width: node.width() * node.scaleX(),
								height: node.height() * node.scaleY(),
								zoom: node.getStage()?.scaleX() ?? 1,
							});
						}}
					/>
				)}
			</Group>
		</Group>
	);
}

/** Paints Figma-style layout grids (uniform grid, columns, rows) over a frame rect. */
function drawLayoutGrids(
	ctx: Konva.Context,
	grids: LayoutGrid[],
	frame: { x: number; y: number; width: number; height: number; zoom: number },
) {
	const { x, y, width, height, zoom } = frame;
	for (const grid of grids) {
		if (!grid.visible) continue;
		ctx.save();
		ctx.globalAlpha = Math.max(0, Math.min(1, grid.opacity));
		ctx.fillStyle = grid.color;
		ctx.strokeStyle = grid.color;
		if (grid.type === "grid") {
			const step = Math.max(1, grid.size);
			// Skip when the lines would be closer than 3 screen pixels.
			if (step * zoom >= 3) {
				ctx.lineWidth = 1 / zoom;
				ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 2.5);
				ctx.beginPath();
				for (let gx = x + step; gx < x + width; gx += step) {
					ctx.moveTo(gx, y);
					ctx.lineTo(gx, y + height);
				}
				for (let gy = y + step; gy < y + height; gy += step) {
					ctx.moveTo(x, gy);
					ctx.lineTo(x + width, gy);
				}
				ctx.stroke();
			}
		} else {
			const horizontal = grid.type === "columns";
			const span = horizontal ? width : height;
			const count = Math.max(1, Math.round(grid.count));
			const inner = span - grid.margin * 2 - grid.gutter * (count - 1);
			const band = inner / count;
			if (band > 0) {
				for (let i = 0; i < count; i++) {
					const start = grid.margin + i * (band + grid.gutter);
					if (horizontal) ctx.fillRect(x + start, y, band, height);
					else ctx.fillRect(x, y + start, width, band);
				}
			}
		}
		ctx.restore();
	}
}

function ImageNode(props: NodeProps & { layer: ImageLayer }) {
	const { layer, cacheRatio } = props;
	const image = useAssetImage(layer.assetId);
	const ref = useRef<Konva.Image>(null);
	useFilters(ref, layer, cacheRatio, !!image);

	return (
		<KImage
			ref={ref}
			{...commonProps(props)}
			image={image ?? undefined}
			width={layer.width}
			height={layer.height}
			crop={layer.crop ?? undefined}
			cornerRadius={layer.cornerRadius}
			stroke={layer.stroke.enabled ? layer.stroke.color : undefined}
			strokeWidth={layer.stroke.enabled ? layer.stroke.width : 0}
			strokeEnabled={layer.stroke.enabled}
		/>
	);
}

export function textFontStyle(layer: TextLayer) {
	const parts: string[] = [];
	if (layer.fontStyle === "italic") parts.push("italic");
	parts.push(layer.fontWeight === "bold" ? "bold" : "normal");
	return parts.join(" ");
}

export function textDecoration(layer: TextLayer) {
	return [layer.underline && "underline", layer.lineThrough && "line-through"]
		.filter(Boolean)
		.join(" ");
}

function TextNode(props: NodeProps & { layer: TextLayer }) {
	const { layer, cacheRatio } = props;
	const ref = useRef<Konva.Text>(null);
	const [fontVersion, setFontVersion] = useState(0);

	useEffect(() => {
		let alive = true;
		ensureFont(layer.fontFamily).then(() => {
			const node = ref.current;
			if (!alive || !node) return;
			// Konva measures and wraps text when font attrs change. Nudge the
			// font size so it re-measures with the real font metrics.
			const size = node.fontSize();
			node.fontSize(size + 0.0001);
			node.fontSize(size);
			node.getLayer()?.batchDraw();
			setFontVersion((v) => v + 1);
		});
		return () => {
			alive = false;
		};
	}, [layer.fontFamily]);

	useFilters(ref, layer, cacheRatio, fontVersion >= 0);

	const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
	const height = ref.current?.height() ?? layer.fontSize * layer.lineHeight;

	return (
		<Text
			ref={ref}
			{...commonProps(props)}
			text={text}
			width={layer.width}
			fontFamily={`"${layer.fontFamily}", sans-serif`}
			fontSize={layer.fontSize}
			fontStyle={textFontStyle(layer)}
			textDecoration={textDecoration(layer)}
			align={layer.align}
			lineHeight={layer.lineHeight}
			letterSpacing={layer.letterSpacing}
			{...fillToKonva(layer.fill, layer.width, height)}
			stroke={layer.stroke.enabled ? layer.stroke.color : undefined}
			strokeWidth={layer.stroke.enabled ? layer.stroke.width : 0}
			strokeEnabled={layer.stroke.enabled}
			fillAfterStrokeEnabled
			lineJoin="round"
		/>
	);
}

function ShapeNode(props: NodeProps & { layer: ShapeLayer }) {
	const { layer, cacheRatio } = props;
	const ref = useRef<Konva.Shape>(null);
	useFilters(ref, layer, cacheRatio, true);
	const isLine = layer.shape === "line" || layer.shape === "arrow";
	const strokeWidth = layer.stroke.enabled ? layer.stroke.width : 0;
	const height = isLine ? Math.max(strokeWidth, 1) : layer.height;

	return (
		<Shape
			ref={ref}
			{...commonProps(props)}
			width={layer.width}
			height={height}
			{...(isLine ? { fillEnabled: false } : fillToKonva(layer.fill, layer.width, layer.height))}
			stroke={layer.stroke.enabled ? layer.stroke.color : undefined}
			strokeWidth={strokeWidth}
			strokeEnabled={layer.stroke.enabled}
			hitStrokeWidth={isLine ? Math.max(strokeWidth, 20) : "auto"}
			lineJoin="round"
			lineCap="round"
			sceneFunc={(ctx, shape) => {
				drawShapePath(ctx, layer, height);
				ctx.fillStrokeShape(shape);
				if (layer.shape === "arrow") {
					// Arrow head.
					const size = Math.max(strokeWidth * 3, 12);
					const y = height / 2;
					ctx.beginPath();
					ctx.moveTo(layer.width - size, y - size * 0.7);
					ctx.lineTo(layer.width, y);
					ctx.lineTo(layer.width - size, y + size * 0.7);
					ctx.strokeShape(shape);
				}
			}}
		/>
	);
}

function drawShapePath(
	ctx: Konva.Context,
	layer: ShapeLayer,
	height: number,
) {
	const { width: w } = layer;
	const h = layer.height;
	ctx.beginPath();
	const poly = (points: number[]) => {
		ctx.moveTo(points[0], points[1]);
		for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
		ctx.closePath();
	};
	switch (layer.shape) {
		case "rect": {
			const r = Math.min(layer.cornerRadius, w / 2, h / 2);
			if (r > 0) {
				ctx.moveTo(r, 0);
				ctx.arcTo(w, 0, w, h, r);
				ctx.arcTo(w, h, 0, h, r);
				ctx.arcTo(0, h, 0, 0, r);
				ctx.arcTo(0, 0, w, 0, r);
				ctx.closePath();
			} else {
				ctx.rect(0, 0, w, h);
			}
			break;
		}
		case "ellipse":
			ctx.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
			ctx.closePath();
			break;
		case "triangle":
			poly(trianglePoints(w, h));
			break;
		case "polygon":
			poly(polygonPoints(w, h, layer.sides));
			break;
		case "star":
			poly(starPoints(w, h, layer.sides, layer.innerRatio));
			break;
		case "heart":
			drawHeart(ctx, w, h);
			break;
		case "line":
		case "arrow":
			ctx.moveTo(0, height / 2);
			ctx.lineTo(w, height / 2);
			break;
	}
}

function drawHeart(ctx: Konva.Context, w: number, h: number) {
	ctx.moveTo(w / 2, h * 0.95);
	ctx.bezierCurveTo(w * 0.15, h * 0.68, -w * 0.05, h * 0.38, w * 0.12, h * 0.16);
	ctx.bezierCurveTo(w * 0.27, -h * 0.02, w * 0.45, h * 0.05, w / 2, h * 0.22);
	ctx.bezierCurveTo(w * 0.55, h * 0.05, w * 0.73, -h * 0.02, w * 0.88, h * 0.16);
	ctx.bezierCurveTo(w * 1.05, h * 0.38, w * 0.85, h * 0.68, w / 2, h * 0.95);
	ctx.closePath();
}

function DrawingNode(props: NodeProps & { layer: DrawingLayer }) {
	const { layer, cacheRatio } = props;
	const ref = useRef<Konva.Group>(null);
	const hasEraser = layer.strokes.some((s) => s.mode === "eraser");
	// Eraser strokes use destination-out, which only stays inside this layer
	// when the group is cached into its own canvas.
	useFilters(ref, layer, cacheRatio, layer.strokes.length > 0, hasEraser);

	return (
		<Group
			ref={ref}
			{...commonProps(props)}
			width={layer.width}
			height={layer.height}
		>
			{layer.strokes.map((stroke) => (
				<Line
					key={stroke.id}
					points={stroke.points}
					stroke={stroke.mode === "eraser" ? "#000000" : stroke.color}
					strokeWidth={stroke.size}
					opacity={stroke.mode === "highlighter" ? 0.4 : stroke.opacity}
					lineCap={stroke.mode === "highlighter" ? "square" : "round"}
					lineJoin="round"
					tension={0.4}
					globalCompositeOperation={
						stroke.mode === "eraser" ? "destination-out" : "source-over"
					}
					perfectDrawEnabled={false}
				/>
			))}
		</Group>
	);
}
