import type { NextRequest } from "next/server";

const ALLOWED_HOSTS = new Set([
	"images.pexels.com",
	"picsum.photos",
	"fastly.picsum.photos",
]);

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Proxies a stock image so the browser can store it without CORS issues.
 * Only allows known stock-photo hosts.
 */
export async function GET(request: NextRequest) {
	const raw = request.nextUrl.searchParams.get("url");
	if (!raw) return new Response("Missing url", { status: 400 });

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return new Response("Invalid url", { status: 400 });
	}
	if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
		return new Response("Host not allowed", { status: 403 });
	}

	const res = await fetch(url, { redirect: "follow" });
	const finalHost = new URL(res.url).hostname;
	if (!ALLOWED_HOSTS.has(finalHost)) {
		return new Response("Redirected to a host that is not allowed", { status: 403 });
	}
	if (!res.ok || !res.body) {
		return new Response("Failed to download image", { status: 502 });
	}
	const type = res.headers.get("content-type") ?? "";
	if (!type.startsWith("image/")) {
		return new Response("Not an image", { status: 415 });
	}
	const length = Number(res.headers.get("content-length") ?? 0);
	if (length > MAX_BYTES) {
		return new Response("Image too large", { status: 413 });
	}
	const buffer = await res.arrayBuffer();
	if (buffer.byteLength > MAX_BYTES) {
		return new Response("Image too large", { status: 413 });
	}
	return new Response(buffer, {
		headers: {
			"Content-Type": type,
			"Cache-Control": "public, max-age=86400",
		},
	});
}
