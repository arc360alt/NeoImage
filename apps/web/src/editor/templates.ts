import { createShapeLayer, createTextLayer, solid } from "./defaults";
import type { CanvasSettings, Fill, Layer } from "./types";

export type Template = {
	id: string;
	name: string;
	category: string;
	build: () => { canvas: CanvasSettings; layers: Layer[] };
};

const linear = (angle: number, ...colors: string[]): Fill => ({
	type: "linear",
	angle,
	stops: colors.map((color, i) => ({
		offset: colors.length === 1 ? 0 : i / (colors.length - 1),
		color,
	})),
});

export const TEMPLATES: Template[] = [
	{
		id: "sale-post",
		name: "Summer Sale",
		category: "Instagram Post",
		build: () => ({
			canvas: { width: 1080, height: 1080, background: linear(135, "#ff9a8b", "#ff6a88", "#ff99ac") },
			layers: [
				createShapeLayer("ellipse", { x: -180, y: -160, width: 620, height: 620, fill: solid("#ffffff"), opacity: 0.18, name: "Circle" }),
				createShapeLayer("ellipse", { x: 700, y: 720, width: 520, height: 520, fill: solid("#ffffff"), opacity: 0.14, name: "Circle" }),
				createTextLayer({ text: "SUMMER", x: 90, y: 300, width: 900, fontFamily: "Bebas Neue", fontSize: 230, fill: solid("#ffffff"), letterSpacing: 8, name: "Title" }),
				createTextLayer({ text: "SALE", x: 90, y: 500, width: 900, fontFamily: "Bebas Neue", fontSize: 230, fill: solid("#3b0a1e"), letterSpacing: 8, name: "Title" }),
				createShapeLayer("rect", { x: 340, y: 780, width: 400, height: 96, cornerRadius: 48, fill: solid("#ffffff"), name: "Button" }),
				createTextLayer({ text: "UP TO 50% OFF", x: 340, y: 808, width: 400, fontFamily: "Poppins", fontWeight: "bold", fontSize: 36, fill: solid("#ff6a88"), name: "Button label" }),
			],
		}),
	},
	{
		id: "quote-post",
		name: "Daily Quote",
		category: "Instagram Post",
		build: () => ({
			canvas: { width: 1080, height: 1080, background: solid("#f5efe6") },
			layers: [
				createTextLayer({ text: "“", x: 90, y: 120, width: 300, align: "left", fontFamily: "Playfair Display", fontSize: 300, fill: solid("#c08457"), name: "Quote mark" }),
				createTextLayer({ text: "Creativity is intelligence having fun.", x: 120, y: 380, width: 840, align: "left", fontFamily: "Playfair Display", fontStyle: "italic", fontSize: 84, lineHeight: 1.15, fill: solid("#2b2118"), name: "Quote" }),
				createShapeLayer("line", { x: 125, y: 760, width: 120, stroke: { enabled: true, color: "#c08457", width: 6 } }),
				createTextLayer({ text: "ALBERT EINSTEIN", x: 120, y: 800, width: 840, align: "left", fontFamily: "Montserrat", fontWeight: "bold", fontSize: 30, letterSpacing: 6, fill: solid("#2b2118"), name: "Author" }),
			],
		}),
	},
	{
		id: "yt-thumbnail",
		name: "Bold Thumbnail",
		category: "YouTube Thumbnail",
		build: () => ({
			canvas: { width: 1280, height: 720, background: linear(120, "#0f0c29", "#302b63", "#24243e") },
			layers: [
				createShapeLayer("rect", { x: 720, y: -60, width: 700, height: 900, rotation: 12, fill: solid("#facc15"), name: "Accent" }),
				createTextLayer({ text: "I TRIED IT\nFOR 30 DAYS", x: 60, y: 190, width: 760, align: "left", fontFamily: "Anton", fontSize: 140, lineHeight: 1.05, fill: solid("#ffffff"), stroke: { enabled: true, color: "#000000", width: 6 }, name: "Title" }),
				createShapeLayer("rect", { x: 66, y: 520, width: 300, height: 76, cornerRadius: 12, fill: solid("#ef4444"), name: "Badge" }),
				createTextLayer({ text: "NEW VIDEO", x: 66, y: 538, width: 300, fontFamily: "Montserrat", fontWeight: "bold", fontSize: 38, fill: solid("#ffffff"), name: "Badge label" }),
				createShapeLayer("star", { x: 980, y: 230, width: 220, height: 220, fill: solid("#ef4444"), rotation: -10, name: "Star" }),
			],
		}),
	},
	{
		id: "story-event",
		name: "Event Story",
		category: "Story",
		build: () => ({
			canvas: { width: 1080, height: 1920, background: linear(180, "#141e30", "#243b55") },
			layers: [
				createShapeLayer("ellipse", { x: 140, y: 260, width: 800, height: 800, fill: linear(135, "#f093fb", "#f5576c"), name: "Orb" }),
				createTextLayer({ text: "LIVE MUSIC", x: 90, y: 1160, width: 900, fontFamily: "Bebas Neue", fontSize: 190, letterSpacing: 10, fill: solid("#ffffff"), name: "Title" }),
				createTextLayer({ text: "FRIDAY · 9 PM · DOWNTOWN", x: 90, y: 1380, width: 900, fontFamily: "Montserrat", fontWeight: "bold", fontSize: 44, letterSpacing: 4, fill: solid("#f5a3c7"), name: "Details" }),
				createShapeLayer("rect", { x: 290, y: 1580, width: 500, height: 110, cornerRadius: 55, fill: { type: "transparent" }, stroke: { enabled: true, color: "#ffffff", width: 4 }, name: "Button" }),
				createTextLayer({ text: "Swipe up for tickets", x: 290, y: 1615, width: 500, fontFamily: "Poppins", fontSize: 38, fill: solid("#ffffff"), name: "Button label" }),
			],
		}),
	},
	{
		id: "minimal-poster",
		name: "Minimal Poster",
		category: "Poster",
		build: () => ({
			canvas: { width: 1800, height: 2400, background: solid("#111111") },
			layers: [
				createShapeLayer("ellipse", { x: 400, y: 380, width: 1000, height: 1000, fill: solid("#ff5a36"), name: "Sun" }),
				createShapeLayer("rect", { x: 0, y: 1100, width: 1800, height: 1300, fill: solid("#111111"), name: "Horizon" }),
				createTextLayer({ text: "SUNSET", x: 100, y: 1300, width: 1600, fontFamily: "Archivo Black", fontSize: 300, letterSpacing: 30, fill: solid("#f5efe6"), name: "Title" }),
				createTextLayer({ text: "An exhibition of light and color", x: 100, y: 1700, width: 1600, fontFamily: "Lora", fontStyle: "italic", fontSize: 80, fill: solid("#a3a3a3"), name: "Subtitle" }),
				createTextLayer({ text: "MAY 12 — JUNE 30", x: 100, y: 2120, width: 1600, fontFamily: "Space Grotesk", fontWeight: "bold", fontSize: 64, letterSpacing: 12, fill: solid("#ff5a36"), name: "Dates" }),
			],
		}),
	},
	{
		id: "fb-announcement",
		name: "Announcement",
		category: "Facebook Post",
		build: () => ({
			canvas: { width: 1200, height: 630, background: solid("#eef2ff") },
			layers: [
				createShapeLayer("rect", { x: 0, y: 0, width: 420, height: 630, fill: linear(160, "#6366f1", "#8b5cf6"), name: "Panel" }),
				createShapeLayer("polygon", { x: 90, y: 165, width: 240, height: 240, sides: 6, fill: solid("#ffffff"), opacity: 0.25, name: "Hexagon" }),
				createTextLayer({ text: "We're launching something new", x: 480, y: 170, width: 640, align: "left", fontFamily: "Poppins", fontWeight: "bold", fontSize: 64, lineHeight: 1.1, fill: solid("#1e1b4b"), name: "Title" }),
				createTextLayer({ text: "Join us on March 3rd for the reveal.", x: 480, y: 360, width: 640, align: "left", fontFamily: "Inter", fontSize: 32, fill: solid("#4338ca"), name: "Subtitle" }),
			],
		}),
	},
	{
		id: "business-card",
		name: "Business Card",
		category: "Business Card",
		build: () => ({
			canvas: { width: 1050, height: 600, background: solid("#0b1320") },
			layers: [
				createShapeLayer("rect", { x: 0, y: 540, width: 1050, height: 60, fill: linear(90, "#00c6ff", "#0072ff"), name: "Stripe" }),
				createTextLayer({ text: "Alex Morgan", x: 80, y: 170, width: 800, align: "left", fontFamily: "Montserrat", fontWeight: "bold", fontSize: 72, fill: solid("#ffffff"), name: "Name" }),
				createTextLayer({ text: "PRODUCT DESIGNER", x: 80, y: 265, width: 800, align: "left", fontFamily: "Inter", fontSize: 28, letterSpacing: 6, fill: solid("#38bdf8"), name: "Title" }),
				createTextLayer({ text: "alex@example.com\n+1 555 012 3456", x: 80, y: 360, width: 800, align: "left", fontFamily: "Inter", fontSize: 28, lineHeight: 1.5, fill: solid("#cbd5e1"), name: "Contact" }),
			],
		}),
	},
	{
		id: "presentation-title",
		name: "Title Slide",
		category: "Presentation",
		build: () => ({
			canvas: { width: 1920, height: 1080, background: linear(135, "#d4fc79", "#96e6a1") },
			layers: [
				createShapeLayer("rect", { x: 120, y: 120, width: 1680, height: 840, cornerRadius: 40, fill: solid("#ffffff"), shadow: { enabled: true, color: "#000000", blur: 60, offsetX: 0, offsetY: 20, opacity: 0.15 }, name: "Card" }),
				createTextLayer({ text: "Quarterly Review", x: 240, y: 380, width: 1440, align: "left", fontFamily: "DM Serif Display", fontSize: 150, fill: solid("#14532d"), name: "Title" }),
				createTextLayer({ text: "Growth, wins and what's next", x: 240, y: 580, width: 1440, align: "left", fontFamily: "DM Sans", fontSize: 56, fill: solid("#15803d"), name: "Subtitle" }),
			],
		}),
	},
];
