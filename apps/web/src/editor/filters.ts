import Konva from "konva";
import type { Filter } from "konva/lib/Node";
import { DEFAULT_ADJUSTMENTS } from "./defaults";
import type { Adjustments } from "./types";

export type AdjustmentKey = keyof Adjustments;

export type AdjustmentDefinition = {
	key: AdjustmentKey;
	label: string;
	min: number;
	max: number;
	step?: number;
	group: "light" | "color" | "effects";
};

export const ADJUSTMENTS: AdjustmentDefinition[] = [
	{ key: "brightness", label: "Brightness", min: -100, max: 100, group: "light" },
	{ key: "contrast", label: "Contrast", min: -100, max: 100, group: "light" },
	{ key: "fade", label: "Fade", min: 0, max: 100, group: "light" },
	{ key: "vignette", label: "Vignette", min: 0, max: 100, group: "light" },
	{ key: "saturation", label: "Saturation", min: -100, max: 100, group: "color" },
	{ key: "temperature", label: "Temperature", min: -100, max: 100, group: "color" },
	{ key: "tint", label: "Tint", min: -100, max: 100, group: "color" },
	{ key: "hue", label: "Hue", min: -180, max: 180, group: "color" },
	{ key: "grayscale", label: "Grayscale", min: 0, max: 100, group: "color" },
	{ key: "sepia", label: "Sepia", min: 0, max: 100, group: "color" },
	{ key: "invert", label: "Invert", min: 0, max: 100, group: "color" },
	{ key: "blur", label: "Blur", min: 0, max: 40, step: 0.5, group: "effects" },
	{ key: "noise", label: "Grain", min: 0, max: 100, group: "effects" },
	{ key: "pixelate", label: "Pixelate", min: 0, max: 60, group: "effects" },
	{ key: "posterize", label: "Posterize", min: 0, max: 100, group: "effects" },
];

export function hasAdjustments(adjustments: Adjustments): boolean {
	return (Object.keys(DEFAULT_ADJUSTMENTS) as AdjustmentKey[]).some(
		(key) => adjustments[key] !== DEFAULT_ADJUSTMENTS[key],
	);
}

/** CSS filter string for the adjustments CSS can express natively. */
export function adjustmentsToCssFilter(a: Adjustments): string {
	const parts: string[] = [];
	if (a.brightness) parts.push(`brightness(${1 + a.brightness / 100})`);
	if (a.contrast) parts.push(`contrast(${1 + a.contrast / 100})`);
	if (a.saturation) parts.push(`saturate(${Math.max(0, 1 + a.saturation / 100)})`);
	if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
	if (a.grayscale) parts.push(`grayscale(${a.grayscale / 100})`);
	if (a.sepia) parts.push(`sepia(${a.sepia / 100})`);
	if (a.invert) parts.push(`invert(${a.invert / 100})`);
	if (a.blur) parts.push(`blur(${a.blur}px)`);
	return parts.join(" ");
}

/** Konva filter list for a set of adjustments. */
export function adjustmentsToKonva(a: Adjustments): {
	filters: Filter[];
	attrs: Record<string, number>;
} {
	const filters: Filter[] = [];
	const attrs: Record<string, number> = {};

	const css = adjustmentsToCssFilter({ ...a, blur: 0 });
	if (css) filters.push(css);

	if (a.temperature || a.tint) {
		filters.push(colorBalanceFilter(a.temperature, a.tint));
	}
	if (a.fade) filters.push(fadeFilter(a.fade));
	if (a.blur) {
		filters.push(Konva.Filters.Blur);
		attrs.blurRadius = Math.round(a.blur);
	}
	if (a.posterize) {
		filters.push(Konva.Filters.Posterize);
		// Konva maps levels 0..1 to 1..256 color levels; invert so 100 = strongest.
		attrs.levels = (1 - a.posterize / 100) ** 2 * 0.3 + 0.01;
	}
	if (a.pixelate) {
		filters.push(Konva.Filters.Pixelate);
		attrs.pixelSize = Math.max(1, Math.round(a.pixelate));
	}
	if (a.noise) {
		filters.push(Konva.Filters.Noise);
		attrs.noise = a.noise / 100;
	}
	if (a.vignette) filters.push(vignetteFilter(a.vignette));

	return { filters, attrs };
}

function colorBalanceFilter(temperature: number, tint: number) {
	const t = temperature * 0.6;
	const g = tint * 0.5;
	return (imageData: ImageData) => {
		const d = imageData.data;
		for (let i = 0; i < d.length; i += 4) {
			d[i] = clamp255(d[i] + t);
			d[i + 1] = clamp255(d[i + 1] - g);
			d[i + 2] = clamp255(d[i + 2] - t);
		}
	};
}

function fadeFilter(amount: number) {
	const k = amount / 100;
	return (imageData: ImageData) => {
		const d = imageData.data;
		for (let i = 0; i < d.length; i += 4) {
			d[i] = d[i] + (128 - d[i]) * k * 0.45 + 18 * k;
			d[i + 1] = d[i + 1] + (128 - d[i + 1]) * k * 0.45 + 18 * k;
			d[i + 2] = d[i + 2] + (128 - d[i + 2]) * k * 0.45 + 18 * k;
		}
	};
}

function vignetteFilter(amount: number) {
	const strength = amount / 100;
	return (imageData: ImageData) => {
		const { width, height, data } = imageData;
		const cx = width / 2;
		const cy = height / 2;
		const maxDist = Math.sqrt(cx * cx + cy * cy);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const dx = x - cx;
				const dy = y - cy;
				const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
				const factor = 1 - strength * Math.max(0, (dist - 0.35) / 0.65) ** 1.6;
				const i = (y * width + x) * 4;
				data[i] *= factor;
				data[i + 1] *= factor;
				data[i + 2] *= factor;
			}
		}
	};
}

function clamp255(value: number) {
	return value < 0 ? 0 : value > 255 ? 255 : value;
}

export type FilterPreset = {
	id: string;
	label: string;
	adjustments: Partial<Adjustments>;
};

export const FILTER_PRESETS: FilterPreset[] = [
	{ id: "none", label: "Original", adjustments: {} },
	{ id: "vivid", label: "Vivid", adjustments: { saturation: 45, contrast: 15, brightness: 4 } },
	{ id: "warm", label: "Warm", adjustments: { temperature: 35, saturation: 10, brightness: 4 } },
	{ id: "cool", label: "Cool", adjustments: { temperature: -35, saturation: 5 } },
	{ id: "noir", label: "Noir", adjustments: { grayscale: 100, contrast: 35, brightness: -6 } },
	{ id: "mono", label: "Mono", adjustments: { grayscale: 100 } },
	{ id: "vintage", label: "Vintage", adjustments: { sepia: 45, fade: 25, contrast: -8, vignette: 35 } },
	{ id: "retro", label: "Retro", adjustments: { temperature: 25, fade: 35, saturation: -20, noise: 18 } },
	{ id: "fade", label: "Faded", adjustments: { fade: 45, saturation: -15 } },
	{ id: "drama", label: "Drama", adjustments: { contrast: 45, saturation: -15, vignette: 50, brightness: -8 } },
	{ id: "dreamy", label: "Dreamy", adjustments: { brightness: 10, fade: 20, saturation: 15, tint: -15 } },
	{ id: "golden", label: "Golden", adjustments: { temperature: 50, saturation: 20, contrast: 10, tint: 10 } },
	{ id: "teal", label: "Teal & Orange", adjustments: { temperature: 15, tint: 25, contrast: 20, saturation: 15 } },
	{ id: "lush", label: "Lush", adjustments: { saturation: 30, hue: -12, contrast: 8 } },
	{ id: "chrome", label: "Chrome", adjustments: { contrast: 25, saturation: 25, brightness: 6 } },
	{ id: "film", label: "Film", adjustments: { fade: 18, noise: 22, contrast: 10, temperature: 8 } },
	{ id: "pop", label: "Pop Art", adjustments: { saturation: 80, contrast: 40, posterize: 70 } },
	{ id: "invert", label: "Invert", adjustments: { invert: 100 } },
];

export function presetToAdjustments(preset: FilterPreset): Adjustments {
	return { ...DEFAULT_ADJUSTMENTS, ...preset.adjustments };
}

/** CSS approximation of a preset, used for thumbnails. */
export function presetToCss(preset: FilterPreset): string {
	const a = presetToAdjustments(preset);
	const parts = [adjustmentsToCssFilter(a)];
	if (a.temperature > 0) parts.push(`sepia(${a.temperature / 300})`);
	if (a.temperature < 0) parts.push(`hue-rotate(${a.temperature / 8}deg)`);
	if (a.fade) parts.push(`contrast(${1 - a.fade / 250})`, `brightness(${1 + a.fade / 400})`);
	return parts.filter(Boolean).join(" ");
}
