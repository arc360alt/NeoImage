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

export function CanvasContextMenu({ children }: { children: React.ReactNode }) {
	const selected = useSelectedLayers();
	const hasClipboard = useEditorStore((s) => s.clipboard.length > 0);
	const { run: removeBackground, isRunning } = useRemoveBackground();
	const ids = selected.map((l) => l.id);
	const single = selected.length === 1 ? selected[0] : null;
	const allLocked = selected.length > 0 && selected.every((l) => l.locked);

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
							<ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Layers01Icon} />}
							onClick={() => getEditor().selectAll()}
						>
							Select all
							<ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
						</ContextMenuItem>
					</>
				) : (
					<>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Copy01Icon} />}
							onClick={() => getEditor().copy()}
						>
							Copy
							<ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={ScissorIcon} />}
							onClick={() => getEditor().cut()}
						>
							Cut
							<ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem
							disabled={!hasClipboard}
							icon={<HugeiconsIcon icon={ClipboardIcon} />}
							onClick={() => getEditor().paste()}
						>
							Paste
							<ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Copy01Icon} />}
							onClick={() => getEditor().duplicateLayers(ids)}
						>
							Duplicate
							<ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuSeparator />
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
								</ContextMenuItem>
								<ContextMenuItem
									icon={<HugeiconsIcon icon={LayerBringForwardIcon} />}
									onClick={() => getEditor().moveLayers(ids, "up")}
								>
									Bring forward
								</ContextMenuItem>
								<ContextMenuItem
									icon={<HugeiconsIcon icon={LayerSendBackwardIcon} />}
									onClick={() => getEditor().moveLayers(ids, "down")}
								>
									Send backward
								</ContextMenuItem>
								<ContextMenuItem
									icon={<HugeiconsIcon icon={LayerSendToBackIcon} />}
									onClick={() => getEditor().moveLayers(ids, "bottom")}
								>
									Send to back
								</ContextMenuItem>
							</ContextMenuSubContent>
						</ContextMenuSub>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={FlipHorizontalIcon} />}
							onClick={() => flipSelection("x")}
						>
							Flip horizontal
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={FlipVerticalIcon} />}
							onClick={() => flipSelection("y")}
						>
							Flip vertical
						</ContextMenuItem>
						{single?.type === "image" && (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem
									icon={<HugeiconsIcon icon={CropIcon} />}
									onClick={startCrop}
								>
									Crop
									<ContextMenuShortcut>C</ContextMenuShortcut>
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
							<ContextMenuShortcut>Ctrl+L</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={ViewOffIcon} />}
							onClick={toggleVisibilitySelection}
						>
							Hide
						</ContextMenuItem>
						<ContextMenuItem
							variant="destructive"
							icon={<HugeiconsIcon icon={Delete02Icon} />}
							onClick={() => getEditor().removeLayers(ids)}
						>
							Delete
							<ContextMenuShortcut>Del</ContextMenuShortcut>
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
