"use client";

import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Group, Image as KImage, Rect, Transformer } from "react-konva";
import { loadAssetImage } from "@/storage/assets";
import {
	CROP_ASPECTS,
	type CropRect,
	getCropGeometry,
	useCropStore,
} from "@/editor/crop-store";
import type { ImageLayer } from "@/editor/types";

const ACCENT = "#0ea5e9";

export function CropOverlay({
	layer,
	zoom,
}: {
	layer: ImageLayer;
	zoom: number;
}) {
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const rect = useCropStore((s) => s.rect);
	const setRect = useCropStore((s) => s.setRect);
	const aspect = useCropStore((s) => s.aspect);
	const rectRef = useRef<Konva.Rect>(null);
	const trRef = useRef<Konva.Transformer>(null);

	useEffect(() => {
		let alive = true;
		loadAssetImage(layer.assetId).then((img) => alive && setImage(img));
		return () => {
			alive = false;
		};
	}, [layer.assetId]);

	const natural = image
		? { width: image.naturalWidth, height: image.naturalHeight }
		: null;
	const geometry = natural ? getCropGeometry(layer, natural) : null;

	// Initialize the crop rect to the current visible region.
	useEffect(() => {
		if (!geometry) return;
		if (!useCropStore.getState().rect) {
			setRect({ x: 0, y: 0, width: layer.width, height: layer.height });
		}
	}, [geometry, layer.width, layer.height, setRect]);

	// Apply aspect ratio presets.
	useEffect(() => {
		if (!geometry || !natural) return;
		const preset = CROP_ASPECTS.find((a) => a.id === aspect);
		const current = useCropStore.getState().rect;
		if (!preset || !preset.ratio || !current) return;
		const ratio =
			preset.ratio === "original" ? natural.width / natural.height : preset.ratio;
		const { full } = geometry;
		let width = current.width;
		let height = width / ratio;
		if (height > full.height) {
			height = full.height;
			width = height * ratio;
		}
		if (width > full.width) {
			width = full.width;
			height = width / ratio;
		}
		const cx = current.x + current.width / 2;
		const cy = current.y + current.height / 2;
		setRect(clampRect({ x: cx - width / 2, y: cy - height / 2, width, height }, full));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [aspect, image]);

	useEffect(() => {
		if (rectRef.current && trRef.current) {
			trRef.current.nodes([rectRef.current]);
			trRef.current.getLayer()?.batchDraw();
		}
	}, [rect !== null, image]);

	if (!image || !geometry || !rect) return null;
	const { full } = geometry;
	const preset = CROP_ASPECTS.find((a) => a.id === aspect);
	const ratio =
		preset?.ratio === "original"
			? image.naturalWidth / image.naturalHeight
			: (preset?.ratio ?? null);

	const syncFromNode = () => {
		const node = rectRef.current;
		if (!node) return;
		const next = clampRect(
			{
				x: node.x(),
				y: node.y(),
				width: Math.max(10, node.width() * node.scaleX()),
				height: Math.max(10, node.height() * node.scaleY()),
			},
			full,
		);
		node.setAttrs({ ...next, scaleX: 1, scaleY: 1 });
		setRect(next);
	};

	return (
		<Group
			x={layer.x}
			y={layer.y}
			rotation={layer.rotation}
			scaleX={layer.scaleX}
			scaleY={layer.scaleY}
		>
			{/* Dimmed full image */}
			<KImage image={image} {...full} opacity={0.35} listening={false} />
			{/* Bright cropped region */}
			<Group
				clipX={rect.x}
				clipY={rect.y}
				clipWidth={rect.width}
				clipHeight={rect.height}
				listening={false}
			>
				<KImage image={image} {...full} />
			</Group>
			<CropGrid rect={rect} zoom={zoom} />
			<Rect
				ref={rectRef}
				x={rect.x}
				y={rect.y}
				width={rect.width}
				height={rect.height}
				draggable
				fill="rgba(0,0,0,0.001)"
				stroke={ACCENT}
				strokeWidth={2 / zoom}
				onDragMove={syncFromNode}
				onTransform={syncFromNode}
				onTransformEnd={syncFromNode}
				dragBoundFunc={undefined}
			/>
			<Transformer
				ref={trRef}
				rotateEnabled={false}
				keepRatio={ratio !== null}
				enabledAnchors={
					ratio !== null
						? ["top-left", "top-right", "bottom-left", "bottom-right"]
						: undefined
				}
				flipEnabled={false}
				anchorSize={12}
				anchorCornerRadius={2}
				anchorStroke={ACCENT}
				anchorFill="#ffffff"
				borderEnabled={false}
				ignoreStroke
				boundBoxFunc={(oldBox, newBox) =>
					newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
				}
			/>
		</Group>
	);
}

function CropGrid({ rect, zoom }: { rect: CropRect; zoom: number }) {
	const lines = [1 / 3, 2 / 3];
	return (
		<Group listening={false}>
			{lines.map((t) => (
				<Rect
					key={`v${t}`}
					x={rect.x + rect.width * t}
					y={rect.y}
					width={1 / zoom}
					height={rect.height}
					fill="rgba(255,255,255,0.6)"
				/>
			))}
			{lines.map((t) => (
				<Rect
					key={`h${t}`}
					x={rect.x}
					y={rect.y + rect.height * t}
					width={rect.width}
					height={1 / zoom}
					fill="rgba(255,255,255,0.6)"
				/>
			))}
		</Group>
	);
}

function clampRect(
	rect: CropRect,
	bounds: { x: number; y: number; width: number; height: number },
): CropRect {
	const width = Math.min(rect.width, bounds.width);
	const height = Math.min(rect.height, bounds.height);
	const x = Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - width);
	const y = Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - height);
	return { x, y, width, height };
}
