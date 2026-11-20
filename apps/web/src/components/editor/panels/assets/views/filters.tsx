"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { MagicWand05Icon } from "@hugeicons/core-free-icons";
import { PanelView } from "./base-panel";
import { cn } from "@/utils/ui";
import { getEditor, useSelectedLayers } from "@/editor/store";
import {
	FILTER_PRESETS,
	presetToAdjustments,
	presetToCss,
} from "@/editor/filters";
import { DEFAULT_ADJUSTMENTS } from "@/editor/defaults";
import type { Adjustments, ImageLayer } from "@/editor/types";
import { useAssetUrl } from "./uploads";

export function FiltersView() {
	const selected = useSelectedLayers();
	const images = selected.filter((l): l is ImageLayer => l.type === "image");
	const target = images[0];

	if (!target) {
		return (
			<PanelView title="Filters">
				<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
					<div className="bg-accent flex size-12 items-center justify-center rounded-full">
						<HugeiconsIcon icon={MagicWand05Icon} className="text-muted-foreground size-6" />
					</div>
					<p className="text-sm font-medium">Select an image</p>
					<p className="text-muted-foreground text-xs">
						Click a photo on the canvas to try one-click filters. Fine-tune them in
						the Adjust tab of the properties panel.
					</p>
				</div>
			</PanelView>
		);
	}

	const current = target.adjustments;
	const isPreset = (adjustments: Adjustments) =>
		(Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]).every(
			(key) => adjustments[key] === current[key],
		);

	return (
		<PanelView title="Filters">
			<div className="grid grid-cols-3 gap-2 pb-4">
				{FILTER_PRESETS.map((preset) => {
					const adjustments = presetToAdjustments(preset);
					const active = isPreset(adjustments);
					return (
						<button
							key={preset.id}
							type="button"
							onClick={() =>
								getEditor().updateLayers(
									images.map((img) => ({ id: img.id, patch: { adjustments } })),
								)
							}
							className="group flex flex-col gap-1"
						>
							<FilterThumb
								assetId={target.assetId}
								filter={presetToCss(preset)}
								active={active}
							/>
							<span className={cn("truncate text-[0.7rem]", active && "text-primary font-medium")}>
								{preset.label}
							</span>
						</button>
					);
				})}
			</div>
		</PanelView>
	);
}

function FilterThumb({
	assetId,
	filter,
	active,
}: {
	assetId: string;
	filter: string;
	active: boolean;
}) {
	const url = useAssetUrl(assetId);
	return (
		<div
			className={cn(
				"bg-accent aspect-square w-full overflow-hidden rounded-md ring-2 transition",
				active ? "ring-primary" : "ring-transparent group-hover:ring-sky-500/60",
			)}
		>
			{url && (
				// biome-ignore lint/performance/noImgElement: object URL preview
				<img
					src={url}
					alt=""
					className="size-full object-cover"
					style={{ filter }}
					draggable={false}
				/>
			)}
		</div>
	);
}
