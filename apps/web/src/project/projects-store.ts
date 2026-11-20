import { create } from "zustand";
import { toast } from "sonner";
import type {
	TProjectMetadata,
	TProjectSortOption,
} from "@/project/types";
import * as storage from "@/storage/projects";
import type {
	AssetRecord,
	CanvasSettings,
	Layer,
	ProjectMode,
} from "@/editor/types";

interface ProjectsDataState {
	projects: TProjectMetadata[];
	isLoading: boolean;
	isInitialized: boolean;
	loadAllProjects: () => Promise<void>;
	createNewProject: (args: {
		name: string;
		mode?: ProjectMode;
		canvas: CanvasSettings;
		layers?: Layer[];
		assets?: Omit<AssetRecord, "projectId">[];
	}) => Promise<string>;
	deleteProjects: (args: { ids: string[] }) => Promise<void>;
	duplicateProjects: (args: { ids: string[] }) => Promise<void>;
	renameProject: (args: { id: string; name: string }) => Promise<void>;
}

export const useProjectsData = create<ProjectsDataState>()((set, get) => ({
	projects: [],
	isLoading: false,
	isInitialized: false,

	loadAllProjects: async () => {
		set({ isLoading: true });
		try {
			const projects = await storage.listProjects();
			set({ projects, isInitialized: true });
		} catch (error) {
			toast.error("Failed to load projects", {
				description: error instanceof Error ? error.message : undefined,
			});
			set({ isInitialized: true });
		} finally {
			set({ isLoading: false });
		}
	},

	createNewProject: async (args) => {
		const id = await storage.createProject(args);
		await get().loadAllProjects();
		return id;
	},

	deleteProjects: async ({ ids }) => {
		await storage.deleteProjects({ ids });
		set((s) => ({ projects: s.projects.filter((p) => !ids.includes(p.id)) }));
	},

	duplicateProjects: async ({ ids }) => {
		await storage.duplicateProjects({ ids });
		await get().loadAllProjects();
	},

	renameProject: async ({ id, name }) => {
		const trimmed = name.trim();
		if (!trimmed) return;
		await storage.renameProject({ id, name: trimmed });
		set((s) => ({
			projects: s.projects.map((p) =>
				p.id === id ? { ...p, name: trimmed, updatedAt: new Date() } : p,
			),
		}));
	},
}));

export function filterAndSortProjects({
	projects,
	searchQuery,
	sortOption,
}: {
	projects: TProjectMetadata[];
	searchQuery: string;
	sortOption: TProjectSortOption;
}) {
	const query = searchQuery.trim().toLowerCase();
	const filtered = query
		? projects.filter((p) => p.name.toLowerCase().includes(query))
		: projects;
	const [key, order] = sortOption.split("-") as [
		keyof TProjectMetadata | "size",
		"asc" | "desc",
	];
	const direction = order === "asc" ? 1 : -1;
	return [...filtered].sort((a, b) => {
		switch (key) {
			case "name":
				return a.name.localeCompare(b.name) * direction;
			case "size":
				return (a.width * a.height - b.width * b.height) * direction;
			case "createdAt":
				return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
			default:
				return (a.updatedAt.getTime() - b.updatedAt.getTime()) * direction;
		}
	});
}
