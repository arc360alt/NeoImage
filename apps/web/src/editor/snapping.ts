import type Konva from "konva";

export type Guide = { orientation: "V" | "H"; position: number };

type Edge = { guide: number; offset: number; snap: "start" | "center" | "end" };

function edgesOf(rect: { x: number; y: number; width: number; height: number }) {
	return {
		vertical: [
			{ guide: rect.x, snap: "start" as const },
			{ guide: rect.x + rect.width / 2, snap: "center" as const },
			{ guide: rect.x + rect.width, snap: "end" as const },
		],
		horizontal: [
			{ guide: rect.y, snap: "start" as const },
			{ guide: rect.y + rect.height / 2, snap: "center" as const },
			{ guide: rect.y + rect.height, snap: "end" as const },
		],
	};
}

/**
 * Snaps a dragged node to the artboard and to other layers. Returns the
 * guides to draw. Coordinates are artboard units.
 */
export function snapNode({
	node,
	parent,
	others,
	artboard,
	threshold,
}: {
	node: Konva.Node;
	parent: Konva.Container;
	others: Konva.Node[];
	/** Default mode snaps to the artboard; FreeForm has none. */
	artboard?: { width: number; height: number };
	threshold: number;
}): Guide[] {
	const stopsV = artboard ? [0, artboard.width / 2, artboard.width] : [];
	const stopsH = artboard ? [0, artboard.height / 2, artboard.height] : [];
	for (const other of others) {
		const r = other.getClientRect({ relativeTo: parent, skipShadow: true });
		stopsV.push(r.x, r.x + r.width / 2, r.x + r.width);
		stopsH.push(r.y, r.y + r.height / 2, r.y + r.height);
	}

	const box = node.getClientRect({ relativeTo: parent, skipShadow: true });
	const absPos = node.position();
	const edges = edgesOf(box);
	const vEdges: Edge[] = edges.vertical.map((e) => ({ ...e, offset: absPos.x - box.x }));
	const hEdges: Edge[] = edges.horizontal.map((e) => ({ ...e, offset: absPos.y - box.y }));

	let bestV: { diff: number; stop: number; edge: Edge } | null = null;
	for (const stop of stopsV) {
		for (const edge of vEdges) {
			const diff = Math.abs(stop - edge.guide);
			if (diff < threshold && (!bestV || diff < bestV.diff)) bestV = { diff, stop, edge };
		}
	}
	let bestH: { diff: number; stop: number; edge: Edge } | null = null;
	for (const stop of stopsH) {
		for (const edge of hEdges) {
			const diff = Math.abs(stop - edge.guide);
			if (diff < threshold && (!bestH || diff < bestH.diff)) bestH = { diff, stop, edge };
		}
	}

	const guides: Guide[] = [];
	const pos = node.position();
	if (bestV) {
		const shift = bestV.stop - bestV.edge.guide;
		pos.x += shift;
		guides.push({ orientation: "V", position: bestV.stop });
	}
	if (bestH) {
		const shift = bestH.stop - bestH.edge.guide;
		pos.y += shift;
		guides.push({ orientation: "H", position: bestH.stop });
	}
	node.position(pos);
	return guides;
}
