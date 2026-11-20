"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Cursor01Icon,
	HandGripIcon,
	PaintBrush02Icon,
	Eraser01Icon,
	TextIcon,
	CropIcon,
	ZoomInAreaIcon,
	ZoomOutAreaIcon,
	ArrowExpand01Icon,
	Tick02Icon,
	Cancel01Icon,
	ArrowTurnBackwardIcon,
	ImageUploadIcon,
	HashtagIcon,
	SquareIcon,
	CircleIcon,
	MinusSignIcon,
	ImageAdd02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/ui";
import { getEditor, useEditorStore } from "@/editor/store";
import { addText, startCrop } from "@/editor/actions";
import { importImageBlobs, addAssetToCanvas, openImagePicker } from "@/editor/import";
import {
	applyCrop,
	CROP_ASPECTS,
	resetCrop,
	useCropStore,
} from "@/editor/crop-store";
import { loadAssetImage } from "@/storage/assets";
import { getStage } from "@/editor/stage";
import { layerBounds, unionBounds } from "@/editor/freeform";
import type { Tool } from "@/editor/types";
import { CanvasContextMenu } from "./canvas-context-menu";
import { ASSET_DRAG_MIME } from "@/components/editor/panels/assets/drag";

const EditorCanvas = dynamic(() => import("./editor-canvas"), {
	ssr: false,
	loading: () => (
		<div className="flex size-full items-center justify-center">
			<Spinner className="size-5" />
		</div>
	),
});

const TOOLS: {
	id: Tool | "text";
	label: string;
	shortcut: string;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
}[] = [
	{ id: "select", label: "Select", shortcut: "V", icon: Cursor01Icon },
	{ id: "hand", label: "Hand", shortcut: "H", icon: HandGripIcon },
	{ id: "brush", label: "Brush", shortcut: "B", icon: PaintBrush02Icon },
	{ id: "eraser", label: "Eraser", shortcut: "E", icon: Eraser01Icon },
	{ id: "text", label: "Add text", shortcut: "T", icon: TextIcon },
	{ id: "crop", label: "Crop image", shortcut: "C", icon: CropIcon },
];

/** FreeForm adds Figma-style creation tools: click or drag on the canvas. */
const FREEFORM_TOOLS: typeof TOOLS = [
	{ id: "select", label: "Move", shortcut: "V", icon: Cursor01Icon },
	{ id: "hand", label: "Hand", shortcut: "H", icon: HandGripIcon },
	{ id: "frame", label: "Frame", shortcut: "F", icon: HashtagIcon },
	{ id: "rect", label: "Rectangle", shortcut: "R", icon: SquareIcon },
	{ id: "ellipse", label: "Ellipse", shortcut: "O", icon: CircleIcon },
	{ id: "line", label: "Line", shortcut: "L", icon: MinusSignIcon },
	{ id: "text", label: "Text", shortcut: "T", icon: TextIcon },
	{ id: "brush", label: "Brush", shortcut: "B", icon: PaintBrush02Icon },
	{ id: "eraser", label: "Eraser", shortcut: "E", icon: Eraser01Icon },
	{ id: "crop", label: "Crop image", shortcut: "C", icon: CropIcon },
];

const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 4];

export function PreviewPanel() {
	const [isDragOver, setIsDragOver] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const clientToArtboard = (clientX: number, clientY: number) => {
		const stage = getStage();
		if (!stage) return undefined;
		const rect = stage.container().getBoundingClientRect();
		const pos = stage.position();
		const zoom = stage.scaleX();
		return {
			x: (clientX - rect.left - pos.x) / zoom,
			y: (clientY - rect.top - pos.y) / zoom,
		};
	};

	return (
		<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
			<PreviewToolbar />
			<div
				ref={containerRef}
				className={cn(
					"relative min-h-0 flex-1 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:18px_18px]",
				)}
				onDragOver={(e) => {
					if (
						e.dataTransfer.types.includes("Files") ||
						e.dataTransfer.types.includes(ASSET_DRAG_MIME)
					) {
						e.preventDefault();
						e.dataTransfer.dropEffect = "copy";
						setIsDragOver(true);
					}
				}}
				onDragLeave={(e) => {
					if (e.currentTarget.contains(e.relatedTarget as Node)) return;
					setIsDragOver(false);
				}}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragOver(false);
					const position = clientToArtboard(e.clientX, e.clientY);
					const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME);
					if (assetId) {
						const asset = getEditor().assets.find((a) => a.id === assetId);
						if (asset) addAssetToCanvas(asset, position);
						return;
					}
					const files = Array.from(e.dataTransfer.files);
					if (files.length > 0) {
						void importImageBlobs(files, { addToCanvas: true, position });
					}
				}}
			>
				<CanvasContextMenu>
					<EditorCanvas />
				</CanvasContextMenu>
				<CropBar />
				{isDragOver && (
					<div className="border-primary bg-primary/10 pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed">
						<div className="bg-background flex items-center gap-2 rounded-md border px-4 py-2 text-sm shadow">
							<HugeiconsIcon icon={ImageUploadIcon} className="size-4" />
							Drop to add to your design
						</div>
					</div>
				)}
			</div>
			<ZoomBar />
		</div>
	);
}

function PreviewToolbar() {
	const tool = useEditorStore((s) => s.tool);
	const brushMode = useEditorStore((s) => s.brush.mode);
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	const tools = freeform ? FREEFORM_TOOLS : TOOLS;

	const handleTool = (id: Tool | "text") => {
		const editor = getEditor();
		if (id === "text" && !freeform) {
			addText();
			return;
		}
		if (id === "crop") {
			startCrop();
			return;
		}
		if (id === "brush" && brushMode === "eraser") editor.setBrush({ mode: "brush" });
		editor.setTool(id);
	};

	return (
		<div className="bg-background flex h-11 shrink-0 items-center justify-center gap-0.5 border-b px-2">
			{tools.map((t, i) => {
				const isActive = tool === t.id;
				// Separate navigation, creation and painting groups like Figma's toolbar.
				const divider = freeform && (i === 2 || i === 7 || i === 9);
				return (
					<div key={t.id} className="flex items-center gap-0.5">
					{divider && <div className="bg-border mx-1 h-5 w-px" />}
					<Tooltip delayDuration={200}>
						<TooltipTrigger asChild>
							<Button
								variant={isActive ? "secondary" : "ghost"}
								size="icon"
								className={cn("size-8", !isActive && "text-muted-foreground")}
								aria-label={t.label}
								aria-pressed={isActive}
								onClick={() => handleTool(t.id)}
							>
								<HugeiconsIcon icon={t.icon} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t.label} <span className="text-muted-foreground ml-1">{t.shortcut}</span>
						</TooltipContent>
					</Tooltip>
					</div>
				);
			})}
			{freeform && (
				<>
					<div className="bg-border mx-1 h-5 w-px" />
					<Tooltip delayDuration={200}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="text-muted-foreground size-8"
								aria-label="Place image"
								onClick={() =>
									openImagePicker((files) => void importImageBlobs(files, { addToCanvas: true }))
								}
							>
								<HugeiconsIcon icon={ImageAdd02Icon} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							Place image <span className="text-muted-foreground ml-1">Ctrl+Shift+K</span>
						</TooltipContent>
					</Tooltip>
				</>
			)}
		</div>
	);
}

function ZoomBar() {
	const zoom = useEditorStore((s) => s.zoom);
	const canvas = useEditorStore((s) => s.doc?.canvas);
	const layerCount = useEditorStore((s) => s.doc?.layers.length ?? 0);
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	const frameCount = useEditorStore(
		(s) => s.doc?.layers.filter((l) => l.type === "frame").length ?? 0,
	);

	return (
		<div className="bg-background text-muted-foreground flex h-10 shrink-0 items-center justify-between border-t px-3 text-xs">
			<span className="tabular-nums">
				{freeform
					? `FreeForm · ${frameCount} ${frameCount === 1 ? "frame" : "frames"}`
					: canvas
						? `${canvas.width} × ${canvas.height} px`
						: ""}
				<span className="mx-2 opacity-40">·</span>
				{layerCount} {layerCount === 1 ? "layer" : "layers"}
			</span>
			<div className="flex items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={() => getEditor().setZoom(zoom / 1.25)}
					aria-label="Zoom out"
				>
					<HugeiconsIcon icon={ZoomOutAreaIcon} />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm" className="w-16 tabular-nums">
							{Math.round(zoom * 100)}%
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="center" className="w-36">
						<DropdownMenuItem onClick={() => getEditor().requestFit()}>
							{freeform ? "Zoom to fit all" : "Fit to screen"}
						</DropdownMenuItem>
						{freeform && (
							<DropdownMenuItem onClick={zoomToSelection}>Zoom to selection</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						{ZOOM_PRESETS.map((z) => (
							<DropdownMenuItem key={z} onClick={() => getEditor().setZoom(z)}>
								{z * 100}%
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={() => getEditor().setZoom(zoom * 1.25)}
					aria-label="Zoom in"
				>
					<HugeiconsIcon icon={ZoomInAreaIcon} />
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => getEditor().requestFit()}
							aria-label="Fit to screen"
						>
							<HugeiconsIcon icon={ArrowExpand01Icon} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Fit (Ctrl+0)</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

function CropBar() {
	const cropLayer = useEditorStore((s) =>
		s.cropLayerId ? s.doc?.layers.find((l) => l.id === s.cropLayerId) : undefined,
	);
	const aspect = useCropStore((s) => s.aspect);
	const setAspect = useCropStore((s) => s.setAspect);
	if (!cropLayer || cropLayer.type !== "image") return null;

	const cancel = () => {
		useCropStore.getState().setRect(null);
		getEditor().setCropLayerId(null);
	};
	const apply = async () => {
		try {
			const image = await loadAssetImage(cropLayer.assetId);
			applyCrop({ width: image.naturalWidth, height: image.naturalHeight });
		} catch {
			toast.error("Couldn't crop this image");
		}
	};

	return (
		<div className="bg-background absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-lg">
			{CROP_ASPECTS.map((a) => (
				<Button
					key={a.id}
					size="sm"
					variant={aspect === a.id ? "secondary" : "ghost"}
					onClick={() => setAspect(a.id)}
				>
					{a.label}
				</Button>
			))}
			<div className="bg-border mx-1 h-5 w-px" />
			{cropLayer.crop && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button size="icon" variant="ghost" className="size-7" onClick={resetCrop} aria-label="Reset crop">
							<HugeiconsIcon icon={ArrowTurnBackwardIcon} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Reset crop</TooltipContent>
				</Tooltip>
			)}
			<Button size="icon" variant="ghost" className="size-7" onClick={cancel} aria-label="Cancel crop">
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
			<Button size="sm" onClick={apply} className="gap-1">
				<HugeiconsIcon icon={Tick02Icon} />
				Apply
			</Button>
		</div>
	);
}

/** Fit the selected layers into view (Shift+2 in FreeForm). */
export function zoomToSelection() {
	const { doc, selectedIds, requestFit } = getEditor();
	if (!doc) return;
	const bounds = unionBounds(
		doc.layers.filter((l) => selectedIds.includes(l.id)).map(layerBounds),
	);
	if (bounds) requestFit(bounds);
}
