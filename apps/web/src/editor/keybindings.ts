/**
 * Keyboard shortcuts as rebindable actions.
 *
 * A combo is a string like "Mod+Shift+Z": modifiers in the order
 * Mod, Alt, Shift, then one key. "Mod" is Ctrl on Windows/Linux and ⌘ on Mac.
 * Keys come from `KeyboardEvent.code`, so Shift+1 is "Shift+1" (not "!") and
 * bindings don't change with the keyboard layout's shifted characters.
 */

export type ActionGroup =
	| "Tools"
	| "Edit"
	| "Selection"
	| "Frames"
	| "Arrange"
	| "Align"
	| "Vector"
	| "View";

export type ActionId =
	| "tool.select"
	| "tool.hand"
	| "tool.frame"
	| "tool.rect"
	| "tool.ellipse"
	| "tool.line"
	| "tool.pen"
	| "tool.text"
	| "tool.brush"
	| "tool.eraser"
	| "tool.crop"
	| "tool.placeImage"
	| "brush.smaller"
	| "brush.bigger"
	| "edit.undo"
	| "edit.redo"
	| "edit.copy"
	| "edit.cut"
	| "edit.copySvg"
	| "edit.paste"
	| "edit.duplicate"
	| "edit.delete"
	| "edit.flipH"
	| "edit.flipV"
	| "edit.save"
	| "select.all"
	| "select.none"
	| "select.children"
	| "select.parent"
	| "frame.wrap"
	| "frame.remove"
	| "frame.fit"
	| "arrange.group"
	| "arrange.ungroup"
	| "arrange.forward"
	| "arrange.backward"
	| "arrange.front"
	| "arrange.back"
	| "layer.lock"
	| "layer.hide"
	| "align.left"
	| "align.center"
	| "align.right"
	| "align.top"
	| "align.middle"
	| "align.bottom"
	| "distribute.h"
	| "distribute.v"
	| "vector.flatten"
	| "vector.outlineStroke"
	| "vector.union"
	| "vector.subtract"
	| "vector.intersect"
	| "vector.exclude"
	| "view.zoomIn"
	| "view.zoomOut"
	| "view.zoomFit"
	| "view.zoom100"
	| "view.zoomSelection"
	| "view.pixelGrid"
	| "view.layoutGrids"
	| "view.export"
	| "view.settings"
	| "view.shortcuts";

export type ActionDef = {
	id: ActionId;
	label: string;
	group: ActionGroup;
	defaults: string[];
	/** Handled by the browser/OS (e.g. paste) or needed to escape; shown but not editable. */
	fixed?: boolean;
	/** Only meaningful in FreeForm projects. */
	freeformOnly?: boolean;
};

export const ACTIONS: ActionDef[] = [
	{ id: "tool.select", label: "Move tool", group: "Tools", defaults: ["V"] },
	{ id: "tool.hand", label: "Hand tool (or hold Space)", group: "Tools", defaults: ["H"] },
	{ id: "tool.frame", label: "Frame tool", group: "Tools", defaults: ["F", "A"], freeformOnly: true },
	{ id: "tool.rect", label: "Rectangle tool", group: "Tools", defaults: ["R"] },
	{ id: "tool.ellipse", label: "Ellipse tool", group: "Tools", defaults: ["O"] },
	{ id: "tool.line", label: "Line tool", group: "Tools", defaults: ["L"] },
	{ id: "tool.pen", label: "Pen tool", group: "Tools", defaults: ["P"], freeformOnly: true },
	{ id: "tool.text", label: "Text tool", group: "Tools", defaults: ["T"] },
	{ id: "tool.brush", label: "Brush", group: "Tools", defaults: ["B"] },
	{ id: "tool.eraser", label: "Eraser", group: "Tools", defaults: ["E"] },
	{ id: "tool.crop", label: "Crop selected image", group: "Tools", defaults: ["C"] },
	{ id: "tool.placeImage", label: "Place image", group: "Tools", defaults: ["Mod+Shift+K"] },
	{ id: "brush.smaller", label: "Decrease brush size", group: "Tools", defaults: ["["] },
	{ id: "brush.bigger", label: "Increase brush size", group: "Tools", defaults: ["]"] },

	{ id: "edit.undo", label: "Undo", group: "Edit", defaults: ["Mod+Z"] },
	{ id: "edit.redo", label: "Redo", group: "Edit", defaults: ["Mod+Shift+Z", "Mod+Y"] },
	{ id: "edit.copy", label: "Copy", group: "Edit", defaults: ["Mod+C"] },
	{ id: "edit.cut", label: "Cut", group: "Edit", defaults: ["Mod+X"] },
	{ id: "edit.copySvg", label: "Copy as SVG", group: "Edit", defaults: ["Mod+Shift+C"] },
	{ id: "edit.paste", label: "Paste layers, images or SVG", group: "Edit", defaults: ["Mod+V"], fixed: true },
	{ id: "edit.duplicate", label: "Duplicate", group: "Edit", defaults: ["Mod+D"] },
	{ id: "edit.delete", label: "Delete", group: "Edit", defaults: ["Delete", "Backspace"] },
	{ id: "edit.flipH", label: "Flip horizontal", group: "Edit", defaults: ["Shift+H"] },
	{ id: "edit.flipV", label: "Flip vertical", group: "Edit", defaults: ["Shift+V"] },
	{ id: "edit.save", label: "Save now", group: "Edit", defaults: ["Mod+S"] },

	{ id: "select.all", label: "Select all", group: "Selection", defaults: ["Mod+A"] },
	{ id: "select.none", label: "Deselect / cancel", group: "Selection", defaults: ["Escape"], fixed: true },
	{ id: "select.children", label: "Select contents / edit path or text", group: "Selection", defaults: ["Enter"] },
	{ id: "select.parent", label: "Select parent frame or group", group: "Selection", defaults: ["Shift+Enter", "\\"] },

	{ id: "frame.wrap", label: "Frame selection", group: "Frames", defaults: ["Mod+Alt+G"], freeformOnly: true },
	// Mod+Shift+G is "Ungroup", which also removes frames (like Figma).
	{ id: "frame.remove", label: "Remove frame (keep contents)", group: "Frames", defaults: [], freeformOnly: true },
	{ id: "frame.fit", label: "Resize frame to fit contents", group: "Frames", defaults: ["Mod+Alt+Shift+R"], freeformOnly: true },

	{ id: "arrange.group", label: "Group selection", group: "Arrange", defaults: ["Mod+G"] },
	{ id: "arrange.ungroup", label: "Ungroup / remove frame", group: "Arrange", defaults: ["Mod+Shift+G"] },
	{ id: "arrange.forward", label: "Bring forward", group: "Arrange", defaults: ["Mod+]"] },
	{ id: "arrange.backward", label: "Send backward", group: "Arrange", defaults: ["Mod+["] },
	{ id: "arrange.front", label: "Bring to front", group: "Arrange", defaults: ["Mod+Shift+]"] },
	{ id: "arrange.back", label: "Send to back", group: "Arrange", defaults: ["Mod+Shift+["] },
	{ id: "layer.lock", label: "Lock / unlock", group: "Arrange", defaults: ["Mod+Shift+L", "Mod+L"] },
	{ id: "layer.hide", label: "Hide / show", group: "Arrange", defaults: ["Mod+Shift+H"] },

	{ id: "align.left", label: "Align left", group: "Align", defaults: ["Alt+A"] },
	{ id: "align.center", label: "Align horizontal centers", group: "Align", defaults: ["Alt+H"] },
	{ id: "align.right", label: "Align right", group: "Align", defaults: ["Alt+D"] },
	{ id: "align.top", label: "Align top", group: "Align", defaults: ["Alt+W"] },
	{ id: "align.middle", label: "Align vertical centers", group: "Align", defaults: ["Alt+V"] },
	{ id: "align.bottom", label: "Align bottom", group: "Align", defaults: ["Alt+S"] },
	{ id: "distribute.h", label: "Distribute horizontally", group: "Align", defaults: ["Alt+Shift+H"] },
	{ id: "distribute.v", label: "Distribute vertically", group: "Align", defaults: ["Alt+Shift+V"] },

	{ id: "vector.flatten", label: "Flatten / convert to path (else Export)", group: "Vector", defaults: ["Mod+E"] },
	{ id: "vector.outlineStroke", label: "Outline stroke", group: "Vector", defaults: ["Mod+Alt+O"] },
	{ id: "vector.union", label: "Union selection", group: "Vector", defaults: ["Alt+Shift+U"] },
	{ id: "vector.subtract", label: "Subtract selection", group: "Vector", defaults: ["Alt+Shift+S"] },
	{ id: "vector.intersect", label: "Intersect selection", group: "Vector", defaults: ["Alt+Shift+I"] },
	{ id: "vector.exclude", label: "Exclude selection", group: "Vector", defaults: ["Alt+Shift+E"] },

	{ id: "view.zoomIn", label: "Zoom in", group: "View", defaults: ["Mod+=", "Mod+Shift+="] },
	{ id: "view.zoomOut", label: "Zoom out", group: "View", defaults: ["Mod+-"] },
	{ id: "view.zoomFit", label: "Zoom to fit", group: "View", defaults: ["Shift+1", "Mod+0"] },
	{ id: "view.zoom100", label: "Zoom to 100%", group: "View", defaults: ["Shift+0", "Mod+1"] },
	{ id: "view.zoomSelection", label: "Zoom to selection", group: "View", defaults: ["Shift+2"] },
	{ id: "view.pixelGrid", label: "Toggle pixel grid", group: "View", defaults: ["Shift+'"] },
	{ id: "view.layoutGrids", label: "Toggle layout grids", group: "View", defaults: ["Shift+G"], freeformOnly: true },
	// Mod+E is Flatten (Figma); it still opens Export when there's nothing to flatten.
	{ id: "view.export", label: "Export", group: "View", defaults: ["Mod+Shift+E"] },
	{ id: "view.settings", label: "Settings", group: "View", defaults: ["Mod+,"] },
	{ id: "view.shortcuts", label: "Keyboard shortcuts", group: "View", defaults: ["Mod+/"] },
];

export const ACTION_GROUPS: ActionGroup[] = [
	"Tools",
	"Edit",
	"Selection",
	"Frames",
	"Arrange",
	"Align",
	"Vector",
	"View",
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function getAction(id: ActionId) {
	return BY_ID.get(id);
}

/** Effective combos for an action, given the user's overrides. */
export function bindingsFor(id: ActionId, overrides: Record<string, string[]>): string[] {
	const action = BY_ID.get(id);
	if (!action) return [];
	if (action.fixed) return action.defaults;
	return overrides[id] ?? action.defaults;
}

/** Combo → action, for every action's effective bindings. Later duplicates lose. */
export function buildKeymap(overrides: Record<string, string[]>): Map<string, ActionId> {
	const map = new Map<string, ActionId>();
	for (const action of ACTIONS) {
		for (const combo of bindingsFor(action.id, overrides)) {
			if (!map.has(combo)) map.set(combo, action.id);
		}
	}
	return map;
}

/** Other actions already using a combo. */
export function conflictsFor(
	combo: string,
	overrides: Record<string, string[]>,
	except?: ActionId,
): ActionDef[] {
	return ACTIONS.filter(
		(a) => a.id !== except && bindingsFor(a.id, overrides).includes(combo),
	);
}

const CODE_KEYS: Record<string, string> = {
	BracketLeft: "[",
	BracketRight: "]",
	Minus: "-",
	Equal: "=",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Backquote: "`",
	Enter: "Enter",
	NumpadEnter: "Enter",
	Escape: "Escape",
	Delete: "Delete",
	Backspace: "Backspace",
	Tab: "Tab",
	ArrowUp: "ArrowUp",
	ArrowDown: "ArrowDown",
	ArrowLeft: "ArrowLeft",
	ArrowRight: "ArrowRight",
	Home: "Home",
	End: "End",
	PageUp: "PageUp",
	PageDown: "PageDown",
	NumpadAdd: "=",
	NumpadSubtract: "-",
};

type KeyLike = Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/** The key part of a combo, or null for modifier-only / unsupported keys. */
export function keyFromEvent(event: Pick<KeyboardEvent, "code" | "key">): string | null {
	const { code } = event;
	if (/^Key[A-Z]$/.test(code)) return code.slice(3);
	if (/^Digit\d$/.test(code)) return code.slice(5);
	if (/^Numpad\d$/.test(code)) return code.slice(6);
	if (/^F\d{1,2}$/.test(code)) return code;
	if (CODE_KEYS[code]) return CODE_KEYS[code];
	// Fallback for synthetic events without a code.
	if (!code && event.key && event.key.length === 1) return event.key.toUpperCase();
	return null;
}

export function comboFromEvent(event: KeyLike): string | null {
	const key = keyFromEvent(event);
	if (!key) return null;
	const parts: string[] = [];
	if (event.ctrlKey || event.metaKey) parts.push("Mod");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey) parts.push("Shift");
	parts.push(key);
	return parts.join("+");
}

export function isMacPlatform() {
	return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

const KEY_LABELS: Record<string, string> = {
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
	Escape: "Esc",
	Delete: "Del",
	Backspace: "⌫",
	Enter: "↵",
};

/** Splits a combo into display labels, e.g. ["Ctrl", "Shift", "Z"] or ["⌘", "⇧", "Z"]. */
export function comboParts(combo: string, mac = isMacPlatform()): string[] {
	// "+" never appears as a key (Equal is "="), so splitting is safe.
	return combo.split("+").map((part) => {
		if (part === "Mod") return mac ? "⌘" : "Ctrl";
		if (part === "Alt") return mac ? "⌥" : "Alt";
		if (part === "Shift") return mac ? "⇧" : "Shift";
		return KEY_LABELS[part] ?? part;
	});
}

export function formatCombo(combo: string, mac = isMacPlatform()) {
	return comboParts(combo, mac).join(mac ? "" : "+");
}
