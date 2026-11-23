"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useEditorStore, getEditor } from "@/editor/store";
import { useOverlayStore } from "@/editor/overlay-store";
import { renderThumbnail } from "@/editor/stage";
import { importImageBlobs, openImagePicker } from "@/editor/import";
import type { Tool } from "@/editor/types";
import {
	addText,
	flipSelection,
	startCrop,
	toggleLockSelection,
	toggleVisibilitySelection,
} from "@/editor/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useExportDialogStore } from "./export-button";
import { useEditorDialogs } from "./editor-dialogs-store";
import { alignSelection, distributeSelection } from "@/editor/align";
import {
	fitFramesToContent,
	frameSelection,
	removeSelectedFrames,
	zoomToSelection,
	selectChildren,
	selectParents,
} from "@/editor/frame-actions";
import { buildKeymap, comboFromEvent, getAction, type ActionId } from "@/editor/keybindings";
import { getSettings, useSettingsStore } from "@/editor/settings-store";
import { topmostIds } from "@/editor/freeform";
import { deleteSelectedPoints, nudgeSelectedPoints } from "@/editor/path-actions";
import { groupSelection, ungroupSelection } from "@/editor/group-actions";
import { booleanSelection, flattenSelection, outlineStrokeSelection } from "@/editor/vector-actions";
import { copySelectionAsSvg, isOwnClipboard, shareClipboard } from "@/editor/clipboard";
import { importSvgMarkup } from "@/editor/svg-import";
import { looksLikeSvg } from "@/editor/svg-parse";

let activeSession: symbol | null = null;

const AUTOSAVE_DELAY_MS = 600;
const THUMBNAIL_DELAY_MS = 2500;

export function EditorProvider({
	projectId,
	children,
}: {
	projectId: string;
	children: React.ReactNode;
}) {
	const isLoading = useEditorStore((s) => s.isLoading);
	const loadError = useEditorStore((s) => s.loadError);
	const hasDoc = useEditorStore((s) => s.doc !== null);

	useEffect(() => {
		const token = Symbol(projectId);
		activeSession = token;
		void getEditor().loadProject(projectId);
		return () => {
			void getEditor()
				.saveNow()
				.finally(() => {
					// Strict Mode remounts immediately; only close if no newer
					// session has started in the meantime.
					if (activeSession === token) getEditor().closeProject();
				});
		};
	}, [projectId]);

	useAutosave();
	useKeyboardShortcuts();
	usePasteImages();

	if (loadError) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
				<p className="text-lg font-medium">{loadError}</p>
				<Button asChild>
					<Link href="/projects">Back to projects</Link>
				</Button>
			</div>
		);
	}

	if (isLoading || !hasDoc) {
		return (
			<div className="flex h-screen w-screen items-center justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	return <>{children}</>;
}

function useAutosave() {
	const revision = useEditorStore((s) => s.revision);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (revision === 0) return;
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => {
			void getEditor().saveNow();
		}, AUTOSAVE_DELAY_MS);
		if (thumbTimer.current) clearTimeout(thumbTimer.current);
		thumbTimer.current = setTimeout(async () => {
			const thumbnail = await renderThumbnail();
			if (thumbnail) getEditor().setThumbnail(thumbnail);
		}, THUMBNAIL_DELAY_MS);
	}, [revision]);

	// Generate a first thumbnail shortly after opening (e.g. for templates).
	useEffect(() => {
		const timer = setTimeout(async () => {
			const { doc } = getEditor();
			if (!doc || doc.thumbnail) return;
			const thumbnail = await renderThumbnail();
			if (thumbnail) getEditor().setThumbnail(thumbnail);
		}, 1500);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		const handler = (event: BeforeUnloadEvent) => {
			const { saveStatus } = getEditor();
			if (saveStatus === "saving" || saveTimer.current) {
				void getEditor().saveNow();
			}
			if (saveStatus === "error") event.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => {
			window.removeEventListener("beforeunload", handler);
			if (saveTimer.current) clearTimeout(saveTimer.current);
			if (thumbTimer.current) clearTimeout(thumbTimer.current);
		};
	}, []);
}

function isTypingTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT"
	);
}

type ActionContext = { editor: ReturnType<typeof getEditor>; freeform: boolean };
/** Returning false means "not handled": the key event is left alone. */
type ActionHandler = (ctx: ActionContext) => boolean | void;

const hasSelection = ({ editor }: ActionContext) => editor.selectedIds.length > 0;

const setTool =
	(tool: Tool): ActionHandler =>
	({ editor }) =>
		editor.setTool(tool);

const toggleSetting = (key: "showPixelGrid" | "showLayoutGrids", label: string) => () => {
	const next = !getSettings()[key];
	getSettings().set({ [key]: next });
	toast(`${label} ${next ? "on" : "off"}`, { duration: 1200 });
};

const ACTION_HANDLERS: Record<ActionId, ActionHandler> = {
	"tool.select": setTool("select"),
	"tool.hand": setTool("hand"),
	"tool.frame": (ctx) => (ctx.freeform ? ctx.editor.setTool("frame") : false),
	"tool.rect": setTool("rect"),
	"tool.ellipse": setTool("ellipse"),
	"tool.line": setTool("line"),
	"tool.pen": (ctx) => (ctx.freeform ? ctx.editor.setTool("pen") : false),
	"tool.text": ({ editor, freeform }) => (freeform ? editor.setTool("text") : void addText()),
	"tool.brush": ({ editor }) => {
		editor.setTool("brush");
		if (editor.brush.mode === "eraser") editor.setBrush({ mode: "brush" });
	},
	"tool.eraser": setTool("eraser"),
	"tool.crop": () => startCrop(),
	"tool.placeImage": () =>
		openImagePicker((files) => void importImageBlobs(files, { addToCanvas: true })),
	"brush.smaller": ({ editor }) =>
		editor.setBrush({ size: Math.max(1, Math.round(editor.brush.size / 1.2)) }),
	"brush.bigger": ({ editor }) =>
		editor.setBrush({ size: Math.min(400, Math.round(editor.brush.size * 1.2 + 1)) }),

	"edit.undo": ({ editor }) => editor.undo(),
	"edit.redo": ({ editor }) => editor.redo(),
	"edit.copy": (ctx) => {
		if (!hasSelection(ctx)) return false;
		ctx.editor.copy();
		void shareClipboard(ctx.editor.selectedIds);
	},
	"edit.cut": (ctx) => {
		if (!hasSelection(ctx)) return false;
		void shareClipboard(ctx.editor.selectedIds);
		ctx.editor.cut();
	},
	"edit.copySvg": (ctx) => (hasSelection(ctx) ? void copySelectionAsSvg() : false),
	// The paste event does the work, so the browser default must still run.
	"edit.paste": ({ editor }) => {
		if (editor.clipboard.length > 0) pendingInternalPaste = true;
		return false;
	},
	"edit.duplicate": ({ editor }) => editor.duplicateLayers(editor.selectedIds),
	"edit.delete": (ctx) => {
		// In path edit mode, Delete removes the selected points instead of the layer.
		if (ctx.editor.editingPathId) return void deleteSelectedPoints();
		return hasSelection(ctx) ? ctx.editor.removeLayers(ctx.editor.selectedIds) : false;
	},
	"edit.flipH": () => flipSelection("x"),
	"edit.flipV": () => flipSelection("y"),
	"edit.save": ({ editor }) => {
		void editor.saveNow().then(() => toast.success("Saved"));
	},

	"select.all": ({ editor }) => editor.selectAll(),
	"select.none": ({ editor }) => {
		if (editor.editingPathId) {
			if (editor.selectedPoints.length > 0) editor.setSelectedPoints([]);
			else editor.setEditingPathId(null);
		} else if (editor.editingTextId) editor.setEditingTextId(null);
		else if (editor.cropLayerId) editor.setCropLayerId(null);
		else if (editor.tool !== "select") editor.setTool("select");
		else editor.clearSelection();
	},
	"select.children": ({ editor }) => {
		if (editor.editingPathId) return void editor.setEditingPathId(null);
		return selectChildren();
	},
	"select.parent": () => selectParents(),
	"arrange.group": () => groupSelection(),
	"arrange.ungroup": () => ungroupSelection(),

	"frame.wrap": () => frameSelection(),
	"frame.remove": () => removeSelectedFrames(),
	"frame.fit": () => fitFramesToContent(),

	"arrange.forward": ({ editor }) => editor.moveLayers(editor.selectedIds, "up"),
	"arrange.backward": ({ editor }) => editor.moveLayers(editor.selectedIds, "down"),
	"arrange.front": ({ editor }) => editor.moveLayers(editor.selectedIds, "top"),
	"arrange.back": ({ editor }) => editor.moveLayers(editor.selectedIds, "bottom"),
	"layer.lock": () => toggleLockSelection(),
	"layer.hide": () => toggleVisibilitySelection(),

	"align.left": () => alignSelection("left"),
	"align.center": () => alignSelection("center"),
	"align.right": () => alignSelection("right"),
	"align.top": () => alignSelection("top"),
	"align.middle": () => alignSelection("middle"),
	"align.bottom": () => alignSelection("bottom"),
	"distribute.h": () => distributeSelection("x"),
	"distribute.v": () => distributeSelection("y"),

	"vector.flatten": () => {
		if (!flattenSelection()) useExportDialogStore.getState().setOpen(true);
	},
	"vector.outlineStroke": () => void outlineStrokeSelection(),
	"vector.union": () => void booleanSelection("union"),
	"vector.subtract": () => void booleanSelection("subtract"),
	"vector.intersect": () => void booleanSelection("intersect"),
	"vector.exclude": () => void booleanSelection("exclude"),
	"view.zoomIn": ({ editor }) => editor.setZoom(editor.zoom * 1.25),
	"view.zoomOut": ({ editor }) => editor.setZoom(editor.zoom / 1.25),
	"view.zoomFit": ({ editor }) => editor.requestFit(),
	"view.zoom100": ({ editor }) => editor.setZoom(1),
	"view.zoomSelection": () => zoomToSelection(),
	"view.pixelGrid": toggleSetting("showPixelGrid", "Pixel grid"),
	"view.layoutGrids": toggleSetting("showLayoutGrids", "Layout grids"),
	"view.export": () => useExportDialogStore.getState().setOpen(true),
	"view.settings": () => useEditorDialogs.getState().openSettings(),
	"view.shortcuts": () => useEditorDialogs.getState().setShortcutsOpen(true),
};

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function useKeyboardShortcuts() {
	const overrides = useSettingsStore((s) => s.keybindings);
	const keymap = useMemo(() => buildKeymap(overrides), [overrides]);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.defaultPrevented || isTypingTarget(event.target)) return;
			if (useOverlayStore.getState().overlayDepth > 0) return;
			const editor = getEditor();
			if (!editor.doc) return;
			const freeform = editor.doc.mode === "freeform";
			const mod = event.ctrlKey || event.metaKey;

			// Nudging uses whatever arrow is held; Shift switches to the big nudge.
			if (ARROWS.has(event.key) && !mod && !event.altKey) {
				if (editor.selectedIds.length === 0) return;
				event.preventDefault();
				if (editor.editingPathId && editor.selectedPoints.length > 0) {
					const { nudge, bigNudge } = getSettings();
					const step = event.shiftKey ? bigNudge : nudge;
					const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
					const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
					nudgeSelectedPoints(dx, dy);
					scheduleNudgeCommit();
					return;
				}
				nudgeSelection(event.key, event.shiftKey);
				return;
			}

			const combo = comboFromEvent(event);
			const actionId = combo ? keymap.get(combo) : undefined;
			if (!actionId) return;
			const action = getAction(actionId);
			if (action?.freeformOnly && !freeform) return;
			const handled = ACTION_HANDLERS[actionId]({ editor, freeform });
			if (handled !== false) event.preventDefault();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [keymap]);
}

function nudgeSelection(key: string, big: boolean) {
	const editor = getEditor();
	const { nudge, bigNudge } = getSettings();
	const step = big ? bigNudge : nudge;
	const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
	const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
	const doc = editor.doc;
	if (!doc) return;
	const selected = new Set(topmostIds(doc.layers, editor.selectedIds));
	const frames = new Set(doc.layers.filter((l) => l.type === "frame" && selected.has(l.id)).map((l) => l.id));
	// Nudging a frame carries its contents along (groups move their own children in the store).
	const moving = doc.layers.filter(
		(l) => !l.locked && (selected.has(l.id) || (l.parentId && frames.has(l.parentId) && !selected.has(l.id))),
	);
	if (moving.length === 0) return;
	editor.updateLayers(
		moving.map((l) => ({ id: l.id, patch: { x: l.x + dx, y: l.y + dy } })),
		{ transient: true },
	);
	scheduleNudgeCommit();
}

let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNudgeCommit() {
	if (nudgeTimer) clearTimeout(nudgeTimer);
	nudgeTimer = setTimeout(() => getEditor().commit(), 400);
}

let pendingInternalPaste = false;

/** FreeForm pastes editable layers; Default mode keeps SVGs as images. */
async function pasteSvgMarkup(text: string) {
	const freeform = getEditor().doc?.mode === "freeform";
	if (freeform && (await importSvgMarkup(text, { name: "Pasted SVG" }))) return;
	await importImageBlobs([new File([text], "Pasted.svg", { type: "image/svg+xml" })], { addToCanvas: true });
}

function usePasteImages() {
	useEffect(() => {
		const handler = (event: ClipboardEvent) => {
			if (isTypingTarget(event.target)) return;
			const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
				f.type.startsWith("image/"),
			);
			if (files.length > 0) {
				event.preventDefault();
				pendingInternalPaste = false;
				void importImageBlobs(files, { addToCanvas: true });
				return;
			}
			const text =
				event.clipboardData?.getData("image/svg+xml") || event.clipboardData?.getData("text/plain") || "";
			// SVG markup from Figma, Illustrator, a browser… unless it's our own copy.
			if (looksLikeSvg(text) && !isOwnClipboard(text)) {
				event.preventDefault();
				pendingInternalPaste = false;
				void pasteSvgMarkup(text);
				return;
			}
			if (pendingInternalPaste || getEditor().clipboard.length > 0) {
				event.preventDefault();
				pendingInternalPaste = false;
				getEditor().paste();
			}
		};
		window.addEventListener("paste", handler);
		return () => window.removeEventListener("paste", handler);
	}, []);
}
