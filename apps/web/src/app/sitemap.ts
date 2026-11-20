import type { MetadataRoute } from "next";
import { SITE_URL } from "@/site/brand";
import { getPosts } from "@/blog/posts";
import { getSortedReleases } from "@/changelog/utils";

export default function sitemap(): MetadataRoute.Sitemap {
	const staticRoutes = [
		"",
		"/projects",
		"/roadmap",
		"/contributors",
		"/sponsors",
		"/blog",
		"/changelog",
		"/brand",
		"/privacy",
		"/terms",
	].map((route) => ({
		url: `${SITE_URL}${route}`,
		lastModified: new Date(),
	}));

	const posts = getPosts().map((post) => ({
		url: `${SITE_URL}/blog/${post.slug}`,
		lastModified: new Date(post.publishedAt),
	}));

	const releases = getSortedReleases().map((release) => ({
		url: `${SITE_URL}/changelog/${release.version}`,
		lastModified: new Date(release.date),
	}));

	return [...staticRoutes, ...posts, ...releases];
}
