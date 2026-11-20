"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, Unlink04Icon } from "@hugeicons/core-free-icons";
import { PanelView } from "./base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import { getEditor, useEditorStore } from "@/editor/store";
import { CANVAS_PRESETS, MAX_CANVAS_SIZE } from "@/editor/canvas-presets";
import type { Layer } from "@/editor/types";

export function resizeCanvas({
	width,
	height,
	scaleContent,
}: {
	width: number;
	height: number;
	scaleContent: boolean;
}) {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return;
	const sx = width / doc.canvas.width;
	const sy = height / doc.canvas.height;
	const s = Math.min(sx, sy);
	const offsetX = (width - doc.canvas.width * (scaleContent ? s : 1)) / 2;
	const offsetY = (height - doc.canvas.height * (scaleContent ? s : 1)) / 2;
	const layers = doc.layers.map((layer): Layer => {
		const k = scaleContent ? s : 1;
		const moved = { ...layer, x: layer.x * k + offsetX, y: layer.y * k + offsetY };
		if (!scaleContent) return moved as Layer;
		switch (layer.type) {
			case "text":
				return { ...layer, ...moved, width: layer.width * k, fontSize: layer.fontSize * k, letterSpacing: layer.letterSpacing * k } as Layer;
			case "drawing":
				return {
					...layer,
					...moved,
					width: layer.width * k,
					height: layer.height * k,
					strokes: layer.strokes.map((st) => ({ ...st, size: st.size * k, points: st.points.map((p) => p * k) })),
				} as Layer;
			default:
				return { ...layer, ...moved, width: layer.width * k, height: layer.height * k } as Layer;
		}
	});
	editor.replaceDocument({ canvas: { ...doc.canvas, width, height }, layers });
}

export function CanvasSettingsView() {
	const canvas = useEditorStore((s) => s.doc?.canvas);
	const [width, setWidth] = useState(String(canvas?.width ?? 1080));
	const [height, setHeight] = useState(String(canvas?.height ?? 1080));
	const [locked, setLocked] = useState(true);
	const [scaleContent, setScaleContent] = useState(true);

	useEffect(() => {
		if (!canvas) return;
		setWidth(String(canvas.width));
		setHeight(String(canvas.height));
	}, [canvas?.width, canvas?.height]);

	if (!canvas) return null;
	const ratio = canvas.width / canvas.height;

	const apply = (w: number, h: number) => {
		const cw = Math.min(MAX_CANVAS_SIZE, Math.max(1, Math.round(w)));
		const ch = Math.min(MAX_CANVAS_SIZE, Math.max(1, Math.round(h)));
		if (cw === canvas.width && ch === canvas.height) return;
		resizeCanvas({ width: cw, height: ch, scaleContent });
	};

	return (
		<PanelView title="Canvas">
			<div className="flex flex-col gap-5 pb-4">
				<div className="flex flex-col gap-2">
					<Label>Size (px)</Label>
					<div className="flex items-center gap-1.5">
						<Input
							aria-label="Width"
							inputMode="numeric"
							value={width}
							onChange={(e) => {
								const v = e.target.value.replace(/\D/g, "");
								setWidth(v);
								if (locked && v) setHeight(String(Math.round(Number(v) / ratio)));
							}}
						/>
						<Button
							variant="ghost"
							size="icon"
							className={cn("size-8 shrink-0", locked && "text-primary")}
							onClick={() => setLocked(!locked)}
							aria-label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
						>
							<HugeiconsIcon icon={locked ? LinkSquare02Icon : Unlink04Icon} />
						</Button>
						<Input
							aria-label="Height"
							inputMode="numeric"
							value={height}
							onChange={(e) => {
								const v = e.target.value.replace(/\D/g, "");
								setHeight(v);
								if (locked && v) setWidth(String(Math.round(Number(v) * ratio)));
							}}
						/>
					</div>
					<label className="flex items-center gap-2 text-sm" htmlFor="scale-content">
						<Checkbox
							id="scale-content"
							checked={scaleContent}
							onCheckedChange={(c) => setScaleContent(!!c)}
						/>
						Scale content to fit
					</label>
					<Button onClick={() => apply(Number(width), Number(height))}>Resize canvas</Button>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>Presets</Label>
					<div className="flex flex-col">
						{CANVAS_PRESETS.map((preset) => {
							const active = preset.width === canvas.width && preset.height === canvas.height;
							return (
								<button
									key={preset.id}
									type="button"
									onClick={() => apply(preset.width, preset.height)}
									className={cn(
										"flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
										active ? "bg-secondary text-secondary-foreground" : "hover:bg-accent",
									)}
								>
									<span>{preset.label}</span>
									<span className="text-muted-foreground tabular-nums">
										{preset.width} × {preset.height}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</PanelView>
	);
}
