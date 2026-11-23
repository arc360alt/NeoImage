export type ChangelogEntry = {
	version: string;
	date: string;
	published?: boolean;
	title: string;
	description?: string;
	summary?: string;
	content: string;
	changes: { type: string; text: string }[];
	isLatest: boolean;
};

const entries: Omit<ChangelogEntry, "isLatest">[] = [
	{
		version: "0.3.0",
		date: "2026-11-23",
		title: "Vector editing",
		description:
			"FreeForm becomes a vector editor too: draw with the pen tool, edit points, group layers, combine shapes with boolean operations and open SVG files as editable layers.",
		summary: "Pen tool, editable paths, groups, boolean operations, better strokes and editable SVG import.",
		content: "",
		changes: [
			{ type: "new", text: "**Pen tool** (**P**): click for corners, drag for curves, Alt to break the handles, Shift for 45°. Click the first point to close the path, Enter or Esc to finish." },
			{ type: "new", text: "**Point editing**: double-click a path (or press Enter) to drag points and handles, click the outline to add a point, Delete to remove points and double-click a point to switch between corner and smooth." },
			{ type: "new", text: "**Groups**: **Ctrl/⌘+G** to group, **Ctrl/⌘+Shift+G** to ungroup. Groups can nest inside frames and each other; double-click or Ctrl/⌘-click to select inside." },
			{ type: "new", text: "**Boolean operations**: union, subtract, intersect and exclude (**Alt+Shift+U/S/I/E**), keeping curves." },
			{ type: "new", text: "**Flatten / convert to path** (**Ctrl/⌘+E**) and **Outline stroke** (**Ctrl/⌘+Alt+O**)." },
			{ type: "new", text: "Strokes can be dashed, with flat, round or square caps, miter, round or bevel joins, and inside, center or outside placement." },
			{ type: "new", text: "**Editable SVG import**: open, drop or paste SVG markup (from Figma, Illustrator…) in FreeForm to get paths, groups, gradients and text instead of a flat image." },
			{ type: "new", text: "**Copy as SVG** (**Ctrl/⌘+Shift+C**). Copying layers also puts them on the clipboard as SVG for other apps." },
			{ type: "new", text: "True vector **SVG export** for the artboard and for frames and layers." },
			{ type: "new", text: "**Settings**: canvas, snapping and tool defaults, plus fully customizable keyboard shortcuts and an About page." },
			{ type: "improved", text: "Groups, converting to paths, boolean operations, point editing and Copy as SVG also work in Default projects." },
			{ type: "improved", text: "The FreeForm dot grid now pans and zooms with the canvas." },
			{ type: "breaking", text: "**Ctrl/⌘+E** is now Flatten (it still opens Export when there's nothing to flatten); Export keeps **Ctrl/⌘+Shift+E**. **Ctrl/⌘+Shift+G** now ungroups as well as removing frames." },
			{ type: "technical", text: "Boolean operations use paper.js, loaded only the first time one is used." },
		],
	},
	{
		version: "0.2.0",
		date: "2026-11-06",
		title: "FreeForm projects",
		description:
			"A new project type with an infinite canvas and frames, inspired by Figma. Lay out several designs side by side and export each one.",
		summary: "Infinite canvas, frames, a layer tree and per-frame export settings.",
		content: "",
		changes: [
			{ type: "new", text: "Choose between **Default** and **FreeForm** when creating a project." },
			{ type: "new", text: "Frames: draw them with **F** or start from device and social presets. Content is clipped to the frame and moves with it." },
			{ type: "new", text: "Click-or-drag creation tools: rectangle (**R**), ellipse (**O**), line (**L**) and text (**T**)." },
			{ type: "new", text: "Layer tree with frames and their contents. Drag a layer onto a frame to put it inside." },
			{ type: "new", text: "Export settings per frame or layer (scale, format, suffix) with a live preview. Multiple files download as a zip." },
			{ type: "improved", text: "Templates, stickers, text and uploads are placed into the selected frame in FreeForm projects." },
		],
	},
	{
		version: "0.1.0",
		date: "2026-11-05",
		title: "Hello, NeoImage",
		description:
			"The first public beta of NeoImage: a free, open-source photo editor and design tool that runs entirely in your browser.",
		summary:
			"Layers, filters, text, shapes, templates, brush, crop and AI background removal.",
		content: "",
		changes: [
			{
				type: "new",
				text: "Project manager with grid and list views, search, sorting, multi-select, duplicate, rename and delete.",
			},
			{
				type: "new",
				text: "Layer-based editor: images, text, shapes, stickers and freehand drawings, with opacity, blend modes, lock and visibility.",
			},
			{
				type: "new",
				text: "Image adjustments (brightness, contrast, saturation, hue, blur, noise, pixelate and more) plus one-click filter presets.",
			},
			{
				type: "new",
				text: "Templates for Instagram, YouTube thumbnails, stories, posters and more.",
			},
			{
				type: "new",
				text: "Crop, flip, rotate, alignment tools and smart snapping guides.",
			},
			{
				type: "new",
				text: "**AI background removal** that runs on your device. Your images never leave your browser.",
			},
			{
				type: "new",
				text: "Export to PNG, JPEG or WebP at 1x, 2x or 3x resolution.",
			},
			{
				type: "technical",
				text: "Built with Next.js, Konva, zustand and IndexedDB.",
			},
		],
	},
];

const published = entries
	.filter((entry) => entry.published !== false)
	.sort((a, b) =>
		b.version.localeCompare(a.version, undefined, { numeric: true }),
	);

export const allChangelogs: ChangelogEntry[] = entries.map((entry) => ({
	...entry,
	isLatest:
		entry.published !== false && published[0]?.version === entry.version,
}));
