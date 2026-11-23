/**
 * Puts parsed SVG content into the document (FreeForm): scales it to fit
 * the insertion area, stores embedded images as assets, wraps several
 * top-level elements in a group, and says when something was simplified.
 */
import { toast } from "sonner";
import { getEditor } from "./store";
import { addAsset } from "@/storage/assets";
import { createGroupLayer } from "./defaults";
import { layerBounds, topmostIds, unionBounds } from "./freeform";
import { getInsertionArea } from "./insertion";
import { multiply, scale as scaleM, translate } from "./matrix";
import { parseSvg, type ParsedSvg } from "./svg-parse";
import { transformLayer } from "./transform";
import type { Layer } from "./types";

function dataUrlBlob(href: string): Blob {
	const comma = href.indexOf(",");
	const header = href.slice(5, comma);
	const data = href.slice(comma + 1);
	const mime = header.split(";")[0] || "application/octet-stream";
	if (header.includes(";base64")) {
		const binary = atob(data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return new Blob([bytes], { type: mime });
	}
	return new Blob([decodeURIComponent(data)], { type: mime });
}

/**
 * Scales and moves parsed layers so they fit `area` (centered on `center`),
 * at most at 100%. Pure, for tests.
 */
export function placeParsed(
	parsed: Pick<ParsedSvg, "layers">,
	area: { x: number; y: number; width: number; height: number },
	center?: { x: number; y: number },
): Layer[] {
	const leaves = parsed.layers.filter((l) => l.type !== "group");
	const bounds = unionBounds(leaves.map((l) => layerBounds(l, parsed.layers)));
	if (!bounds) return parsed.layers;
	const k = Math.min(
		1,
		(area.width * 0.8) / Math.max(bounds.width, 1),
		(area.height * 0.8) / Math.max(bounds.height, 1),
	);
	const c = center ?? { x: area.x + area.width / 2, y: area.y + area.height / 2 };
	const m = multiply(
		translate(Math.round(c.x - (bounds.width * k) / 2), Math.round(c.y - (bounds.height * k) / 2)),
		multiply(scaleM(k), translate(-bounds.x, -bounds.y)),
	);
	return parsed.layers.map((layer) => {
		if (layer.type === "group") return layer;
		const next = { ...layer, ...transformLayer(layer, m) } as Layer;
		// Strokes and corner radii shrink with the artwork.
		if ("stroke" in next && k !== 1) next.stroke = { ...next.stroke, width: next.stroke.width * k };
		if (next.type === "shape" && k !== 1) next.cornerRadius *= k;
		return next;
	});
}

/** Wraps several top-level layers into one group named after the file. */
export function wrapRoots(layers: Layer[], name: string): Layer[] {
	const ids = new Set(layers.map((l) => l.id));
	const roots = layers.filter((l) => !l.parentId || !ids.has(l.parentId));
	if (roots.length <= 1) return layers;
	const group = createGroupLayer({ name });
	const rootIds = new Set(roots.map((r) => r.id));
	return [...layers.map((l) => (rootIds.has(l.id) ? ({ ...l, parentId: group.id } as Layer) : l)), group];
}

/**
 * Imports SVG markup as editable layers. Returns false when it couldn't be
 * converted (the caller then imports it as a plain image).
 */
export async function importSvgMarkup(
	markup: string,
	{ name = "SVG", position }: { name?: string; position?: { x: number; y: number } } = {},
): Promise<boolean> {
	const editor = getEditor();
	if (!editor.doc || !editor.projectId) return false;
	let parsed: ParsedSvg;
	try {
		parsed = parseSvg(markup);
	} catch (error) {
		console.error("SVG parse failed", error);
		return false;
	}
	if (parsed.layers.length === 0) return false;

	// Embedded images become assets of this project.
	const failed = new Set<string>();
	for (const image of parsed.images) {
		try {
			const asset = await addAsset({
				projectId: editor.projectId,
				blob: dataUrlBlob(image.href),
				name: `${name} image`,
			});
			editor.addAssetMeta(asset);
			const layer = parsed.layers.find((l) => l.id === image.layerId);
			if (layer?.type === "image") layer.assetId = asset.id;
		} catch {
			failed.add(image.layerId);
			parsed.simplified.push("images");
		}
	}
	const usable = { ...parsed, layers: parsed.layers.filter((l) => !failed.has(l.id)) };
	const placed = wrapRoots(placeParsed(usable, getInsertionArea(), position), name);
	editor.addLayers(placed, { select: false });
	const ids = placed.map((l) => l.id);
	editor.select(topmostIds(placed, ids));
	editor.setTool("select");
	const simplified = [...new Set(parsed.simplified)];
	if (simplified.length > 0) {
		toast.info("SVG simplified", {
			description: `These parts can't be edited and were dropped: ${simplified.join(", ")}.`,
		});
	}
	return true;
}

/** True for files we'd try to open as editable SVG. */
export function isSvgFile(file: File | Blob) {
	return file.type === "image/svg+xml" || (file instanceof File && /\.svg$/i.test(file.name));
}
