import type { NextRequest } from "next/server";

const PER_PAGE = 30;

type StockPhoto = {
	id: string;
	thumb: string;
	full: string;
	width: number;
	height: number;
	author: string;
	alt: string;
};

export async function GET(request: NextRequest) {
	const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
	const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
	const apiKey = process.env.PEXELS_API_KEY;
	const hasPexels = !!apiKey && apiKey !== "your_pexels_api_key_here";

	try {
		if (hasPexels) {
			const url = query
				? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`
				: `https://api.pexels.com/v1/curated?per_page=${PER_PAGE}&page=${page}`;
			const res = await fetch(url, {
				headers: { Authorization: apiKey },
				next: { revalidate: 3600 },
			});
			if (!res.ok) throw new Error(`Pexels responded ${res.status}`);
			const data = (await res.json()) as {
				photos: {
					id: number;
					width: number;
					height: number;
					alt: string;
					photographer: string;
					src: { medium: string; large2x: string };
				}[];
				next_page?: string;
			};
			const photos: StockPhoto[] = data.photos.map((p) => ({
				id: `pexels-${p.id}`,
				thumb: p.src.medium,
				full: p.src.large2x,
				width: p.width,
				height: p.height,
				author: p.photographer,
				alt: p.alt,
			}));
			return Response.json({
				photos,
				hasMore: !!data.next_page,
				source: "pexels",
				searchSupported: true,
			});
		}

		const res = await fetch(
			`https://picsum.photos/v2/list?page=${page}&limit=${PER_PAGE}`,
			{ next: { revalidate: 86400 } },
		);
		if (!res.ok) throw new Error(`Picsum responded ${res.status}`);
		const data = (await res.json()) as {
			id: string;
			author: string;
			width: number;
			height: number;
		}[];
		const photos: StockPhoto[] = data.map((p) => {
			const scale = Math.min(1, 2000 / Math.max(p.width, p.height));
			const w = Math.round(p.width * scale);
			const h = Math.round(p.height * scale);
			const thumbW = 400;
			const thumbH = Math.round((p.height / p.width) * thumbW);
			return {
				id: `picsum-${p.id}`,
				thumb: `https://picsum.photos/id/${p.id}/${thumbW}/${thumbH}`,
				full: `https://picsum.photos/id/${p.id}/${w}/${h}`,
				width: p.width,
				height: p.height,
				author: p.author,
				alt: "",
			};
		});
		return Response.json({
			photos,
			hasMore: data.length === PER_PAGE,
			source: "picsum",
			searchSupported: false,
		});
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Failed to fetch photos" },
			{ status: 502 },
		);
	}
}
