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
import { childrenOf, isFreeform, parentFor } from "./freeform";

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
			});
		},
		setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
		setZoom: (zoom) => set({ zoom: Math.min(32, Math.max(0.02, zoom)) }),
		requestFit: (target) =>
			set((s) => ({ fitRequest: s.fitRequest + 1, fitTarget: target ?? null })),
		setCropLayerId: (id) =>
			set({ cropLayerId: id, tool: id ? "crop" : "select" }),
		setEditingTextId: (id) => set({ editingTextId: id }),

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
			set({
				selectedIds: doc.layers
					.filter((l) => l.visible && !l.locked && !(isFreeform(doc) && l.parentId))
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
			const byId = new Map(patches.map((p) => [p.id, p.patch]));
			mutateDoc(
				(doc) => ({
					layers: doc.layers.map((layer) => {
						const patch = byId.get(layer.id);
						return patch ? ({ ...layer, ...patch } as Layer) : layer;
					}),
				}),
				options,
			);
		},

		removeLayers: (ids) => {
			if (ids.length === 0) return;
			const layersNow = get().doc?.layers ?? [];
			// Deleting a frame deletes everything inside it.
			const idSet = new Set(ids);
			for (const id of ids) {
				for (const child of childrenOf(layersNow, id)) idSet.add(child.id);
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
			const idSet = new Set(ids);
			const newIds: string[] = [];
			mutateDoc((d) => {
				const layers: Layer[] = [];
				const frameCopies: Layer[] = [];
				// Duplicated frames move as a group into free space right of all content.
				const dupFrames = d.layers.filter((l) => idSet.has(l.id) && l.type === "frame");
				const contentRight = Math.max(
					...d.layers
						.filter((l) => l.type === "frame" || !l.parentId)
						.map((l) => l.x + Math.max(l.width, 0)),
				);
				const groupLeft = Math.min(...dupFrames.map((l) => l.x));
				const frameDx = dupFrames.length ? contentRight + 80 - groupLeft : 0;
				for (const layer of d.layers) {
					layers.push(layer);
					if (!idSet.has(layer.id)) continue;
					const copy = cloneLayer(layer);
					copy.id = nanoid(10);
					copy.name = `${layer.name} copy`;
					copy.locked = false;
					newIds.push(copy.id);
					if (layer.type === "frame") {
						// Figma-style: a duplicated frame lands to the right, with its contents.
						const dx = frameDx;
						copy.x += dx;
						frameCopies.push(copy);
						for (const child of childrenOf(d.layers, layer.id)) {
							const childCopy = cloneLayer(child);
							childCopy.id = nanoid(10);
							childCopy.parentId = copy.id;
							childCopy.x += dx;
							frameCopies.push(childCopy);
						}
						continue;
					}
					copy.x += 24;
					copy.y += 24;
					layers.push(copy);
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
				if (parentId !== undefined && layer.type !== "frame") {
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
			mutateDoc((d) => {
				const layers = [...d.layers];
				if (direction === "top" || direction === "bottom") {
					const moving = layers.filter((l) => idSet.has(l.id));
					const rest = layers.filter((l) => !idSet.has(l.id));
					return {
						layers: direction === "top" ? [...rest, ...moving] : [...moving, ...rest],
					};
				}
				if (direction === "up") {
					for (let i = layers.length - 2; i >= 0; i--) {
						if (idSet.has(layers[i].id) && !idSet.has(layers[i + 1].id)) {
							[layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
						}
					}
				} else {
					for (let i = 1; i < layers.length; i++) {
						if (idSet.has(layers[i].id) && !idSet.has(layers[i - 1].id)) {
							[layers[i], layers[i - 1]] = [layers[i - 1], layers[i]];
						}
					}
				}
				return { layers };
			});
		},

		reparentLayers: (ids) => {
			const { doc } = get();
			if (!doc || !isFreeform(doc)) return;
			const changes = ids
				.map((id) => doc.layers.find((l) => l.id === id))
				.filter((l): l is Layer => !!l && l.type !== "frame")
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
				for (const child of childrenOf(doc.layers, id)) ids.add(child.id);
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
