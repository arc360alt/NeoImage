import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	output: "standalone",
	// Konva ships an optional node-canvas build; never bundle it for the browser.
	turbopack: {
		resolveAlias: {
			canvas: { browser: "./src/utils/empty-module.ts" },
		},
	},
	webpack: (config) => {
		config.externals = [...(config.externals || []), { canvas: "canvas" }];
		return config;
	},
	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "images.pexels.com" },
			{ protocol: "https", hostname: "avatars.githubusercontent.com" },
		],
	},
};

export default nextConfig;
