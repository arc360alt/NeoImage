export type FontOption = {
	family: string;
	category: "sans" | "serif" | "display" | "handwriting" | "mono";
	google: boolean;
};

export const FONTS: FontOption[] = [
	{ family: "Inter", category: "sans", google: true },
	{ family: "Roboto", category: "sans", google: true },
	{ family: "Poppins", category: "sans", google: true },
	{ family: "Montserrat", category: "sans", google: true },
	{ family: "Raleway", category: "sans", google: true },
	{ family: "Space Grotesk", category: "sans", google: true },
	{ family: "DM Sans", category: "sans", google: true },
	{ family: "Oswald", category: "display", google: true },
	{ family: "Bebas Neue", category: "display", google: true },
	{ family: "Anton", category: "display", google: true },
	{ family: "Archivo Black", category: "display", google: true },
	{ family: "Abril Fatface", category: "display", google: true },
	{ family: "Righteous", category: "display", google: true },
	{ family: "Lobster", category: "display", google: true },
	{ family: "Fredoka", category: "display", google: true },
	{ family: "Playfair Display", category: "serif", google: true },
	{ family: "DM Serif Display", category: "serif", google: true },
	{ family: "Lora", category: "serif", google: true },
	{ family: "Merriweather", category: "serif", google: true },
	{ family: "Pacifico", category: "handwriting", google: true },
	{ family: "Dancing Script", category: "handwriting", google: true },
	{ family: "Caveat", category: "handwriting", google: true },
	{ family: "Permanent Marker", category: "handwriting", google: true },
	{ family: "Shadows Into Light", category: "handwriting", google: true },
	{ family: "JetBrains Mono", category: "mono", google: true },
	{ family: "Arial", category: "sans", google: false },
	{ family: "Georgia", category: "serif", google: false },
	{ family: "Times New Roman", category: "serif", google: false },
	{ family: "Courier New", category: "mono", google: false },
	{ family: "Impact", category: "display", google: false },
];

const stylesheets = new Map<string, Promise<void>>();
const loaded = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Subscribe to font load events (used to redraw the canvas). */
export function onFontLoaded(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function injectStylesheet(family: string): Promise<void> {
	const existing = stylesheets.get(family);
	if (existing) return existing;
	const font = FONTS.find((f) => f.family === family);
	if (font && !font.google) {
		const done = Promise.resolve();
		stylesheets.set(family, done);
		return done;
	}
	const promise = new Promise<void>((resolve) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
			family,
		).replace(/%20/g, "+")}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
		link.onload = () => resolve();
		link.onerror = () => resolve();
		document.head.appendChild(link);
	});
	stylesheets.set(family, promise);
	return promise;
}

/** Loads a font family (regular + bold) so Konva can draw it. */
export function ensureFont(family: string): Promise<void> {
	if (typeof document === "undefined") return Promise.resolve();
	const existing = loaded.get(family);
	if (existing) return existing;
	const promise = (async () => {
		// The @font-face rules only exist once the stylesheet has loaded;
		// document.fonts.load() resolves immediately (and uselessly) before that.
		await injectStylesheet(family);
		try {
			await Promise.all([
				document.fonts.load(`400 32px "${family}"`),
				document.fonts.load(`700 32px "${family}"`),
				document.fonts.load(`italic 400 32px "${family}"`),
			]);
		} catch {
			// Fall back silently to the browser default.
		}
		for (const listener of listeners) listener();
	})();
	loaded.set(family, promise);
	return promise;
}

/** Inject the CSS for every font so the font picker can preview them. */
export function preloadFontPreviews() {
	for (const font of FONTS) void injectStylesheet(font.family);
}
