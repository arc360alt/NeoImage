"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";
import { PanelView } from "./base-panel";
import { Button } from "@/components/ui/button";
import { addText } from "@/editor/actions";
import { getEditor } from "@/editor/store";
import { getInsertionArea } from "@/editor/insertion";
import { ensureFont } from "@/editor/fonts";
import { solid } from "@/editor/defaults";
import type { TextLayer } from "@/editor/types";
import { useEffect } from "react";

type Style = {
	id: string;
	label: string;
	preview: React.CSSProperties;
	layer: Partial<TextLayer>;
};

const STYLES: Style[] = [
	{
		id: "display",
		label: "BOLD DISPLAY",
		preview: { fontFamily: "Bebas Neue", fontSize: 26, letterSpacing: 2 },
		layer: { text: "BOLD DISPLAY", fontFamily: "Bebas Neue", letterSpacing: 4 },
	},
	{
		id: "elegant",
		label: "Elegant Serif",
		preview: { fontFamily: "Playfair Display", fontStyle: "italic", fontSize: 22 },
		layer: { text: "Elegant Serif", fontFamily: "Playfair Display", fontStyle: "italic" },
	},
	{
		id: "script",
		label: "Handwritten",
		preview: { fontFamily: "Pacifico", fontSize: 22 },
		layer: { text: "Handwritten", fontFamily: "Pacifico" },
	},
	{
		id: "outline",
		label: "OUTLINE",
		preview: { fontFamily: "Anton", fontSize: 24, color: "transparent", WebkitTextStroke: "1.5px currentColor" },
		layer: {
			text: "OUTLINE",
			fontFamily: "Anton",
			fill: { type: "transparent" },
			stroke: { enabled: true, color: "#111111", width: 3 },
		},
	},
	{
		id: "gradient",
		label: "Gradient Pop",
		preview: {
			fontFamily: "Poppins",
			fontWeight: 700,
			fontSize: 22,
			background: "linear-gradient(90deg,#f093fb,#f5576c)",
			WebkitBackgroundClip: "text",
			color: "transparent",
		},
		layer: {
			text: "Gradient Pop",
			fontFamily: "Poppins",
			fontWeight: "bold",
			fill: {
				type: "linear",
				angle: 90,
				stops: [
					{ offset: 0, color: "#f093fb" },
					{ offset: 1, color: "#f5576c" },
				],
			},
		},
	},
	{
		id: "neon",
		label: "Neon Glow",
		preview: { fontFamily: "Righteous", fontSize: 22, color: "#f0abfc", textShadow: "0 0 6px #d946ef" },
		layer: {
			text: "Neon Glow",
			fontFamily: "Righteous",
			fill: solid("#f5d0fe"),
			shadow: { enabled: true, color: "#d946ef", blur: 30, offsetX: 0, offsetY: 0, opacity: 1 },
		},
	},
	{
		id: "retro",
		label: "Retro Shadow",
		preview: { fontFamily: "Lobster", fontSize: 22, color: "#f97316", textShadow: "2px 2px 0 #1e293b" },
		layer: {
			text: "Retro Shadow",
			fontFamily: "Lobster",
			fill: solid("#f97316"),
			shadow: { enabled: true, color: "#1e293b", blur: 0, offsetX: 6, offsetY: 6, opacity: 1 },
		},
	},
	{
		id: "marker",
		label: "Marker",
		preview: { fontFamily: "Permanent Marker", fontSize: 22 },
		layer: { text: "Marker", fontFamily: "Permanent Marker" },
	},
	{
		id: "mono",
		label: "monospace_",
		preview: { fontFamily: "JetBrains Mono", fontSize: 18 },
		layer: { text: "monospace_", fontFamily: "JetBrains Mono" },
	},
	{
		id: "spaced",
		label: "W I D E",
		preview: { fontFamily: "Montserrat", fontWeight: 700, fontSize: 16, letterSpacing: 6 },
		layer: { text: "WIDE", fontFamily: "Montserrat", fontWeight: "bold", letterSpacing: 24 },
	},
];

export function TextView() {
	useEffect(() => {
		for (const style of STYLES) {
			if (style.layer.fontFamily) void ensureFont(style.layer.fontFamily);
		}
	}, []);

	const canvasSize = () => {
		if (!getEditor().doc) return 1080;
		const area = getInsertionArea();
		return Math.min(area.width, area.height);
	};

	return (
		<PanelView title="Text">
			<div className="flex flex-col gap-4 pb-4">
				<Button className="w-full gap-2" onClick={() => addText({ text: "Add your text" })}>
					<HugeiconsIcon icon={TextIcon} />
					Add a text box
				</Button>
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">Default text styles</span>
					<button
						type="button"
						className="hover:bg-accent rounded-md border px-3 py-2.5 text-left text-xl font-bold"
						onClick={() =>
							addText({ text: "Add a heading", fontWeight: "bold", fontSize: Math.round(canvasSize() / 10) })
						}
					>
						Add a heading
					</button>
					<button
						type="button"
						className="hover:bg-accent rounded-md border px-3 py-2 text-left text-base font-medium"
						onClick={() =>
							addText({ text: "Add a subheading", fontSize: Math.round(canvasSize() / 18) })
						}
					>
						Add a subheading
					</button>
					<button
						type="button"
						className="hover:bg-accent rounded-md border px-3 py-2 text-left text-xs"
						onClick={() =>
							addText({ text: "Add a little bit of body text", fontSize: Math.round(canvasSize() / 30) })
						}
					>
						Add a little bit of body text
					</button>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">Font combinations</span>
					<div className="grid grid-cols-2 gap-1.5">
						{STYLES.map((style) => (
							<button
								key={style.id}
								type="button"
								onClick={() =>
									addText({ ...style.layer, fontSize: Math.round(canvasSize() / 9) })
								}
								className="hover:bg-accent flex h-16 items-center justify-center overflow-hidden rounded-md border px-2 text-center"
							>
								<span style={style.preview} className="truncate">
									{style.label}
								</span>
							</button>
						))}
					</div>
				</div>
			</div>
		</PanelView>
	);
}
