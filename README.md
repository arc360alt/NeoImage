# NeoImage

A free, open-source photo editor and design tool that runs entirely in your browser. Think Canva's ease of use with Photoshop-style layers and adjustments.

## Why?

- **Privacy**: Your photos stay on your device. Projects and images are stored in your browser (IndexedDB).
- **Free features**: Layers, filters, templates and AI background removal, with no paywall.
- **Simple**: Pick a size or template, drop in photos, add text, export.

## Features

Two project types:

- **Default**: one fixed-size canvas, Canva-style.
- **FreeForm**: an infinite canvas with frames, Figma-style. Draw frames (F), rectangles (R), ellipses (O), lines (L) and text (T); layers inside a frame are clipped to it and move with it; a layer tree on the left; and a Design panel on the right with per-frame export settings (scale, format, suffix). Exporting several files downloads a zip.

Everything else works in both:

- **Project manager**: grid/list views, search, sort, multi-select, rename, duplicate, delete
- **New project**: social/video/print size presets, custom sizes, templates, or "Edit a photo"
- **Layers**: images, text, shapes, stickers and freehand drawings; reorder by drag and drop, lock, hide, rename, blend modes, opacity
- **Adjustments**: brightness, contrast, saturation, hue, temperature, tint, fade, vignette, blur, grain, pixelate, posterize and more
- **Filters**: one-click presets (Vivid, Noir, Vintage, Film, ...)
- **Text**: 30 fonts (Google Fonts loaded on demand), font combinations, gradients, outlines, shadows, inline editing on the canvas
- **Tools**: move/resize/rotate with snapping guides, marquee selection, crop with aspect presets, flip, align & distribute, brush/highlighter/eraser
- **AI background removal**: runs on-device with [Transformers.js](https://huggingface.co/docs/transformers.js) (RMBG-1.4); images are never uploaded
- **Stock photos**: [Pexels](https://www.pexels.com/api/) when an API key is set, otherwise featured photos from [Lorem Picsum](https://picsum.photos)
- **Export**: PNG, JPEG or WebP at 0.5x–3x, optional transparent background, or copy to clipboard
- Undo/redo, autosave, keyboard shortcuts, light and dark themes

## Project Structure

- `apps/web/`: Next.js web application
  - `src/app/`: routes (landing page, `/projects`, `/editor/[project_id]`, roadmap, blog, changelog, ...)
  - `src/components/editor/`: editor UI (header, assets panel, Konva canvas, properties panel, layers panel)
  - `src/editor/`: editor state (zustand store with history), filters, templates, export, background removal
  - `src/storage/`: IndexedDB persistence for projects and image assets

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Docker](https://docs.docker.com/get-docker/) (optional, only for self-hosting)

No database is required: everything is stored in the browser.

### Setup

1. Copy the environment file:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

   Optionally add a `PEXELS_API_KEY` to enable stock photo search.

2. Install dependencies and start the dev server:

   ```bash
   bun install
   bun dev:web
   ```

The application will be available at [http://localhost:3000](http://localhost:3000).

### Other scripts

```bash
bun run build:web        # production build
bun run check-types:web  # TypeScript check
bun run test             # unit tests
bun run generate:icons   # regenerate favicons / app icons / OG image from the logo
```

### Self-Hosting with Docker

```bash
docker compose up -d
```

The app will be available at [http://localhost:3100](http://localhost:3100).

## Credits

NeoImage is built on [OpenCut](https://github.com/OpenCut-app/OpenCut). The UI and most of the app's code come from the OpenCut project. Thanks to the OpenCut team and contributors.

## License

[MIT LICENSE](LICENSE)
