import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import pkg from "./package.json";

/** Commit the app was built from, shown in Settings → About. */
function gitCommit() {
	const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
	if (fromEnv) return fromEnv;
	try {
		return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
	} catch {
		return "";
	}
}

const nextConfig: NextConfig = {
	env: {
		NEXT_PUBLIC_APP_VERSION: pkg.version,
		NEXT_PUBLIC_COMMIT_SHA: gitCommit(),
	},
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
