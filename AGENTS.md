# Agents.md

## Architecture

OpenImage is a bun + turborepo monorepo. Each app under `apps/` is a UI shell.

- `apps/web/` — Next.js (App Router), Tailwind v4, Radix UI, zustand, Konva

## Web

### Layout of `apps/web/src`

- `app/` — routes: landing page, `/projects`, `/editor/[project_id]`, and marketing pages
- `components/ui/` — shared design-system primitives (shadcn-style). Read them before using them; they already apply classes.
- `components/editor/` — the photo editor shell (header, panels, canvas, layers)
- `editor/` — editor state (zustand store, history, tools, filters, export)
- `storage/` — IndexedDB persistence for projects and image assets

### Project modes

`ProjectDoc.mode` is `"default"` (one artboard, `doc.canvas`) or `"freeform"` (infinite canvas). In FreeForm, `frame` layers group other layers via `parentId`; child positions stay in world coordinates. Use `editor/insertion.ts` (`getInsertionArea`) instead of `doc.canvas` when placing new content, so it lands in the right frame. FreeForm helpers live in `editor/freeform.ts`; frame/region export is in `editor/stage.ts` and `editor/export.ts`.

### React

- Read components before using them. They may already apply classes, which affects what you need to pass and how to override them.
- The Konva canvas must only render on the client (`next/dynamic` with `ssr: false`).
