import { nanoid } from "nanoid";
import { getDB } from "./db";
import type { AssetMeta, AssetRecord } from "@/editor/types";

const urlCache = new Map<string, string>();
const imageCache = new Map<string, Promise<HTMLImageElement>>();

export async function listAssets({
	projectId,
}: {
	projectId: string;
}): Promise<AssetMeta[]> {
	const db = await getDB();
	const records = await db.getAllFromIndex("assets", "by-project", projectId);
	return records
		.map(({ blob: _blob, ...meta }) => meta)
		.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
	const db = await getDB();
	return (await db.get("assets", id))?.blob;
}

export async function getAssetUrl(id: string): Promise<string | undefined> {
	const cached = urlCache.get(id);
	if (cached) return cached;
	const blob = await getAssetBlob(id);
	if (!blob) return undefined;
	const url = URL.createObjectURL(blob);
	urlCache.set(id, url);
	return url;
}

/** Loads (and memoizes) a decoded HTMLImageElement for an asset id. */
export function loadAssetImage(id: string): Promise<HTMLImageElement> {
	const cached = imageCache.get(id);
	if (cached) return cached;
	const promise = (async () => {
		const url = await getAssetUrl(id);
		if (!url) throw new Error(`Asset ${id} not found`);
		return loadImage(url);
	})();
	promise.catch(() => imageCache.delete(id));
	imageCache.set(id, promise);
	return promise;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new window.Image();
		image.crossOrigin = "anonymous";
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Failed to load image"));
		image.src = src;
	});
}

export async function createAssetRecord({
	projectId,
	blob,
	name,
}: {
	projectId: string;
	blob: Blob;
	name: string;
}): Promise<AssetRecord> {
	const url = URL.createObjectURL(blob);
	try {
		const image = await loadImage(url);
		return {
			id: nanoid(12),
			projectId,
			name,
			mimeType: blob.type || "image/png",
			width: image.naturalWidth,
			height: image.naturalHeight,
			size: blob.size,
			createdAt: Date.now(),
			blob,
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}

export async function addAsset({
	projectId,
	blob,
	name,
}: {
	projectId: string;
	blob: Blob;
	name: string;
}): Promise<AssetMeta> {
	const record = await createAssetRecord({ projectId, blob, name });
	const db = await getDB();
	await db.put("assets", record);
	const { blob: _blob, ...meta } = record;
	return meta;
}

export async function deleteAsset(id: string): Promise<void> {
	const db = await getDB();
	await db.delete("assets", id);
	const url = urlCache.get(id);
	if (url) URL.revokeObjectURL(url);
	urlCache.delete(id);
	imageCache.delete(id);
}

export const SUPPORTED_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/svg+xml",
	"image/avif",
	"image/bmp",
];

export function isSupportedImage(file: File | Blob) {
	return file.type.startsWith("image/");
}
