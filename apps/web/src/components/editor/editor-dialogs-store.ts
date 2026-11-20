import { create } from "zustand";

export type SettingsTab = "general" | "canvas" | "tools" | "keyboard";

/** Open state for the editor's app-level dialogs, so shortcuts and menus can open them. */
export const useEditorDialogs = create<{
	settingsOpen: boolean;
	settingsTab: SettingsTab;
	shortcutsOpen: boolean;
	openSettings: (tab?: SettingsTab) => void;
	setSettingsOpen: (open: boolean) => void;
	setSettingsTab: (tab: SettingsTab) => void;
	setShortcutsOpen: (open: boolean) => void;
}>()((set) => ({
	settingsOpen: false,
	settingsTab: "general",
	shortcutsOpen: false,
	openSettings: (tab) =>
		set((s) => ({ settingsOpen: true, shortcutsOpen: false, settingsTab: tab ?? s.settingsTab })),
	setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
	setSettingsTab: (settingsTab) => set({ settingsTab }),
	setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));
