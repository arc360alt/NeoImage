"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	PaintBrush02Icon,
	Eraser01Icon,
	HighlighterIcon,
	Delete02Icon,
} from "@hugeicons/core-free-icons";
import { PanelView } from "./base-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { getEditor, useEditorStore, useSelectedLayers } from "@/editor/store";
import { SOLID_SWATCHES } from "@/editor/fill";
import { ColorPicker } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import type { BrushSettings } from "@/editor/types";

const MODES: { id: BrushSettings["mode"]; label: string; icon: Parameters<typeof HugeiconsIcon>[0]["icon"] }[] = [
	{ id: "brush", label: "Brush", icon: PaintBrush02Icon },
	{ id: "highlighter", label: "Highlighter", icon: HighlighterIcon },
	{ id: "eraser", label: "Eraser", icon: Eraser01Icon },
];

export function DrawView() {
	const brush = useEditorStore((s) => s.brush);
	const tool = useEditorStore((s) => s.tool);
	const selected = useSelectedLayers();
	const drawing = selected.length === 1 && selected[0].type === "drawing" ? selected[0] : null;
	const activeMode: BrushSettings["mode"] =
		tool === "eraser" ? "eraser" : brush.mode === "eraser" ? "brush" : brush.mode;
	const isDrawingTool = tool === "brush" || tool === "eraser";

	const setMode = (mode: BrushSettings["mode"]) => {
		const editor = getEditor();
		if (mode === "eraser") {
			editor.setTool("eraser");
		} else {
			editor.setBrush({ mode });
			editor.setTool("brush");
		}
	};

	return (
		<PanelView title="Draw">
			<div className="flex flex-col gap-5 pb-4">
				<div className="grid grid-cols-3 gap-1.5">
					{MODES.map((mode) => (
						<button
							key={mode.id}
							type="button"
							onClick={() => setMode(mode.id)}
							className={cn(
								"flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-xs",
								isDrawingTool && activeMode === mode.id
									? "bg-secondary border-secondary-border text-secondary-foreground"
									: "hover:bg-accent",
							)}
						>
							<HugeiconsIcon icon={mode.icon} className="size-5" />
							{mode.label}
						</button>
					))}
				</div>
				{!isDrawingTool && (
					<p className="text-muted-foreground -mt-2 text-xs">
						Pick a brush to start drawing on the canvas. Strokes go into a
						drawing layer you can move, resize and erase.
					</p>
				)}

				{activeMode !== "eraser" && (
					<div className="flex flex-col gap-2">
						<Label>Color</Label>
						<div className="grid grid-cols-8 gap-1.5">
							{SOLID_SWATCHES.slice(0, 16).map((color) => (
								<button
									key={color}
									type="button"
									aria-label={color}
									onClick={() => getEditor().setBrush({ color })}
									className={cn(
										"aspect-square rounded-full border",
										brush.color.toLowerCase() === color && "ring-primary ring-2 ring-offset-1",
									)}
									style={{ background: color }}
								/>
							))}
						</div>
						<ColorPicker
							value={brush.color.replace("#", "")}
							onChange={(v) => getEditor().setBrush({ color: `#${v}` })}
						/>
					</div>
				)}

				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<Label>Size</Label>
						<span className="text-muted-foreground text-xs tabular-nums">{brush.size}px</span>
					</div>
					<Slider
						min={1}
						max={200}
						step={1}
						value={[brush.size]}
						onValueChange={([size]) => getEditor().setBrush({ size })}
					/>
				</div>

				{activeMode === "brush" && (
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<Label>Opacity</Label>
							<span className="text-muted-foreground text-xs tabular-nums">
								{Math.round(brush.opacity * 100)}%
							</span>
						</div>
						<Slider
							min={0.05}
							max={1}
							step={0.01}
							value={[brush.opacity]}
							onValueChange={([opacity]) => getEditor().setBrush({ opacity })}
						/>
					</div>
				)}

				<div className="flex items-center justify-center py-2">
					<div
						className="rounded-full border"
						style={{
							width: Math.min(brush.size, 120),
							height: Math.min(brush.size, 120),
							background: activeMode === "eraser" ? "transparent" : brush.color,
							opacity: activeMode === "highlighter" ? 0.4 : activeMode === "eraser" ? 1 : brush.opacity,
							borderStyle: activeMode === "eraser" ? "dashed" : "solid",
						}}
					/>
				</div>

				{drawing && drawing.type === "drawing" && drawing.strokes.length > 0 && (
					<Button
						variant="destructive-foreground"
						className="gap-2"
						onClick={() => getEditor().updateLayer(drawing.id, { strokes: [] })}
					>
						<HugeiconsIcon icon={Delete02Icon} />
						Clear this drawing
					</Button>
				)}
			</div>
		</PanelView>
	);
}
