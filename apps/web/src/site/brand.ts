export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const SITE_INFO = {
	title: "OpenImage",
	description:
		"A simple but powerful photo editor and design tool. Layers, filters, text and more. In your browser.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.png",
	twitterImage: "/open-graph/default.png",
	favicon: "/favicon.ico",
};

export const DEFAULT_LOGO_URL = "/logos/openimage/svg/logo.svg";
