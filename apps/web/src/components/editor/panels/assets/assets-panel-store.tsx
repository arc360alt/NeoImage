import type { ElementType } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	Folder03Icon,
	DashboardSquare01Icon,
	Image02Icon,
	TextIcon,
	ShapesIcon,
	Happy01Icon,
	PaintBrush02Icon,
	MagicWand05Icon,
	BackgroundIcon,
	Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export const TAB_KEYS = [
	"uploads",
	"templates",
	"stock",
	"text",
	"elements",
	"stickers",
	"draw",
	"filters",
	"background",
	"settings",
] as const;

export type Tab = (typeof TAB_KEYS)[number];

const createHugeiconsIcon =
	({ icon }: { icon: IconSvgElement }) =>
	({ className }: { className?: string }) => (
		<HugeiconsIcon icon={icon} className={className} />
	);

export const tabs = {
	uploads: { icon: createHugeiconsIcon({ icon: Folder03Icon }), label: "Uploads" },
	templates: { icon: createHugeiconsIcon({ icon: DashboardSquare01Icon }), label: "Templates" },
	stock: { icon: createHugeiconsIcon({ icon: Image02Icon }), label: "Stock photos" },
	text: { icon: createHugeiconsIcon({ icon: TextIcon }), label: "Text" },
	elements: { icon: createHugeiconsIcon({ icon: ShapesIcon }), label: "Elements" },
	stickers: { icon: createHugeiconsIcon({ icon: Happy01Icon }), label: "Stickers" },
	draw: { icon: createHugeiconsIcon({ icon: PaintBrush02Icon }), label: "Draw" },
	filters: { icon: createHugeiconsIcon({ icon: MagicWand05Icon }), label: "Filters" },
	background: { icon: createHugeiconsIcon({ icon: BackgroundIcon }), label: "Background" },
	settings: { icon: createHugeiconsIcon({ icon: Settings01Icon }), label: "Canvas" },
} satisfies Record<
	Tab,
	{ icon: ElementType<{ className?: string }>; label: string }
>;

export type MediaViewMode = "grid" | "list";

interface AssetsPanelStore {
	activeTab: Tab;
	setActiveTab: (tab: Tab) => void;
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
}

export const useAssetsPanelStore = create<AssetsPanelStore>()(
	persist(
		(set) => ({
			activeTab: "uploads",
			setActiveTab: (tab) => set({ activeTab: tab }),
			mediaViewMode: "grid",
			setMediaViewMode: (mode) => set({ mediaViewMode: mode }),
		}),
		{
			name: "openimage-assets-panel",
			partialize: (state) => ({
				activeTab: state.activeTab,
				mediaViewMode: state.mediaViewMode,
			}),
		},
	),
);
