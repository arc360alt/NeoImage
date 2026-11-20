"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ViewIcon,
	ViewOffIcon,
	SquareLock01Icon,
	SquareUnlock01Icon,
	Delete02Icon,
	Copy01Icon,
	LayerBringForwardIcon,
	LayerSendBackwardIcon,
	LayerBringToFrontIcon,
	LayerSendToBackIcon,
	FlipHorizontalIcon,
	FlipVerticalIcon,
	TextIcon,
	PaintBrush02Icon,
	Image01Icon,
	DragDropVerticalIcon,
	Layers01Icon,
	Undo02Icon,
	Redo02Icon,
	MagicWand05Icon,
	HashtagIcon,
	ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/ui";
import { getEditor, useEditorStore } from "@/editor/store";
import { flipSelection } from "@/editor/actions";
import { fillToCss } from "@/editor/fill";
import { hasAdjustments } from "@/editor/filters";
import type { Layer } from "@/editor/types";
import { useAssetUrl } from "../assets/views/uploads";
import { frameRect } from "@/editor/freeform";

type DropPosition = "above" | "below" | "inside";

const LAYER_DRAG_MIME = "application/x-openimage-layer";

export function LayersPanel({ variant = "list" }: { variant?: "list" | "tree" }) {
	const layers = useEditorStore((s) => s.doc?.layers ?? EMPTY);
	const selectedIds = useEditorStore((s) => s.selectedIds);
	const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const lastClicked = useRef<string | null>(null);
	const isTree = variant === "tree";

	// Rows top-most first. In tree mode, frames are followed by their children.
	const frameIds = new Set(layers.filter((l) => l.type === "frame").map((l) => l.id));
	const rows: { layer: Layer; depth: number }[] = [];
	const topFirst = [...layers].reverse();
	if (isTree) {
		for (const layer of topFirst) {
			if (layer.parentId && frameIds.has(layer.parentId)) continue;
			rows.push({ layer, depth: 0 });
			if (layer.type === "frame" && !collapsed.has(layer.id)) {
				for (const child of topFirst) {
					if (child.parentId === layer.id) rows.push({ layer: child, depth: 1 });
				}
			}
		}
	} else {
		for (const layer of topFirst) rows.push({ layer, depth: 0 });
	}
	const ordered = rows.map((r) => r.layer);

	const handleClick = (event: React.MouseEvent, layer: Layer) => {
		const editor = getEditor();
		if (event.shiftKey && lastClicked.current) {
			const a = ordered.findIndex((l) => l.id === lastClicked.current);
			const b = ordered.findIndex((l) => l.id === layer.id);
			if (a !== -1 && b !== -1) {
				const [from, to] = a < b ? [a, b] : [b, a];
				editor.select(ordered.slice(from, to + 1).map((l) => l.id));
				return;
			}
		}
		lastClicked.current = layer.id;
		if (event.metaKey || event.ctrlKey) editor.toggleSelect(layer.id);
		else editor.select([layer.id]);
	};

	const handleDrop = (targetId: string, position: DropPosition, draggedId: string) => {
		if (draggedId === targetId) return;
		const doc = getEditor().doc;
		if (!doc) return;
		const dragged = doc.layers.find((l) => l.id === draggedId);
		let target = doc.layers.find((l) => l.id === targetId);
		if (!dragged || !target) return;
		// Frames can't be nested: dropping a frame on a child targets its frame.
		if (dragged.type === "frame" && target.parentId) {
			target = doc.layers.find((l) => l.id === target?.parentId) ?? target;
			if (position === "inside") position = "above";
		}
		if (position === "inside" && target.type === "frame" && dragged.type !== "frame") {
			// Becomes the top-most layer inside the frame.
			getEditor().reorderLayer(draggedId, doc.layers.length, target.id);
			return;
		}
		const without = doc.layers.filter((l) => l.id !== draggedId);
		const targetIndex = without.findIndex((l) => l.id === target?.id);
		if (targetIndex === -1) return;
		// "above" in the list means higher in the stack (later in the array).
		getEditor().reorderLayer(
			draggedId,
			position === "above" ? targetIndex + 1 : targetIndex,
			isTree ? (target.parentId ?? null) : undefined,
		);
	};

	return (
		<div
			className={cn(
				"bg-background flex h-full flex-col overflow-hidden",
				!isTree && "panel rounded-sm border",
			)}
		>
			<LayersToolbar compact={isTree} />
			<div
				className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
				onClick={(e) => {
					if (e.target === e.currentTarget) getEditor().clearSelection();
				}}
				onKeyDown={undefined}
				role="presentation"
			>
				{ordered.length === 0 ? (
					<div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm">
						<HugeiconsIcon icon={Layers01Icon} className="size-6" />
						{isTree
							? "No layers yet. Press F to draw a frame."
							: "No layers yet. Add images, text or shapes to get started."}
					</div>
				) : (
					<div className="flex flex-col py-1">
						{rows.map(({ layer, depth }) => (
							<LayerRow
								key={layer.id}
								layer={layer}
								depth={depth}
								isTree={isTree}
								isCollapsed={collapsed.has(layer.id)}
								onToggleCollapse={() =>
									setCollapsed((prev) => {
										const next = new Set(prev);
										if (next.has(layer.id)) next.delete(layer.id);
										else next.add(layer.id);
										return next;
									})
								}
								isSelected={selectedIds.includes(layer.id)}
								dropIndicator={dropTarget?.id === layer.id ? dropTarget.position : null}
								onClick={(e) => handleClick(e, layer)}
								onDragOverRow={(position) => setDropTarget({ id: layer.id, position })}
								onDragLeaveRow={() => setDropTarget(null)}
								onDropRow={(position, draggedId) => {
									setDropTarget(null);
									handleDrop(layer.id, position, draggedId);
								}}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

const EMPTY: Layer[] = [];

function ToolbarButton({
	label,
	icon,
	onClick,
	disabled,
}: {
	label: string;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="text"
					size="icon"
					className="size-7"
					onClick={onClick}
					disabled={disabled}
					aria-label={label}
				>
					<HugeiconsIcon icon={icon} />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function LayersToolbar({ compact = false }: { compact?: boolean }) {
	const selectedIds = useEditorStore((s) => s.selectedIds);
	const canUndo = useEditorStore((s) => s.past.length > 0 || s.pending !== null);
	const canRedo = useEditorStore((s) => s.future.length > 0);
	const hasSelection = selectedIds.length > 0;
	const editor = getEditor;

	if (compact) {
		return (
			<div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
				<span className="text-muted-foreground pl-1 text-sm">Layers</span>
				<div className="flex items-center gap-0.5">
					<ToolbarButton label="Duplicate (Ctrl+D)" icon={Copy01Icon} disabled={!hasSelection} onClick={() => editor().duplicateLayers(selectedIds)} />
					<ToolbarButton label="Bring forward (Ctrl+])" icon={LayerBringForwardIcon} disabled={!hasSelection} onClick={() => editor().moveLayers(selectedIds, "up")} />
					<ToolbarButton label="Send backward (Ctrl+[)" icon={LayerSendBackwardIcon} disabled={!hasSelection} onClick={() => editor().moveLayers(selectedIds, "down")} />
					<ToolbarButton label="Delete (Del)" icon={Delete02Icon} disabled={!hasSelection} onClick={() => editor().removeLayers(selectedIds)} />
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
			<div className="flex items-center gap-1">
				<span className="text-muted-foreground mr-2 pl-1 text-sm">Layers</span>
				<ToolbarButton label="Undo (Ctrl+Z)" icon={Undo02Icon} disabled={!canUndo} onClick={() => editor().undo()} />
				<ToolbarButton label="Redo (Ctrl+Shift+Z)" icon={Redo02Icon} disabled={!canRedo} onClick={() => editor().redo()} />
				<div className="bg-border mx-1 h-4 w-px" />
				<ToolbarButton label="Duplicate (Ctrl+D)" icon={Copy01Icon} disabled={!hasSelection} onClick={() => editor().duplicateLayers(selectedIds)} />
				<ToolbarButton label="Delete (Del)" icon={Delete02Icon} disabled={!hasSelection} onClick={() => editor().removeLayers(selectedIds)} />
				<div className="bg-border mx-1 h-4 w-px" />
				<ToolbarButton label="Bring to front" icon={LayerBringToFrontIcon} disabled={!hasSelection} onClick={() => editor().moveLayers(selectedIds, "top")} />
				<ToolbarButton label="Bring forward (Ctrl+])" icon={LayerBringForwardIcon} disabled={!hasSelection} onClick={() => editor().moveLayers(selectedIds, "up")} />
				<ToolbarButton label="Send backward (Ctrl+[)" icon={LayerSendBackwardIcon} disabled={!hasSelection} onClick={() => editor().moveLayers(selectedIds, "down")} />
				<ToolbarButton label="Send to back" icon={LayerSendToBackIcon} disabled={!hasSelection} onClick={() => editor().moveLayers(selectedIds, "bottom")} />
				<div className="bg-border mx-1 h-4 w-px" />
				<ToolbarButton label="Flip horizontal" icon={FlipHorizontalIcon} disabled={!hasSelection} onClick={() => flipSelection("x")} />
				<ToolbarButton label="Flip vertical" icon={FlipVerticalIcon} disabled={!hasSelection} onClick={() => flipSelection("y")} />
			</div>
			<span className="text-muted-foreground pr-1 text-xs">
				{hasSelection ? `${selectedIds.length} selected` : ""}
			</span>
		</div>
	);
}

function LayerRow({
	layer,
	depth = 0,
	isTree = false,
	isCollapsed = false,
	onToggleCollapse,
	isSelected,
	dropIndicator,
	onClick,
	onDragOverRow,
	onDragLeaveRow,
	onDropRow,
}: {
	layer: Layer;
	depth?: number;
	isTree?: boolean;
	isCollapsed?: boolean;
	onToggleCollapse?: () => void;
	isSelected: boolean;
	dropIndicator: DropPosition | null;
	onClick: (event: React.MouseEvent) => void;
	onDragOverRow: (position: DropPosition) => void;
	onDragLeaveRow: () => void;
	onDropRow: (position: DropPosition, draggedId: string) => void;
}) {
	const [isRenaming, setIsRenaming] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const isFrameRow = layer.type === "frame";
	const positionFor = (event: React.DragEvent): DropPosition => {
		const rect = event.currentTarget.getBoundingClientRect();
		const y = event.clientY - rect.top;
		// Frame rows in the tree accept drops "inside" through their middle.
		if (isTree && isFrameRow) {
			if (y < rect.height * 0.25) return "above";
			if (y > rect.height * 0.75) return "below";
			return "inside";
		}
		return y < rect.height / 2 ? "above" : "below";
	};

	const finishRename = () => {
		const value = inputRef.current?.value.trim();
		setIsRenaming(false);
		if (value && value !== layer.name) getEditor().updateLayer(layer.id, { name: value });
	};

	return (
		<div
			role="button"
			tabIndex={0}
			draggable={!isRenaming}
			onDragStart={(e) => {
				e.dataTransfer.setData(LAYER_DRAG_MIME, layer.id);
				e.dataTransfer.effectAllowed = "move";
			}}
			onDragOver={(e) => {
				if (!e.dataTransfer.types.includes(LAYER_DRAG_MIME)) return;
				e.preventDefault();
				onDragOverRow(positionFor(e));
			}}
			onDragLeave={onDragLeaveRow}
			onDrop={(e) => {
				const draggedId = e.dataTransfer.getData(LAYER_DRAG_MIME);
				if (!draggedId) return;
				e.preventDefault();
				onDropRow(positionFor(e), draggedId);
			}}
			onClick={onClick}
			onDoubleClick={(e) => {
				// Double-clicking a frame's icon zooms to it; elsewhere renames.
				if (isFrameRow && (e.target as HTMLElement).closest("[data-zoom-frame]")) {
					if (layer.type === "frame") getEditor().requestFit(frameRect(layer));
					return;
				}
				setIsRenaming(true);
				requestAnimationFrame(() => inputRef.current?.select());
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" && !isRenaming) onClick(e as unknown as React.MouseEvent);
			}}
			className={cn(
				"group relative mx-1 flex h-11 cursor-default items-center gap-2.5 rounded-md px-2 select-none",
				isSelected ? "bg-primary/10" : "hover:bg-accent",
				!layer.visible && "opacity-55",
				isTree && "h-9 gap-1.5",
				dropIndicator === "inside" && "ring-primary ring-2 ring-inset",
			)}
			style={depth > 0 ? { paddingLeft: 8 + depth * 18 } : undefined}
		>
			{dropIndicator && dropIndicator !== "inside" && (
				<div
					className={cn(
						"bg-primary absolute right-2 left-2 h-0.5 rounded-full",
						dropIndicator === "above" ? "-top-px" : "-bottom-px",
					)}
				/>
			)}
			{isTree ? (
				isFrameRow ? (
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground flex size-4 shrink-0 items-center justify-center"
						onClick={(e) => {
							e.stopPropagation();
							onToggleCollapse?.();
						}}
						aria-label={isCollapsed ? "Expand frame" : "Collapse frame"}
					>
						<HugeiconsIcon
							icon={ArrowRight01Icon}
							className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-90")}
						/>
					</button>
				) : (
					<span className="size-4 shrink-0" />
				)
			) : (
				<HugeiconsIcon
					icon={DragDropVerticalIcon}
					className="text-muted-foreground size-3.5 shrink-0 cursor-grab opacity-0 group-hover:opacity-100"
				/>
			)}
			<span data-zoom-frame title={isFrameRow ? "Double-click to zoom to frame" : undefined}>
				<LayerThumbnail layer={layer} small={isTree} />
			</span>
			<div className="flex min-w-0 flex-1 flex-col">
				{isRenaming ? (
					<input
						ref={inputRef}
						defaultValue={layer.name}
						onBlur={finishRename}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter") finishRename();
							if (e.key === "Escape") setIsRenaming(false);
						}}
						className="ring-ring bg-background h-6 rounded-sm px-1 text-sm outline-none ring-1"
					/>
				) : (
					<span className={cn("truncate text-sm", isTree && isFrameRow && "font-medium")}>
						{layer.name}
					</span>
				)}
				<span
					className={cn(
						"text-muted-foreground flex items-center gap-1.5 truncate text-[0.7rem] capitalize",
						isTree && "hidden",
					)}
				>
					{layer.type === "shape" ? layer.shape : layer.type}
					{layer.opacity < 1 && <span>· {Math.round(layer.opacity * 100)}%</span>}
					{layer.blendMode !== "source-over" && <span>· {layer.blendMode.replace("-", " ")}</span>}
					{hasAdjustments(layer.adjustments) && (
						<HugeiconsIcon icon={MagicWand05Icon} className="size-3" />
					)}
				</span>
			</div>
			<div className="flex items-center gap-0.5">
				<RowToggle
					label={layer.locked ? "Unlock" : "Lock"}
					icon={layer.locked ? SquareLock01Icon : SquareUnlock01Icon}
					active={layer.locked}
					onClick={() => getEditor().updateLayer(layer.id, { locked: !layer.locked })}
				/>
				<RowToggle
					label={layer.visible ? "Hide" : "Show"}
					icon={layer.visible ? ViewIcon : ViewOffIcon}
					active={!layer.visible}
					onClick={() => getEditor().updateLayer(layer.id, { visible: !layer.visible })}
				/>
			</div>
		</div>
	);
}

function RowToggle({
	label,
	icon,
	active,
	onClick,
}: {
	label: string;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
	active: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn(
				"size-7",
				active ? "text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
			)}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			aria-label={label}
		>
			<HugeiconsIcon icon={icon} />
		</Button>
	);
}

function LayerThumbnail({ layer, small = false }: { layer: Layer; small?: boolean }) {
	const base = cn(
		"bg-accent flex shrink-0 items-center justify-center overflow-hidden rounded border",
		small ? "size-6" : "size-8",
	);
	if (layer.type === "frame") {
		return (
			<div className={base}>
				<HugeiconsIcon icon={HashtagIcon} className="text-muted-foreground size-3.5" />
			</div>
		);
	}
	if (layer.type === "image") return <ImageThumb assetId={layer.assetId} className={base} />;
	if (layer.type === "text") {
		return (
			<div className={base}>
				<HugeiconsIcon icon={TextIcon} className="text-muted-foreground size-4" />
			</div>
		);
	}
	if (layer.type === "drawing") {
		return (
			<div className={base}>
				<HugeiconsIcon icon={PaintBrush02Icon} className="text-muted-foreground size-4" />
			</div>
		);
	}
	const isLine = layer.shape === "line" || layer.shape === "arrow";
	return (
		<div className={base}>
			<div
				className={cn("size-5", layer.shape === "ellipse" && "rounded-full", layer.shape === "rect" && "rounded-[3px]", isLine && "h-1 rounded-full")}
				style={{
					background: isLine ? layer.stroke.color : fillToCss(layer.fill),
					border: !isLine && layer.stroke.enabled ? `2px solid ${layer.stroke.color}` : undefined,
					clipPath:
						layer.shape === "triangle"
							? "polygon(50% 0, 100% 100%, 0 100%)"
							: layer.shape === "star"
								? "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"
								: layer.shape === "polygon"
									? "polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)"
									: undefined,
				}}
			/>
		</div>
	);
}

function ImageThumb({ assetId, className }: { assetId: string; className: string }) {
	const url = useAssetUrl(assetId);
	return (
		<div className={className}>
			{url ? (
				// biome-ignore lint/performance/noImgElement: object URL thumbnail
				<img src={url} alt="" className="size-full object-cover" draggable={false} />
			) : (
				<HugeiconsIcon icon={Image01Icon} className="text-muted-foreground size-4" />
			)}
		</div>
	);
}
