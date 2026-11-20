"use client";

import type Konva from "konva";
import { useEffect, useLayoutEffect, useRef } from "react";
import { getEditor } from "@/editor/store";
import { primaryColor } from "@/editor/fill";
import type { TextLayer } from "@/editor/types";

/** A textarea positioned over a text layer for in-place editing. */
export function TextEditorOverlay({
	layer,
	stage,
	zoom,
	stagePos,
}: {
	layer: TextLayer;
	stage: Konva.Stage | null;
	zoom: number;
	stagePos: { x: number; y: number };
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const original = useRef(layer.text);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.focus();
		el.select();
	}, []);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	});

	const finish = (cancel = false) => {
		const editor = getEditor();
		const value = ref.current?.value ?? "";
		editor.setEditingTextId(null);
		if (cancel) {
			editor.updateLayer(layer.id, { text: original.current }, { transient: true });
			editor.commit();
			return;
		}
		if (!value.trim()) {
			editor.commit();
			editor.removeLayers([layer.id]);
			return;
		}
		editor.updateLayer(layer.id, { text: value, name: value.split("\n")[0].slice(0, 32) }, { transient: true });
		editor.commit();
	};

	void stage;
	const left = stagePos.x + layer.x * zoom;
	const top = stagePos.y + layer.y * zoom;
	const transform = `rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`;

	return (
		<textarea
			ref={ref}
			defaultValue={layer.text}
			spellCheck={false}
			onChange={(e) =>
				getEditor().updateLayer(layer.id, { text: e.target.value }, { transient: true })
			}
			onBlur={() => finish()}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === "Escape") {
					e.preventDefault();
					finish(true);
				}
				if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					finish();
				}
			}}
			className="absolute z-10 resize-none overflow-hidden border-none bg-transparent p-0 outline-1 outline-sky-500 outline-dashed"
			style={{
				left,
				top,
				width: layer.width * zoom,
				transform,
				transformOrigin: "left top",
				fontFamily: `"${layer.fontFamily}", sans-serif`,
				fontSize: layer.fontSize * zoom,
				fontWeight: layer.fontWeight,
				fontStyle: layer.fontStyle,
				lineHeight: layer.lineHeight,
				letterSpacing: layer.letterSpacing * zoom,
				textAlign: layer.align,
				textTransform: layer.uppercase ? "uppercase" : "none",
				color: primaryColor(layer.fill),
				caretColor: "#0ea5e9",
				whiteSpace: "pre-wrap",
				overflowWrap: "break-word",
			}}
		/>
	);
}
