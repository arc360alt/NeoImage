import { create } from "zustand";
import { persist } from "zustand/middleware";

type PanelKey = "tools" | "preview" | "properties" | "mainContent" | "layers";

interface PanelStore {
	panels: Record<PanelKey, number>;
	setPanel: (args: { panel: PanelKey; size: number }) => void;
}

export const usePanelStore = create<PanelStore>()(
	persist(
		(set) => ({
			panels: {
				tools: 24,
				preview: 52,
				properties: 24,
				mainContent: 72,
				layers: 28,
			},
			setPanel: ({ panel, size }) =>
				set((s) => ({ panels: { ...s.panels, [panel]: size } })),
		}),
		{ name: "openimage-panel-sizes" },
	),
);
