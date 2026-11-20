"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	CloudUploadIcon,
	Delete02Icon,
	GridViewIcon,
	LeftToRightListDashIcon,
	PlusSignIcon,
	ImageAdd02Icon,
	Image01Icon,
	BackgroundIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/ui";
import { PanelView } from "./base-panel";
import { useAssetsPanelStore } from "../assets-panel-store";
import { ASSET_DRAG_MIME } from "../drag";
import { getEditor, useEditorStore } from "@/editor/store";
import {
	addAssetToCanvas,
	importImageBlobs,
	openImagePicker,
} from "@/editor/import";
import { createImageLayer } from "@/editor/defaults";
import { getInsertionArea } from "@/editor/insertion";
import { deleteAsset, getAssetUrl } from "@/storage/assets";
import type { AssetMeta } from "@/editor/types";

export function UploadsView() {
	const assets = useEditorStore((s) => s.assets);
	const { mediaViewMode, setMediaViewMode } = useAssetsPanelStore();
	const [isImporting, setIsImporting] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);

	const handleFiles = async (files: File[]) => {
		setIsImporting(true);
		try {
			const imported = await importImageBlobs(files);
			if (imported.length > 0) {
				toast.success(
					imported.length === 1 ? "Image uploaded" : `${imported.length} images uploaded`,
				);
			}
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<PanelView
			title="Uploads"
			actions={
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								onClick={() =>
									setMediaViewMode(mediaViewMode === "grid" ? "list" : "grid")
								}
								aria-label="Toggle view"
							>
								<HugeiconsIcon
									icon={mediaViewMode === "grid" ? LeftToRightListDashIcon : GridViewIcon}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{mediaViewMode === "grid" ? "List view" : "Grid view"}
						</TooltipContent>
					</Tooltip>
					<Button
						size="sm"
						variant="outline"
						className="gap-1"
						disabled={isImporting}
						onClick={() => openImagePicker(handleFiles)}
					>
						<HugeiconsIcon icon={PlusSignIcon} />
						Upload
					</Button>
				</div>
			}
			onDragOver={(e) => {
				if (e.dataTransfer.types.includes("Files")) {
					e.preventDefault();
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
				void handleFiles(Array.from(e.dataTransfer.files));
			}}
		>
			{assets.length === 0 ? (
				<button
					type="button"
					onClick={() => openImagePicker(handleFiles)}
					className={cn(
						"hover:bg-accent/50 mt-1 flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center transition-colors",
						isDragOver && "border-primary bg-primary/5",
					)}
				>
					<div className="bg-accent flex size-12 items-center justify-center rounded-full">
						<HugeiconsIcon icon={CloudUploadIcon} className="text-muted-foreground size-6" />
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-sm font-medium">Upload images</span>
						<span className="text-muted-foreground text-xs">
							Drag & drop, click to browse, or paste from your clipboard
						</span>
					</div>
				</button>
			) : (
				<div
					className={cn(
						"pb-4",
						mediaViewMode === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-1",
						isDragOver && "ring-primary rounded-md ring-2",
					)}
				>
					{assets.map((asset) => (
						<AssetItem key={asset.id} asset={asset} viewMode={mediaViewMode} />
					))}
				</div>
			)}
		</PanelView>
	);
}

export function useAssetUrl(assetId: string) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		getAssetUrl(assetId).then((u) => alive && setUrl(u ?? null));
		return () => {
			alive = false;
		};
	}, [assetId]);
	return url;
}

function AssetItem({
	asset,
	viewMode,
}: {
	asset: AssetMeta;
	viewMode: "grid" | "list";
}) {
	const url = useAssetUrl(asset.id);
	const usageCount = useEditorStore(
		(s) => s.doc?.layers.filter((l) => l.type === "image" && l.assetId === asset.id).length ?? 0,
	);

	const setAsBackground = () => {
		const { doc, addLayers, reorderLayer } = getEditor();
		if (!doc) return;
		// Fills the artboard, or in FreeForm the target frame.
		const area = getInsertionArea();
		const { width: cw, height: ch } = area;
		// Cover the area, cropping the overflow (like CSS object-fit: cover).
		const scale = Math.max(cw / asset.width, ch / asset.height);
		const cropW = cw / scale;
		const cropH = ch / scale;
		const layer = createImageLayer({
			assetId: asset.id,
			name: "Background photo",
			x: area.x,
			y: area.y,
			width: cw,
			height: ch,
			parentId: area.frame?.id,
			crop: {
				x: (asset.width - cropW) / 2,
				y: (asset.height - cropH) / 2,
				width: cropW,
				height: cropH,
			},
		});
		addLayers([layer]);
		// Bottom of the stack: right above its frame, or at index 0 on the artboard.
		const frameIndex = area.frame
			? (getEditor().doc?.layers.findIndex((l) => l.id === area.frame?.id) ?? -1)
			: -1;
		reorderLayer(layer.id, frameIndex + 1);
	};

	const handleDelete = async () => {
		const editor = getEditor();
		const layerIds =
			editor.doc?.layers
				.filter((l) => l.type === "image" && l.assetId === asset.id)
				.map((l) => l.id) ?? [];
		if (layerIds.length > 0) {
			editor.removeLayers(layerIds);
			// Removing an asset can't be undone, so drop the history that references it.
			useEditorStore.setState({ past: [], future: [] });
		}
		await deleteAsset(asset.id);
		editor.removeAssetMeta(asset.id);
	};

	const thumb = url ? (
		// biome-ignore lint/performance/noImgElement: object URLs from IndexedDB
		<img src={url} alt={asset.name} className="size-full object-contain" draggable={false} />
	) : (
		<HugeiconsIcon icon={Image01Icon} className="text-muted-foreground size-6" />
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					draggable
					onDragStart={(e) => {
						e.dataTransfer.setData(ASSET_DRAG_MIME, asset.id);
						e.dataTransfer.effectAllowed = "copy";
					}}
					onClick={() => addAssetToCanvas(asset)}
					className={cn(
						"group relative text-left",
						viewMode === "grid"
							? "flex flex-col gap-1"
							: "hover:bg-accent flex items-center gap-2 rounded-md p-1",
					)}
					title={`${asset.name} · ${asset.width}×${asset.height}`}
				>
					<div
						className={cn(
							"bg-accent relative flex items-center justify-center overflow-hidden rounded-md bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:12px_12px]",
							viewMode === "grid" ? "aspect-square w-full" : "size-10 shrink-0",
						)}
					>
						{thumb}
						{viewMode === "grid" && (
							<div className="absolute inset-0 rounded-md ring-2 ring-transparent ring-inset transition group-hover:ring-sky-500" />
						)}
						{usageCount > 0 && viewMode === "grid" && (
							<span className="absolute top-1 right-1 rounded-sm bg-black/60 px-1.5 text-[0.65rem] font-medium text-white">
								In use
							</span>
						)}
					</div>
					<div className="min-w-0">
						<p className="truncate text-xs">{asset.name}</p>
						{viewMode === "list" && (
							<p className="text-muted-foreground text-[0.7rem]">
								{asset.width} × {asset.height}
							</p>
						)}
					</div>
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem
					icon={<HugeiconsIcon icon={ImageAdd02Icon} />}
					onClick={() => addAssetToCanvas(asset)}
				>
					Add to canvas
				</ContextMenuItem>
				<ContextMenuItem
					icon={<HugeiconsIcon icon={BackgroundIcon} />}
					onClick={setAsBackground}
				>
					Set as background
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					variant="destructive"
					icon={<HugeiconsIcon icon={Delete02Icon} />}
					onClick={handleDelete}
				>
					{usageCount > 0 ? `Delete (removes ${usageCount} layer${usageCount > 1 ? "s" : ""})` : "Delete"}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
