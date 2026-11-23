"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	Copy01Icon,
	Delete02Icon,
	Layers01Icon,
	LayerBringToFrontIcon,
	LayerSendToBackIcon,
	LayerBringForwardIcon,
	LayerSendBackwardIcon,
	FlipHorizontalIcon,
	FlipVerticalIcon,
	SquareLock01Icon,
	SquareUnlock01Icon,
	CropIcon,
	AiMagicIcon,
	ClipboardIcon,
	ScissorIcon,
	ViewOffIcon,
	HashtagIcon,
	FullScreenIcon,
	SquareArrowExpand01Icon,
	Cancel01Icon,
	GroupItemsIcon,
	PathIcon,
	SourceCodeIcon,
	PathfinderOutlineIcon,
	PathfinderUniteIcon,
	PathfinderMinusFrontIcon,
	PathfinderIntersectIcon,
	PathfinderExcludeIcon,
} from "@hugeicons/core-free-icons";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getEditor, useSelectedLayers, useEditorStore } from "@/editor/store";
import {
	flipSelection,
	startCrop,
	toggleLockSelection,
	toggleVisibilitySelection,
} from "@/editor/actions";
import { useRemoveBackground } from "@/components/editor/use-remove-background";
import {
	fitFramesToContent,
	frameSelection,
	removeSelectedFrames,
	zoomToSelection,
} from "@/editor/frame-actions";
import type { ActionId } from "@/editor/keybindings";
import { groupSelection, ungroupSelection } from "@/editor/group-actions";
import { copySelection, copySelectionAsSvg, cutSelection } from "@/editor/clipboard";
import { booleanSelection, flattenSelection, outlineStrokeSelection, vectorTargets } from "@/editor/vector-actions";
import { useShortcut } from "@/editor/use-shortcut";

function Shortcut({ id }: { id: ActionId }) {
	const shortcut = useShortcut(id);
	return shortcut ? <ContextMenuShortcut>{shortcut}</ContextMenuShortcut> : null;
}

export function CanvasContextMenu({ children }: { children: React.ReactNode }) {
	const selected = useSelectedLayers();
	const hasClipboard = useEditorStore((s) => s.clipboard.length > 0);
	const { run: removeBackground, isRunning } = useRemoveBackground();
	const ids = selected.map((l) => l.id);
	const single = selected.length === 1 ? selected[0] : null;
	const allLocked = selected.length > 0 && selected.every((l) => l.locked);
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	const hasFrames = selected.some((l) => l.type === "frame");
	const hasNonFrames = selected.some((l) => l.type !== "frame");
	const inFrame = selected.some((l) => l.parentId);
	const hasGroups = selected.some((l) => l.type === "group");
	const docLayers = useEditorStore((s) => s.doc?.layers);
	const vectorCount = docLayers ? vectorTargets(docLayers, ids).vectors.length : 0;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="size-full">{children}</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-56">
				{selected.length === 0 ? (
					<>
						<ContextMenuItem
							disabled={!hasClipboard}
							icon={<HugeiconsIcon icon={ClipboardIcon} />}
							onClick={() => getEditor().paste()}
						>
							Paste
							<Shortcut id="edit.paste" />
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Layers01Icon} />}
							onClick={() => getEditor().selectAll()}
						>
							Select all
							<Shortcut id="select.all" />
						</ContextMenuItem>
					</>
				) : (
					<>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Copy01Icon} />}
							onClick={copySelection}
						>
							Copy
							<Shortcut id="edit.copy" />
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={ScissorIcon} />}
							onClick={cutSelection}
						>
							Cut
							<Shortcut id="edit.cut" />
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={SourceCodeIcon} />}
							onClick={() => void copySelectionAsSvg()}
						>
							Copy as SVG
							<Shortcut id="edit.copySvg" />
						</ContextMenuItem>
						<ContextMenuItem
							disabled={!hasClipboard}
							icon={<HugeiconsIcon icon={ClipboardIcon} />}
							onClick={() => getEditor().paste()}
						>
							Paste
							<Shortcut id="edit.paste" />
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Copy01Icon} />}
							onClick={() => getEditor().duplicateLayers(ids)}
						>
							Duplicate
							<Shortcut id="edit.duplicate" />
						</ContextMenuItem>
						<ContextMenuSeparator />
						{hasNonFrames && (
							<ContextMenuItem icon={<HugeiconsIcon icon={GroupItemsIcon} />} onClick={groupSelection}>
								Group selection
								<Shortcut id="arrange.group" />
							</ContextMenuItem>
						)}
						{hasGroups && (
							<ContextMenuItem icon={<HugeiconsIcon icon={GroupItemsIcon} />} onClick={ungroupSelection}>
								Ungroup
								<Shortcut id="arrange.ungroup" />
							</ContextMenuItem>
						)}
						{vectorCount > 0 && (
							<>
								<ContextMenuItem icon={<HugeiconsIcon icon={PathIcon} />} onClick={() => flattenSelection()}>
									{vectorCount === 1 && single?.type === "shape" ? "Convert to path" : "Flatten"}
									<Shortcut id="vector.flatten" />
								</ContextMenuItem>
								<ContextMenuItem
									icon={<HugeiconsIcon icon={PathfinderOutlineIcon} />}
									onClick={() => void outlineStrokeSelection()}
								>
									Outline stroke
									<Shortcut id="vector.outlineStroke" />
								</ContextMenuItem>
							</>
						)}
						{vectorCount >= 2 && (
							<ContextMenuSub>
								<ContextMenuSubTrigger icon={<HugeiconsIcon icon={PathfinderUniteIcon} />}>
									Boolean
								</ContextMenuSubTrigger>
								<ContextMenuSubContent className="w-52">
									<ContextMenuItem icon={<HugeiconsIcon icon={PathfinderUniteIcon} />} onClick={() => void booleanSelection("union")}>
										Union
										<Shortcut id="vector.union" />
									</ContextMenuItem>
									<ContextMenuItem icon={<HugeiconsIcon icon={PathfinderMinusFrontIcon} />} onClick={() => void booleanSelection("subtract")}>
										Subtract
										<Shortcut id="vector.subtract" />
									</ContextMenuItem>
									<ContextMenuItem icon={<HugeiconsIcon icon={PathfinderIntersectIcon} />} onClick={() => void booleanSelection("intersect")}>
										Intersect
										<Shortcut id="vector.intersect" />
									</ContextMenuItem>
									<ContextMenuItem icon={<HugeiconsIcon icon={PathfinderExcludeIcon} />} onClick={() => void booleanSelection("exclude")}>
										Exclude
										<Shortcut id="vector.exclude" />
									</ContextMenuItem>
								</ContextMenuSubContent>
							</ContextMenuSub>
						)}
						{(hasNonFrames || hasGroups) && !freeform && <ContextMenuSeparator />}
						{freeform && (
							<>
								{hasNonFrames && (
									<ContextMenuItem
										icon={<HugeiconsIcon icon={HashtagIcon} />}
										onClick={frameSelection}
									>
										Frame selection
										<Shortcut id="frame.wrap" />
									</ContextMenuItem>
								)}
								{(hasFrames || inFrame) && (
									<ContextMenuItem
										icon={<HugeiconsIcon icon={SquareArrowExpand01Icon} />}
										onClick={() => fitFramesToContent()}
									>
										Resize frame to fit
										<Shortcut id="frame.fit" />
									</ContextMenuItem>
								)}
								{hasFrames && (
									<ContextMenuItem
										icon={<HugeiconsIcon icon={Cancel01Icon} />}
										onClick={removeSelectedFrames}
									>
										Remove frame
										<Shortcut id="arrange.ungroup" />
									</ContextMenuItem>
								)}
								<ContextMenuItem
									icon={<HugeiconsIcon icon={FullScreenIcon} />}
									onClick={zoomToSelection}
								>
									Zoom to selection
									<Shortcut id="view.zoomSelection" />
								</ContextMenuItem>
								<ContextMenuSeparator />
							</>
						)}
						<ContextMenuSub>
							<ContextMenuSubTrigger icon={<HugeiconsIcon icon={Layers01Icon} />}>
								Arrange
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-52">
								<ContextMenuItem
									icon={<HugeiconsIcon icon={LayerBringToFrontIcon} />}
									onClick={() => getEditor().moveLayers(ids, "top")}
								>
									Bring to front
									<Shortcut id="arrange.front" />
								</ContextMenuItem>
								<ContextMenuItem
									icon={<HugeiconsIcon icon={LayerBringForwardIcon} />}
									onClick={() => getEditor().moveLayers(ids, "up")}
								>
									Bring forward
									<Shortcut id="arrange.forward" />
								</ContextMenuItem>
								<ContextMenuItem
									icon={<HugeiconsIcon icon={LayerSendBackwardIcon} />}
									onClick={() => getEditor().moveLayers(ids, "down")}
								>
									Send backward
									<Shortcut id="arrange.backward" />
								</ContextMenuItem>
								<ContextMenuItem
									icon={<HugeiconsIcon icon={LayerSendToBackIcon} />}
									onClick={() => getEditor().moveLayers(ids, "bottom")}
								>
									Send to back
									<Shortcut id="arrange.back" />
								</ContextMenuItem>
							</ContextMenuSubContent>
						</ContextMenuSub>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={FlipHorizontalIcon} />}
							onClick={() => flipSelection("x")}
						>
							Flip horizontal
							<Shortcut id="edit.flipH" />
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={FlipVerticalIcon} />}
							onClick={() => flipSelection("y")}
						>
							Flip vertical
							<Shortcut id="edit.flipV" />
						</ContextMenuItem>
						{single?.type === "image" && (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem
									icon={<HugeiconsIcon icon={CropIcon} />}
									onClick={startCrop}
								>
									Crop
									<Shortcut id="tool.crop" />
								</ContextMenuItem>
								<ContextMenuItem
									disabled={isRunning}
									icon={<HugeiconsIcon icon={AiMagicIcon} />}
									onClick={() => removeBackground(single)}
								>
									Remove background
								</ContextMenuItem>
							</>
						)}
						<ContextMenuSeparator />
						<ContextMenuItem
							icon={<HugeiconsIcon icon={allLocked ? SquareUnlock01Icon : SquareLock01Icon} />}
							onClick={toggleLockSelection}
						>
							{allLocked ? "Unlock" : "Lock"}
							<Shortcut id="layer.lock" />
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={ViewOffIcon} />}
							onClick={toggleVisibilitySelection}
						>
							Hide
							<Shortcut id="layer.hide" />
						</ContextMenuItem>
						<ContextMenuItem
							variant="destructive"
							icon={<HugeiconsIcon icon={Delete02Icon} />}
							onClick={() => getEditor().removeLayers(ids)}
						>
							Delete
							<Shortcut id="edit.delete" />
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
