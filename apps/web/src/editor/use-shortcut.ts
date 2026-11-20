"use client";

import { bindingsFor, formatCombo, type ActionId } from "./keybindings";
import { useSettingsStore } from "./settings-store";

/** The first combo bound to an action, formatted for display (e.g. "Ctrl+D" / "⌘D"). */
export function useShortcut(id: ActionId): string | undefined {
	const overrides = useSettingsStore((s) => s.keybindings);
	const combo = bindingsFor(id, overrides)[0];
	return combo ? formatCombo(combo) : undefined;
}
