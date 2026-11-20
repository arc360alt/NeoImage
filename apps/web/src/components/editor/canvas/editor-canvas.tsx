"use client";

import Konva from "konva";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer as KLayer, Line, Rect, Stage, Transformer, Circle, Ellipse, Text as KText } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useShallow } from "zustand/react/shallow";
import { getEditor, useEditorStore } from "@/editor/store";
import { setStage } from "@/editor/stage";
import { fillToKonva } from "@/editor/fill";
import { onFontLoaded } from "@/editor/fonts";
import { snapNode, type Guide } from "@/editor/snapping";
import { getOrCreateDrawingLayer } from "@/editor/actions";
import { useCropStore } from "@/editor/crop-store";
import type { DrawingLayer, FrameLayer, Layer, TextLayer } from "@/editor/types";
import {
	childrenOf,
	containsRect,
	contentBounds,
	frameRect,
	layerBounds,
	nextFrameName,
} from "@/editor/freeform";
import {
	createFrameLayer,
	createShapeLayer,
	createTextLayer,
	solid,
} from "@/editor/defaults";
import { FrameNode, LayerNode, type LayerNodeHandlers } from "./layer-nodes";
import { CropOverlay } from "./crop-overlay";
import { TextEditorOverlay } from "./text-editor-overlay";

Konva.dragButtons = [0];

const ACCENT = "#0ea5e9";
const FIT_PADDING = 64;

type Marquee = { x1: number; y1: number; x2: number; y2: number };
type Creation = Marquee & { shift: boolean };

const CREATION_TOOLS = new Set(["frame", "rect", "ellipse", "line", "text"]);

export default function EditorCanvas({
	onContextMenuLayer,
}: {
	onContextMenuLayer?: (layerId: string | null) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<Konva.Stage>(null);
	const contentRef = useRef<Konva.Group>(null);
	const trRef = useRef<Konva.Transformer>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
	const [guides, setGuides] = useState<Guide[]>([]);
	const [hovered, setHovered] = useState<Layer | null>(null);
	const [marquee, setMarquee] = useState<Marquee | null>(null);
	const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
	const [isSpaceDown, setIsSpaceDown] = useState(false);
	const [livePoints, setLivePoints] = useState<number[] | null>(null);
	const [fontTick, setFontTick] = useState(0);
	const [creation, setCreation] = useState<Creation | null>(null);
	// While dragging a layer, frames stop clipping so it doesn't vanish at the edge.
	const [suspendClip, setSuspendClip] = useState(false);

	const canvas = useEditorStore((s) => s.doc?.canvas);
	const layers = useEditorStore((s) => s.doc?.layers ?? EMPTY_LAYERS);
	const selectedIds = useEditorStore(useShallow((s) => s.selectedIds));
	const tool = useEditorStore((s) => s.tool);
	const brush = useEditorStore(useShallow((s) => s.brush));
	const zoom = useEditorStore((s) => s.zoom);
	const fitRequest = useEditorStore((s) => s.fitRequest);
	const cropLayerId = useEditorStore((s) => s.cropLayerId);
	const editingTextId = useEditorStore((s) => s.editingTextId);
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	const fitTarget = useEditorStore((s) => s.fitTarget);

	const dragState = useRef<{
		startPositions: Map<string, { x: number; y: number }>;
		primary: { x: number; y: number };
	} | null>(null);
	const isDrawing = useRef(false);
	const drawingLayerId = useRef<string | null>(null);
	const drawingPoints = useRef<number[]>([]);
	const prevZoom = useRef(zoom);

	const isPanning = tool === "hand" || isSpaceDown;
	const isBrushTool = tool === "brush" || tool === "eraser";
	const interactive = tool === "select" && !isSpaceDown;
	const isCreationTool =
		CREATION_TOOLS.has(tool) && (freeform || (tool !== "text" && tool !== "frame"));

	// Register stage for export / thumbnails. The Stage only mounts once the
	// container has been measured, so use a callback ref rather than an effect.
	const registerStage = useCallback((node: Konva.Stage | null) => {
		stageRef.current = node;
		setStage(node);
	}, []);

	// Redraw text when web fonts finish loading.
	useEffect(() => onFontLoaded(() => setFontTick((t) => t + 1)), []);
	useEffect(() => {
		trRef.current?.forceUpdate();
		stageRef.current?.batchDraw();
	}, [fontTick]);

	// Track container size.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
		const observer = new ResizeObserver(update);
		observer.observe(el);
		update();
		return () => observer.disconnect();
	}, []);

	// Fit artboard into view.
	const fit = useCallback(() => {
		if (!canvas || size.width === 0 || size.height === 0) return;
		const doc = getEditor().doc;
		// FreeForm fits the content (or a requested rect); default fits the artboard.
		const target =
			fitTarget ??
			(freeform
				? doc && contentBounds(doc.layers)
				: { x: 0, y: 0, width: canvas.width, height: canvas.height });
		if (!target) {
			prevZoom.current = 1;
			getEditor().setZoom(1);
			setStagePos({ x: size.width / 2, y: size.height / 2 });
			return;
		}
		const nextZoom = Math.min(
			(size.width - FIT_PADDING * 2) / Math.max(target.width, 1),
			(size.height - FIT_PADDING * 2) / Math.max(target.height, 1),
		);
		const z = Math.max(0.02, Math.min(nextZoom, freeform ? 2 : 4));
		prevZoom.current = z;
		getEditor().setZoom(z);
		setStagePos({
			x: (size.width - target.width * z) / 2 - target.x * z,
			y: (size.height - target.height * z) / 2 - target.y * z,
		});
	}, [canvas?.width, canvas?.height, size.width, size.height, freeform, fitTarget]);

	const hasFitted = useRef(false);
	useEffect(() => {
		if (size.width === 0) return;
		if (!hasFitted.current) {
			hasFitted.current = true;
			fit();
		}
	}, [size.width, fit]);
	useEffect(() => {
		if (hasFitted.current) fit();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fitRequest]);

	// Zoom changes from toolbar keep the viewport center fixed.
	useEffect(() => {
		const old = prevZoom.current;
		if (old === zoom) return;
		prevZoom.current = zoom;
		const cx = size.width / 2;
		const cy = size.height / 2;
		setStagePos((pos) => ({
			x: cx - ((cx - pos.x) / old) * zoom,
			y: cy - ((cy - pos.y) / old) * zoom,
		}));
	}, [zoom, size.width, size.height]);

	// Space bar = temporary hand tool.
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.code !== "Space" || e.repeat) return;
			const target = e.target as HTMLElement | null;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
			e.preventDefault();
			setIsSpaceDown(true);
		};
		const up = (e: KeyboardEvent) => {
			if (e.code === "Space") setIsSpaceDown(false);
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, []);

	// Attach transformer to selected nodes.
	const selectableIds = useMemo(
		() =>
			selectedIds.filter((id) => {
				const layer = layers.find((l) => l.id === id);
				return layer && layer.visible && !layer.locked && id !== cropLayerId && id !== editingTextId;
			}),
		[selectedIds, layers, cropLayerId, editingTextId],
	);
	useEffect(() => {
		const tr = trRef.current;
		const stage = stageRef.current;
		if (!tr || !stage) return;
		const nodes = selectableIds
			.map((id) => stage.findOne(`#${id}`))
			.filter((n): n is Konva.Node => !!n);
		tr.nodes(tool === "select" ? nodes : []);
		tr.getLayer()?.batchDraw();
	}, [selectableIds, layers, tool]);

	const singleSelected =
		selectableIds.length === 1 ? layers.find((l) => l.id === selectableIds[0]) : undefined;
	const isLineSelected =
		singleSelected?.type === "shape" &&
		(singleSelected.shape === "line" || singleSelected.shape === "arrow");
	const isTextSelected = singleSelected?.type === "text";
	const hasFrameSelected = selectableIds.some(
		(id) => layers.find((l) => l.id === id)?.type === "frame",
	);

	// Convert a stage pointer to artboard coordinates.
	const toArtboard = useCallback(
		(p: { x: number; y: number }) => ({
			x: (p.x - stagePos.x) / zoom,
			y: (p.y - stagePos.y) / zoom,
		}),
		[stagePos.x, stagePos.y, zoom],
	);

	const handlers: LayerNodeHandlers = useMemo(
		() => ({
			onSelect: (e, layer) => {
				if (getEditor().tool !== "select") return;
				const editor = getEditor();
				const evt = e.evt as MouseEvent;
				if (evt.button === 2) {
					if (!editor.selectedIds.includes(layer.id)) editor.select([layer.id]);
					return;
				}
				if (evt.shiftKey || evt.metaKey || evt.ctrlKey) {
					editor.toggleSelect(layer.id);
				} else if (!editor.selectedIds.includes(layer.id)) {
					editor.select([layer.id]);
				}
				e.cancelBubble = true;
			},
			onDragStart: (e, layer) => {
				const editor = getEditor();
				const stage = stageRef.current;
				if (!stage) return;
				const ids = editor.selectedIds.includes(layer.id) ? editor.selectedIds : [layer.id];
				if (!editor.selectedIds.includes(layer.id)) editor.select([layer.id]);
				const startPositions = new Map<string, { x: number; y: number }>();
				const doc = editor.doc;
				// Moving a frame moves everything inside it.
				const moving = new Set(ids);
				for (const id of ids) {
					for (const child of doc ? childrenOf(doc.layers, id) : []) moving.add(child.id);
				}
				for (const id of moving) {
					const node = stage.findOne(`#${id}`);
					if (node && id !== layer.id) startPositions.set(id, node.position());
				}
				dragState.current = { startPositions, primary: e.target.position() };
				if (doc?.mode === "freeform" && layer.type !== "frame") setSuspendClip(true);
			},
			onDragMove: (e, layer) => {
				const stage = stageRef.current;
				const content = contentRef.current;
				const doc = getEditor().doc;
				if (!stage || !content || !doc) return;
				const node = e.target;
				const state = dragState.current;
				const movingIds = new Set([layer.id, ...(state?.startPositions.keys() ?? [])]);
				if (!(e.evt as MouseEvent).altKey) {
					const others = doc.layers
						.filter((l) => l.visible && !movingIds.has(l.id))
						.map((l) => stage.findOne(`#${l.id}`))
						.filter((n): n is Konva.Node => !!n);
					const nextGuides = snapNode({
						node,
						parent: content,
						others,
						artboard: doc.mode === "freeform" ? undefined : doc.canvas,
						threshold: 6 / stage.scaleX(),
					});
					setGuides(nextGuides);
				}
				if (state) {
					const dx = node.x() - state.primary.x;
					const dy = node.y() - state.primary.y;
					for (const [id, start] of state.startPositions) {
						stage.findOne(`#${id}`)?.position({ x: start.x + dx, y: start.y + dy });
					}
				}
			},
			onDragEnd: (e, layer) => {
				const stage = stageRef.current;
				setGuides([]);
				const state = dragState.current;
				dragState.current = null;
				const patches = [{ id: layer.id, patch: { x: e.target.x(), y: e.target.y() } }];
				if (state && stage) {
					for (const id of state.startPositions.keys()) {
						const node = stage.findOne(`#${id}`);
						if (node) patches.push({ id, patch: { x: node.x(), y: node.y() } });
					}
				}
				getEditor().updateLayers(patches);
				setSuspendClip(false);
				// FreeForm: dropping a layer into (or out of) a frame reparents it.
				getEditor().reparentLayers(patches.map((p) => p.id));
			},
			onDoubleClick: (_e, layer) => {
				if (layer.type === "text" && !layer.locked) {
					getEditor().select([layer.id]);
					getEditor().setEditingTextId(layer.id);
				}
				if (layer.type === "image" && !layer.locked) {
					getEditor().select([layer.id]);
					getEditor().setCropLayerId(layer.id);
				}
			},
			onHover: (layer) => setHovered(layer),
		}),
		[],
	);

	// --- Transform end: bake scale into width/height/fontSize ---
	const handleTransform = () => {
		const tr = trRef.current;
		if (!tr) return;
		const anchor = tr.getActiveAnchor();
		for (const node of tr.nodes()) {
			const layer = getEditor().doc?.layers.find((l) => l.id === node.id());
			if (layer?.type === "text" && anchor && (anchor.includes("middle") && !anchor.includes("rotater"))) {
				// Side handles reflow text instead of stretching it.
				const sx = node.scaleX();
				node.setAttrs({ width: Math.max(20, node.width() * Math.abs(sx)), scaleX: Math.sign(sx) || 1 });
			}
		}
	};

	const handleTransformEnd = () => {
		const tr = trRef.current;
		if (!tr) return;
		const doc = getEditor().doc;
		if (!doc) return;
		const patches: { id: string; patch: Partial<Layer> }[] = [];
		for (const node of tr.nodes()) {
			const layer = doc.layers.find((l) => l.id === node.id());
			if (!layer) continue;
			const sx = node.scaleX();
			const sy = node.scaleY();
			const ax = Math.abs(sx);
			const ay = Math.abs(sy);
			const signX = Math.sign(sx) || 1;
			const signY = Math.sign(sy) || 1;
			const base = {
				x: node.x(),
				y: node.y(),
				rotation: node.rotation(),
				scaleX: signX,
				scaleY: signY,
			};
			node.scale({ x: signX, y: signY });
			if (layer.type === "text") {
				const uniform = ay;
				const scaledFont = Math.abs(uniform - 1) > 0.001;
				patches.push({
					id: layer.id,
					patch: {
						...base,
						width: Math.max(20, node.width() * (scaledFont ? ax : 1)),
						fontSize: scaledFont ? Math.max(4, layer.fontSize * uniform) : layer.fontSize,
						letterSpacing: scaledFont ? layer.letterSpacing * uniform : layer.letterSpacing,
						stroke: scaledFont
							? { ...layer.stroke, width: layer.stroke.width * uniform }
							: layer.stroke,
					} as Partial<TextLayer>,
				});
				continue;
			}
			if (layer.type === "drawing") {
				patches.push({
					id: layer.id,
					patch: {
						...base,
						width: layer.width * ax,
						height: layer.height * ay,
						strokes: layer.strokes.map((s) => ({
							...s,
							size: s.size * Math.sqrt(ax * ay),
							points: s.points.map((v, i) => (i % 2 === 0 ? v * ax : v * ay)),
						})),
					} as Partial<DrawingLayer>,
				});
				continue;
			}
			const isLine = layer.type === "shape" && (layer.shape === "line" || layer.shape === "arrow");
			patches.push({
				id: layer.id,
				patch: {
					...base,
					width: Math.max(1, layer.width * ax),
					height: isLine ? 0 : Math.max(1, layer.height * ay),
				},
			});
		}
		getEditor().updateLayers(patches);
	};

	// --- Stage pointer handling: deselect, marquee, brush ---
	const handleStageMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
		const stage = stageRef.current;
		if (!stage) return;
		const evt = e.evt as MouseEvent;
		if (evt.button === 1) return;
		const pos = stage.getPointerPosition();
		if (!pos) return;

		if (isPanning) return;

		if (isBrushTool) {
			const layerId = getOrCreateDrawingLayer();
			if (!layerId) return;
			drawingLayerId.current = layerId;
			isDrawing.current = true;
			const point = toDrawingLocal(layerId, pos);
			drawingPoints.current = [point.x, point.y, point.x + 0.01, point.y + 0.01];
			setLivePoints(drawingPoints.current);
			return;
		}

		if (isCreationTool) {
			const p = toArtboard(pos);
			setCreation({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, shift: evt.shiftKey });
			return;
		}

		if (tool !== "select") return;
		const clickedEmpty =
			e.target === stage || e.target.hasName("artboard-background") || e.target.hasName("backdrop");
		void freeform;
		if (clickedEmpty && evt.button !== 2) {
			if (!evt.shiftKey) getEditor().clearSelection();
			const p = toArtboard(pos);
			setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
		}
	};

	const toDrawingLocal = (layerId: string, pos: { x: number; y: number }) => {
		const node = stageRef.current?.findOne(`#${layerId}`);
		if (!node) return toArtboard(pos);
		return node.getAbsoluteTransform().copy().invert().point(pos);
	};

	const handleStageMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
		const stage = stageRef.current;
		if (!stage) return;
		const pos = stage.getPointerPosition();
		if (!pos) return;
		if (creation) {
			const p = toArtboard(pos);
			const shift = (e.evt as MouseEvent).shiftKey ?? false;
			setCreation((c) => (c ? { ...c, x2: p.x, y2: p.y, shift } : c));
			return;
		}
		if (isBrushTool) setPointer(toArtboard(pos));
		if (isDrawing.current && drawingLayerId.current) {
			const point = toDrawingLocal(drawingLayerId.current, pos);
			drawingPoints.current = [...drawingPoints.current, point.x, point.y];
			setLivePoints(drawingPoints.current);
			return;
		}
		if (marquee) {
			const p = toArtboard(pos);
			setMarquee((m) => (m ? { ...m, x2: p.x, y2: p.y } : m));
		}
	};

	const finishCreation = (c: Creation) => {
		const editor = getEditor();
		const doc = editor.doc;
		if (!doc) return;
		const dragged = Math.abs(c.x2 - c.x1) * zoom > 4 || Math.abs(c.y2 - c.y1) * zoom > 4;
		let { x, y, width, height } = creationRect(c);
		const shapeFill = solid(doc.mode === "freeform" ? "#d9d9d9" : "#3b82f6");

		if (tool === "line") {
			const strokeWidth = 4;
			const dx = dragged ? c.x2 - c.x1 : 200;
			const dy = dragged ? c.y2 - c.y1 : 0;
			const angle = Math.atan2(dy, dx);
			const line = createShapeLayer("line", {
				width: Math.max(1, Math.hypot(dx, dy)),
				height: 0,
				rotation: (angle * 180) / Math.PI,
				stroke: { enabled: true, color: "#111111", width: strokeWidth },
				// The line is drawn through the middle of a strokeWidth-tall box.
				x: c.x1 + Math.sin(angle) * (strokeWidth / 2),
				y: c.y1 - Math.cos(angle) * (strokeWidth / 2),
			});
			editor.addLayers([line]);
			return;
		}

		if (tool === "text") {
			const text = createTextLayer({
				text: "Text",
				name: "Text",
				x,
				y,
				width: dragged ? Math.max(40, width) : 320,
				fontSize: 48,
				align: "left",
				fill: solid("#111111"),
			});
			editor.addLayers([text]);
			editor.setEditingTextId(text.id);
			return;
		}

		if (!dragged) {
			// A click creates a default-sized item at the pointer.
			width = tool === "frame" ? 400 : 100;
			height = tool === "frame" ? 300 : 100;
			x = c.x1;
			y = c.y1;
		}

		if (tool === "frame") {
			const frame = createFrameLayer({
				name: nextFrameName(doc.layers),
				x: Math.round(x),
				y: Math.round(y),
				width: Math.round(width),
				height: Math.round(height),
			});
			// Drawing a frame around loose layers puts them inside it, like Figma.
			const adopt = doc.layers
				.filter((l) => !l.parentId && l.type !== "frame" && l.visible)
				.filter((l) => containsRect(frameRect(frame), layerBounds(l)))
				.map((l) => l.id);
			editor.addLayers([frame]);
			editor.reparentLayers(adopt);
			return;
		}

		const shape = createShapeLayer(tool === "ellipse" ? "ellipse" : "rect", {
			x,
			y,
			width: Math.max(1, width),
			height: Math.max(1, height),
			fill: shapeFill,
			name: tool === "ellipse" ? "Ellipse" : "Rectangle",
		});
		editor.addLayers([shape]);
	};

	const handleStageMouseUp = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
		if (creation) {
			const c = creation;
			setCreation(null);
			finishCreation(c);
			return;
		}
		if (isDrawing.current && drawingLayerId.current) {
			const layerId = drawingLayerId.current;
			isDrawing.current = false;
			drawingLayerId.current = null;
			const points = drawingPoints.current;
			drawingPoints.current = [];
			setLivePoints(null);
			const layer = getEditor().doc?.layers.find((l) => l.id === layerId);
			if (layer?.type === "drawing" && points.length >= 4) {
				const { brush } = getEditor();
				const node = stageRef.current?.findOne(`#${layerId}`);
				const scale = node ? node.getAbsoluteScale().x / zoom : 1;
				getEditor().updateLayer(layerId, {
					strokes: [
						...layer.strokes,
						{
							id: nanoid(8),
							points,
							color: brush.color,
							size: brush.size / Math.abs(scale || 1),
							opacity: brush.opacity,
							mode: getEditor().tool === "eraser" ? "eraser" : brush.mode === "eraser" ? "brush" : brush.mode,
						},
					],
				} as Partial<DrawingLayer>);
			}
			return;
		}
		if (marquee) {
			const stage = stageRef.current;
			const content = contentRef.current;
			const box = normalize(marquee);
			setMarquee(null);
			if (!stage || !content || (box.width < 3 / zoom && box.height < 3 / zoom)) return;
			const doc = getEditor().doc;
			if (!doc) return;
			const intersecting = doc.layers
				.filter((l) => l.visible && !l.locked)
				.filter((l) => {
					const node = stage.findOne(`#${l.id}`);
					if (!node) return false;
					return Konva.Util.haveIntersection(box, node.getClientRect({ relativeTo: content }));
				});
			// If a frame is selected, don't also select the layers inside it.
			const hitIds = new Set(intersecting.map((l) => l.id));
			const hits = intersecting
				.filter((l) => !(l.parentId && hitIds.has(l.parentId)))
				.map((l) => l.id);
			const evt = e.evt as MouseEvent;
			const editor = getEditor();
			editor.select(evt.shiftKey ? Array.from(new Set([...editor.selectedIds, ...hits])) : hits);
		}
	};

	const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
		e.evt.preventDefault();
		const stage = stageRef.current;
		if (!stage) return;
		if (e.evt.ctrlKey || e.evt.metaKey) {
			const pointerPos = stage.getPointerPosition();
			if (!pointerPos) return;
			const factor = Math.exp(-e.evt.deltaY * 0.0025);
			const nextZoom = Math.max(0.02, Math.min(32, zoom * factor));
			const anchor = toArtboard(pointerPos);
			prevZoom.current = nextZoom;
			getEditor().setZoom(nextZoom);
			setStagePos({
				x: pointerPos.x - anchor.x * nextZoom,
				y: pointerPos.y - anchor.y * nextZoom,
			});
			return;
		}
		const dx = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
		const dy = e.evt.shiftKey ? 0 : e.evt.deltaY;
		setStagePos((p) => ({ x: p.x - dx, y: p.y - dy }));
	};

	// Middle mouse button pans as well.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		let last: { x: number; y: number } | null = null;
		const down = (e: PointerEvent) => {
			if (e.button !== 1) return;
			e.preventDefault();
			last = { x: e.clientX, y: e.clientY };
			el.setPointerCapture(e.pointerId);
		};
		const move = (e: PointerEvent) => {
			if (!last) return;
			const dx = e.clientX - last.x;
			const dy = e.clientY - last.y;
			last = { x: e.clientX, y: e.clientY };
			setStagePos((p) => ({ x: p.x + dx, y: p.y + dy }));
		};
		const up = () => {
			last = null;
		};
		el.addEventListener("pointerdown", down);
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
		return () => {
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
		};
	}, []);

	const cacheRatio = useMemo(() => {
		const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
		// Bucket the zoom so we don't re-cache filters on every wheel tick.
		const bucket = 2 ** Math.ceil(Math.log2(Math.max(zoom * dpr, 0.125)));
		return Math.min(4, Math.max(0.25, bucket));
	}, [zoom]);

	if (!canvas) return <div ref={containerRef} className="size-full" />;

	const cropLayer = cropLayerId ? layers.find((l) => l.id === cropLayerId) : undefined;
	const editingLayer = editingTextId ? layers.find((l) => l.id === editingTextId) : undefined;
	const cursor = isPanning
		? "grab"
		: isBrushTool
			? "none"
			: isCreationTool
				? tool === "text"
					? "text"
					: "crosshair"
				: "default";

	return (
		<div
			ref={containerRef}
			className="relative size-full overflow-hidden"
			style={{ cursor }}
			onContextMenu={(e) => {
				const stage = stageRef.current;
				if (!stage) return;
				stage.setPointersPositions(e.nativeEvent);
				const pos = stage.getPointerPosition();
				const hit = pos ? stage.getIntersection(pos) : null;
				let node: Konva.Node | null = hit;
				while (node && !node.hasName("layer")) node = node.getParent();
				const id = node?.id() ?? null;
				if (id && !getEditor().selectedIds.includes(id)) getEditor().select([id]);
				onContextMenuLayer?.(id);
			}}
			onMouseLeave={() => setPointer(null)}
		>
			{size.width > 0 && (
				<Stage
					ref={registerStage}
					width={size.width}
					height={size.height}
					x={stagePos.x}
					y={stagePos.y}
					scaleX={zoom}
					scaleY={zoom}
					draggable={isPanning}
					onDragEnd={(e) => {
						if (e.target === stageRef.current) setStagePos(e.target.position());
					}}
					onMouseDown={handleStageMouseDown}
					onTouchStart={handleStageMouseDown}
					onMouseMove={handleStageMouseMove}
					onTouchMove={handleStageMouseMove}
					onMouseUp={handleStageMouseUp}
					onTouchEnd={handleStageMouseUp}
					onWheel={handleWheel}
				>
					{!freeform && (
						<KLayer name="backdrop" listening={false}>
							<Rect
								width={canvas.width}
								height={canvas.height}
								fill="#ffffff"
								shadowColor="#000000"
								shadowBlur={24 / zoom}
								shadowOpacity={0.25}
								shadowOffsetY={4 / zoom}
							/>
							<Checkerboard width={canvas.width} height={canvas.height} zoom={zoom} />
						</KLayer>
					)}
					<KLayer name="content">
						{!freeform && (
							<Rect
								name="artboard-background"
								width={canvas.width}
								height={canvas.height}
								{...fillToKonva(canvas.background, canvas.width, canvas.height)}
							/>
						)}
						<Group
							ref={contentRef}
							name="content-group"
							{...(freeform
								? {}
								: { clipX: 0, clipY: 0, clipWidth: canvas.width, clipHeight: canvas.height })}
						>
							{freeform ? (
								<FreeformContent
									layers={layers}
									interactive={interactive}
									hiddenIds={[cropLayerId, editingTextId]}
									cacheRatio={cacheRatio}
									handlers={handlers}
									suspendClip={suspendClip}
								/>
							) : (
								layers.map((layer) => (
									<LayerNode
										key={layer.id}
										layer={layer}
										interactive={interactive}
										hidden={layer.id === cropLayerId || layer.id === editingTextId}
										cacheRatio={cacheRatio}
										handlers={handlers}
									/>
								))
							)}
						</Group>
					</KLayer>
					<KLayer name="ui">
						{freeform && (
							<FrameLabels
								layers={layers}
								selectedIds={selectedIds}
								zoom={zoom}
								interactive={interactive}
								stage={stageRef.current}
							/>
						)}
						{creation && <CreationPreview creation={creation} tool={tool} zoom={zoom} />}
						{hovered && tool === "select" && !selectedIds.includes(hovered.id) && (
							<HoverOutline layerId={hovered.id} stage={stageRef.current} zoom={zoom} />
						)}
						{guides.map((guide) => (
							<Line
								key={`${guide.orientation}-${guide.position}`}
								points={
									guide.orientation === "V"
										? [guide.position, -10000, guide.position, 10000]
										: [-10000, guide.position, 10000, guide.position]
								}
								stroke="#ec4899"
								strokeWidth={1 / zoom}
								dash={[4 / zoom, 4 / zoom]}
								listening={false}
							/>
						))}
						{cropLayer?.type === "image" && <CropOverlay layer={cropLayer} zoom={zoom} />}
						<Transformer
							ref={trRef}
							visible={tool === "select"}
							rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
							rotationSnapTolerance={4}
							anchorSize={10}
							anchorCornerRadius={5}
							anchorStroke={ACCENT}
							anchorFill="#ffffff"
							anchorStrokeWidth={1.5}
							borderStroke={ACCENT}
							borderStrokeWidth={1.5}
							rotateAnchorOffset={28}
							rotateEnabled={!hasFrameSelected}
							keepRatio={!isLineSelected && !hasFrameSelected}
							enabledAnchors={
								isLineSelected
									? ["middle-left", "middle-right"]
									: isTextSelected
										? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
										: undefined
							}
							ignoreStroke
							flipEnabled={false}
							shouldOverdrawWholeArea={false}
							onTransform={handleTransform}
							onTransformEnd={handleTransformEnd}
							boundBoxFunc={(oldBox, newBox) =>
								Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < (isLineSelected ? 0 : 4)
									? oldBox
									: newBox
							}
						/>
						{marquee && (
							<Rect
								{...normalize(marquee)}
								fill="rgba(14,165,233,0.08)"
								stroke={ACCENT}
								strokeWidth={1 / zoom}
								listening={false}
							/>
						)}
						{livePoints && (
							<Line
								points={livePointsToArtboard(livePoints, drawingLayerNode(stageRef.current))}
								stroke={tool === "eraser" ? "rgba(236,72,153,0.5)" : brush.color}
								strokeWidth={brush.size}
								opacity={tool === "eraser" ? 1 : brush.mode === "highlighter" ? 0.4 : brush.opacity}
								lineCap={brush.mode === "highlighter" ? "square" : "round"}
								lineJoin="round"
								tension={0.4}
								listening={false}
							/>
						)}
						{isBrushTool && pointer && (
							<Circle
								x={pointer.x}
								y={pointer.y}
								radius={brush.size / 2}
								stroke={tool === "eraser" ? "#ec4899" : "#ffffff"}
								strokeWidth={1.5 / zoom}
								shadowColor="#000000"
								shadowBlur={2 / zoom}
								shadowOpacity={0.8}
								listening={false}
							/>
						)}
					</KLayer>
				</Stage>
			)}
			{editingLayer?.type === "text" && (
				<TextEditorOverlay
					layer={editingLayer}
					stage={stageRef.current}
					zoom={zoom}
					stagePos={stagePos}
				/>
			)}
		</div>
	);
}

const EMPTY_LAYERS: Layer[] = [];

function creationRect(c: Creation) {
	let width = Math.abs(c.x2 - c.x1);
	let height = Math.abs(c.y2 - c.y1);
	if (c.shift) width = height = Math.max(width, height);
	const x = c.x2 < c.x1 ? c.x1 - width : c.x1;
	const y = c.y2 < c.y1 ? c.y1 - height : c.y1;
	return { x, y, width, height };
}

function CreationPreview({
	creation,
	tool,
	zoom,
}: {
	creation: Creation;
	tool: string;
	zoom: number;
}) {
	const r = creationRect(creation);
	const common = { stroke: ACCENT, strokeWidth: 1.5 / zoom, listening: false };
	if (tool === "line") {
		return <Line points={[creation.x1, creation.y1, creation.x2, creation.y2]} {...common} />;
	}
	if (tool === "ellipse") {
		return (
			<Ellipse
				x={r.x + r.width / 2}
				y={r.y + r.height / 2}
				radiusX={r.width / 2}
				radiusY={r.height / 2}
				fill="rgba(14,165,233,0.08)"
				{...common}
			/>
		);
	}
	return (
		<Group listening={false}>
			<Rect {...r} fill={tool === "frame" ? "rgba(255,255,255,0.6)" : "rgba(14,165,233,0.08)"} {...common} />
			{r.width * zoom > 40 && (
				<KText
					x={r.x + r.width / 2 - 40 / zoom}
					y={r.y + r.height + 6 / zoom}
					width={80 / zoom}
					align="center"
					text={`${Math.round(r.width)} × ${Math.round(r.height)}`}
					fontSize={11 / zoom}
					fill="#ffffff"
					padding={3 / zoom}
				/>
			)}
		</Group>
	);
}

/** Renders FreeForm content: top-level layers, with frames wrapping their children. */
function FreeformContent({
	layers,
	interactive,
	hiddenIds,
	cacheRatio,
	handlers,
	suspendClip,
}: {
	layers: Layer[];
	interactive: boolean;
	hiddenIds: (string | null)[];
	cacheRatio: number;
	handlers: LayerNodeHandlers;
	suspendClip: boolean;
}) {
	const frameIds = new Set(layers.filter((l) => l.type === "frame").map((l) => l.id));
	const node = (layer: Layer) => (
		<LayerNode
			key={layer.id}
			layer={layer}
			interactive={interactive}
			hidden={hiddenIds.includes(layer.id)}
			cacheRatio={cacheRatio}
			handlers={handlers}
		/>
	);
	return (
		<>
			{layers
				.filter((l) => !l.parentId || !frameIds.has(l.parentId))
				.map((layer) =>
					layer.type === "frame" ? (
						<FrameNode
							key={layer.id}
							layer={layer}
							interactive={interactive}
							hidden={false}
							cacheRatio={cacheRatio}
							handlers={handlers}
							suspendClip={suspendClip}
						>
							{layers.filter((l) => l.parentId === layer.id).map(node)}
						</FrameNode>
					) : (
						node(layer)
					),
				)}
		</>
	);
}

/** Frame names above each frame, like Figma. Click to select, drag to move. */
function FrameLabels({
	layers,
	selectedIds,
	zoom,
	interactive,
	stage,
}: {
	layers: Layer[];
	selectedIds: string[];
	zoom: number;
	interactive: boolean;
	stage: Konva.Stage | null;
}) {
	const frames = layers.filter((l): l is FrameLayer => l.type === "frame" && l.visible);
	const fontSize = 11 / zoom;
	return (
		<>
			{frames.map((frame) => {
				const isSelected = selectedIds.includes(frame.id);
				return (
					<KText
						key={frame.id}
						x={frame.x}
						y={frame.y - fontSize - 5 / zoom}
						text={frame.name}
						fontSize={fontSize}
						fontStyle={isSelected ? "bold" : "normal"}
						fill={isSelected ? ACCENT : "#8a8a8a"}
						listening={interactive}
						width={Math.max(frame.width, 1)}
						wrap="none"
						ellipsis
						onMouseDown={(e) => {
							e.cancelBubble = true;
							const editor = getEditor();
							if (e.evt.shiftKey) editor.toggleSelect(frame.id);
							else if (!editor.selectedIds.includes(frame.id)) editor.select([frame.id]);
							if (!frame.locked) stage?.findOne(`#${frame.id}`)?.startDrag();
						}}
						onDblClick={() => {
							const name = window.prompt("Rename frame", frame.name);
							if (name?.trim()) getEditor().updateLayer(frame.id, { name: name.trim() });
						}}
					/>
				);
			})}
		</>
	);
}

function normalize(m: Marquee) {
	return {
		x: Math.min(m.x1, m.x2),
		y: Math.min(m.y1, m.y2),
		width: Math.abs(m.x2 - m.x1),
		height: Math.abs(m.y2 - m.y1),
	};
}

function drawingLayerNode(stage: Konva.Stage | null) {
	const editor = getEditor();
	const id = editor.selectedIds.find((sid) =>
		editor.doc?.layers.some((l) => l.id === sid && l.type === "drawing"),
	);
	return id && stage ? stage.findOne(`#${id}`) : undefined;
}

/** Live stroke points are in drawing-layer space; map to artboard space for the UI layer. */
function livePointsToArtboard(points: number[], node: Konva.Node | undefined) {
	if (!node) return points;
	const transform = node.getTransform();
	const out: number[] = [];
	for (let i = 0; i < points.length; i += 2) {
		const p = transform.point({ x: points[i], y: points[i + 1] });
		out.push(p.x, p.y);
	}
	return out;
}

function HoverOutline({
	layerId,
	stage,
	zoom,
}: {
	layerId: string;
	stage: Konva.Stage | null;
	zoom: number;
}) {
	const node = stage?.findOne(`#${layerId}`);
	if (!node) return null;
	const t = node.getTransform();
	const w = node.width();
	const h = node.height();
	const corners = [
		t.point({ x: 0, y: 0 }),
		t.point({ x: w, y: 0 }),
		t.point({ x: w, y: h }),
		t.point({ x: 0, y: h }),
	];
	return (
		<Line
			points={corners.flatMap((p) => [p.x, p.y])}
			closed
			stroke={ACCENT}
			strokeWidth={1.5 / zoom}
			listening={false}
		/>
	);
}

let checkerPattern: HTMLCanvasElement | null = null;
function getCheckerPattern() {
	if (checkerPattern || typeof document === "undefined") return checkerPattern;
	const c = document.createElement("canvas");
	c.width = 16;
	c.height = 16;
	const ctx = c.getContext("2d");
	if (ctx) {
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, 16, 16);
		ctx.fillStyle = "#e5e5e5";
		ctx.fillRect(0, 0, 8, 8);
		ctx.fillRect(8, 8, 8, 8);
	}
	checkerPattern = c;
	return c;
}

function Checkerboard({
	width,
	height,
	zoom,
}: {
	width: number;
	height: number;
	zoom: number;
}) {
	const pattern = getCheckerPattern();
	if (!pattern) return null;
	return (
		<Rect
			width={width}
			height={height}
			fillPatternImage={pattern as unknown as HTMLImageElement}
			fillPatternScaleX={1 / zoom}
			fillPatternScaleY={1 / zoom}
		/>
	);
}
