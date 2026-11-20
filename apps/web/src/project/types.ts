export interface TProjectMetadata {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	thumbnail?: string;
	width: number;
	height: number;
	layerCount: number;
	mode: "default" | "freeform";
}

export type TProjectSortKey = "createdAt" | "updatedAt" | "name" | "size";
export type TProjectSortOption = `${TProjectSortKey}-${"asc" | "desc"}`;
