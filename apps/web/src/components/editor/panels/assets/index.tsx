"use client";

import { Separator } from "@/components/ui/separator";
import {
	TAB_KEYS,
	type Tab,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { useEditorStore } from "@/editor/store";
import { cn } from "@/utils/ui";
import { TabBar } from "./tabbar";
import { UploadsView } from "./views/uploads";
import { TemplatesView } from "./views/templates";
import { StockView } from "./views/stock";
import { TextView } from "./views/text";
import { ElementsView } from "./views/elements";
import { StickersView } from "./views/stickers";
import { DrawView } from "./views/draw";
import { FiltersView } from "./views/filters";
import { BackgroundView } from "./views/background";
import { CanvasSettingsView } from "./views/canvas-settings";

/** FreeForm has no single artboard, so the canvas size tab doesn't apply. */
const FREEFORM_TABS = TAB_KEYS.filter((key) => key !== "settings");

export function AssetsPanel({ embedded = false }: { embedded?: boolean }) {
	const { activeTab } = useAssetsPanelStore();
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	const keys: readonly Tab[] = freeform ? FREEFORM_TABS : TAB_KEYS;
	const tab = keys.includes(activeTab) ? activeTab : keys[0];

	const viewMap: Record<Tab, React.ReactNode> = {
		uploads: <UploadsView />,
		templates: <TemplatesView />,
		stock: <StockView />,
		text: <TextView />,
		elements: <ElementsView />,
		stickers: <StickersView />,
		draw: <DrawView />,
		filters: <FiltersView />,
		background: <BackgroundView />,
		settings: <CanvasSettingsView />,
	};

	return (
		<div
			className={cn(
				"bg-background flex h-full overflow-hidden",
				!embedded && "panel rounded-sm border",
			)}
		>
			<TabBar keys={keys} />
			<Separator orientation="vertical" />
			<div className="flex-1 overflow-hidden">{viewMap[tab]}</div>
		</div>
	);
}
