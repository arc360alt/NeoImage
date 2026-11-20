"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useEditorStore, getEditor } from "@/editor/store";
import { useOverlayStore } from "@/editor/overlay-store";
import { renderThumbnail } from "@/editor/stage";
import { importImageBlobs, openImagePicker } from "@/editor/import";
import { zoomToSelection } from "./canvas/preview-panel";
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

function useKeyboardShortcuts() {
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (isTypingTarget(event.target)) return;
			if (useOverlayStore.getState().overlayDepth > 0) return;
			const editor = getEditor();
			if (!editor.doc) return;
			const mod = event.ctrlKey || event.metaKey;
			const key = event.key.toLowerCase();
			const freeform = editor.doc.mode === "freeform";

			const run = (fn: () => void) => {
				event.preventDefault();
				fn();
			};

			if (mod) {
				switch (key) {
					case "z":
						return run(event.shiftKey ? editor.redo : editor.undo);
					case "y":
						return run(editor.redo);
					case "c":
						if (editor.selectedIds.length === 0) return;
						return run(editor.copy);
					case "x":
						if (editor.selectedIds.length === 0) return;
						return run(editor.cut);
					case "v":
						// Let the paste event handle clipboard images; paste layers only
						// when we have an internal clipboard.
						if (editor.clipboard.length > 0 && !event.shiftKey) {
							pendingInternalPaste = true;
						}
						return;
					case "d":
						return run(() => editor.duplicateLayers(editor.selectedIds));
					case "a":
						return run(editor.selectAll);
					case "]":
						return run(() =>
							editor.moveLayers(editor.selectedIds, event.shiftKey ? "top" : "up"),
						);
					case "[":
						return run(() =>
							editor.moveLayers(editor.selectedIds, event.shiftKey ? "bottom" : "down"),
						);
					case "l":
						return run(toggleLockSelection);
					case "h":
						if (event.shiftKey) return run(toggleVisibilitySelection);
						return;
					case "=":
					case "+":
						return run(() => editor.setZoom(editor.zoom * 1.25));
					case "-":
						return run(() => editor.setZoom(editor.zoom / 1.25));
					case "0":
						return run(editor.requestFit);
					case "1":
						return run(() => editor.setZoom(1));
					case "e":
						return run(() => useExportDialogStore.getState().setOpen(true));
					case "k":
						if (!event.shiftKey) return;
						return run(() =>
							openImagePicker((files) => void importImageBlobs(files, { addToCanvas: true })),
						);
					case "s":
						return run(() => {
							void editor.saveNow().then(() => toast.success("Saved"));
						});
				}
				return;
			}

			if (event.altKey) return;

			if (event.shiftKey && key === "h") return run(() => flipSelection("x"));
			if (event.shiftKey && key === "v") return run(() => flipSelection("y"));
			if (event.shiftKey && event.code === "Digit1") return run(() => editor.requestFit());
			if (event.shiftKey && event.code === "Digit2") return run(zoomToSelection);

			// FreeForm creation tools.
			if (!event.shiftKey) {
				const creation: Record<string, Tool> = { r: "rect", o: "ellipse", l: "line" };
				if (freeform) {
					creation.f = "frame";
					creation.t = "text";
				}
				const next = creation[key];
				if (next) return run(() => editor.setTool(next));
			}

			switch (key) {
				case "delete":
				case "backspace":
					if (editor.selectedIds.length === 0) return;
					return run(() => editor.removeLayers(editor.selectedIds));
				case "escape":
					return run(() => {
						if (editor.cropLayerId) editor.setCropLayerId(null);
						else if (editor.tool !== "select") editor.setTool("select");
						else editor.clearSelection();
					});
				case "v":
					return run(() => editor.setTool("select"));
				case "h":
					return run(() => editor.setTool("hand"));
				case "b":
					return run(() => {
						editor.setTool("brush");
						if (editor.brush.mode === "eraser") editor.setBrush({ mode: "brush" });
					});
				case "e":
					return run(() => {
						editor.setTool("eraser");
					});
				case "t":
					return run(() => (freeform ? editor.setTool("text") : addText()));
				case "c":
					return run(startCrop);
				case "[":
					return run(() => editor.setBrush({ size: Math.max(1, Math.round(editor.brush.size / 1.2)) }));
				case "]":
					return run(() => editor.setBrush({ size: Math.min(400, Math.round(editor.brush.size * 1.2 + 1)) }));
				case "arrowup":
				case "arrowdown":
				case "arrowleft":
				case "arrowright": {
					if (editor.selectedIds.length === 0) return;
					const step = event.shiftKey ? 10 : 1;
					const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
					const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
					return run(() => {
						const layers = editor.doc?.layers.filter(
							(l) => editor.selectedIds.includes(l.id) && !l.locked,
						);
						if (!layers?.length) return;
						editor.updateLayers(
							layers.map((l) => ({ id: l.id, patch: { x: l.x + dx, y: l.y + dy } })),
							{ transient: true },
						);
						scheduleNudgeCommit();
					});
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);
}

let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNudgeCommit() {
	if (nudgeTimer) clearTimeout(nudgeTimer);
	nudgeTimer = setTimeout(() => getEditor().commit(), 400);
}

let pendingInternalPaste = false;

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
