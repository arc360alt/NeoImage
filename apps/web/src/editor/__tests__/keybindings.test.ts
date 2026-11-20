import { describe, expect, test } from "bun:test";
import {
	ACTIONS,
	bindingsFor,
	buildKeymap,
	comboFromEvent,
	comboParts,
	conflictsFor,
} from "../keybindings";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
	code,
	key: "",
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	shiftKey: false,
	...mods,
});

describe("comboFromEvent", () => {
	test("letters, digits and modifiers", () => {
		expect(comboFromEvent(key("KeyV"))).toBe("V");
		expect(comboFromEvent(key("KeyZ", { ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+Z");
		expect(comboFromEvent(key("KeyZ", { metaKey: true }))).toBe("Mod+Z");
		// Shift+1 stays "1", not "!".
		expect(comboFromEvent(key("Digit1", { shiftKey: true }))).toBe("Shift+1");
		expect(comboFromEvent(key("KeyG", { ctrlKey: true, altKey: true }))).toBe("Mod+Alt+G");
	});

	test("punctuation uses the unshifted key", () => {
		expect(comboFromEvent(key("BracketRight", { ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+]");
		expect(comboFromEvent(key("Quote", { shiftKey: true }))).toBe("Shift+'");
	});

	test("modifier-only and Space are ignored", () => {
		expect(comboFromEvent(key("ShiftLeft", { shiftKey: true }))).toBeNull();
		expect(comboFromEvent(key("ControlLeft", { ctrlKey: true }))).toBeNull();
		expect(comboFromEvent(key("Space"))).toBeNull();
	});
});

describe("keymap", () => {
	test("default bindings don't collide", () => {
		const seen = new Map<string, string>();
		for (const action of ACTIONS) {
			for (const combo of action.defaults) {
				expect(seen.get(combo)).toBeUndefined();
				seen.set(combo, action.id);
			}
		}
	});

	test("overrides replace defaults; fixed actions ignore overrides", () => {
		const overrides = { "tool.rect": ["Mod+Alt+R"], "edit.paste": ["P"] };
		expect(bindingsFor("tool.rect", overrides)).toEqual(["Mod+Alt+R"]);
		expect(bindingsFor("edit.paste", overrides)).toEqual(["Mod+V"]);
		const map = buildKeymap(overrides);
		expect(map.get("R")).toBeUndefined();
		expect(map.get("Mod+Alt+R")).toBe("tool.rect");
		expect(map.get("Shift+2")).toBe("view.zoomSelection");
	});

	test("conflicts", () => {
		expect(conflictsFor("V", {}).map((a) => a.id)).toEqual(["tool.select"]);
		expect(conflictsFor("V", {}, "tool.select")).toEqual([]);
	});

	test("display", () => {
		expect(comboParts("Mod+Shift+Z", false)).toEqual(["Ctrl", "Shift", "Z"]);
		expect(comboParts("Mod+Shift+Z", true)).toEqual(["⌘", "⇧", "Z"]);
	});
});
