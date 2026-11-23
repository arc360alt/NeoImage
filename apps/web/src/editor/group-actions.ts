/**
 * Groups: Ctrl/Cmd+G, Ctrl/Cmd+Shift+G and Figma-style click targeting.
 * Works in both project modes (Default mode has no frames, so groups are the
 * only containers there).
 */
import { toast } from "sonner";
import { getEditor } from "./store";
import { createGroupLayer } from "./defaults";
import { ancestorsOf, childrenOf, descendantsOf, layerBounds, topmostIds, unionBounds } from "./freeform";
import { rectToRect, scaleAround, transformDescendants } from "./transform";
import type { Matrix } from "./matrix";
import type { Layer } from "./types";

function nextGroupName(layers: Layer[]) {
	const used = new Set(layers.filter((l) => l.type === "group").map((l) => l.name));
	let n = layers.filter((l) => l.type === "group").length + 1;
	while (used.has(`Group ${n}`)) n++;
	return `Group ${n}`;
}

/**
 * Wraps layers in a new group (pure, for tests): the group takes the place of
 * the top-most layer, inside that layer's parent.
 */
export function groupLayers(layers: Layer[], ids: string[]): { layers: Layer[]; groupId: string } | null {
	const roots = topmostIds(layers, ids).filter((id) => layers.find((l) => l.id === id)?.type !== "frame");
	if (roots.length === 0) return null;
	const set = new Set(roots);
	const indices = layers.map((l, i) => (set.has(l.id) ? i : -1)).filter((i) => i >= 0);
	const top = layers[indices[indices.length - 1]];
	const group = createGroupLayer({ name: nextGroupName(layers), parentId: top.parentId });
	const next = layers.map((l) => (set.has(l.id) ? ({ ...l, parentId: group.id } as Layer) : l));
	// Right after the top-most member, so it keeps that stacking position.
	next.splice(indices[indices.length - 1] + 1, 0, group);
	return { layers: next, groupId: group.id };
}

/** Dissolves groups (pure): children move up into the group's parent at the group's place. */
export function ungroupLayers(layers: Layer[], groupIds: string[]): { layers: Layer[]; freed: string[] } {
	let next = layers;
	const freed: string[] = [];
	for (const id of groupIds) {
		const group = next.find((l) => l.id === id);
		if (group?.type !== "group") continue;
		const kids = childrenOf(next, id);
		const kidIds = new Set(kids.map((k) => k.id));
		freed.push(...kids.map((k) => k.id));
		const rest = next.filter((l) => l.id !== id && !kidIds.has(l.id));
		const at = next.filter((l, i) => i < next.indexOf(group) && l.id !== id && !kidIds.has(l.id)).length;
		const moved = kids.map(
			(k) =>
				({
					...k,
					parentId: group.parentId,
					// The group's opacity carries over so nothing changes on screen.
					opacity: k.opacity * group.opacity,
					visible: k.visible && group.visible,
				}) as Layer,
		);
		next = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
	}
	return { layers: next, freed };
}

export function groupSelection() {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc || editor.selectedIds.length === 0) return;
	if (editor.selectedIds.every((id) => doc.layers.find((l) => l.id === id)?.type === "frame")) {
		toast.info("Frames can't be grouped. Use Frame selection to put them in a frame instead");
		return;
	}
	const result = groupLayers(doc.layers, editor.selectedIds);
	if (!result) return;
	editor.transformLayers(() => result.layers);
	editor.select([result.groupId]);
}

/** Ctrl/Cmd+Shift+G: ungroups groups and removes frames (keeping their contents). */
export function ungroupSelection() {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return;
	const groupIds = editor.selectedIds.filter((id) => doc.layers.find((l) => l.id === id)?.type === "group");
	const frameIds = new Set(
		editor.selectedIds.filter((id) => doc.layers.find((l) => l.id === id)?.type === "frame"),
	);
	if (groupIds.length === 0 && frameIds.size === 0) return;
	const { layers, freed } = ungroupLayers(doc.layers, groupIds);
	const freedFromFrames = layers.filter((l) => l.parentId && frameIds.has(l.parentId)).map((l) => l.id);
	editor.transformLayers(() =>
		layers
			.filter((l) => !frameIds.has(l.id))
			.map((l) => (l.parentId && frameIds.has(l.parentId) ? ({ ...l, parentId: undefined } as Layer) : l)),
	);
	const kept = editor.selectedIds.filter((id) => !groupIds.includes(id) && !frameIds.has(id));
	editor.select([...kept, ...freed, ...freedFromFrames]);
}

/* ------------------------------ Click targets ----------------------------- */

/** Groups that the selection is "inside": clicks within them reach their children. */
export function enteredGroups(layers: Layer[], selectedIds: string[]) {
	const out = new Set<string>();
	for (const id of selectedIds) {
		for (const a of ancestorsOf(layers, id)) if (a.type === "group") out.add(a.id);
	}
	return out;
}

/** `hit` plus its chain of enclosing groups, innermost first (stops at frames). */
function groupChain(layers: Layer[], hitId: string) {
	const chain = [hitId];
	for (const a of ancestorsOf(layers, hitId)) {
		if (a.type !== "group") break;
		chain.push(a.id);
	}
	return chain;
}

/**
 * Figma's click rule: a click selects the top-most group around what was hit,
 * unless the selection is already inside that group, in which case it goes
 * one level deeper. `deep` (Ctrl/Cmd-click) selects the hit layer directly.
 */
export function clickTarget(layers: Layer[], hitId: string, selectedIds: string[], deep = false) {
	if (deep) return hitId;
	const chain = groupChain(layers, hitId);
	const entered = enteredGroups(layers, selectedIds);
	let i = chain.length - 1;
	while (i > 0 && entered.has(chain[i])) i--;
	return chain[i];
}

/** Double-click: one level deeper than the current selection along the hit's group chain. */
export function doubleClickTarget(layers: Layer[], hitId: string, selectedIds: string[]) {
	const chain = groupChain(layers, hitId);
	const idx = chain.findIndex((id) => selectedIds.includes(id));
	if (idx > 0) return chain[idx - 1];
	if (idx === 0) return hitId;
	return clickTarget(layers, hitId, selectedIds);
}

/** A layer can be dragged directly when every group around it has been entered. */
export function isReachable(layers: Layer[], id: string, entered: Set<string>) {
	for (const a of ancestorsOf(layers, id)) {
		if (a.type !== "group") break;
		if (!entered.has(a.id)) return false;
	}
	return true;
}

/* ---------------------------- Group transforms ---------------------------- */

export function groupBounds(layers: Layer[], groupId: string) {
	const leaves = descendantsOf(layers, groupId).filter((l) => l.type !== "group" && l.visible);
	return unionBounds(leaves.map((l) => layerBounds(l, layers)));
}

/** Applies a world-space matrix to everything in a group, as one undo step (or transient). */
export function transformGroup(groupId: string, m: Matrix, options?: { transient?: boolean }) {
	const editor = getEditor();
	const doc = editor.doc;
	if (!doc) return;
	editor.updateLayers(transformDescendants(doc.layers, groupId, m), options);
}

/** Resize/move a group from the properties panel. */
export function setGroupBox(
	groupId: string,
	box: Partial<{ x: number; y: number; width: number; height: number }>,
	options?: { transient?: boolean },
) {
	const doc = getEditor().doc;
	if (!doc) return;
	const from = groupBounds(doc.layers, groupId);
	if (!from) return;
	const to = { ...from, ...box };
	transformGroup(groupId, rectToRect(from, to), options);
}

export function flipGroup(groupId: string, axis: "x" | "y") {
	const doc = getEditor().doc;
	if (!doc) return;
	const b = groupBounds(doc.layers, groupId);
	if (!b) return;
	const m = scaleAround(axis === "x" ? -1 : 1, axis === "y" ? -1 : 1, b.x + b.width / 2, b.y + b.height / 2);
	transformGroup(groupId, m);
}
