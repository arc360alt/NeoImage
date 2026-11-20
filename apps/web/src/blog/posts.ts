export type Post = {
	slug: string;
	title: string;
	description: string;
	publishedAt: string;
	author: string;
	content: string;
};

const POSTS: Post[] = [
	{
		slug: "introducing-openimage",
		title: "Introducing OpenImage",
		description:
			"A free, open-source photo editor that combines the ease of Canva with the power of Photoshop.",
		publishedAt: "2026-11-05",
		author: "The OpenImage team",
		content: `Most photo editors force a choice. Design tools are friendly but shallow; pro editors are powerful but intimidating, and many of the good features now sit behind a subscription.

**OpenImage** is our attempt at both: a layer-based editor with real adjustments and filters, plus the templates, text styles and stickers that make quick designs painless.

## Private by design

Everything runs in your browser. Your images are stored in IndexedDB on your own device and are never uploaded. Even AI background removal runs locally, using an on-device model.

## What's in the first beta

- A project manager to keep your designs organised
- Layers for images, text, shapes, stickers and drawings
- Adjustments: brightness, contrast, saturation, hue, blur, noise, pixelate and more
- Templates for social posts, thumbnails, stories and posters
- Crop, flip, rotate and smart alignment guides
- Export to PNG, JPEG or WebP at up to 3x resolution

## What's next

Layer masks, selections and retouching brushes are next on the [roadmap](/roadmap). If you'd like to help, the whole project is open source.`,
	},
	{
		slug: "how-layers-work",
		title: "How layers work in OpenImage",
		description:
			"A quick tour of the layers panel: stacking order, blend modes, locking and more.",
		publishedAt: "2026-11-05",
		author: "The OpenImage team",
		content: `Every object you add to a design (a photo, a heading, a shape) is its own **layer**. The layers panel at the bottom of the editor lists them from top to bottom.

## Reordering

Use the arrow buttons or the keyboard shortcuts **Ctrl + ]** and **Ctrl + [** to move a layer up or down. Layers higher in the list are drawn on top.

## Visibility and locking

The eye icon hides a layer without deleting it. The lock icon prevents it from being selected or moved on the canvas, which is handy for backgrounds.

## Blend modes

In the properties panel you can change how a layer mixes with the layers below it: multiply, screen, overlay, and more. Try a gradient shape set to *overlay* on top of a photo for an instant color grade.`,
	},
];

export function getPosts(): Post[] {
	return [...POSTS].sort(
		(a, b) =>
			new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
	);
}

export function getPostBySlug({ slug }: { slug: string }): Post | undefined {
	return POSTS.find((post) => post.slug === slug);
}
