/**
 * True vector SVG export.
 *
 * Instead of capturing the canvas as pixels, this walks the document model and
 * writes real SVG elements: shapes become <rect>/<ellipse>/<polygon>/<path>,
 * text stays editable <text>, gradients become <linearGradient>/<radialGradient>,
 * frames clip with <clipPath>, and eraser strokes become <mask>s.
 *
 * The only bitmaps are photos (embedded as their original file) and photos
 * with adjustments, which are baked once because those filters are per-pixel.
 * Layout mirrors the Konva canvas exactly (same transforms, text line breaks
 * and baselines, and spline curves), so the SVG matches what's on screen.
 */
import Konva from "konva";
import { adjustmentsToKonva, hasAdjustments } from "./filters";
import { FONTS, ensureFont } from "./fonts";
import { heartPath, polygonPoints, starPoints, trianglePoints } from "./geometry";
import { layerBounds, topmostIds, unionBounds, type Rect } from "./freeform";
import { pathToD } from "./path";
import { getEditor } from "./store";
import { getAssetBlob, loadAssetImage } from "@/storage/assets";
import type {
	Adjustments,
	BrushStroke,
	DrawingLayer,
	Fill,
	FrameLayer,
	GroupLayer,
	ImageLayer,
	Layer,
	PathLayer,
	ShapeLayer,
	Stroke,
	TextLayer,
} from "./types";

/* -------------------------------- Helpers -------------------------------- */

/** Compact number formatting (3 decimals, no trailing zeros). */
const n = (v: number) => {
	if (!Number.isFinite(v)) return "0";
	const r = Math.round(v * 1000) / 1000;
	return String(Object.is(r, -0) ? 0 : r);
};

const esc = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** Builds ` key="value"` pairs, skipping undefined/empty values. */
function attrs(map: Record<string, string | number | undefined | null | false>) {
	let out = "";
	for (const [key, value] of Object.entries(map)) {
		if (value === undefined || value === null || value === false || value === "") continue;
		out += ` ${key}="${typeof value === "number" ? n(value) : esc(value)}"`;
	}
	return out;
}

/**
 * Splits "#rrggbbaa" into an SVG 1.1-safe color plus opacity, since many
 * editors (Inkscape, Illustrator) don't read 8-digit hex.
 */
function splitColor(color: string): { color: string; opacity: number } {
	const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(color);
	if (hex8) return { color: `#${hex8[1]}`, opacity: Number.parseInt(hex8[2], 16) / 255 };
	const hex4 = /^#([0-9a-f]{3})([0-9a-f])$/i.exec(color);
	if (hex4) return { color: `#${hex4[1]}`, opacity: Number.parseInt(hex4[2] + hex4[2], 16) / 255 };
	if (color === "transparent") return { color: "#000000", opacity: 0 };
	return { color, opacity: 1 };
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

class SvgContext {
	defs: string[] = [];
	fonts = new Set<string>();
	private counter = 0;
	id(prefix: string) {
		this.counter += 1;
		return `${prefix}${this.counter}`;
	}

	/** fill="..." (or stroke="...") for a Fill in a width × height local box. */
	paint(fill: Fill, width: number, height: number, kind: "fill" | "stroke" = "fill"): string {
		switch (fill.type) {
			case "transparent":
				return attrs({ [kind]: "none" });
			case "solid": {
				const { color, opacity } = splitColor(fill.color);
				return attrs({ [kind]: color, [`${kind}-opacity`]: opacity < 1 ? opacity : undefined });
			}
			case "linear": {
				// Same geometry as fillToKonva so gradients line up exactly.
				const rad = ((fill.angle - 90) * Math.PI) / 180;
				const cx = width / 2;
				const cy = height / 2;
				const half = (Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad))) / 2;
				const id = this.id("g");
				this.defs.push(
					`<linearGradient id="${id}" gradientUnits="userSpaceOnUse"${attrs({
						x1: cx - Math.cos(rad) * half,
						y1: cy - Math.sin(rad) * half,
						x2: cx + Math.cos(rad) * half,
						y2: cy + Math.sin(rad) * half,
					})}>${stops(fill.stops)}</linearGradient>`,
				);
				return attrs({ [kind]: `url(#${id})` });
			}
			case "radial": {
				const id = this.id("g");
				this.defs.push(
					`<radialGradient id="${id}" gradientUnits="userSpaceOnUse"${attrs({
						cx: width / 2,
						cy: height / 2,
						r: Math.max(width, height) / 2,
					})}>${stops(fill.stops)}</radialGradient>`,
				);
				return attrs({ [kind]: `url(#${id})` });
			}
		}
	}
}

function stops(list: { offset: number; color: string }[]) {
	return [...list]
		.sort((a, b) => a.offset - b.offset)
		.map((s) => {
			const { color, opacity } = splitColor(s.color);
			return `<stop${attrs({
				offset: s.offset,
				"stop-color": color,
				"stop-opacity": opacity < 1 ? opacity : undefined,
			})}/>`;
		})
		.join("");
}

function strokeAttrs(stroke: Stroke, extra: Record<string, string | number> = {}) {
	if (!stroke.enabled || stroke.width <= 0) return "";
	const { color, opacity } = splitColor(stroke.color);
	return attrs({
		stroke: color,
		"stroke-opacity": opacity < 1 ? opacity : undefined,
		"stroke-width": stroke.width,
		...extra,
	});
}

/* ------------------------------ Layer wrapper ----------------------------- */

const BLEND_CSS: Partial<Record<Layer["blendMode"], string>> = {
	multiply: "multiply",
	screen: "screen",
	overlay: "overlay",
	darken: "darken",
	lighten: "lighten",
	"color-dodge": "color-dodge",
	"color-burn": "color-burn",
	"hard-light": "hard-light",
	"soft-light": "soft-light",
	difference: "difference",
	exclusion: "exclusion",
	hue: "hue",
	saturation: "saturation",
	color: "color",
	luminosity: "luminosity",
};

function transformOf(layer: Layer) {
	const parts = [`translate(${n(layer.x)} ${n(layer.y)})`];
	if (layer.rotation) parts.push(`rotate(${n(layer.rotation)})`);
	if (layer.scaleX !== 1 || layer.scaleY !== 1) parts.push(`scale(${n(layer.scaleX)} ${n(layer.scaleY)})`);
	return parts.join(" ");
}

/**
 * The drop shadow, in world space: canvas shadows ignore the layer's rotation,
 * so the filter sits on an untransformed outer group.
 */
function shadowFilter(ctx: SvgContext, layer: Layer) {
	if (!layer.shadow.enabled) return undefined;
	const { color, opacity } = splitColor(layer.shadow.color);
	const id = ctx.id("s");
	ctx.defs.push(
		`<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feDropShadow${attrs({
			dx: layer.shadow.offsetX,
			dy: layer.shadow.offsetY,
			stdDeviation: layer.shadow.blur / 2,
			"flood-color": color,
			"flood-opacity": layer.shadow.opacity * opacity,
		})}/></filter>`,
	);
	return `url(#${id})`;
}

/**
 * Vector approximations of the adjustments, as SVG filter primitives in the
 * same order the canvas applies them. Vignette, grain, pixelate and posterize
 * have no vector equivalent and are skipped for non-photo layers.
 */
function adjustmentFilter(ctx: SvgContext, a: Adjustments) {
	const fx: string[] = [];
	const linear = (slope: number, intercept = 0) =>
		`<feComponentTransfer><feFuncR type="linear" slope="${n(slope)}" intercept="${n(intercept)}"/><feFuncG type="linear" slope="${n(slope)}" intercept="${n(intercept)}"/><feFuncB type="linear" slope="${n(slope)}" intercept="${n(intercept)}"/></feComponentTransfer>`;
	if (a.brightness) fx.push(linear(1 + a.brightness / 100));
	if (a.contrast) {
		const c = 1 + a.contrast / 100;
		fx.push(linear(c, 0.5 - 0.5 * c));
	}
	if (a.saturation) fx.push(`<feColorMatrix type="saturate" values="${n(Math.max(0, 1 + a.saturation / 100))}"/>`);
	if (a.hue) fx.push(`<feColorMatrix type="hueRotate" values="${n(a.hue)}"/>`);
	if (a.grayscale) fx.push(`<feColorMatrix type="saturate" values="${n(1 - a.grayscale / 100)}"/>`);
	if (a.sepia) {
		const s = a.sepia / 100;
		const m = [
			0.393 + 0.607 * (1 - s), 0.769 - 0.769 * (1 - s), 0.189 - 0.189 * (1 - s), 0, 0,
			0.349 - 0.349 * (1 - s), 0.686 + 0.314 * (1 - s), 0.168 - 0.168 * (1 - s), 0, 0,
			0.272 - 0.272 * (1 - s), 0.534 - 0.534 * (1 - s), 0.131 + 0.869 * (1 - s), 0, 0,
			0, 0, 0, 1, 0,
		];
		fx.push(`<feColorMatrix type="matrix" values="${m.map(n).join(" ")}"/>`);
	}
	if (a.invert) {
		const i = a.invert / 100;
		const table = `type="table" tableValues="${n(i)} ${n(1 - i)}"`;
		fx.push(`<feComponentTransfer><feFuncR ${table}/><feFuncG ${table}/><feFuncB ${table}/></feComponentTransfer>`);
	}
	if (a.temperature || a.tint) {
		const t = (a.temperature * 0.6) / 255;
		const g = (a.tint * 0.5) / 255;
		fx.push(
			`<feColorMatrix type="matrix" values="1 0 0 0 ${n(t)} 0 1 0 0 ${n(-g)} 0 0 1 0 ${n(-t)} 0 0 0 1 0"/>`,
		);
	}
	if (a.fade) {
		const k = a.fade / 100;
		fx.push(linear(1 - 0.45 * k, (128 * 0.45 * k + 18 * k) / 255));
	}
	if (a.blur) fx.push(`<feGaussianBlur stdDeviation="${n(a.blur)}"/>`);
	if (fx.length === 0) return undefined;
	const id = ctx.id("a");
	ctx.defs.push(
		`<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">${fx.join("")}</filter>`,
	);
	return `url(#${id})`;
}

/** Opacity, blend mode and shadow outside; position/rotation/flip (and adjustments) inside. */
function wrap(
	ctx: SvgContext,
	layer: Layer,
	inner: string,
	options: { adjustments?: boolean; transform?: boolean } = {},
) {
	const blend = BLEND_CSS[layer.blendMode];
	const adjust =
		options.adjustments !== false && hasAdjustments(layer.adjustments)
			? adjustmentFilter(ctx, layer.adjustments)
			: undefined;
	const body = `<g${attrs({
		transform: options.transform === false ? undefined : transformOf(layer),
		filter: adjust,
	})}>${inner}</g>`;
	return `<g${attrs({
		id: safeId(layer.name),
		opacity: layer.opacity < 1 ? layer.opacity : undefined,
		style: blend ? `mix-blend-mode:${blend}` : undefined,
		filter: shadowFilter(ctx, layer),
	})}>${body}</g>`;
}

/** Layer names as ids make the SVG easier to work with in other editors. */
const usedIds = new Set<string>();
function safeId(name: string) {
	let base = name
		.trim()
		.replace(/[^\w-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!base || !/^[A-Za-z_]/.test(base)) base = `layer-${base}`;
	let id = base;
	let i = 2;
	while (usedIds.has(id)) id = `${base}-${i++}`;
	usedIds.add(id);
	return id;
}

/* --------------------------------- Layers -------------------------------- */

async function imageSvg(ctx: SvgContext, layer: ImageLayer) {
	const { width: w, height: h } = layer;
	let content: string;
	if (hasAdjustments(layer.adjustments)) {
		// Per-pixel filters can't be expressed as vectors: bake just this photo.
		content = `<image${attrs({
			width: w,
			height: h,
			preserveAspectRatio: "none",
			"xlink:href": await bakeImage(layer),
		})}/>`;
	} else {
		const blob = await getAssetBlob(layer.assetId);
		if (!blob) return "";
		const href = await blobToDataUrl(blob);
		if (layer.crop) {
			const image = await loadAssetImage(layer.assetId);
			const c = layer.crop;
			content = `<svg${attrs({
				width: w,
				height: h,
				viewBox: `${n(c.x)} ${n(c.y)} ${n(c.width)} ${n(c.height)}`,
				preserveAspectRatio: "none",
			})}><image${attrs({
				width: image.naturalWidth,
				height: image.naturalHeight,
				"xlink:href": href,
			})}/></svg>`;
		} else {
			content = `<image${attrs({ width: w, height: h, preserveAspectRatio: "none", "xlink:href": href })}/>`;
		}
	}
	const r = Math.min(layer.cornerRadius, Math.abs(w) / 2, Math.abs(h) / 2);
	if (r > 0) {
		const id = ctx.id("c");
		ctx.defs.push(`<clipPath id="${id}"><rect${attrs({ width: w, height: h, rx: r })}/></clipPath>`);
		content = `<g clip-path="url(#${id})">${content}</g>`;
	}
	const border = strokeAttrs(layer.stroke);
	if (border) content += `<rect${attrs({ width: w, height: h, rx: r || undefined, fill: "none" })}${border}/>`;
	return wrap(ctx, layer, content, { adjustments: false });
}

/** Renders a photo with its adjustments through Konva's own filters, once, at native resolution. */
async function bakeImage(layer: ImageLayer): Promise<string> {
	const image = await loadAssetImage(layer.assetId);
	const sourceWidth = layer.crop?.width ?? image.naturalWidth;
	const ratio = Math.max(
		0.25,
		Math.min(sourceWidth / Math.max(1, layer.width), 4096 / Math.max(1, layer.width, layer.height), 4),
	);
	const node = new Konva.Image({
		image,
		width: layer.width,
		height: layer.height,
		crop: layer.crop ?? undefined,
	});
	try {
		const { filters, attrs: filterAttrs } = adjustmentsToKonva(layer.adjustments);
		node.setAttrs(filterAttrs as Konva.ImageConfig);
		node.filters(filters);
		node.cache({ pixelRatio: ratio });
		return node.toDataURL({ pixelRatio: ratio, mimeType: "image/png" });
	} finally {
		node.destroy();
	}
}

async function textSvg(ctx: SvgContext, layer: TextLayer) {
	await ensureFont(layer.fontFamily);
	ctx.fonts.add(layer.fontFamily);
	const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
	const decoration = [layer.underline && "underline", layer.lineThrough && "line-through"]
		.filter(Boolean)
		.join(" ");
	// Let Konva lay the text out so line breaks match the canvas exactly.
	const node = new Konva.Text({
		text,
		width: layer.width,
		fontFamily: `"${layer.fontFamily}", sans-serif`,
		fontSize: layer.fontSize,
		fontStyle: [layer.fontStyle === "italic" && "italic", layer.fontWeight === "bold" ? "bold" : "normal"]
			.filter(Boolean)
			.join(" "),
		textDecoration: decoration,
		align: layer.align,
		lineHeight: layer.lineHeight,
		letterSpacing: layer.letterSpacing,
	});
	try {
		const lineHeightPx = layer.lineHeight * layer.fontSize;
		const metrics = node.measureSize("M") as {
			fontBoundingBoxAscent?: number;
			fontBoundingBoxDescent?: number;
			actualBoundingBoxAscent?: number;
			actualBoundingBoxDescent?: number;
		};
		const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? layer.fontSize * 0.8;
		const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? layer.fontSize * 0.2;
		// Konva's alphabetic baseline for the first line.
		const firstBaseline = (ascent - descent) / 2 + lineHeightPx / 2;
		const height = node.height();
		const tspans = node.textArr
			.map((line, i) => {
				if (!line.text) return "";
				const x =
					layer.align === "right"
						? layer.width - line.width
						: layer.align === "center"
							? (layer.width - line.width) / 2
							: 0;
				return `<tspan${attrs({ x, y: firstBaseline + i * lineHeightPx })}>${esc(line.text)}</tspan>`;
			})
			.join("");
		const content = `<text${attrs({
			"font-family": `'${layer.fontFamily}', sans-serif`,
			"font-size": layer.fontSize,
			"font-weight": layer.fontWeight === "bold" ? "bold" : undefined,
			"font-style": layer.fontStyle === "italic" ? "italic" : undefined,
			"letter-spacing": layer.letterSpacing || undefined,
			"text-decoration": decoration || undefined,
			"xml:space": "preserve",
		})}${ctx.paint(layer.fill, layer.width, height)}${strokeAttrs(layer.stroke, {
			"stroke-linejoin": "round",
			"paint-order": "stroke",
		})}>${tspans}</text>`;
		return wrap(ctx, layer, content);
	} finally {
		node.destroy();
	}
}

/** Caps, joins and dashes of a vector stroke (round caps and joins unless set). */
function vectorStrokeAttrs(stroke: Stroke, width = stroke.width) {
	const dash = stroke.dash?.filter((v) => v >= 0);
	return strokeAttrs(
		{ ...stroke, width },
		{
			"stroke-linejoin": stroke.join ?? "round",
			"stroke-linecap": stroke.cap ?? "round",
			...(dash && dash.some((v) => v > 0) ? { "stroke-dasharray": dash.map(n).join(" ") } : {}),
		},
	);
}

/**
 * One vector element with its fill and stroke. Inside/outside strokes are
 * drawn twice as wide and clipped (inside) or masked (outside) by the
 * element, exactly like the canvas does.
 */
function vectorElement(
	ctx: SvgContext,
	element: string,
	fill: string,
	stroke: Stroke,
	closed: boolean,
	bounds: { width: number; height: number },
) {
	const align = closed ? (stroke.align ?? "center") : "center";
	if (align === "center" || !stroke.enabled || stroke.width <= 0) {
		return `<${element}${fill}${vectorStrokeAttrs(stroke)}/>`;
	}
	const wide = `<${element} fill="none"${vectorStrokeAttrs(stroke, stroke.width * 2)}/>`;
	const id = ctx.id(align === "inside" ? "c" : "m");
	if (align === "inside") {
		ctx.defs.push(`<clipPath id="${id}"><${element}/></clipPath>`);
		return `<${element}${fill}/><g clip-path="url(#${id})">${wide}</g>`;
	}
	const pad = stroke.width * 2 + 2;
	const box = { x: -pad, y: -pad, width: Math.abs(bounds.width) + pad * 2, height: Math.abs(bounds.height) + pad * 2 };
	ctx.defs.push(
		`<mask id="${id}" maskUnits="userSpaceOnUse"${attrs(box)}><rect${attrs({ ...box, fill: "#ffffff" })}/><${element} fill="#000000"/></mask>`,
	);
	return `<${element}${fill}/><g mask="url(#${id})">${wide}</g>`;
}

function shapeSvg(ctx: SvgContext, layer: ShapeLayer) {
	const { width: w, height: h } = layer;
	const isLine = layer.shape === "line" || layer.shape === "arrow";
	const strokeWidth = layer.stroke.enabled ? layer.stroke.width : 0;
	const fill = isLine ? attrs({ fill: "none" }) : ctx.paint(layer.fill, w, h);
	let element: string;
	switch (layer.shape) {
		case "rect": {
			const r = Math.min(layer.cornerRadius, Math.abs(w) / 2, Math.abs(h) / 2);
			element = `rect${attrs({ width: w, height: h, rx: r > 0 ? r : undefined })}`;
			break;
		}
		case "ellipse":
			element = `ellipse${attrs({ cx: w / 2, cy: h / 2, rx: Math.abs(w / 2), ry: Math.abs(h / 2) })}`;
			break;
		case "triangle":
		case "polygon":
		case "star": {
			const points =
				layer.shape === "triangle"
					? trianglePoints(w, h)
					: layer.shape === "polygon"
						? polygonPoints(w, h, layer.sides)
						: starPoints(w, h, layer.sides, layer.innerRatio);
			const list: string[] = [];
			for (let i = 0; i < points.length; i += 2) list.push(`${n(points[i])},${n(points[i + 1])}`);
			element = `polygon points="${list.join(" ")}"`;
			break;
		}
		case "heart":
			element = `path d="${heartPath(w, h)}"`;
			break;
		case "line":
		case "arrow": {
			const y = Math.max(strokeWidth, 1) / 2;
			let d = `M0 ${n(y)}L${n(w)} ${n(y)}`;
			if (layer.shape === "arrow") {
				const size = Math.max(strokeWidth * 3, 12);
				d += `M${n(w - size)} ${n(y - size * 0.7)}L${n(w)} ${n(y)}L${n(w - size)} ${n(y + size * 0.7)}`;
			}
			element = `path d="${d}"`;
			break;
		}
	}
	return wrap(ctx, layer, vectorElement(ctx, element, fill, layer.stroke, !isLine, layer));
}

function pathSvg(ctx: SvgContext, layer: PathLayer) {
	const d = pathToD(layer.subpaths);
	if (!d) return "";
	const element = `path${attrs({ d, "fill-rule": layer.fillRule === "evenodd" ? "evenodd" : undefined })}`;
	const closed = layer.subpaths.length > 0 && layer.subpaths.every((s) => s.closed);
	const fill = ctx.paint(layer.fill, layer.width, layer.height);
	return wrap(ctx, layer, vectorElement(ctx, element, fill, layer.stroke, closed, layer));
}

/** Same curve Konva draws for a `tension` line: quadratic ends, cubic middle. */
function strokePath(points: number[]) {
	if (points.length < 2) return "";
	let d = `M${n(points[0])} ${n(points[1])}`;
	if (points.length > 4) {
		const line = new Konva.Line({ points, tension: 0.4 });
		const tp = line.getTensionPoints() as number[];
		line.destroy();
		const len = tp.length;
		d += `Q${n(tp[0])} ${n(tp[1])} ${n(tp[2])} ${n(tp[3])}`;
		let i = 4;
		while (i < len - 2) {
			d += `C${tp.slice(i, i + 6).map(n).join(" ")}`;
			i += 6;
		}
		d += `Q${n(tp[len - 2])} ${n(tp[len - 1])} ${n(points[points.length - 2])} ${n(points[points.length - 1])}`;
	} else {
		for (let i = 2; i < points.length; i += 2) d += `L${n(points[i])} ${n(points[i + 1])}`;
	}
	return d;
}

function strokeElement(stroke: BrushStroke, color?: string) {
	const highlighter = stroke.mode === "highlighter";
	const paint = splitColor(color ?? stroke.color);
	return `<path${attrs({
		d: strokePath(stroke.points),
		fill: "none",
		stroke: paint.color,
		"stroke-opacity": paint.opacity < 1 ? paint.opacity : undefined,
		"stroke-width": stroke.size,
		"stroke-linecap": highlighter ? "square" : "round",
		"stroke-linejoin": "round",
		opacity: color ? undefined : highlighter ? 0.4 : stroke.opacity < 1 ? stroke.opacity : undefined,
	})}/>`;
}

function drawingSvg(ctx: SvgContext, layer: DrawingLayer) {
	// Eraser strokes only remove what was drawn before them, so each run of
	// eraser strokes masks everything accumulated so far.
	const xs: number[] = [];
	const ys: number[] = [];
	let maxSize = 0;
	for (const s of layer.strokes) {
		maxSize = Math.max(maxSize, s.size);
		for (let i = 0; i < s.points.length; i += 2) {
			xs.push(s.points[i]);
			ys.push(s.points[i + 1]);
		}
	}
	if (xs.length === 0) return "";
	const pad = maxSize + 2;
	const box = {
		x: Math.min(...xs) - pad,
		y: Math.min(...ys) - pad,
		width: Math.max(...xs) - Math.min(...xs) + pad * 2,
		height: Math.max(...ys) - Math.min(...ys) + pad * 2,
	};
	let acc = "";
	let erasers: BrushStroke[] = [];
	const flushErasers = () => {
		if (erasers.length === 0) return;
		const id = ctx.id("m");
		ctx.defs.push(
			`<mask id="${id}" maskUnits="userSpaceOnUse"${attrs(box)}><rect${attrs({ ...box, fill: "#ffffff" })}/>${erasers
				.map((s) => strokeElement(s, "#000000"))
				.join("")}</mask>`,
		);
		acc = `<g mask="url(#${id})">${acc}</g>`;
		erasers = [];
	};
	for (const stroke of layer.strokes) {
		if (stroke.mode === "eraser") {
			erasers.push(stroke);
			continue;
		}
		flushErasers();
		acc += strokeElement(stroke);
	}
	flushErasers();
	return wrap(ctx, layer, acc);
}

async function frameSvg(ctx: SvgContext, frame: FrameLayer, children: Layer[], all: Layer[]) {
	const w = frame.width * frame.scaleX;
	const h = frame.height * frame.scaleY;
	const r = Math.min(frame.cornerRadius, Math.abs(w) / 2, Math.abs(h) / 2);
	const rect = `<rect${attrs({
		width: frame.width,
		height: frame.height,
		rx: frame.cornerRadius > 0 ? Math.min(frame.cornerRadius, frame.width / 2, frame.height / 2) : undefined,
	})}${ctx.paint(frame.fill, frame.width, frame.height)}${strokeAttrs(frame.stroke)}/>`;
	const blend = BLEND_CSS[frame.blendMode];
	// Frame opacity covers the frame and everything in it; its shadow and blend only the rectangle.
	const background = `<g${attrs({
		style: blend ? `mix-blend-mode:${blend}` : undefined,
		filter: shadowFilter(ctx, frame),
	})}><g transform="${transformOf(frame)}">${rect}</g></g>`;
	let inner = (await Promise.all(children.map((c) => layerSvg(ctx, c, all)))).join("");
	if (frame.clipContent && inner) {
		const id = ctx.id("c");
		ctx.defs.push(
			`<clipPath id="${id}"><rect${attrs({
				x: Math.min(frame.x, frame.x + w),
				y: Math.min(frame.y, frame.y + h),
				width: Math.abs(w),
				height: Math.abs(h),
				rx: r > 0 ? r : undefined,
			})}/></clipPath>`,
		);
		inner = `<g clip-path="url(#${id})">${inner}</g>`;
	}
	return `<g${attrs({
		id: safeId(frame.name),
		opacity: frame.opacity < 1 ? frame.opacity : undefined,
	})}>${background}${inner}</g>`;
}

/** Groups become plain <g> elements (no clipping), nesting like the layer tree. */
async function groupSvg(ctx: SvgContext, group: GroupLayer, all: Layer[]) {
	const children = all.filter((l) => l.parentId === group.id && l.id !== group.id);
	const inner = (await Promise.all(children.map((c) => layerSvg(ctx, c, all)))).join("");
	if (!inner) return "";
	const blend = BLEND_CSS[group.blendMode];
	return `<g${attrs({
		id: safeId(group.name),
		opacity: group.opacity < 1 ? group.opacity : undefined,
		style: blend ? `mix-blend-mode:${blend}` : undefined,
	})}>${inner}</g>`;
}

async function layerSvg(ctx: SvgContext, layer: Layer, all: Layer[] = []): Promise<string> {
	if (!layer.visible) return "";
	switch (layer.type) {
		case "image":
			return imageSvg(ctx, layer);
		case "text":
			return textSvg(ctx, layer);
		case "shape":
			return shapeSvg(ctx, layer);
		case "drawing":
			return drawingSvg(ctx, layer);
		case "path":
			return pathSvg(ctx, layer);
		case "group":
			return groupSvg(ctx, layer, all);
		case "frame":
			return frameSvg(
				ctx,
				layer,
				all.filter((l) => l.parentId === layer.id),
				all,
			);
	}
}

/* ------------------------------- Documents ------------------------------- */

function fontImports(fonts: Set<string>) {
	const google = [...fonts].filter((family) => FONTS.find((f) => f.family === family)?.google ?? true);
	if (google.length === 0) return "";
	const families = google
		.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,400;0,700;1,400;1,700`)
		.join("&");
	// Lets browsers show the right fonts even when they aren't installed.
	return `<style>@import url("https://fonts.googleapis.com/css2?${esc(families)}&amp;display=swap");</style>`;
}

function documentSvg(ctx: SvgContext, region: Rect, body: string, scale: number) {
	const head = fontImports(ctx.fonts) + ctx.defs.join("");
	return [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${attrs({
			width: region.width * scale,
			height: region.height * scale,
			viewBox: `${n(region.x)} ${n(region.y)} ${n(region.width)} ${n(region.height)}`,
		})}>`,
		head ? `<defs>${head}</defs>` : "",
		body,
		"</svg>",
	].join("\n");
}

/** Default mode: the whole artboard as a vector SVG. */
export async function artboardToSvg({
	scale = 1,
	transparent = false,
}: { scale?: number; transparent?: boolean } = {}): Promise<string> {
	const doc = getEditor().doc;
	if (!doc) throw new Error("No project open");
	usedIds.clear();
	const ctx = new SvgContext();
	const { width, height, background } = doc.canvas;
	const region = { x: 0, y: 0, width, height };
	let body = "";
	if (!transparent && background.type !== "transparent") {
		body += `<rect id="background"${attrs({ width, height })}${ctx.paint(background, width, height)}/>`;
	}
	// Only top-level layers here; groups (and frames) write their own children.
	const ids = new Set(doc.layers.map((l) => l.id));
	for (const layer of doc.layers) {
		if (layer.parentId && ids.has(layer.parentId)) continue;
		body += await layerSvg(ctx, layer, doc.layers);
	}
	// Layers can hang off the artboard; clip like the canvas does.
	const clip = ctx.id("c");
	ctx.defs.push(`<clipPath id="${clip}"><rect${attrs({ width, height })}/></clipPath>`);
	return documentSvg(ctx, region, `<g clip-path="url(#${clip})">${body}</g>`, scale);
}

/** FreeForm: one frame (with its contents) or one loose layer as a vector SVG. */
export async function layerToSvg(layerId: string, { scale = 1 }: { scale?: number } = {}): Promise<string> {
	const doc = getEditor().doc;
	if (!doc) throw new Error("No project open");
	const layer = doc.layers.find((l) => l.id === layerId);
	if (!layer) throw new Error("Layer not found");
	usedIds.clear();
	const ctx = new SvgContext();
	const region: Rect =
		layer.type === "frame"
			? {
					x: Math.min(layer.x, layer.x + layer.width * layer.scaleX),
					y: Math.min(layer.y, layer.y + layer.height * layer.scaleY),
					width: Math.abs(layer.width * layer.scaleX),
					height: Math.abs(layer.height * layer.scaleY),
				}
			: layerBounds(layer, doc.layers);
	if (region.width <= 0 || region.height <= 0) throw new Error("Nothing to export");
	// Export the layer even if it's hidden in the editor, like the PNG export does.
	const body = await layerSvg(ctx, { ...layer, visible: true }, doc.layers);
	return documentSvg(ctx, region, body, scale);
}

/**
 * The selection as one SVG (Copy as SVG): each selected layer with its
 * contents, cropped to their combined bounds. `marker` is stamped on the
 * root so the editor can recognise its own clipboard content.
 */
export async function layersToSvg(ids: string[], { marker }: { marker?: string } = {}): Promise<string> {
	const doc = getEditor().doc;
	if (!doc) throw new Error("No project open");
	const roots = topmostIds(doc.layers, ids);
	const layers = doc.layers.filter((l) => roots.includes(l.id));
	const region = unionBounds(layers.map((l) => layerBounds(l, doc.layers)));
	if (!region || region.width <= 0 || region.height <= 0) throw new Error("Nothing to copy");
	usedIds.clear();
	const ctx = new SvgContext();
	let body = "";
	for (const layer of layers) body += await layerSvg(ctx, { ...layer, visible: true }, doc.layers);
	const svg = documentSvg(ctx, region, body, 1);
	return marker ? svg.replace("<svg ", `<svg data-neoimage-clip="${esc(marker)}" `) : svg;
}

export function svgBlob(svg: string) {
	return new Blob([svg], { type: "image/svg+xml" });
}

