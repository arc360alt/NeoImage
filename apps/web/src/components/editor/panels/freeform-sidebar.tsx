"use client";

import { create } from "zustand";
import { cn } from "@/utils/ui";
import { LayersPanel } from "./layers";
import { AssetsPanel } from "./assets";

const useSidebarStore = create<{
	tab: "layers" | "assets";
	setTab: (tab: "layers" | "assets") => void;
}>()((set) => ({ tab: "layers", setTab: (tab) => set({ tab }) }));

/** FreeForm left sidebar, Figma-style: a layer tree and an assets tab. */
export function FreeformSidebar() {
	const { tab, setTab } = useSidebarStore();
	return (
		<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
			<div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
				{([
					["layers", "Layers"],
					["assets", "Assets"],
				] as const).map(([key, label]) => (
					<button
						key={key}
						type="button"
						onClick={() => setTab(key)}
						className={cn(
							"rounded-sm px-2.5 py-1 text-sm transition-colors",
							tab === key
								? "bg-secondary text-secondary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{label}
					</button>
				))}
			</div>
			<div className="min-h-0 flex-1">
				{tab === "layers" ? <LayersPanel variant="tree" /> : <AssetsPanel embedded />}
			</div>
		</div>
	);
}
