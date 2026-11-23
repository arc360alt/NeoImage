import type Konva from "konva";
import { getEditor } from "./store";
import { ancestorsOf, descendantsOf } from "./freeform";

/**
 * The editor renders a single Konva stage. Keeping a module-level reference
 * lets non-React code (export, thumbnails) reach it without prop drilling.
 */
let stageRef: Konva.Stage | null = null;

export function setStage(stage: Konva.Stage | null) {
	stageRef = stage;
}

export function getStage() {
	return stageRef;
}

export type ExportFormat = "png" | "jpeg" | "webp";

const MIME: Record<ExportFormat, string> = {
	png: "image/png",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

/**
 * Renders the artboard (and only the artboard) to a data URL.
 * UI helpers (transformer, guides, crop overlay) live on a separate layer
 * named "ui" which is hidden during capture.
 */
export async function renderArtboard({
	scale = 1,
	format = "png",
	quality = 0.92,
	transparent = false,
}: {
	scale?: number;
	format?: ExportFormat;
	quality?: number;
	transparent?: boolean;
}): Promise<string> {
	const stage = stageRef;
	const doc = getEditor().doc;
	if (!stage || !doc) throw new Error("Editor is not ready");

	const ui = stage.findOne<Konva.Layer>(".ui");
	const background = stage.findOne(".artboard-background");
	const content = stage.findOne<Konva.Layer>(".content");
	if (!content) throw new Error("Editor is not ready");

	const zoom = stage.scaleX();
	const pixelRatio = scale / zoom;

	// Re-cache filtered nodes at export resolution so they stay sharp.
	const filtered = content.find<Konva.Node>(".filtered");
	for (const node of filtered) {
		node.cache({ pixelRatio: Math.max(1, scale) });
	}

	const wasUiVisible = ui?.visible() ?? false;
	ui?.visible(false);
	const wasBgVisible = background?.visible() ?? true;
	if (transparent) background?.visible(false);
	// The backdrop (artboard shadow + transparency checkerboard) is editor-only.
	const backdrop = stage.findOne<Konva.Layer>(".backdrop");
	const wasBackdropVisible = backdrop?.visible() ?? false;
	backdrop?.visible(false);

	try {
		const position = stage.position();
		const box = {
			x: position.x,
			y: position.y,
			width: doc.canvas.width * zoom,
			height: doc.canvas.height * zoom,
		};
		const canvas = stage.toCanvas({ ...box, pixelRatio });
		if (format === "jpeg" && !transparent) {
			// JPEG has no alpha; flatten onto white so transparent areas aren't black.
			const flat = document.createElement("canvas");
			flat.width = canvas.width;
			flat.height = canvas.height;
			const ctx = flat.getContext("2d");
			if (ctx) {
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(0, 0, flat.width, flat.height);
				ctx.drawImage(canvas, 0, 0);
			}
			return flat.toDataURL(MIME[format], quality);
		}
		return canvas.toDataURL(MIME[format], quality);
	} finally {
		ui?.visible(wasUiVisible);
		if (transparent) background?.visible(wasBgVisible);
		backdrop?.visible(wasBackdropVisible);
		for (const node of filtered) {
			node.cache();
		}
		stage.batchDraw();
	}
}

export async function renderThumbnail(): Promise<string | null> {
	const doc = getEditor().doc;
	if (!stageRef || !doc) return null;
	const maxSide = 480;
	try {
		if (doc.mode === "freeform") {
			const group = stageRef.findOne<Konva.Group>(".content-group");
			if (!group || group.getChildren().length === 0) return null;
			const rect = group.getClientRect({ relativeTo: group });
			if (rect.width <= 0 || rect.height <= 0) return null;
			const scale = Math.min(1, maxSide / Math.max(rect.width, rect.height));
			return await renderRegion({ rect, scale, format: "jpeg", quality: 0.8, background: "#e5e5e5" });
		}
		const scale = Math.min(1, maxSide / Math.max(doc.canvas.width, doc.canvas.height));
		return await renderArtboard({ scale, format: "jpeg", quality: 0.8 });
	} catch {
		return null;
	}
}

type Region = { x: number; y: number; width: number; height: number };

/**
 * Renders a world-space region of the FreeForm canvas. When `onlyIds` is set,
 * every other layer is hidden for the capture (so a frame exports alone).
 */
async function renderRegion({
	rect,
	scale,
	format,
	quality = 0.92,
	onlyIds,
	background,
}: {
	rect: Region;
	scale: number;
	format: ExportFormat;
	quality?: number;
	onlyIds?: Set<string>;
	background?: string;
}): Promise<string> {
	const stage = stageRef;
	if (!stage) throw new Error("Editor is not ready");
	const group = stage.findOne<Konva.Group>(".content-group");
	if (!group) throw new Error("Editor is not ready");
	const ui = stage.findOne<Konva.Layer>(".ui");
	const zoom = stage.scaleX();
	const pos = stage.position();

	const hidden: Konva.Node[] = [];
	if (onlyIds) {
		for (const node of group.find<Konva.Node>(".layer")) {
			if (!onlyIds.has(node.id()) && node.visible()) {
				node.visible(false);
				hidden.push(node);
			}
		}
	}
	// Editor-only helpers inside frames (layout grids) never appear in exports.
	for (const node of group.find<Konva.Node>(".editor-only")) {
		if (node.visible()) {
			node.visible(false);
			hidden.push(node);
		}
	}
	const filtered = group.find<Konva.Node>(".filtered");
	for (const node of filtered) node.cache({ pixelRatio: Math.max(1, scale) });
	const wasUiVisible = ui?.visible() ?? false;
	ui?.visible(false);

	try {
		const canvas = stage.toCanvas({
			x: rect.x * zoom + pos.x,
			y: rect.y * zoom + pos.y,
			width: rect.width * zoom,
			height: rect.height * zoom,
			pixelRatio: scale / zoom,
		});
		const fillColor = background ?? (format === "jpeg" ? "#ffffff" : null);
		if (fillColor) {
			const flat = document.createElement("canvas");
			flat.width = canvas.width;
			flat.height = canvas.height;
			const ctx = flat.getContext("2d");
			if (ctx) {
				ctx.fillStyle = fillColor;
				ctx.fillRect(0, 0, flat.width, flat.height);
				ctx.drawImage(canvas, 0, 0);
			}
			return flat.toDataURL(MIME[format], quality);
		}
		return canvas.toDataURL(MIME[format], quality);
	} finally {
		for (const node of hidden) node.visible(true);
		ui?.visible(wasUiVisible);
		for (const node of filtered) node.cache();
		stage.batchDraw();
	}
}

/** Exports one layer (a frame exports together with its contents). */
export async function renderLayer({
	layerId,
	scale = 1,
	format = "png",
	quality = 0.92,
}: {
	layerId: string;
	scale?: number;
	format?: ExportFormat;
	quality?: number;
}): Promise<string> {
	const stage = stageRef;
	const doc = getEditor().doc;
	if (!stage || !doc) throw new Error("Editor is not ready");
	const layer = doc.layers.find((l) => l.id === layerId);
	const node = stage.findOne(`#${layerId}`);
	const group = stage.findOne<Konva.Group>(".content-group");
	if (!layer || !node || !group) throw new Error("Layer not found");
	// Keep the layer, everything inside it, and the groups around it (hiding a
	// group would hide the layer too); everything else is hidden for the capture.
	const onlyIds = new Set([layerId]);
	for (const child of descendantsOf(doc.layers, layerId)) onlyIds.add(child.id);
	for (const parent of ancestorsOf(doc.layers, layerId)) if (parent.type === "group") onlyIds.add(parent.id);
	let rect: Region;
	if (layer.type === "frame") {
		rect = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
	} else {
		rect = node.getClientRect({ relativeTo: group });
	}
	if (rect.width <= 0 || rect.height <= 0) throw new Error("Nothing to export");
	return renderRegion({ rect, scale, format, quality, onlyIds });
}

export function dataUrlToBlob(dataUrl: string): Blob {
	const [header, data] = dataUrl.split(",");
	const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
	const a = document.createElement("a");
	a.href = dataUrl;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
}
