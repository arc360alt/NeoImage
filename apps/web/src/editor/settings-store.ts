import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Editor preferences. Stored per browser, shared by every project. */
export type EditorSettings = {
	/* View */
	showDotGrid: boolean;
	/** Figma-style 1px grid once you zoom in far enough. */
	showPixelGrid: boolean;
	showLayoutGrids: boolean;
	showFrameNames: boolean;
	/** "pan": wheel scrolls, Ctrl+wheel zooms (Figma). "zoom": wheel zooms. */
	wheelBehavior: "pan" | "zoom";
	zoomSpeed: number;

	/* Snapping & movement */
	snapToObjects: boolean;
	/** On-screen distance (px) at which layers snap to each other. */
	snapThreshold: number;
	/** Round positions and sizes to whole pixels after moves and resizes. */
	snapToPixels: boolean;
	nudge: number;
	bigNudge: number;
	/** Rotation snaps to multiples of this angle (Shift forces it). 0 = off. */
	rotationSnap: number;

	/* Tools */
	/** Keep the creation tool selected after drawing, instead of going back to Move. */
	keepToolActive: boolean;
	shapeFill: string;
	lineColor: string;
	lineWidth: number;
	textFont: string;
	textSize: number;
	textColor: string;
	frameFill: string;
	frameWidth: number;
	frameHeight: number;
	frameClip: boolean;

	/** Keyboard overrides: action id → combos. Missing ids use the defaults. */
	keybindings: Record<string, string[]>;
};

export const DEFAULT_SETTINGS: EditorSettings = {
	showDotGrid: true,
	showPixelGrid: true,
	showLayoutGrids: true,
	showFrameNames: true,
	wheelBehavior: "pan",
	zoomSpeed: 1,

	snapToObjects: true,
	snapThreshold: 6,
	snapToPixels: true,
	nudge: 1,
	bigNudge: 10,
	rotationSnap: 15,

	keepToolActive: false,
	shapeFill: "#d9d9d9",
	lineColor: "#111111",
	lineWidth: 4,
	textFont: "Inter",
	textSize: 48,
	textColor: "#111111",
	frameFill: "#ffffff",
	frameWidth: 400,
	frameHeight: 300,
	frameClip: true,

	keybindings: {},
};

interface SettingsStore extends EditorSettings {
	set: (patch: Partial<EditorSettings>) => void;
	setKeybinding: (actionId: string, combos: string[]) => void;
	resetKeybinding: (actionId: string) => void;
	resetKeybindings: () => void;
	resetAll: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
	persist(
		(set) => ({
			...DEFAULT_SETTINGS,
			set: (patch) => set(patch),
			setKeybinding: (actionId, combos) =>
				set((s) => ({ keybindings: { ...s.keybindings, [actionId]: combos } })),
			resetKeybinding: (actionId) =>
				set((s) => {
					const { [actionId]: _removed, ...rest } = s.keybindings;
					return { keybindings: rest };
				}),
			resetKeybindings: () => set({ keybindings: {} }),
			resetAll: () => set({ ...DEFAULT_SETTINGS }),
		}),
		{
			name: "neoimage-settings",
			version: 1,
			// New settings added later fall back to their defaults.
			merge: (persisted, current) => ({ ...current, ...(persisted as Partial<EditorSettings>) }),
		},
	),
);

export const getSettings = () => useSettingsStore.getState();
