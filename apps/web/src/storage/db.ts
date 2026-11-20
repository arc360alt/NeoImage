import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { AssetRecord, ProjectDoc } from "@/editor/types";

interface OpenImageDB extends DBSchema {
	projects: {
		key: string;
		value: ProjectDoc;
	};
	assets: {
		key: string;
		value: AssetRecord;
		indexes: { "by-project": string };
	};
}

let dbPromise: Promise<IDBPDatabase<OpenImageDB>> | null = null;

export function getDB() {
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("IndexedDB is not available"));
	}
	if (!dbPromise) {
		dbPromise = openDB<OpenImageDB>("openimage", 1, {
			upgrade(db) {
				db.createObjectStore("projects", { keyPath: "id" });
				const assets = db.createObjectStore("assets", { keyPath: "id" });
				assets.createIndex("by-project", "projectId");
			},
		});
	}
	return dbPromise;
}
