"use client";

import { PanelView } from "./base-panel";
import { FillField, FillSwatches } from "../../controls";
import { getEditor, useEditorStore } from "@/editor/store";
import { Label } from "@/components/ui/label";
import { getInsertionArea } from "@/editor/insertion";

export function BackgroundView() {
	const background = useEditorStore((s) => s.doc?.canvas.background);
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	useEditorStore((s) => s.selectedIds);
	useEditorStore((s) => s.doc?.layers);
	if (!background) return null;

	if (freeform) {
		const frame = getInsertionArea().frame;
		return (
			<PanelView title="Frame background">
				{frame ? (
					<div className="flex flex-col gap-5 pb-4">
						<div className="flex flex-col gap-2">
							<Label>{frame.name}</Label>
							<FillField
								value={frame.fill}
								allowTransparent
								onChange={(fill, options) => getEditor().updateLayer(frame.id, { fill }, options)}
							/>
						</div>
						<FillSwatches
							value={frame.fill}
							allowTransparent
							onChange={(fill) => getEditor().updateLayer(frame.id, { fill })}
						/>
					</div>
				) : (
					<p className="text-muted-foreground px-2 py-8 text-center text-xs">
						Select a frame to change its background.
					</p>
				)}
			</PanelView>
		);
	}

	return (
		<PanelView title="Background">
			<div className="flex flex-col gap-5 pb-4">
				<div className="flex flex-col gap-2">
					<Label>Current background</Label>
					<FillField
						value={background}
						allowTransparent
						onChange={(fill, options) =>
							getEditor().updateCanvas({ background: fill }, options)
						}
					/>
				</div>
				<FillSwatches
					value={background}
					allowTransparent
					onChange={(fill) => getEditor().updateCanvas({ background: fill })}
				/>
				<p className="text-muted-foreground text-xs">
					Tip: right-click an upload and choose “Set as background” to fill the
					canvas with a photo.
				</p>
			</div>
		</PanelView>
	);
}
