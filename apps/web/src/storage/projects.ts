import { nanoid } from "nanoid";
import { getDB } from "./db";
import type {
	AssetRecord,
	CanvasSettings,
	Layer,
	ProjectDoc,
	ProjectMode,
} from "@/editor/types";
import type { TProjectMetadata } from "@/project/types";

export async function listProjects(): Promise<TProjectMetadata[]> {
	const db = await getDB();
	const docs = await db.getAll("projects");
	return docs.map(toMetadata);
}

export function toMetadata(doc: ProjectDoc): TProjectMetadata {
	return {
		id: doc.id,
		name: doc.name,
		createdAt: new Date(doc.createdAt),
		updatedAt: new Date(doc.updatedAt),
		thumbnail: doc.thumbnail,
		width: doc.canvas.width,
		height: doc.canvas.height,
		layerCount: doc.layers.length,
		mode: doc.mode ?? "default",
	};
}

export async function getProject(id: string): Promise<ProjectDoc | undefined> {
	const db = await getDB();
	return db.get("projects", id);
}

export async function saveProject(doc: ProjectDoc): Promise<void> {
	const db = await getDB();
	await db.put("projects", doc);
}

export async function createProject({
	name,
	mode = "default",
	canvas,
	layers = [],
	assets = [],
}: {
	name: string;
	mode?: ProjectMode;
	canvas: CanvasSettings;
	layers?: Layer[];
	assets?: Omit<AssetRecord, "projectId">[];
}): Promise<string> {
	const db = await getDB();
	const now = Date.now();
	const doc: ProjectDoc = {
		id: nanoid(12),
		name,
		mode,
		createdAt: now,
		updatedAt: now,
		canvas,
		layers,
		version: 1,
	};
	const tx = db.transaction(["projects", "assets"], "readwrite");
	await tx.objectStore("projects").put(doc);
	for (const asset of assets) {
		await tx.objectStore("assets").put({ ...asset, projectId: doc.id });
	}
	await tx.done;
	return doc.id;
}

export async function renameProject({
	id,
	name,
}: {
	id: string;
	name: string;
}): Promise<void> {
	const db = await getDB();
	const doc = await db.get("projects", id);
	if (!doc) return;
	await db.put("projects", { ...doc, name, updatedAt: Date.now() });
}

export async function deleteProjects({ ids }: { ids: string[] }) {
	const db = await getDB();
	const tx = db.transaction(["projects", "assets"], "readwrite");
	for (const id of ids) {
		await tx.objectStore("projects").delete(id);
		const assetKeys = await tx
			.objectStore("assets")
			.index("by-project")
			.getAllKeys(id);
		for (const key of assetKeys) {
			await tx.objectStore("assets").delete(key);
		}
	}
	await tx.done;
}

export async function duplicateProjects({ ids }: { ids: string[] }) {
	const db = await getDB();
	for (const id of ids) {
		const doc = await db.get("projects", id);
		if (!doc) continue;
		const assets = await db.getAllFromIndex("assets", "by-project", id);
		const newId = nanoid(12);
		const assetIdMap = new Map<string, string>();
		const now = Date.now();
		const tx = db.transaction(["projects", "assets"], "readwrite");
		for (const asset of assets) {
			const newAssetId = nanoid(12);
			assetIdMap.set(asset.id, newAssetId);
			await tx
				.objectStore("assets")
				.put({ ...asset, id: newAssetId, projectId: newId });
		}
		const layers = doc.layers.map((layer) =>
			layer.type === "image"
				? { ...layer, assetId: assetIdMap.get(layer.assetId) ?? layer.assetId }
				: layer,
		);
		await tx.objectStore("projects").put({
			...doc,
			id: newId,
			name: `${doc.name} (copy)`,
			createdAt: now,
			updatedAt: now,
			layers,
		});
		await tx.done;
	}
}
