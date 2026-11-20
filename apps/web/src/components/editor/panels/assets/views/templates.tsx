"use client";

import { toast } from "sonner";
import { PanelView } from "./base-panel";
import { TEMPLATES } from "@/editor/templates";
import { TemplatePreview } from "@/components/editor/template-preview";
import { getEditor, useEditorStore } from "@/editor/store";
import { createFrameLayer } from "@/editor/defaults";
import { frameRect, nextFramePosition } from "@/editor/freeform";
import type { Template } from "@/editor/templates";

/** FreeForm: a template becomes a new frame to the right of existing work. */
export function addTemplateFrame(template: Template) {
	const doc = getEditor().doc;
	if (!doc) return;
	const { canvas, layers } = template.build();
	const pos = nextFramePosition(doc.layers);
	const frame = createFrameLayer({
		name: template.name,
		width: canvas.width,
		height: canvas.height,
		fill: canvas.background,
		stroke: { enabled: false, color: "#d4d4d4", width: 1 },
		...pos,
	});
	const children = layers.map((l) => ({ ...l, x: l.x + pos.x, y: l.y + pos.y, parentId: frame.id }));
	getEditor().addLayers([frame, ...children], { select: false });
	getEditor().select([frame.id]);
	getEditor().requestFit(frameRect(frame));
}

export function TemplatesView() {
	const categories = Array.from(new Set(TEMPLATES.map((t) => t.category)));

	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");

	const apply = (id: string) => {
		const template = TEMPLATES.find((t) => t.id === id);
		if (!template) return;
		if (freeform) {
			addTemplateFrame(template);
			toast.success(`Added "${template.name}" as a new frame`, {
				action: { label: "Undo", onClick: () => getEditor().undo() },
			});
			return;
		}
		getEditor().replaceDocument(template.build());
		toast.success(`Applied "${template.name}"`, {
			action: { label: "Undo", onClick: () => getEditor().undo() },
		});
	};

	return (
		<PanelView title={freeform ? "Templates (adds a frame)" : "Templates"}>
			<div className="flex flex-col gap-5 pb-4">
				{categories.map((category) => (
					<div key={category} className="flex flex-col gap-2">
						<span className="text-muted-foreground text-xs font-medium">{category}</span>
						<div className="grid grid-cols-2 gap-2">
							{TEMPLATES.filter((t) => t.category === category).map((template) => (
								<button
									key={template.id}
									type="button"
									onClick={() => apply(template.id)}
									className="group flex flex-col gap-1 text-left"
								>
									<TemplatePreview
										template={template}
										className="rounded-md ring-2 ring-transparent transition group-hover:ring-sky-500"
									/>
									<span className="truncate text-xs">{template.name}</span>
								</button>
							))}
						</div>
					</div>
				))}
			</div>
		</PanelView>
	);
}
