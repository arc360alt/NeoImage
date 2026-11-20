"use client";

import { Button } from "../ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CropBox } from "./crop-box";

export function Hero() {
	return (
		<div className="relative flex min-h-[calc(100svh-4.5rem)] flex-col items-center justify-between overflow-hidden px-4 text-center">
			<HeroBackground />
			<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center">
				<div className="inline-block text-4xl font-bold tracking-tighter md:text-[4rem]">
					<h1>The open source</h1>
					<CropBox>Photo editor</CropBox>
				</div>

				<p className="text-muted-foreground mx-auto mt-10 max-w-xl text-base font-light tracking-wide sm:text-xl">
					Edit photos and design graphics with layers, filters, text and AI
					tools. Private, free, and right in your browser.
				</p>

				<div className="mt-8 flex justify-center gap-8">
					<Link href="/projects">
						<Button type="submit" size="lg" className="h-11 text-base">
							Start designing
							<ArrowRight className="ml-0.5" />
						</Button>
					</Link>
				</div>
			</div>
		</div>
	);
}

function HeroBackground() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 -z-50">
			<div
				className="absolute inset-0 opacity-[0.35] dark:opacity-25"
				style={{
					backgroundImage:
						"linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
					backgroundSize: "56px 56px",
					maskImage:
						"radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 75%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 75%)",
				}}
			/>
			<div className="bg-primary/20 absolute top-[18%] left-[12%] size-72 rounded-full blur-[120px]" />
			<div className="absolute right-[10%] bottom-[18%] size-80 rounded-full bg-fuchsia-500/15 blur-[130px]" />
			<div className="absolute top-[55%] left-[40%] size-64 rounded-full bg-amber-400/10 blur-[120px]" />
		</div>
	);
}
