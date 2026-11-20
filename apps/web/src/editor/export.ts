import { zipSync } from "fflate";
import { createExportSetting } from "./defaults";
import { dataUrlToBlob, renderLayer } from "./stage";
import { getEditor } from "./store";
import { layerToSvg, svgBlob } from "./svg-export";
import type { ExportSetting, Layer } from "./types";

const EXT = { png: "png", jpeg: "jpg", webp: "webp", svg: "svg" } as const;

export function settingsFor(layer: Layer): ExportSetting[] {
	return layer.exportSettings?.length ? layer.exportSettings : [createExportSetting()];
}

export function fileNameFor(layer: Layer, setting: ExportSetting) {
	const base = layer.name.replace(/[\\/:*?"<>|]+/g, "").trim() || "export";
	const suffix = setting.suffix || (setting.scale === 1 ? "" : `@${setting.scale}x`);
	return `${base}${suffix}.${EXT[setting.format]}`;
}

function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Exports layers using their export settings. One file downloads directly;
 * several are bundled into a zip.
 */
export async function exportLayers(
	layerIds: string[],
	options: { zipName?: string } = {},
): Promise<number> {
	const doc = getEditor().doc;
	if (!doc) throw new Error("No project open");
	const files: { name: string; blob: Blob }[] = [];
	const used = new Map<string, number>();
	for (const id of layerIds) {
		const layer = doc.layers.find((l) => l.id === id);
		if (!layer) continue;
		for (const setting of settingsFor(layer)) {
			const blob =
				setting.format === "svg"
					? svgBlob(await layerToSvg(id, { scale: setting.scale }))
					: dataUrlToBlob(
							await renderLayer({ layerId: id, scale: setting.scale, format: setting.format }),
						);
			let name = fileNameFor(layer, setting);
			// Keep names unique inside the zip ("Frame 1.png", "Frame 1 (2).png").
			const count = used.get(name) ?? 0;
			used.set(name, count + 1);
			if (count > 0) name = name.replace(/(\.\w+)$/, ` (${count + 1})$1`);
			files.push({ name, blob });
		}
	}
	if (files.length === 0) return 0;
	if (files.length === 1) {
		download(files[0].blob, files[0].name);
		return 1;
	}
	const entries: Record<string, Uint8Array> = {};
	for (const file of files) {
		entries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
	}
	const zip = zipSync(entries, { level: 0 });
	const single = layerIds.length === 1 ? doc.layers.find((l) => l.id === layerIds[0]) : undefined;
	const zipName = (options.zipName || single?.name || doc.name).replace(/[\\/:*?"<>|]+/g, "").trim() || "export";
	download(new Blob([zip as BlobPart], { type: "application/zip" }), `${zipName}.zip`);
	return files.length;
}
