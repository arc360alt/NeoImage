/**
 * Editable SVG import: parses SVG markup into NeoImage layers.
 *
 * - path / rect / circle / ellipse / line / polyline / polygon → path layers
 *   (plain rects and ellipses stay shape layers), g / svg / symbol / use → groups
 * - transforms are baked in, solid colors and linear/radial gradients become
 *   fills, strokes keep width, caps, joins and dashes, text becomes text layers
 * - embedded images are returned so the caller can store them as assets
 * - filters, masks, clip paths and patterns can't be edited; they're dropped
 *   and listed in `simplified` so the UI can say so
 *
 * The parser is self-contained (no DOMParser) so it runs the same in the
 * browser and in tests.
 */
import { apply, decompose, IDENTITY, multiply, rotate, scale, translate, type Matrix } from "./matrix";
import { classifyAnchor, ellipseSubpath, mapSubpaths, pathFromWorld, polygonSubpath, rectSubpath } from "./path";
import { createGroupLayer, createImageLayer, createPathLayer, createShapeLayer, createTextLayer } from "./defaults";
import type { Fill, GradientStop, Layer, Stroke, Subpath } from "./types";

/* ---------------------------------- XML ---------------------------------- */

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string) {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
		if (e[0] === "#") {
			const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : m;
		}
		return ENTITIES[e.toLowerCase()] ?? m;
	});
}

/** A small, forgiving XML parser: elements, attributes, text, CDATA; skips comments, PIs and doctypes. */
export function parseXml(src: string): XmlNode {
	const root: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
	const stack: XmlNode[] = [root];
	let i = 0;
	const top = () => stack[stack.length - 1];
	while (i < src.length) {
		const lt = src.indexOf("<", i);
		if (lt === -1) {
			top().text += decodeEntities(src.slice(i));
			break;
		}
		if (lt > i) top().text += decodeEntities(src.slice(i, lt));
		if (src.startsWith("<!--", lt)) {
			const end = src.indexOf("-->", lt + 4);
			i = end === -1 ? src.length : end + 3;
		} else if (src.startsWith("<![CDATA[", lt)) {
			const end = src.indexOf("]]>", lt + 9);
			top().text += src.slice(lt + 9, end === -1 ? src.length : end);
			i = end === -1 ? src.length : end + 3;
		} else if (src.startsWith("<?", lt)) {
			const end = src.indexOf("?>", lt + 2);
			i = end === -1 ? src.length : end + 2;
		} else if (src.startsWith("<!", lt)) {
			// <!DOCTYPE …> (possibly with an internal [subset]).
			let depth = 0;
			let j = lt + 2;
			for (; j < src.length; j++) {
				if (src[j] === "[") depth++;
				else if (src[j] === "]") depth--;
				else if (src[j] === ">" && depth <= 0) break;
			}
			i = j + 1;
		} else if (src[lt + 1] === "/") {
			const end = src.indexOf(">", lt);
			const name = localName(src.slice(lt + 2, end === -1 ? src.length : end).trim());
			// Pop to the matching element (tolerates stray closing tags).
			for (let k = stack.length - 1; k > 0; k--) {
				if (stack[k].name === name) {
					stack.length = k;
					break;
				}
			}
			i = end === -1 ? src.length : end + 1;
		} else {
			// Start tag: scan to the closing ">" outside quotes.
			let j = lt + 1;
			let quote = "";
			for (; j < src.length; j++) {
				const c = src[j];
				if (quote) {
					if (c === quote) quote = "";
				} else if (c === '"' || c === "'") quote = c;
				else if (c === ">") break;
			}
			let body = src.slice(lt + 1, j);
			const selfClosing = body.trimEnd().endsWith("/");
			if (selfClosing) body = body.trimEnd().slice(0, -1);
			const nameMatch = /^\s*([^\s/>]+)/.exec(body);
			const node: XmlNode = { name: localName(nameMatch?.[1] ?? ""), attrs: {}, children: [], text: "" };
			const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
			const rest = body.slice(nameMatch?.[0].length ?? 0);
			for (const m of rest.matchAll(attrRe)) {
				node.attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
			}
			top().children.push(node);
			if (!selfClosing) stack.push(node);
			i = j + 1;
		}
	}
	return root;
}

/** "svg:path" → "path". */
function localName(name: string) {
	const k = name.indexOf(":");
	return k === -1 ? name : name.slice(k + 1);
}

/* ---------------------------------- CSS ---------------------------------- */

type CssRule = { selector: string; decls: Record<string, string> };

export function parseDeclarations(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of text.split(";")) {
		const k = part.indexOf(":");
		if (k === -1) continue;
		const key = part.slice(0, k).trim().toLowerCase();
		const value = part.slice(k + 1).replace(/!important/i, "").trim();
		if (key) out[key] = value;
	}
	return out;
}

function parseCss(text: string): CssRule[] {
	const rules: CssRule[] = [];
	const clean = text.replace(/\/\*[\s\S]*?\*\//g, "");
	let i = 0;
	while (i < clean.length) {
		const open = clean.indexOf("{", i);
		if (open === -1) break;
		const selector = clean.slice(i, open).trim();
		// Skip @-rules with nested blocks (e.g. @media) entirely.
		let depth = 1;
		let j = open + 1;
		for (; j < clean.length && depth > 0; j++) {
			if (clean[j] === "{") depth++;
			else if (clean[j] === "}") depth--;
		}
		const body = clean.slice(open + 1, j - 1);
		if (!selector.startsWith("@")) {
			const decls = parseDeclarations(body);
			for (const sel of selector.split(",")) rules.push({ selector: sel.trim(), decls });
		}
		i = j;
	}
	return rules;
}

/** Simple selectors only: tag, .class, #id, tag.class (combinators aren't supported). */
function matches(selector: string, node: XmlNode) {
	if (/[\s>+~[:]/.test(selector)) return false;
	const m = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/.exec(selector);
	if (!m) return false;
	if (m[1] && m[1] !== "*" && m[1] !== node.name) return false;
	const classes = (node.attrs.class ?? "").split(/\s+/);
	for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
		if (part[0] === "." && !classes.includes(part.slice(1))) return false;
		if (part[0] === "#" && node.attrs.id !== part.slice(1)) return false;
	}
	return true;
}

/* -------------------------------- Numbers -------------------------------- */

const NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function numbers(s: string | undefined): number[] {
	return (s?.match(NUM_RE) ?? []).map(Number);
}

/** A length in user units ("12px", "1.5em" ≈ ×16, "50%" of `ref`). */
function length(v: string | undefined, ref = 0, fallback = 0): number {
	if (v === undefined || v === "") return fallback;
	const n = Number.parseFloat(v);
	if (!Number.isFinite(n)) return fallback;
	if (v.endsWith("%")) return (n / 100) * ref;
	if (v.endsWith("em")) return n * 16;
	if (v.endsWith("pt")) return n * (4 / 3);
	if (v.endsWith("mm")) return n * 3.7795;
	if (v.endsWith("cm")) return n * 37.795;
	if (v.endsWith("in")) return n * 96;
	return n;
}

/* ------------------------------- Transforms ------------------------------ */

export function parseTransform(s: string | undefined): Matrix {
	let m: Matrix = [...IDENTITY];
	if (!s) return m;
	for (const part of s.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
		const v = numbers(part[2]);
		let t: Matrix = [...IDENTITY];
		switch (part[1]) {
			case "matrix":
				if (v.length === 6) t = v as Matrix;
				break;
			case "translate":
				t = translate(v[0] ?? 0, v[1] ?? 0);
				break;
			case "scale":
				t = scale(v[0] ?? 1, v[1] ?? v[0] ?? 1);
				break;
			case "rotate":
				t =
					v.length >= 3
						? multiply(multiply(translate(v[1], v[2]), rotate(v[0])), translate(-v[1], -v[2]))
						: rotate(v[0] ?? 0);
				break;
			case "skewX":
				t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
				break;
			case "skewY":
				t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
				break;
		}
		m = multiply(m, t);
	}
	return m;
}

/* -------------------------------- Colors --------------------------------- */

// The CSS named colors, packed as "name:rrggbb".
const NAMED =
	"aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32";
const NAMED_COLORS = new Map(NAMED.split(" ").map((p) => p.split(":") as [string, string]));

const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");

/** Parses a CSS color into [r, g, b, a] (0..255, a 0..1), or null. */
export function parseColor(input: string, currentColor = "#000000"): [number, number, number, number] | null {
	const s = input.trim().toLowerCase();
	if (s === "currentcolor") return parseColor(currentColor);
	if (s === "transparent") return [0, 0, 0, 0];
	const named = NAMED_COLORS.get(s);
	if (named) return parseColor(`#${named}`);
	if (s[0] === "#") {
		let h = s.slice(1);
		if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
		if (h.length !== 6 && h.length !== 8) return null;
		const n = (k: number) => Number.parseInt(h.slice(k, k + 2), 16);
		return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
	}
	const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
	if (!fn) return null;
	const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
	const val = (p: string | undefined, max: number) =>
		p === undefined ? max : p.endsWith("%") ? (Number.parseFloat(p) / 100) * max : Number.parseFloat(p);
	const alpha = parts[3] === undefined ? 1 : val(parts[3], 1);
	if (fn[1].startsWith("rgb")) return [val(parts[0], 255), val(parts[1], 255), val(parts[2], 255), alpha];
	const hue = (((Number.parseFloat(parts[0]) % 360) + 360) % 360) / 360;
	const sat = val(parts[1], 1);
	const light = val(parts[2], 1);
	const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
	const p = 2 * light - q;
	const ch = (t: number) => {
		const k = (t + 1) % 1;
		if (k < 1 / 6) return p + (q - p) * 6 * k;
		if (k < 1 / 2) return q;
		if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
		return p;
	};
	return [ch(hue + 1 / 3) * 255, ch(hue) * 255, ch(hue - 1 / 3) * 255, alpha];
}

/** "#rrggbb" or "#rrggbbaa" (the app's color format). */
export function colorToHex(rgba: [number, number, number, number], opacity = 1) {
	const a = Math.max(0, Math.min(1, rgba[3] * opacity));
	const base = `#${hex2(rgba[0])}${hex2(rgba[1])}${hex2(rgba[2])}`;
	return a >= 0.999 ? base : `${base}${hex2(a * 255)}`;
}

/* ------------------------------- Path data ------------------------------- */

/** Arc (SVG endpoint parameters) as cubic segments, appended to `out` as [c1, c2, p] triples. */
function arcToCubics(
	x1: number,
	y1: number,
	rxIn: number,
	ryIn: number,
	angle: number,
	largeArc: boolean,
	sweep: boolean,
	x2: number,
	y2: number,
): [number, number, number, number, number, number][] {
	if (x1 === x2 && y1 === y2) return [];
	let rx = Math.abs(rxIn);
	let ry = Math.abs(ryIn);
	if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
	const phi = (angle * Math.PI) / 180;
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);
	const dx = (x1 - x2) / 2;
	const dy = (y1 - y2) / 2;
	const x1p = cos * dx + sin * dy;
	const y1p = -sin * dx + cos * dy;
	const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	const sign = largeArc === sweep ? -1 : 1;
	const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
	const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
	const coef = sign * Math.sqrt(Math.max(0, num / den));
	const cxp = (coef * (rx * y1p)) / ry;
	const cyp = (coef * -(ry * x1p)) / rx;
	const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
	const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
	const angleOf = (ux: number, uy: number, vx: number, vy: number) => {
		const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
		return a;
	};
	const theta1 = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
	let delta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
	if (!sweep && delta > 0) delta -= 2 * Math.PI;
	if (sweep && delta < 0) delta += 2 * Math.PI;
	const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
	const step = delta / segments;
	const k = (4 / 3) * Math.tan(step / 4);
	const out: [number, number, number, number, number, number][] = [];
	const point = (t: number) => {
		const ex = Math.cos(t) * rx;
		const ey = Math.sin(t) * ry;
		return { x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy };
	};
	const deriv = (t: number) => {
		const ex = -Math.sin(t) * rx;
		const ey = Math.cos(t) * ry;
		return { x: cos * ex - sin * ey, y: sin * ex + cos * ey };
	};
	for (let i = 0; i < segments; i++) {
		const a = theta1 + i * step;
		const b = a + step;
		const p0 = point(a);
		const p3 = i === segments - 1 ? { x: x2, y: y2 } : point(b);
		const d0 = deriv(a);
		const d3 = deriv(b);
		out.push([p0.x + k * d0.x, p0.y + k * d0.y, p3.x - k * d3.x, p3.y - k * d3.y, p3.x, p3.y]);
	}
	return out;
}

/** Parses SVG path data into subpaths (absolute coordinates). */
export function parsePathData(d: string): Subpath[] {
	const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
	const subpaths: Subpath[] = [];
	let current: Subpath | null = null;
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	type Pt = { x: number; y: number };
	let lastCtrl: Pt | null = null;
	let lastQuad: Pt | null = null;
	let cmd = "";
	let i = 0;
	const next = () => Number(tokens[i++]);
	const isCommand = (t: string) => /^[a-zA-Z]$/.test(t);
	const hasNumber = () => i < tokens.length && !isCommand(tokens[i]);
	const ensure = () => {
		if (!current) {
			current = { anchors: [{ x, y, type: "corner" }], closed: false };
			subpaths.push(current);
		}
		return current;
	};
	const lastAnchor = () => {
		const s = ensure();
		return s.anchors[s.anchors.length - 1];
	};
	const lineTo = (nx: number, ny: number) => {
		ensure().anchors.push({ x: nx, y: ny, type: "corner" });
		x = nx;
		y = ny;
	};
	const curveTo = (c1x: number, c1y: number, c2x: number, c2y: number, nx: number, ny: number) => {
		const prev = lastAnchor();
		prev.handleOut = { x: c1x - prev.x, y: c1y - prev.y };
		ensure().anchors.push({ x: nx, y: ny, handleIn: { x: c2x - nx, y: c2y - ny }, type: "corner" });
		x = nx;
		y = ny;
	};
	while (i < tokens.length) {
		if (isCommand(tokens[i])) cmd = tokens[i++];
		else if (!cmd) {
			i++;
			continue;
		}
		const rel = cmd === cmd.toLowerCase();
		const C = cmd.toUpperCase();
		const ox = rel ? x : 0;
		const oy = rel ? y : 0;
		if (C === "Z") {
			if (current) {
				const sub: Subpath = current;
				const first = sub.anchors[0];
				const last = sub.anchors[sub.anchors.length - 1];
				// An explicit segment back to the start merges into the first anchor.
				if (sub.anchors.length > 1 && Math.abs(last.x - first.x) < 1e-6 && Math.abs(last.y - first.y) < 1e-6) {
					first.handleIn = last.handleIn;
					sub.anchors.pop();
				}
				sub.closed = true;
			}
			current = null;
			x = startX;
			y = startY;
			lastCtrl = lastQuad = null;
			continue;
		}
		if (!hasNumber()) continue;
		let ctrl: { x: number; y: number } | null = null;
		let quad: { x: number; y: number } | null = null;
		switch (C) {
			case "M": {
				x = next() + ox;
				y = next() + oy;
				startX = x;
				startY = y;
				current = { anchors: [{ x, y, type: "corner" }], closed: false };
				subpaths.push(current);
				// Extra pairs after M are implicit line-tos.
				cmd = rel ? "l" : "L";
				break;
			}
			case "L":
				lineTo(next() + ox, next() + oy);
				break;
			case "H":
				lineTo(next() + ox, y);
				break;
			case "V":
				lineTo(x, next() + oy);
				break;
			case "C": {
				const c1x = next() + ox;
				const c1y = next() + oy;
				const c2x = next() + ox;
				const c2y = next() + oy;
				curveTo(c1x, c1y, c2x, c2y, next() + ox, next() + oy);
				ctrl = { x: c2x, y: c2y };
				break;
			}
			case "S": {
				const c1 = lastCtrl ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y };
				const c2x = next() + ox;
				const c2y = next() + oy;
				curveTo(c1.x, c1.y, c2x, c2y, next() + ox, next() + oy);
				ctrl = { x: c2x, y: c2y };
				break;
			}
			case "Q":
			case "T": {
				const q: { x: number; y: number } =
					C === "Q"
						? { x: next() + ox, y: next() + oy }
						: lastQuad
							? { x: 2 * x - lastQuad.x, y: 2 * y - lastQuad.y }
							: { x, y };
				const nx = next() + ox;
				const ny = next() + oy;
				// Quadratic → cubic: control points two thirds toward the quad control.
				curveTo(x + (2 / 3) * (q.x - x), y + (2 / 3) * (q.y - y), nx + (2 / 3) * (q.x - nx), ny + (2 / 3) * (q.y - ny), nx, ny);
				quad = q;
				break;
			}
			case "A": {
				const rx = next();
				const ry = next();
				const rot = next();
				const large = next() !== 0;
				const sweep = next() !== 0;
				const nx = next() + ox;
				const ny = next() + oy;
				const cubics = arcToCubics(x, y, rx, ry, rot, large, sweep, nx, ny);
				if (cubics.length === 0) break;
				for (const c of cubics) curveTo(c[0], c[1], c[2], c[3], c[4], c[5]);
				break;
			}
			default:
				i++;
		}
		lastCtrl = ctrl;
		lastQuad = quad;
	}
	return subpaths
		.filter((s) => s.anchors.length > 1 || s.closed)
		.map((s) => ({
			closed: s.closed,
			anchors: s.anchors.map((a) => ({ ...a, type: classifyAnchor(a.handleIn, a.handleOut) })),
		}));
}

/* --------------------------------- Import -------------------------------- */

export type ParsedSvg = {
	/** Layers in SVG user space (world units), parents before children. */
	layers: Layer[];
	/** Embedded images to store as assets: the layer's `assetId` is a placeholder until then. */
	images: { layerId: string; href: string }[];
	/** Features that couldn't be kept editable. */
	simplified: string[];
	/** The document's own size (from width/height/viewBox). */
	size: { width: number; height: number } | null;
};

type Style = Record<string, string>;

/** Properties that children inherit. */
const INHERITED = new Set([
	"fill",
	"fill-opacity",
	"fill-rule",
	"stroke",
	"stroke-width",
	"stroke-opacity",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-dasharray",
	"stroke-miterlimit",
	"font-family",
	"font-size",
	"font-weight",
	"font-style",
	"text-anchor",
	"color",
	"visibility",
	"letter-spacing",
	"text-decoration",
]);

const PRESENTATION = [
	...INHERITED,
	"opacity",
	"display",
	"mix-blend-mode",
	"stop-color",
	"stop-opacity",
	"clip-path",
	"mask",
	"filter",
];

const BLEND_MODES = new Set([
	"multiply",
	"screen",
	"overlay",
	"darken",
	"lighten",
	"color-dodge",
	"color-burn",
	"hard-light",
	"soft-light",
	"difference",
	"exclusion",
	"hue",
	"saturation",
	"color",
	"luminosity",
]);

const SKIP = new Set([
	"defs",
	"clipPath",
	"mask",
	"pattern",
	"filter",
	"linearGradient",
	"radialGradient",
	"style",
	"title",
	"desc",
	"metadata",
	"script",
	"marker",
	"symbol",
]);

const titleCase = (id: string) => id.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

export function parseSvg(markup: string): ParsedSvg {
	const doc = parseXml(markup);
	const svg = findFirst(doc, "svg");
	if (!svg) throw new Error("Not an SVG file");

	const rules: CssRule[] = [];
	const byId = new Map<string, XmlNode>();
	const walkIndex = (node: XmlNode) => {
		if (node.attrs.id) byId.set(node.attrs.id, node);
		if (node.name === "style") rules.push(...parseCss(node.text + node.children.map((c) => c.text).join("")));
		for (const c of node.children) walkIndex(c);
	};
	walkIndex(svg);

	const simplified = new Set<string>();
	const images: ParsedSvg["images"] = [];
	const out: Layer[] = [];

	const ownStyle = (node: XmlNode): Style => {
		const style: Style = {};
		for (const key of PRESENTATION) if (node.attrs[key] !== undefined) style[key] = node.attrs[key];
		for (const rule of rules) if (matches(rule.selector, node)) Object.assign(style, rule.decls);
		if (node.attrs.style) Object.assign(style, parseDeclarations(node.attrs.style));
		return style;
	};
	const computed = (node: XmlNode, parent: Style): Style => {
		const style: Style = {};
		for (const [k, v] of Object.entries(parent)) if (INHERITED.has(k)) style[k] = v;
		for (const [k, v] of Object.entries(ownStyle(node))) if (v !== "inherit") style[k] = v;
		return style;
	};

	/* ------------------------------ Paints ------------------------------ */

	const gradientStops = (node: XmlNode, seen = new Set<string>()): GradientStop[] => {
		const stops = node.children
			.filter((c) => c.name === "stop")
			.map((stop) => {
				const st = ownStyle(stop);
				const offsetRaw = stop.attrs.offset ?? "0";
				const offset = offsetRaw.endsWith("%") ? Number.parseFloat(offsetRaw) / 100 : Number.parseFloat(offsetRaw);
				const rgba = parseColor(st["stop-color"] ?? "#000000") ?? [0, 0, 0, 1];
				return {
					offset: Math.max(0, Math.min(1, Number.isFinite(offset) ? offset : 0)),
					color: colorToHex(rgba, Number.parseFloat(st["stop-opacity"] ?? "1")),
				};
			});
		if (stops.length > 0) return stops;
		const href = (node.attrs.href ?? node.attrs["xlink:href"])?.replace(/^#/, "");
		const linked = href ? byId.get(href) : undefined;
		if (linked && !seen.has(href as string)) return gradientStops(linked, new Set([...seen, href as string]));
		return [];
	};

	const gradientAttr = (node: XmlNode, key: string, seen = new Set<string>()): string | undefined => {
		if (node.attrs[key] !== undefined) return node.attrs[key];
		const href = (node.attrs.href ?? node.attrs["xlink:href"])?.replace(/^#/, "");
		const linked = href ? byId.get(href) : undefined;
		return linked && !seen.has(href as string) ? gradientAttr(linked, key, new Set([...seen, href as string])) : undefined;
	};

	const paint = (value: string | undefined, opacity: number, ctm: Matrix, style: Style): Fill | null => {
		if (!value || value === "none") return null;
		const url = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(value);
		if (url) {
			const ref = byId.get(url[1]);
			if (ref?.name === "linearGradient" || ref?.name === "radialGradient") {
				const stops = gradientStops(ref).map((s) => ({ ...s, color: applyOpacity(s.color, opacity) }));
				if (stops.length === 0) return null;
				if (stops.length === 1) return { type: "solid", color: stops[0].color };
				if (ref.name === "radialGradient") return { type: "radial", stops };
				// Direction of the gradient vector, after its own and the element's transforms.
				const units = gradientAttr(ref, "gradientUnits") ?? "objectBoundingBox";
				const pct = units === "objectBoundingBox" ? 1 : 0;
				const coord = (key: string, fallback: string) => {
					const v = gradientAttr(ref, key) ?? fallback;
					return v.endsWith("%") ? Number.parseFloat(v) / 100 : Number.parseFloat(v);
				};
				const x1 = coord("x1", "0");
				const y1 = coord("y1", "0");
				const x2 = coord("x2", pct ? "1" : "100%");
				const y2 = coord("y2", "0");
				const gt = parseTransform(gradientAttr(ref, "gradientTransform"));
				const full = units === "userSpaceOnUse" ? multiply(ctm, gt) : multiply([ctm[0], ctm[1], ctm[2], ctm[3], 0, 0], gt);
				const a = apply(full, { x: x1, y: y1 });
				const b = apply(full, { x: x2, y: y2 });
				const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
				return { type: "linear", angle: Math.round(((angle % 360) + 360) % 360 * 100) / 100, stops };
			}
			// Patterns and other paint servers aren't editable.
			simplified.add(ref?.name === "pattern" ? "patterns" : "unsupported paints");
			const fallback = /\)\s*(\S.*)$/.exec(value)?.[1];
			return fallback ? paint(fallback, opacity, ctm, style) : { type: "solid", color: "#999999" };
		}
		const rgba = parseColor(value, style.color);
		if (!rgba) return null;
		return { type: "solid", color: colorToHex(rgba, opacity) };
	};

	const strokeOf = (style: Style, ctm: Matrix): Stroke => {
		const opacity = Number.parseFloat(style["stroke-opacity"] ?? "1");
		const p = paint(style.stroke, Number.isFinite(opacity) ? opacity : 1, ctm, style);
		const k = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
		const width = length(style["stroke-width"], 0, 1) * k;
		const color = p?.type === "solid" ? p.color : p && "stops" in p ? p.stops[0]?.color ?? "#000000" : "#000000";
		if (p && p.type !== "solid") simplified.add("gradient strokes");
		const cap = style["stroke-linecap"];
		const join = style["stroke-linejoin"];
		const dash = numbers(style["stroke-dasharray"]).map((v) => v * k);
		return {
			enabled: !!p && width > 0,
			color,
			width: width || 1,
			cap: cap === "round" || cap === "square" ? cap : "butt",
			join: join === "round" || join === "bevel" ? join : "miter",
			...(dash.length > 0 && dash.some((v) => v > 0) ? { dash: dash.length % 2 ? [...dash, ...dash] : dash } : {}),
		};
	};

	/* ------------------------------ Elements ----------------------------- */

	const baseProps = (node: XmlNode, style: Style, parentId: string | undefined) => {
		const opacity = Number.parseFloat(style.opacity ?? "1");
		const blend = style["mix-blend-mode"];
		return {
			name: node.attrs.id ? titleCase(node.attrs.id) : undefined,
			parentId,
			opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1,
			visible: style.visibility !== "hidden" && style.visibility !== "collapse",
			blendMode: blend && BLEND_MODES.has(blend) ? (blend as Layer["blendMode"]) : ("source-over" as const),
		};
	};

	const noteUnsupported = (style: Style) => {
		if (style.filter && style.filter !== "none") simplified.add("filters");
		if (style.mask && style.mask !== "none") simplified.add("masks");
		if (style["clip-path"] && style["clip-path"] !== "none") simplified.add("clip paths");
	};

	/** Geometry of a basic shape or path element in its own coordinates, or null. */
	const geometryOf = (node: XmlNode): Subpath[] | null => {
		const a = node.attrs;
		switch (node.name) {
			case "path":
				return parsePathData(a.d ?? "");
			case "rect": {
				const w = length(a.width);
				const h = length(a.height);
				if (w <= 0 || h <= 0) return null;
				let rx = length(a.rx, w, Number.NaN);
				let ry = length(a.ry, h, Number.NaN);
				if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
				if (Number.isNaN(ry)) ry = rx;
				const x = length(a.x);
				const y = length(a.y);
				if (rx > 0 && Math.abs(rx - ry) > 1e-6) {
					// Elliptical corners: build them with arcs.
					const rxc = Math.min(rx, w / 2);
					const ryc = Math.min(ry, h / 2);
					return parsePathData(
						`M${x + rxc} ${y}H${x + w - rxc}A${rxc} ${ryc} 0 0 1 ${x + w} ${y + ryc}V${y + h - ryc}A${rxc} ${ryc} 0 0 1 ${x + w - rxc} ${y + h}H${x + rxc}A${rxc} ${ryc} 0 0 1 ${x} ${y + h - ryc}V${y + ryc}A${rxc} ${ryc} 0 0 1 ${x + rxc} ${y}Z`,
					);
				}
				return [rectSubpath(x, y, w, h, rx)];
			}
			case "circle": {
				const r = length(a.r);
				return r > 0 ? [ellipseSubpath(length(a.cx), length(a.cy), r, r)] : null;
			}
			case "ellipse": {
				const rx = length(a.rx);
				const ry = length(a.ry);
				return rx > 0 && ry > 0 ? [ellipseSubpath(length(a.cx), length(a.cy), rx, ry)] : null;
			}
			case "line":
				return [polygonSubpath([length(a.x1), length(a.y1), length(a.x2), length(a.y2)], false)];
			case "polyline":
			case "polygon": {
				const pts = numbers(a.points);
				if (pts.length < 4) return null;
				return [polygonSubpath(pts.slice(0, pts.length - (pts.length % 2)), node.name === "polygon")];
			}
		}
		return null;
	};

	/** Plain rects and ellipses (no skew, round corners) stay shape layers. */
	const asShape = (node: XmlNode, ctm: Matrix) => {
		if (node.name !== "rect" && node.name !== "circle" && node.name !== "ellipse") return null;
		const [a, b, c, d] = ctm;
		// Columns must be perpendicular (rotation/scale/flip only).
		if (Math.abs(a * c + b * d) > 1e-6 * Math.max(1, Math.abs(a * d))) return null;
		const t = decompose(ctm);
		const sx = Math.abs(t.scaleX);
		const sy = Math.abs(t.scaleY);
		const at = node.attrs;
		let box: { x: number; y: number; w: number; h: number; r: number };
		if (node.name === "rect") {
			const rx = length(at.rx, 0, Number.NaN);
			const ry = length(at.ry, 0, Number.NaN);
			const radius = Number.isNaN(rx) ? (Number.isNaN(ry) ? 0 : ry) : rx;
			if (!Number.isNaN(rx) && !Number.isNaN(ry) && Math.abs(rx - ry) > 1e-6) return null;
			if (radius > 0 && Math.abs(sx - sy) > 1e-6) return null;
			box = { x: length(at.x), y: length(at.y), w: length(at.width), h: length(at.height), r: radius * sx };
		} else {
			const rx = node.name === "circle" ? length(at.r) : length(at.rx);
			const ry = node.name === "circle" ? length(at.r) : length(at.ry);
			box = { x: length(at.cx) - rx, y: length(at.cy) - ry, w: rx * 2, h: ry * 2, r: 0 };
		}
		if (box.w <= 0 || box.h <= 0) return null;
		const origin = apply(ctm, { x: box.x, y: box.y });
		return {
			kind: node.name === "rect" ? ("rect" as const) : ("ellipse" as const),
			x: origin.x,
			y: origin.y,
			rotation: t.rotation,
			scaleY: t.scaleY < 0 ? -1 : 1,
			width: box.w * sx,
			height: box.h * sy,
			cornerRadius: box.r,
		};
	};

	const visit = (node: XmlNode, parentStyle: Style, parentCtm: Matrix, parentId: string | undefined, depth: number) => {
		if (depth > 64 || SKIP.has(node.name)) return;
		const style = computed(node, parentStyle);
		if (style.display === "none") return;
		const ctm = multiply(parentCtm, parseTransform(node.attrs.transform));
		noteUnsupported(style);

		if (node.name === "g" || node.name === "a" || node.name === "switch") {
			container(node, style, ctm, parentId, depth, node.children);
			return;
		}
		if (node.name === "svg") {
			// Nested <svg>: position and viewBox; its clipping is dropped.
			const inner = multiply(multiply(ctm, translate(length(node.attrs.x), length(node.attrs.y))), viewBoxMatrix(node));
			container(node, style, inner, parentId, depth, node.children);
			return;
		}
		if (node.name === "use") {
			const href = (node.attrs.href ?? node.attrs["xlink:href"])?.replace(/^#/, "");
			const ref = href ? byId.get(href) : undefined;
			if (!ref) return;
			const at = multiply(ctm, translate(length(node.attrs.x), length(node.attrs.y)));
			const content = ref.name === "symbol" ? ref.children : [ref];
			const inner = ref.name === "symbol" ? multiply(at, viewBoxMatrix(ref)) : at;
			const named = { ...node, attrs: { ...node.attrs, id: node.attrs.id ?? ref.attrs.id } };
			// The referenced element's own id would duplicate the name, so drop it on the copy.
			const copies = content.map((c) => (c === ref ? { ...c, attrs: { ...c.attrs, id: "" } } : c));
			container(named, style, inner, parentId, depth, copies);
			return;
		}
		if (node.name === "text") {
			const layer = textLayer(node, style, ctm, parentId);
			if (layer) out.push(layer);
			return;
		}
		if (node.name === "image") {
			const href = node.attrs.href ?? node.attrs["xlink:href"] ?? "";
			if (!href.startsWith("data:image/")) {
				simplified.add("linked images");
				return;
			}
			const w = length(node.attrs.width);
			const h = length(node.attrs.height);
			if (w <= 0 || h <= 0) return;
			const m = multiply(ctm, translate(length(node.attrs.x), length(node.attrs.y)));
			const t = decompose(m);
			const layer = createImageLayer({
				...baseProps(node, style, parentId),
				name: node.attrs.id ? titleCase(node.attrs.id) : "Image",
				assetId: "",
				x: t.x,
				y: t.y,
				rotation: t.rotation,
				scaleY: t.scaleY < 0 ? -1 : 1,
				width: w * Math.abs(t.scaleX),
				height: h * Math.abs(t.scaleY),
			});
			out.push(layer);
			images.push({ layerId: layer.id, href });
			return;
		}
		if (node.name === "foreignObject") {
			simplified.add("embedded HTML");
			return;
		}

		const local = geometryOf(node);
		if (!local || local.length === 0) return;
		const shape = asShape(node, ctm);
		const fillOpacity = Number.parseFloat(style["fill-opacity"] ?? "1");
		// Shape layers keep their rotation, so gradients are measured in the element's own space;
		// paths have the transform baked into their anchors, so they use world space.
		const fill = paint(style.fill ?? "black", Number.isFinite(fillOpacity) ? fillOpacity : 1, shape ? IDENTITY : ctm, style);
		const stroke = strokeOf(style, ctm);
		const isLineish = node.name === "line" || node.name === "polyline";
		const base = baseProps(node, style, parentId);
		if (shape) {
			out.push(
				createShapeLayer(shape.kind, {
					...base,
					name: base.name ?? (shape.kind === "rect" ? "Rectangle" : "Ellipse"),
					x: shape.x,
					y: shape.y,
					rotation: shape.rotation,
					scaleY: shape.scaleY,
					width: shape.width,
					height: shape.height,
					cornerRadius: shape.cornerRadius,
					fill: fill ?? { type: "transparent" },
					stroke,
				}),
			);
			return;
		}
		const world = mapSubpaths(local, ctm);
		out.push(
			createPathLayer({
				...base,
				name: base.name ?? "Vector",
				...pathFromWorld(world),
				fill: isLineish ? { type: "transparent" } : (fill ?? { type: "transparent" }),
				stroke,
				fillRule: style["fill-rule"] === "evenodd" ? "evenodd" : "nonzero",
			}),
		);
	};

	/**
	 * Groups become group layers. A group with a single child is folded into
	 * it (exporters wrap every element in <g>s), keeping its name and opacity.
	 */
	const container = (
		node: XmlNode,
		style: Style,
		ctm: Matrix,
		parentId: string | undefined,
		depth: number,
		children: XmlNode[],
	) => {
		const renderable = children.filter((c) => !SKIP.has(c.name) && c.name !== "stop");
		const base = baseProps(node, style, parentId);
		if (renderable.length === 0) return;
		const before = out.length;
		if (renderable.length === 1) {
			// Fold: opacity and blend pass to the child through its style.
			const childStyle: Style = { ...style, opacity: "1" };
			const start = out.length;
			visit(renderable[0], childStyle, ctm, parentId, depth + 1);
			const made = out.slice(start).filter((l) => l.parentId === parentId);
			for (const layer of made) {
				layer.opacity *= base.opacity;
				if (base.blendMode !== "source-over" && layer.blendMode === "source-over") layer.blendMode = base.blendMode;
				if (!base.visible) layer.visible = false;
				if (base.name && !renderable[0].attrs.id) layer.name = base.name;
			}
			return;
		}
		const group = createGroupLayer({ ...base, name: base.name ?? "Group" });
		out.push(group);
		const childStyle: Style = { ...style, opacity: "1" };
		for (const child of renderable) visit(child, childStyle, ctm, group.id, depth + 1);
		// Drop groups that ended up empty.
		if (!out.slice(before + 1).some((l) => l.parentId === group.id)) out.splice(before, 1);
	};

	const textLayer = (node: XmlNode, style: Style, ctm: Matrix, parentId: string | undefined) => {
		type Line = { text: string; x?: number; y?: number };
		const lines: Line[] = [];
		const startX = numbers(node.attrs.x)[0];
		const startY = numbers(node.attrs.y)[0];
		let current: Line = { text: node.text.replace(/\s+/g, " "), x: startX, y: startY };
		for (const child of node.children) {
			if (child.name !== "tspan") continue;
			const cx = numbers(child.attrs.x)[0];
			const cy = numbers(child.attrs.y)[0];
			const dy = numbers(child.attrs.dy)[0];
			const content = child.text + child.children.map((c) => c.text).join("");
			const newLine = (cy !== undefined && cy !== current.y) || (dy !== undefined && dy !== 0);
			if (newLine && current.text.trim()) {
				lines.push(current);
				current = { text: content, x: cx ?? current.x, y: cy ?? (current.y ?? 0) + (dy ?? 0) };
			} else {
				if (current.x === undefined) current.x = cx;
				if (current.y === undefined) current.y = cy;
				current.text += content;
			}
		}
		lines.push(current);
		const kept = lines.map((l) => ({ ...l, text: l.text.replace(/^\s+|\s+$/g, "") })).filter((l) => l.text);
		if (kept.length === 0) return null;
		const fontSize = length(style["font-size"], 16, 16);
		const t = decompose(ctm);
		const k = Math.abs(t.scaleX) || 1;
		const anchor = style["text-anchor"];
		const align = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
		const longest = Math.max(...kept.map((l) => l.text.length));
		const width = Math.max(fontSize, longest * fontSize * 0.6) + fontSize;
		const lineX = Math.min(...kept.map((l) => l.x ?? 0));
		const x0 = align === "center" ? lineX - width / 2 : align === "right" ? lineX - width : lineX;
		// SVG positions the baseline; layers position the top of the line box (1.2 line height).
		const y0 = (kept[0].y ?? 0) - fontSize * 0.95;
		const origin = apply(ctm, { x: x0, y: y0 });
		const fillOpacity = Number.parseFloat(style["fill-opacity"] ?? "1");
		const fill = paint(style.fill ?? "black", Number.isFinite(fillOpacity) ? fillOpacity : 1, IDENTITY, style);
		const family = (style["font-family"] ?? "Inter").split(",")[0].replace(/['"]/g, "").trim() || "Inter";
		const weight = style["font-weight"] ?? "normal";
		const base = baseProps(node, style, parentId);
		const decoration = style["text-decoration"] ?? "";
		const text = kept.map((l) => l.text).join("\n");
		return createTextLayer({
			...base,
			name: base.name ?? text.slice(0, 24),
			text,
			x: origin.x,
			y: origin.y,
			rotation: t.rotation,
			width: width * k,
			fontSize: fontSize * k,
			fontFamily: family,
			fontWeight: weight === "bold" || Number.parseInt(weight, 10) >= 600 ? "bold" : "normal",
			fontStyle: style["font-style"] === "italic" || style["font-style"] === "oblique" ? "italic" : "normal",
			underline: decoration.includes("underline"),
			lineThrough: decoration.includes("line-through"),
			letterSpacing: length(style["letter-spacing"], 0, 0) * k,
			align,
			lineHeight: 1.2,
			fill: fill ?? { type: "transparent" },
			stroke: { ...strokeOf(style, ctm) },
		});
	};

	const rootMatrix = viewBoxMatrix(svg);
	const rootStyle = computed(svg, {});
	noteUnsupported(rootStyle);
	const renderable = svg.children.filter((c) => !SKIP.has(c.name));
	for (const child of renderable) visit(child, rootStyle, rootMatrix, undefined, 0);
	return { layers: out, images, simplified: [...simplified], size: svgSize(svg) };
}

function findFirst(node: XmlNode, name: string): XmlNode | undefined {
	if (node.name === name) return node;
	for (const c of node.children) {
		const found = findFirst(c, name);
		if (found) return found;
	}
	return undefined;
}

function svgSize(svg: XmlNode) {
	const vb = numbers(svg.attrs.viewBox);
	const w = length(svg.attrs.width, 0, vb[2] ?? 0);
	const h = length(svg.attrs.height, 0, vb[3] ?? 0);
	return w > 0 && h > 0 ? { width: w, height: h } : null;
}

/** viewBox → width/height mapping (preserveAspectRatio xMidYMid meet, or none). */
function viewBoxMatrix(svg: XmlNode): Matrix {
	const vb = numbers(svg.attrs.viewBox);
	if (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0) return [...IDENTITY];
	const w = length(svg.attrs.width, 0, vb[2]);
	const h = length(svg.attrs.height, 0, vb[3]);
	const par = (svg.attrs.preserveAspectRatio ?? "").trim();
	let sx = w / vb[2];
	let sy = h / vb[3];
	let tx = 0;
	let ty = 0;
	if (!par.startsWith("none")) {
		const s = par.includes("slice") ? Math.max(sx, sy) : Math.min(sx, sy);
		const align = par.split(/\s+/)[0] || "xMidYMid";
		const fx = align.includes("xMin") ? 0 : align.includes("xMax") ? 1 : 0.5;
		const fy = align.includes("YMin") ? 0 : align.includes("YMax") ? 1 : 0.5;
		tx = (w - vb[2] * s) * fx;
		ty = (h - vb[3] * s) * fy;
		sx = s;
		sy = s;
	}
	return multiply(translate(tx, ty), multiply(scale(sx, sy), translate(-vb[0], -vb[1])));
}

/** Multiplies a "#rrggbb[aa]" color's alpha. */
function applyOpacity(color: string, opacity: number) {
	if (opacity >= 0.999) return color;
	const rgba = parseColor(color) ?? [0, 0, 0, 1];
	return colorToHex(rgba, opacity);
}

/** Quick check used for pasted text. */
export function looksLikeSvg(text: string) {
	const head = text.trimStart().slice(0, 4096);
	return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head);
}
