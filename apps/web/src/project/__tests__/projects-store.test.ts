import { describe, expect, test } from "bun:test";
import { filterAndSortProjects } from "../projects-store";
import type { TProjectMetadata } from "../types";

const make = (name: string, created: number, w: number, h: number): TProjectMetadata => ({
	id: name,
	name,
	createdAt: new Date(created),
	updatedAt: new Date(created),
	width: w,
	height: h,
	layerCount: 0,
	mode: "default",
});

const projects = [make("Poster", 3, 1800, 2400), make("Avatar", 1, 500, 500), make("Banner", 2, 1500, 500)];

describe("filterAndSortProjects", () => {
	test("sorts by name", () => {
		const result = filterAndSortProjects({ projects, searchQuery: "", sortOption: "name-asc" });
		expect(result.map((p) => p.name)).toEqual(["Avatar", "Banner", "Poster"]);
	});

	test("sorts by canvas size descending", () => {
		const result = filterAndSortProjects({ projects, searchQuery: "", sortOption: "size-desc" });
		expect(result.map((p) => p.name)).toEqual(["Poster", "Banner", "Avatar"]);
	});

	test("filters by search query, case-insensitively", () => {
		const result = filterAndSortProjects({ projects, searchQuery: "ban", sortOption: "createdAt-desc" });
		expect(result.map((p) => p.name)).toEqual(["Banner"]);
	});
});
