import type { ElementType } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Layers01Icon,
	AiMagicIcon,
	DatabaseIcon,
	PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	icon: ElementType<{ className?: string }>;
};

const icon =
	(svg: Parameters<typeof HugeiconsIcon>[0]["icon"]) =>
	({ className }: { className?: string }) =>
		createElement(HugeiconsIcon, { icon: svg, className });

export const EXTERNAL_TOOLS: ExternalTool[] = [
	{
		name: "Konva",
		description: "The 2D canvas framework that powers the NeoImage editor",
		url: "https://konvajs.org",
		icon: icon(Layers01Icon),
	},
	{
		name: "Transformers.js",
		description: "On-device AI used for one-click background removal",
		url: "https://huggingface.co/docs/transformers.js",
		icon: icon(AiMagicIcon),
	},
	{
		name: "Radix UI",
		description: "Accessible primitives behind every menu and dialog",
		url: "https://www.radix-ui.com",
		icon: icon(PaintBoardIcon),
	},
	{
		name: "IndexedDB",
		description: "Keeps your projects and images on your own device",
		url: "https://developer.mozilla.org/docs/Web/API/IndexedDB_API",
		icon: icon(DatabaseIcon),
	},
];
