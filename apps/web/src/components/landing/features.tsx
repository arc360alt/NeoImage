import { HugeiconsIcon } from "@hugeicons/react";
import {
	AiMagicIcon,
	Layers01Icon,
	MagicWand05Icon,
	PaintBrush02Icon,
	TextIcon,
	SecurityLockIcon,
	PenTool03Icon,
} from "@hugeicons/core-free-icons";

const FEATURES = [
	{
		icon: Layers01Icon,
		title: "Layers, like Photoshop",
		description:
			"Stack images, text and shapes. Reorder, lock, hide, blend and adjust opacity per layer.",
	},
	{
		icon: MagicWand05Icon,
		title: "Filters & adjustments",
		description:
			"Brightness, contrast, saturation, hue, blur, noise, pixelate and one-click presets.",
	},
	{
		icon: TextIcon,
		title: "Design like Canva",
		description:
			"Templates for every social format, headings, stickers, shapes and gradient backgrounds.",
	},
	{
		icon: PenTool03Icon,
		title: "Vectors, like Illustrator",
		description:
			"Pen tool and editable paths, groups, boolean operations, outline stroke, and SVG files that import as editable layers.",
	},
	{
		icon: PaintBrush02Icon,
		title: "Draw & retouch",
		description:
			"Freehand brush and eraser, crop, flip, rotate and pixel-perfect alignment guides.",
	},
	{
		icon: AiMagicIcon,
		title: "AI background removal",
		description:
			"Remove image backgrounds with an on-device model. Nothing is uploaded anywhere.",
	},
	{
		icon: SecurityLockIcon,
		title: "Private by default",
		description:
			"Projects and images live in your browser's storage. No account required.",
	},
];

export function Features() {
	return (
		<section className="mx-auto max-w-5xl px-6 pb-28">
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{FEATURES.map((feature) => (
					<div
						key={feature.title}
						className="bg-background/60 flex flex-col gap-3 rounded-xl border p-6 backdrop-blur"
					>
						<div className="bg-secondary border-secondary-border text-secondary-foreground flex size-10 items-center justify-center rounded-md border">
							<HugeiconsIcon icon={feature.icon} className="size-5" />
						</div>
						<h3 className="font-semibold">{feature.title}</h3>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{feature.description}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
