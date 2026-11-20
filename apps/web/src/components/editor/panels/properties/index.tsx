"use client";

import { create } from "zustand";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Image01Icon,
	TextIcon,
	ShapesIcon,
	SlidersHorizontalIcon,
	Move01Icon,
	MagicWand05Icon,
	PaintBrush02Icon,
	BackgroundIcon,
	Delete02Icon,
	Copy01Icon,
	HashtagIcon,
	Download04Icon,
} from "@hugeicons/core-free-icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { cn } from "@/utils/ui";
import { getEditor, useEditorStore, useSelectedLayers } from "@/editor/store";
import type { Layer, LayerType } from "@/editor/types";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { FillField, Field } from "../controls";
import {
	AdjustTab,
	AlignSection,
	BlendingSection,
	EffectsTab,
	ImageTab,
	ShapeTab,
	TextTab,
	TransformTab,
} from "./tabs";
import { ExportSection, FrameTab, PageProperties } from "./freeform";

type TabId = "content" | "adjust" | "transform" | "effects" | "export";

type TabDef = {
	id: TabId;
	label: string;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
	render: (layer: Layer) => React.ReactNode;
};

const CONTENT_TAB: Record<LayerType, TabDef | null> = {
	image: { id: "content", label: "Image", icon: Image01Icon, render: (l) => l.type === "image" && <ImageTab layer={l} /> },
	text: { id: "content", label: "Text", icon: TextIcon, render: (l) => l.type === "text" && <TextTab layer={l} /> },
	shape: { id: "content", label: "Shape", icon: ShapesIcon, render: (l) => l.type === "shape" && <ShapeTab layer={l} /> },
	drawing: null,
	frame: { id: "content", label: "Frame", icon: HashtagIcon, render: (l) => l.type === "frame" && <FrameTab layer={l} /> },
};

const EXPORT_TAB: TabDef = {
	id: "export",
	label: "Export",
	icon: Download04Icon,
	render: (l) => <ExportSection layers={[l]} />,
};

const COMMON_TABS: TabDef[] = [
	{ id: "adjust", label: "Adjust", icon: SlidersHorizontalIcon, render: (l) => <AdjustTab layer={l} /> },
	{ id: "transform", label: "Transform", icon: Move01Icon, render: (l) => <TransformTab layer={l} /> },
	{ id: "effects", label: "Effects", icon: MagicWand05Icon, render: (l) => <EffectsTab layer={l} /> },
];

const usePropertiesStore = create<{
	activeTabPerType: Partial<Record<LayerType, TabId>>;
	setActiveTab: (type: LayerType, tab: TabId) => void;
}>()((set) => ({
	activeTabPerType: {},
	setActiveTab: (type, tab) =>
		set((s) => ({ activeTabPerType: { ...s.activeTabPerType, [type]: tab } })),
}));

export function PropertiesPanel() {
	const selected = useSelectedLayers();
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	const { activeTabPerType, setActiveTab } = usePropertiesStore();

	if (selected.length === 0) {
		return (
			<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
				{freeform ? (
					<ScrollArea className="scrollbar-hidden flex-1">
						<PageProperties />
					</ScrollArea>
				) : (
					<CanvasProperties />
				)}
			</div>
		);
	}

	if (selected.length > 1) {
		return (
			<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
				<ScrollArea className="scrollbar-hidden flex-1">
					<div className="flex h-11 items-center border-b px-3.5">
						<span className="text-muted-foreground text-sm">{selected.length} layers selected</span>
					</div>
					<AlignSection multiple />
					<BlendingSection layers={selected} />
					{freeform && <ExportSection layers={selected} />}
					<Section sectionKey="multi-actions" showBottomBorder={false}>
						<SectionContent className="pt-4">
							<div className="grid grid-cols-2 gap-2">
								<Button
									variant="outline"
									className="gap-2"
									onClick={() => getEditor().duplicateLayers(selected.map((l) => l.id))}
								>
									<HugeiconsIcon icon={Copy01Icon} />
									Duplicate
								</Button>
								<Button
									variant="destructive-foreground"
									className="gap-2"
									onClick={() => getEditor().removeLayers(selected.map((l) => l.id))}
								>
									<HugeiconsIcon icon={Delete02Icon} />
									Delete
								</Button>
							</div>
						</SectionContent>
					</Section>
				</ScrollArea>
			</div>
		);
	}

	const layer = selected[0];
	const contentTab = CONTENT_TAB[layer.type];
	// Frames carry their own position/size controls and don't take filters.
	const baseTabs =
		layer.type === "frame"
			? COMMON_TABS.filter((t) => t.id === "effects")
			: COMMON_TABS;
	const withContent = contentTab ? [contentTab, ...baseTabs] : baseTabs;
	const visibleTabs =
		freeform && layer.type !== "frame" ? [...withContent, EXPORT_TAB] : withContent;
	const storedTab = activeTabPerType[layer.type];
	const activeTab = visibleTabs.find((t) => t.id === storedTab) ?? visibleTabs[0];

	return (
		<div className="panel bg-background flex h-full overflow-hidden rounded-sm border">
			<TooltipProvider delayDuration={0}>
				<div className="scrollbar-hidden flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-1">
					{visibleTabs.map((tab) => (
						<Tooltip key={tab.id}>
							<TooltipTrigger asChild>
								<Button
									variant={tab.id === activeTab.id ? "secondary" : "ghost"}
									size="icon"
									onClick={() => setActiveTab(layer.type, tab.id)}
									aria-label={tab.label}
									className={cn("h-8 w-8 shrink-0", tab.id !== activeTab.id && "text-muted-foreground")}
								>
									<HugeiconsIcon icon={tab.icon} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">{tab.label}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</TooltipProvider>
			<ScrollArea className="scrollbar-hidden flex-1">
				{layer.type === "drawing" && activeTab.id === "adjust" && <DrawingHint />}
				{activeTab.render(layer)}
			</ScrollArea>
		</div>
	);
}

function DrawingHint() {
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	return (
		<div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
			<span className="text-muted-foreground text-xs">Drawing layer</span>
			<Button
				size="sm"
				variant="outline"
				className="gap-1"
				onClick={() => {
					setActiveTab("draw");
					getEditor().setTool("brush");
				}}
			>
				<HugeiconsIcon icon={PaintBrush02Icon} />
				Keep drawing
			</Button>
		</div>
	);
}

function CanvasProperties() {
	const canvas = useEditorStore((s) => s.doc?.canvas);
	const layerCount = useEditorStore((s) => s.doc?.layers.length ?? 0);
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	if (!canvas) return null;

	return (
		<ScrollArea className="scrollbar-hidden flex-1">
			<div className="flex h-11 items-center border-b px-3.5">
				<span className="text-muted-foreground text-sm">Canvas</span>
			</div>
			<Section sectionKey="canvas-bg">
				<SectionHeader>
					<SectionTitle>Background</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<FillField
							value={canvas.background}
							allowTransparent
							onChange={(background, options) => getEditor().updateCanvas({ background }, options)}
						/>
						<Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActiveTab("background")}>
							<HugeiconsIcon icon={BackgroundIcon} />
							More backgrounds
						</Button>
					</SectionFields>
				</SectionContent>
			</Section>
			<Section sectionKey="canvas-size">
				<SectionHeader>
					<SectionTitle>Size</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<Field label="Dimensions">
							<span className="text-sm tabular-nums">
								{canvas.width} × {canvas.height} px
							</span>
						</Field>
						<Button variant="outline" size="sm" onClick={() => setActiveTab("settings")}>
							Resize canvas
						</Button>
					</SectionFields>
				</SectionContent>
			</Section>
			<div className="text-muted-foreground flex flex-col gap-1 p-4 text-xs leading-relaxed">
				<p>
					{layerCount === 0
						? "Your canvas is empty. Upload a photo, pick a template, or add text from the left panel."
						: "Select a layer on the canvas or in the layers panel to edit it."}
				</p>
			</div>
		</ScrollArea>
	);
}
