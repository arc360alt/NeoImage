import { toast } from "sonner";
import { addAsset, isSupportedImage } from "@/storage/assets";
import { createImageLayer } from "./defaults";
import { getEditor } from "./store";
import { centerIn, getInsertionArea } from "./insertion";
import type { AssetMeta } from "./types";

/** Size an image so it fits nicely inside the artboard. */
export function fitImageToCanvas(asset: Pick<AssetMeta, "width" | "height">) {
	const doc = getEditor().doc;
	if (!doc) return { width: asset.width, height: asset.height, x: 0, y: 0 };
	const area = getInsertionArea();
	const scale = Math.min(1, (area.width * 0.8) / asset.width, (area.height * 0.8) / asset.height);
	const width = Math.max(1, Math.round(asset.width * scale));
	const height = Math.max(1, Math.round(asset.height * scale));
	return { width, height, ...centerIn(area, width, height) };
}

export function addAssetToCanvas(
	asset: AssetMeta,
	position?: { x: number; y: number },
) {
	const size = fitImageToCanvas(asset);
	const layer = createImageLayer({
		assetId: asset.id,
		name: asset.name.replace(/\.[a-z0-9]+$/i, "") || "Image",
		width: size.width,
		height: size.height,
		x: position ? Math.round(position.x - size.width / 2) : size.x,
		y: position ? Math.round(position.y - size.height / 2) : size.y,
	});
	getEditor().addLayers([layer]);
	return layer;
}

export async function importImageBlobs(
	files: (File | Blob)[],
	options: { addToCanvas?: boolean; position?: { x: number; y: number } } = {},
): Promise<AssetMeta[]> {
	const { projectId, addAssetMeta } = getEditor();
	if (!projectId) return [];
	const images = files.filter(isSupportedImage);
	if (images.length === 0) {
		if (files.length > 0) toast.error("Only image files are supported");
		return [];
	}
	const results: AssetMeta[] = [];
	for (const file of images) {
		try {
			const name = file instanceof File ? file.name : "Pasted image";
			const asset = await addAsset({ projectId, blob: file, name });
			addAssetMeta(asset);
			results.push(asset);
			if (options.addToCanvas) addAssetToCanvas(asset, options.position);
		} catch (error) {
			console.error(error);
			toast.error("Failed to import image", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	}
	return results;
}

export async function importImageFromUrl({
	url,
	name,
	addToCanvas = true,
}: {
	url: string;
	name: string;
	addToCanvas?: boolean;
}) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Download failed (${response.status})`);
	const blob = await response.blob();
	return importImageBlobs([new File([blob], name, { type: blob.type })], {
		addToCanvas,
	});
}

export function openImagePicker(
	onFiles: (files: File[]) => void,
	{ multiple = true }: { multiple?: boolean } = {},
) {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "image/*";
	input.multiple = multiple;
	input.onchange = () => {
		const files = Array.from(input.files ?? []);
		if (files.length > 0) onFiles(files);
	};
	input.click();
}
