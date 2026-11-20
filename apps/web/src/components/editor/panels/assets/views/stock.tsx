"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { PanelView } from "./base-panel";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { importImageFromUrl } from "@/editor/import";

type StockPhoto = {
	id: string;
	thumb: string;
	full: string;
	width: number;
	height: number;
	author: string;
	alt: string;
};

type StockResponse = {
	photos: StockPhoto[];
	hasMore: boolean;
	source: "pexels" | "picsum";
	searchSupported: boolean;
};

export function StockView() {
	const [query, setQuery] = useState("");
	const [submitted, setSubmitted] = useState("");
	const [photos, setPhotos] = useState<StockPhoto[]>([]);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [meta, setMeta] = useState<Pick<StockResponse, "source" | "searchSupported"> | null>(null);
	const [addingId, setAddingId] = useState<string | null>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const requestId = useRef(0);

	const load = useCallback(async (q: string, p: number) => {
		const id = ++requestId.current;
		setIsLoading(true);
		try {
			const res = await fetch(`/api/stock/search?q=${encodeURIComponent(q)}&page=${p}`);
			if (!res.ok) throw new Error(`Request failed (${res.status})`);
			const data = (await res.json()) as StockResponse;
			if (id !== requestId.current) return;
			setPhotos((prev) => (p === 1 ? data.photos : [...prev, ...data.photos]));
			setHasMore(data.hasMore);
			setMeta({ source: data.source, searchSupported: data.searchSupported });
		} catch (error) {
			if (id === requestId.current) {
				toast.error("Couldn't load stock photos", {
					description: error instanceof Error ? error.message : undefined,
				});
				setHasMore(false);
			}
		} finally {
			if (id === requestId.current) setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		setPage(1);
		void load(submitted, 1);
	}, [submitted, load]);

	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting && hasMore && !isLoading) {
				const next = page + 1;
				setPage(next);
				void load(submitted, next);
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore, isLoading, page, submitted, load]);

	const add = async (photo: StockPhoto) => {
		setAddingId(photo.id);
		try {
			await importImageFromUrl({
				url: `/api/stock/download?url=${encodeURIComponent(photo.full)}`,
				name: `${photo.alt || "Photo"} by ${photo.author}.jpg`,
			});
		} catch (error) {
			toast.error("Couldn't add photo", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setAddingId(null);
		}
	};

	return (
		<PanelView title="Stock photos">
			<div className="flex flex-col gap-3 pb-4">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						setSubmitted(query.trim());
					}}
					className="relative"
				>
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
					/>
					<Input
						placeholder="Search photos..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="pl-8"
					/>
				</form>
				{meta && !meta.searchSupported && submitted && (
					<p className="text-muted-foreground text-xs">
						Search needs a Pexels API key (set <code>PEXELS_API_KEY</code>). Showing
						featured photos instead.
					</p>
				)}
				<div className="columns-2 gap-2 [&>*]:mb-2">
					{photos.map((photo) => (
						<button
							key={photo.id}
							type="button"
							onClick={() => add(photo)}
							disabled={addingId !== null}
							className="group relative block w-full overflow-hidden rounded-md"
							title={`Photo by ${photo.author}`}
						>
							{/* biome-ignore lint/performance/noImgElement: remote thumbnails */}
							<img
								src={photo.thumb}
								alt={photo.alt}
								loading="lazy"
								className="bg-accent w-full transition group-hover:brightness-90"
								style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
								draggable={false}
							/>
							<span className="absolute right-0 bottom-0 left-0 truncate bg-linear-to-t from-black/60 to-transparent px-1.5 pt-4 pb-1 text-left text-[0.65rem] text-white opacity-0 transition group-hover:opacity-100">
								{photo.author}
							</span>
							{addingId === photo.id && (
								<span className="absolute inset-0 flex items-center justify-center bg-black/40">
									<Spinner className="size-5 text-white" />
								</span>
							)}
						</button>
					))}
				</div>
				<div ref={sentinelRef} className="flex h-8 items-center justify-center">
					{isLoading && <Spinner className="size-4" />}
				</div>
				{meta && (
					<p className="text-muted-foreground text-center text-[0.7rem]">
						Photos provided by{" "}
						{meta.source === "pexels" ? (
							<a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline">
								Pexels
							</a>
						) : (
							<a href="https://picsum.photos" target="_blank" rel="noopener noreferrer" className="underline">
								Lorem Picsum
							</a>
						)}
					</p>
				)}
			</div>
		</PanelView>
	);
}
