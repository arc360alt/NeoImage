export type CanvasPreset = {
	id: string;
	label: string;
	category: "Social" | "Video" | "Print" | "Other";
	width: number;
	height: number;
};

export const CANVAS_PRESETS: CanvasPreset[] = [
	{ id: "ig-post", label: "Instagram Post", category: "Social", width: 1080, height: 1080 },
	{ id: "ig-portrait", label: "Instagram Portrait", category: "Social", width: 1080, height: 1350 },
	{ id: "ig-story", label: "Story / Reel", category: "Social", width: 1080, height: 1920 },
	{ id: "fb-post", label: "Facebook Post", category: "Social", width: 1200, height: 630 },
	{ id: "fb-cover", label: "Facebook Cover", category: "Social", width: 1640, height: 624 },
	{ id: "x-post", label: "X Post", category: "Social", width: 1600, height: 900 },
	{ id: "x-header", label: "X Header", category: "Social", width: 1500, height: 500 },
	{ id: "linkedin-banner", label: "LinkedIn Banner", category: "Social", width: 1584, height: 396 },
	{ id: "pinterest", label: "Pinterest Pin", category: "Social", width: 1000, height: 1500 },
	{ id: "yt-thumb", label: "YouTube Thumbnail", category: "Video", width: 1280, height: 720 },
	{ id: "yt-banner", label: "YouTube Banner", category: "Video", width: 2560, height: 1440 },
	{ id: "hd", label: "Full HD", category: "Video", width: 1920, height: 1080 },
	{ id: "4k", label: "4K UHD", category: "Video", width: 3840, height: 2160 },
	{ id: "a4", label: "A4 Document", category: "Print", width: 2480, height: 3508 },
	{ id: "letter", label: "US Letter", category: "Print", width: 2550, height: 3300 },
	{ id: "poster", label: "Poster (18×24)", category: "Print", width: 1800, height: 2400 },
	{ id: "flyer", label: "Flyer (A5)", category: "Print", width: 1748, height: 2480 },
	{ id: "business-card", label: "Business Card", category: "Print", width: 1050, height: 600 },
	{ id: "presentation", label: "Presentation (16:9)", category: "Other", width: 1920, height: 1080 },
	{ id: "logo", label: "Logo", category: "Other", width: 500, height: 500 },
	{ id: "desktop", label: "Desktop Wallpaper", category: "Other", width: 2560, height: 1440 },
	{ id: "phone", label: "Phone Wallpaper", category: "Other", width: 1170, height: 2532 },
];

export const MAX_CANVAS_SIZE = 8000;

/** FreeForm frame presets (Figma-style), devices first. */
export const FRAME_PRESETS: CanvasPreset[] = [
	{ id: "iphone-16", label: "iPhone 16", category: "Other", width: 393, height: 852 },
	{ id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", category: "Other", width: 440, height: 956 },
	{ id: "android", label: "Android", category: "Other", width: 412, height: 917 },
	{ id: "ipad", label: "iPad", category: "Other", width: 834, height: 1194 },
	{ id: "macbook", label: "MacBook Air", category: "Other", width: 1280, height: 832 },
	{ id: "frame-desktop", label: "Desktop", category: "Other", width: 1440, height: 1024 },
	...CANVAS_PRESETS,
];
