import { toast } from "sonner";
import { getEditor } from "./store";
import { layersToSvg } from "./svg-export";

/**
 * Copying layers also puts them on the system clipboard as SVG, so they paste
 * into Figma, Illustrator or a code editor. The token tells our own paste
 * handler to use the full-fidelity internal clipboard instead.
 */
let clipboardToken = "";

export async function shareClipboard(ids: string[]) {
	if (!navigator.clipboard?.writeText) return;
	clipboardToken = Math.random().toString(36).slice(2);
	try {
		await navigator.clipboard.writeText(await layersToSvg(ids, { marker: clipboardToken }));
	} catch {
		// Clipboard access can be denied; the internal clipboard still works.
	}
}

export function isOwnClipboard(text: string) {
	return !!clipboardToken && text.includes(`data-neoimage-clip="${clipboardToken}"`);
}

export async function copySelectionAsSvg() {
	const editor = getEditor();
	try {
		const svg = await layersToSvg(editor.selectedIds);
		await navigator.clipboard.writeText(svg);
		toast.success("Copied as SVG");
	} catch (error) {
		toast.error("Couldn't copy as SVG", { description: error instanceof Error ? error.message : undefined });
	}
}


/** Copy / Cut from menus: internal clipboard plus the SVG on the system clipboard. */
export function copySelection() {
	const editor = getEditor();
	if (editor.selectedIds.length === 0) return;
	editor.copy();
	void shareClipboard(editor.selectedIds);
}

export function cutSelection() {
	const editor = getEditor();
	if (editor.selectedIds.length === 0) return;
	void shareClipboard(editor.selectedIds);
	editor.cut();
}
