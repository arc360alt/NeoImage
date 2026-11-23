import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { nanoid } from "nanoid";
import type {
	AssetMeta,
	BrushSettings,
	CanvasSettings,
	Layer,
	ProjectDoc,
	Tool,
} from "./types";
import { getProject, saveProject } from "@/storage/projects";
import { listAssets } from "@/storage/assets";
import { descendantsOf, isFreeform, isInside, layerBounds, parentFor, topmostIds } from "./freeform";
import { resizePath } from "./path";

type Snapshot = { canvas: CanvasSettings; layers: Layer[] };

const HISTORY_LIMIT = 100;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type LayerPatch = { id: string; patch: Partial<Layer> };

interface EditorState {
	projectId: string | null;
	doc: ProjectDoc | null;
	assets: AssetMeta[];
	isLoading: boolean;
	loadError: string | null;
	saveStatus: SaveStatus;
	/** Bumped on every document change; used by autosave. */
	revision: number;

	selectedIds: string[];
	tool: Tool;
	brush: BrushSettings;
	cropLayerId: string | null;
	editingTextId: string | null;
	/** Path in point-edit mode (double-click a path, Esc to leave). */
	editingPathId: string | null;
	/** Selected anchors while editing a path, as "subpath:anchor" keys. */
	selectedPoints: string[];

	zoom: number;
	/** Bumped to ask the canvas to re-fit the artboard into view. */
	fitRequest: number;
	/** Optional world-space rect to fit instead of the whole document. */
	fitTarget: { x: number; y: number; width: number; height: number } | null;

	past: Snapshot[];
	future: Snapshot[];
	pending: Snapshot | null;

	clipboard: Layer[];

	loadProject: (id: string) => Promise<void>;
	closeProject: () => void;
	saveNow: () => Promise<void>;
	setThumbnail: (thumbnail: string) => void;
	renameProject: (name: string) => void;

	refreshAssets: () => Promise<void>;
	addAssetMeta: (asset: AssetMeta) => void;
	removeAssetMeta: (id: string) => void;

	setTool: (tool: Tool) => void;
	setBrush: (patch: Partial<BrushSettings>) => void;
	setZoom: (zoom: number) => void;
	requestFit: (target?: { x: number; y: number; width: number; height: number }) => void;
	setCropLayerId: (id: string | null) => void;
	setEditingTextId: (id: string | null) => void;
	setEditingPathId: (id: string | null) => void;
	setSelectedPoints: (keys: string[]) => void;

	select: (ids: string[]) => void;
	toggleSelect: (id: string) => void;
	clearSelection: () => void;
	selectAll: () => void;

	/** Pushes the current state to history unless a transient edit is pending. */
	checkpoint: () => void;
	/** Commits a transient (slider / drag) edit to history. */
	commit: () => void;
	undo: () => void;
	redo: () => void;

	addLayers: (layers: Layer[], options?: { select?: boolean }) => void;
	updateLayer: (
		id: string,
		patch: Partial<Layer>,
		options?: { transient?: boolean },
	) => void;
	updateLayers: (
		patches: LayerPatch[],
		options?: { transient?: boolean },
	) => void;
	removeLayers: (ids: string[]) => void;
	duplicateLayers: (ids: string[]) => void;
	/** Moves a layer in the stack. `parentId: null` takes it out of its frame. */
	reorderLayer: (id: string, toIndex: number, parentId?: string | null) => void;
	moveLayers: (ids: string[], direction: "up" | "down" | "top" | "bottom") => void;
	/** FreeForm: re-evaluate which frame each layer belongs to. */
	reparentLayers: (ids: string[]) => void;
	/** Replaces the layer list in one history step (for multi-part edits like framing). */
	transformLayers: (fn: (layers: Layer[]) => Layer[]) => void;
	updateCanvas: (
		patch: Partial<CanvasSettings>,
		options?: { transient?: boolean },
	) => void;
	replaceDocument: (snapshot: Snapshot) => void;

	copy: () => void;
	cut: () => void;
	paste: () => void;
}

function snapshotOf(doc: ProjectDoc): Snapshot {
	return { canvas: doc.canvas, layers: doc.layers };
}

/**
 * Applies a patch, keeping derived geometry in sync: resizing a path (from
 * the properties panel, flips, etc.) scales its anchors to the new size.
 */
function patchLayer(layer: Layer, patch: Partial<Layer>): Layer {
	if (
		layer.type === "path" &&
		!("subpaths" in patch) &&
		(("width" in patch && patch.width !== layer.width) || ("height" in patch && patch.height !== layer.height))
	) {
		const p = patch as Partial<typeof layer>;
		const width = p.width ?? layer.width;
		const height = p.height ?? layer.height;
		return { ...layer, ...p, subpaths: resizePath(layer, width, height) };
	}
	return { ...layer, ...patch } as Layer;
}

function cloneLayer(layer: Layer): Layer {
	return structuredClone(layer);
}

export const useEditorStore = create<EditorState>()((set, get) => {
	const mutateDoc = (
		recipe: (doc: ProjectDoc) => Partial<ProjectDoc>,
		options: { transient?: boolean } = {},
	) => {
		const { doc } = get();
		if (!doc) return;
		if (options.transient) {
			if (!get().pending) set({ pending: snapshotOf(doc) });
		} else {
			get().checkpoint();
		}
		const next = { ...doc, ...recipe(doc), updatedAt: Date.now() };
		set((s) => ({ doc: next, revision: s.revision + 1 }));
	};

	return {
		projectId: null,
		doc: null,
		assets: [],
		isLoading: false,
		loadError: null,
		saveStatus: "idle",
		revision: 0,

		selectedIds: [],
		tool: "select",
		brush: { color: "#ef4444", size: 16, opacity: 1, mode: "brush" },
		cropLayerId: null,
		editingTextId: null,
		editingPathId: null,
		selectedPoints: [],

		zoom: 1,
		fitRequest: 0,
		fitTarget: null,

		past: [],
		future: [],
		pending: null,

		clipboard: [],

		loadProject: async (id) => {
			set({
				isLoading: true,
				loadError: null,
				projectId: id,
				doc: null,
				selectedIds: [],
				past: [],
				future: [],
				pending: null,
				cropLayerId: null,
				editingTextId: null,
				editingPathId: null,
				selectedPoints: [],
				tool: "select",
			});
			try {
				const [doc, assets] = await Promise.all([
					getProject(id),
					listAssets({ projectId: id }),
				]);
				if (get().projectId !== id) return;
				if (!doc) {
					set({ isLoading: false, loadError: "Project not found" });
					return;
				}
				set({
					doc,
					assets,
					isLoading: false,
					saveStatus: "saved",
					fitRequest: get().fitRequest + 1,
				});
			} catch (error) {
				set({
					isLoading: false,
					loadError:
						error instanceof Error ? error.message : "Failed to load project",
				});
			}
		},

		closeProject: () =>
			set({
				projectId: null,
				doc: null,
				assets: [],
				selectedIds: [],
				past: [],
				future: [],
				pending: null,
				cropLayerId: null,
				editingTextId: null,
				editingPathId: null,
				selectedPoints: [],
			}),

		saveNow: async () => {
			const { doc } = get();
			if (!doc) return;
			set({ saveStatus: "saving" });
			try {
				await saveProject(doc);
				// Only mark saved if nothing changed while we were writing.
				if (get().doc === doc) set({ saveStatus: "saved" });
			} catch (error) {
				console.error("Failed to save project", error);
				set({ saveStatus: "error" });
			}
		},

		setThumbnail: (thumbnail) => {
			const { doc } = get();
			if (!doc) return;
			// Thumbnails are not part of history and don't bump the revision.
			const next = { ...doc, thumbnail };
			set({ doc: next });
			void saveProject(next).catch(() => {});
		},

		renameProject: (name) => {
			const { doc } = get();
			if (!doc) return;
			set((s) => ({
				doc: { ...doc, name, updatedAt: Date.now() },
				revision: s.revision + 1,
			}));
		},

		refreshAssets: async () => {
			const { projectId } = get();
			if (!projectId) return;
			const assets = await listAssets({ projectId });
			set({ assets });
		},
		addAssetMeta: (asset) => set((s) => ({ assets: [asset, ...s.assets] })),
		removeAssetMeta: (id) =>
			set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),

		setTool: (tool) => {
			const { cropLayerId, editingTextId } = get();
			set({
				tool,
				cropLayerId: tool === "crop" ? cropLayerId : null,
				editingTextId: tool === "select" ? editingTextId : null,
				editingPathId: tool === "select" ? get().editingPathId : null,
				selectedPoints: tool === "select" ? get().selectedPoints : [],
			});
		},
		setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
		setZoom: (zoom) => set({ zoom: Math.min(32, Math.max(0.02, zoom)) }),
		requestFit: (target) =>
			set((s) => ({ fitRequest: s.fitRequest + 1, fitTarget: target ?? null })),
		setCropLayerId: (id) =>
			set({ cropLayerId: id, tool: id ? "crop" : "select" }),
		setEditingTextId: (id) => set({ editingTextId: id }),
		setEditingPathId: (id) =>
			set((s) => ({
				editingPathId: id,
				selectedPoints: [],
				selectedIds: id ? [id] : s.selectedIds,
				editingTextId: id ? null : s.editingTextId,
			})),
		setSelectedPoints: (keys) => set({ selectedPoints: keys }),

		select: (ids) => set({ selectedIds: ids }),
		toggleSelect: (id) =>
			set((s) => ({
				selectedIds: s.selectedIds.includes(id)
					? s.selectedIds.filter((x) => x !== id)
					: [...s.selectedIds, id],
			})),
		clearSelection: () => set({ selectedIds: [] }),
		selectAll: () => {
			const { doc } = get();
			if (!doc) return;
			const ids = new Set(doc.layers.map((l) => l.id));
			set({
				selectedIds: doc.layers
					// Top-level only: frame and group contents come along with their parent.
					.filter((l) => l.visible && !l.locked && !(l.parentId && ids.has(l.parentId)))
					.map((l) => l.id),
			});
		},

		checkpoint: () => {
			const { doc, pending } = get();
			if (!doc) return;
			const snapshot = pending ?? snapshotOf(doc);
			set((s) => ({
				past: [...s.past, snapshot].slice(-HISTORY_LIMIT),
				future: [],
				pending: null,
			}));
		},

		commit: () => {
			const { pending, doc } = get();
			if (!pending || !doc) return;
			const changed =
				pending.layers !== doc.layers || pending.canvas !== doc.canvas;
			set((s) => ({
				past: changed ? [...s.past, pending].slice(-HISTORY_LIMIT) : s.past,
				future: changed ? [] : s.future,
				pending: null,
			}));
		},

		undo: () => {
			get().commit();
			const { past, doc } = get();
			const previous = past[past.length - 1];
			if (!previous || !doc) return;
			set((s) => ({
				past: past.slice(0, -1),
				future: [snapshotOf(doc), ...s.future].slice(0, HISTORY_LIMIT),
				doc: { ...doc, ...previous, updatedAt: Date.now() },
				revision: s.revision + 1,
				selectedIds: s.selectedIds.filter((id) =>
					previous.layers.some((l) => l.id === id),
				),
				cropLayerId: null,
				editingPathId: previous.layers.some((l) => l.id === s.editingPathId) ? s.editingPathId : null,
				selectedPoints: [],
			}));
		},

		redo: () => {
			const { future, doc } = get();
			const next = future[0];
			if (!next || !doc) return;
			set((s) => ({
				future: future.slice(1),
				past: [...s.past, snapshotOf(doc)].slice(-HISTORY_LIMIT),
				doc: { ...doc, ...next, updatedAt: Date.now() },
				revision: s.revision + 1,
				selectedIds: s.selectedIds.filter((id) =>
					next.layers.some((l) => l.id === id),
				),
				cropLayerId: null,
				editingPathId: next.layers.some((l) => l.id === s.editingPathId) ? s.editingPathId : null,
				selectedPoints: [],
			}));
		},

		addLayers: (layers, options = {}) => {
			if (layers.length === 0) return;
			mutateDoc((doc) => {
				if (!isFreeform(doc)) return { layers: [...doc.layers, ...layers] };
				// FreeForm: new layers join the frame they're dropped into.
				const all = [...doc.layers, ...layers];
				const placed = layers.map((layer) =>
					layer.type === "frame" || layer.parentId !== undefined
						? layer
						: ({ ...layer, parentId: parentFor(all, layer) } as Layer),
				);
				return { layers: [...doc.layers, ...placed] };
			});
			if (options.select !== false) {
				set({ selectedIds: layers.map((l) => l.id), tool: "select" });
			}
		},

		updateLayer: (id, patch, options) =>
			get().updateLayers([{ id, patch }], options),

		updateLayers: (patches, options) => {
			const layersNow = get().doc?.layers ?? [];
			const byId = new Map(patches.map((p) => [p.id, p.patch]));
			// Groups stay at the origin: moving one moves everything inside it.
			for (const { id, patch } of patches) {
				const layer = layersNow.find((l) => l.id === id);
				if (layer?.type !== "group" || (patch.x === undefined && patch.y === undefined)) continue;
				const dx = (patch.x ?? layer.x) - layer.x;
				const dy = (patch.y ?? layer.y) - layer.y;
				const { x: _x, y: _y, ...rest } = patch;
				byId.set(id, rest);
				if (dx === 0 && dy === 0) continue;
				for (const child of descendantsOf(layersNow, id)) {
					if (child.type === "group") continue;
					const own = byId.get(child.id) ?? {};
					byId.set(child.id, { ...own, x: (own.x ?? child.x) + dx, y: (own.y ?? child.y) + dy });
				}
			}
			mutateDoc(
				(doc) => ({
					layers: doc.layers.map((layer) => {
						const patch = byId.get(layer.id);
						return patch ? patchLayer(layer, patch) : layer;
					}),
				}),
				options,
			);
		},

		removeLayers: (ids) => {
			if (ids.length === 0) return;
			const layersNow = get().doc?.layers ?? [];
			// Deleting a frame or group deletes everything inside it.
			const idSet = new Set(ids);
			for (const id of ids) {
				for (const child of descendantsOf(layersNow, id)) idSet.add(child.id);
			}
			mutateDoc((doc) => ({
				layers: doc.layers.filter((l) => !idSet.has(l.id)),
			}));
			set((s) => ({
				selectedIds: s.selectedIds.filter((id) => !idSet.has(id)),
				cropLayerId: s.cropLayerId && idSet.has(s.cropLayerId) ? null : s.cropLayerId,
			}));
		},

		duplicateLayers: (ids) => {
			const { doc } = get();
			if (!doc || ids.length === 0) return;
			// Duplicating a frame or group duplicates what's inside it; nested picks are covered.
			const roots = new Set(topmostIds(doc.layers, ids));
			const newIds: string[] = [];
			mutateDoc((d) => {
				const layers: Layer[] = [];
				const frameCopies: Layer[] = [];
				// Duplicated frames move as a group into free space right of all content.
				const dupFrames = d.layers.filter((l) => roots.has(l.id) && l.type === "frame");
				const contentRight = Math.max(
					...d.layers
						.filter((l) => l.type === "frame" || !l.parentId)
						.map((l) => {
							const b = layerBounds(l, d.layers);
							return b.x + b.width;
						}),
				);
				const groupLeft = Math.min(...dupFrames.map((l) => l.x));
				const frameDx = dupFrames.length ? contentRight + 80 - groupLeft : 0;
				/** Copies a layer and its subtree, offset by (dx, dy); groups stay at 0. */
				const copyTree = (layer: Layer, dx: number, dy: number) => {
					const idMap = new Map<string, string>();
					const tree = [layer, ...descendantsOf(d.layers, layer.id)];
					for (const l of tree) idMap.set(l.id, nanoid(10));
					// Keep the original stacking order inside the copy.
					const ordered = d.layers.filter((l) => idMap.has(l.id));
					const rootId = idMap.get(layer.id) as string;
					const copies = ordered.map((l) => {
						const copy = cloneLayer(l);
						copy.id = idMap.get(l.id) as string;
						if (l.id === layer.id) {
							copy.name = `${l.name} copy`;
							copy.locked = false;
						} else if (l.parentId) {
							copy.parentId = idMap.get(l.parentId) ?? l.parentId;
						}
						if (copy.type !== "group") {
							copy.x += dx;
							copy.y += dy;
						}
						return copy;
					});
					return { copies, rootId };
				};
				for (const layer of d.layers) {
					layers.push(layer);
					if (!roots.has(layer.id)) continue;
					if (layer.type === "frame") {
						// Figma-style: a duplicated frame lands to the right, with its contents.
						const { copies, rootId } = copyTree(layer, frameDx, 0);
						newIds.push(rootId);
						frameCopies.push(...copies);
						continue;
					}
					const { copies, rootId } = copyTree(layer, 24, 24);
					newIds.push(rootId);
					layers.push(...copies);
				}
				return { layers: [...layers, ...frameCopies] };
			});
			set({ selectedIds: newIds });
		},

		reorderLayer: (id, toIndex, parentId) => {
			mutateDoc((doc) => {
				const layers = [...doc.layers];
				const from = layers.findIndex((l) => l.id === id);
				if (from === -1) return {};
				let [layer] = layers.splice(from, 1);
				// Frames stay top-level, and nothing can move inside itself.
				const target = parentId ? doc.layers.find((l) => l.id === parentId) : undefined;
				const cycle = !!parentId && isInside(doc.layers, parentId, id);
				const valid =
					parentId === null ||
					(!!target && (target.type === "group" || target.type === "frame") && !cycle);
				if (parentId !== undefined && layer.type !== "frame" && valid) {
					layer = { ...layer, parentId: parentId ?? undefined } as Layer;
				}
				layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, layer);
				return { layers };
			});
		},

		moveLayers: (ids, direction) => {
			const { doc } = get();
			if (!doc || ids.length === 0) return;
			const idSet = new Set(ids);
			// Stacking order only matters among siblings (same parent), so step over
			// siblings rather than whatever happens to sit next in the array.
			const ids2 = new Set(doc.layers.map((l) => l.id));
			const parentKey = (l: Layer) => (l.parentId && ids2.has(l.parentId) ? l.parentId : "");
			mutateDoc((d) => {
				const layers = [...d.layers];
				if (direction === "top" || direction === "bottom") {
					const moving = layers.filter((l) => idSet.has(l.id));
					let next = layers.filter((l) => !idSet.has(l.id));
					for (const layer of direction === "top" ? moving : [...moving].reverse()) {
						const siblings = next
							.map((l, i) => ({ l, i }))
							.filter(({ l }) => parentKey(l) === parentKey(layer));
						const at =
							siblings.length === 0
								? direction === "top"
									? next.length
									: 0
								: direction === "top"
									? siblings[siblings.length - 1].i + 1
									: siblings[0].i;
						next = [...next.slice(0, at), layer, ...next.slice(at)];
					}
					return { layers: next };
				}
				const step = direction === "up" ? 1 : -1;
				const order = layers.map((_, i) => i);
				if (step === 1) order.reverse();
				for (const i of order) {
					const layer = layers[i];
					if (!idSet.has(layer.id)) continue;
					let j = i + step;
					while (j >= 0 && j < layers.length && parentKey(layers[j]) !== parentKey(layer)) j += step;
					if (j < 0 || j >= layers.length || idSet.has(layers[j].id)) continue;
					[layers[i], layers[j]] = [layers[j], layers[i]];
				}
				return { layers };
			});
		},

		reparentLayers: (ids) => {
			const { doc } = get();
			if (!doc || !isFreeform(doc)) return;
			const byId = new Map(doc.layers.map((l) => [l.id, l]));
			const changes = ids
				.map((id) => byId.get(id))
				// Layers inside a group stay in it; the group itself is what moves between frames.
				.filter((l): l is Layer => !!l && l.type !== "frame" && byId.get(l.parentId ?? "")?.type !== "group")
				.map((layer) => ({ layer, parentId: parentFor(doc.layers, layer) }))
				.filter(({ layer, parentId }) => layer.parentId !== parentId);
			if (changes.length === 0) return;
			// Part of the same user action (a drag), so don't add a history step.
			set((s) => ({
				doc: {
					...doc,
					layers: doc.layers.map((l) => {
						const change = changes.find((c) => c.layer.id === l.id);
						return change ? ({ ...l, parentId: change.parentId } as Layer) : l;
					}),
				},
				revision: s.revision + 1,
			}));
		},

		transformLayers: (fn) => mutateDoc((doc) => ({ layers: fn(doc.layers) })),

		updateCanvas: (patch, options) =>
			mutateDoc((doc) => ({ canvas: { ...doc.canvas, ...patch } }), options),

		replaceDocument: (snapshot) => {
			mutateDoc(() => snapshot);
			set({ selectedIds: [], cropLayerId: null, fitRequest: get().fitRequest + 1 });
		},

		copy: () => {
			const { doc, selectedIds } = get();
			if (!doc) return;
			const ids = new Set(selectedIds);
			for (const id of selectedIds) {
				for (const child of descendantsOf(doc.layers, id)) ids.add(child.id);
			}
			const layers = doc.layers.filter((l) => ids.has(l.id));
			if (layers.length > 0) set({ clipboard: layers.map(cloneLayer) });
		},

		cut: () => {
			get().copy();
			get().removeLayers(get().selectedIds);
		},

		paste: () => {
			const { clipboard, doc } = get();
			if (!doc || clipboard.length === 0) return;
			const assetIds = new Set(get().assets.map((a) => a.id));
			const idMap = new Map(clipboard.map((l) => [l.id, nanoid(10)]));
			const existing = new Set(doc.layers.map((l) => l.id));
			const freeform = isFreeform(doc);
			const layers = clipboard
				// Images from other projects can't be pasted; their assets live there.
				.filter((l) => l.type !== "image" || assetIds.has(l.assetId))
				.filter((l) => freeform || l.type !== "frame")
				.map((layer) => {
					const copy = cloneLayer(layer);
					copy.id = idMap.get(layer.id) ?? nanoid(10);
					if (layer.parentId) {
						copy.parentId = idMap.get(layer.parentId) ??
							(freeform && existing.has(layer.parentId) ? layer.parentId : undefined);
					}
					copy.x += 24;
					copy.y += 24;
					return copy;
				});
			set({ clipboard: layers.map(cloneLayer) });
			// Only select top-level pasted items.
			get().addLayers(layers, { select: false });
			const pastedIds = new Set(layers.map((l) => l.id));
			set({
				selectedIds: layers
					.filter((l) => !l.parentId || !pastedIds.has(l.parentId))
					.map((l) => l.id),
				tool: "select",
			});
		},
	};
});

export const getEditor = () => useEditorStore.getState();

export function useSelectedLayers(): Layer[] {
	return useEditorStore(
		useShallow((s) =>
			s.doc ? s.doc.layers.filter((l) => s.selectedIds.includes(l.id)) : EMPTY,
		),
	);
}

const EMPTY: Layer[] = [];
