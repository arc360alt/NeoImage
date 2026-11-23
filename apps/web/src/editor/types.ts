export type BlendMode =
	| "source-over"
	| "multiply"
	| "screen"
	| "overlay"
	| "darken"
	| "lighten"
	| "color-dodge"
	| "color-burn"
	| "hard-light"
	| "soft-light"
	| "difference"
	| "exclusion"
	| "hue"
	| "saturation"
	| "color"
	| "luminosity";

export type Adjustments = {
	brightness: number; // -100..100
	contrast: number; // -100..100
	saturation: number; // -100..100
	hue: number; // -180..180
	temperature: number; // -100..100
	tint: number; // -100..100
	fade: number; // 0..100
	blur: number; // 0..40 (px)
	grayscale: number; // 0..100
	sepia: number; // 0..100
	invert: number; // 0..100
	vignette: number; // 0..100
	noise: number; // 0..100
	pixelate: number; // 0..60
	posterize: number; // 0..100 (0 = off)
};

export type Shadow = {
	enabled: boolean;
	color: string;
	blur: number;
	offsetX: number;
	offsetY: number;
	opacity: number;
};

export type Stroke = {
	enabled: boolean;
	color: string;
	width: number;
	/** Dash pattern (alternating dash/gap lengths). Missing or empty = solid. */
	dash?: number[];
	/** Line ends. Missing = each layer type's default (round for shapes and paths). */
	cap?: "butt" | "round" | "square";
	/** Corners. Missing = each layer type's default (round for shapes and paths). */
	join?: "miter" | "round" | "bevel";
	/** Where the stroke sits on closed outlines. Missing = "center". */
	align?: "center" | "inside" | "outside";
};

export type GradientStop = { offset: number; color: string };

export type Fill =
	| { type: "solid"; color: string }
	| { type: "linear"; angle: number; stops: GradientStop[] }
	| { type: "radial"; stops: GradientStop[] }
	| { type: "transparent" };

/** "svg" is a true vector export (see editor/svg-export.ts). */
export type ExportFormat = "png" | "jpeg" | "webp" | "svg";

/** One export row, like Figma's export settings ("2x PNG"). */
export type ExportSetting = {
	id: string;
	scale: number;
	format: ExportFormat;
	suffix: string;
};

type LayerBase = {
	id: string;
	name: string;
	/** FreeForm mode: the frame this layer lives in (positions stay in world space). */
	parentId?: string;
	/** FreeForm mode: export presets shown in the Export section. */
	exportSettings?: ExportSetting[];
	x: number;
	y: number;
	rotation: number;
	scaleX: number; // only the sign is used (flip), size is baked into width/height
	scaleY: number;
	opacity: number; // 0..1
	visible: boolean;
	locked: boolean;
	blendMode: BlendMode;
	adjustments: Adjustments;
	shadow: Shadow;
};

export type ImageLayer = LayerBase & {
	type: "image";
	assetId: string;
	width: number;
	height: number;
	/** Crop rectangle in natural image pixels. */
	crop: { x: number; y: number; width: number; height: number } | null;
	cornerRadius: number;
	stroke: Stroke;
};

export type TextLayer = LayerBase & {
	type: "text";
	text: string;
	width: number;
	fontFamily: string;
	fontSize: number;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	underline: boolean;
	lineThrough: boolean;
	align: "left" | "center" | "right";
	lineHeight: number;
	letterSpacing: number;
	fill: Fill;
	stroke: Stroke;
	uppercase: boolean;
};

export type ShapeKind =
	| "rect"
	| "ellipse"
	| "triangle"
	| "star"
	| "polygon"
	| "heart"
	| "line"
	| "arrow";

export type ShapeLayer = LayerBase & {
	type: "shape";
	shape: ShapeKind;
	width: number;
	height: number;
	fill: Fill;
	stroke: Stroke;
	cornerRadius: number;
	sides: number; // polygon sides / star points
	innerRatio: number; // star inner radius ratio
};

export type BrushStroke = {
	id: string;
	points: number[];
	color: string;
	size: number;
	opacity: number;
	mode: "brush" | "eraser" | "highlighter";
};

export type DrawingLayer = LayerBase & {
	type: "drawing";
	width: number;
	height: number;
	strokes: BrushStroke[];
};

/** Figma-style layout grid drawn over a frame (editor only, never exported). */
export type LayoutGrid = {
	id: string;
	type: "grid" | "columns" | "rows";
	visible: boolean;
	color: string;
	opacity: number; // 0..1
	/** Cell size for "grid". */
	size: number;
	/** Number of columns / rows. */
	count: number;
	gutter: number;
	margin: number;
};

/** FreeForm mode: a Figma-style frame that clips the layers inside it. */
export type FrameLayer = LayerBase & {
	type: "frame";
	width: number;
	height: number;
	fill: Fill;
	stroke: Stroke;
	cornerRadius: number;
	clipContent: boolean;
	layoutGrids?: LayoutGrid[];
};

export type AnchorType = "corner" | "smooth" | "symmetric";

/**
 * One point of a vector path, in the layer's local coordinates.
 * Handles are offsets from the anchor (like paper.js), so moving an anchor
 * carries its handles along. "corner" handles move independently, "smooth"
 * handles stay collinear, and "symmetric" handles also keep equal length.
 */
export type PathAnchor = {
	x: number;
	y: number;
	handleIn?: { x: number; y: number };
	handleOut?: { x: number; y: number };
	type: AnchorType;
};

export type Subpath = { anchors: PathAnchor[]; closed: boolean };

/**
 * An editable vector path (pen tool, outlines, boolean results, SVG import).
 * Geometry is normalized so its bounds start at (0, 0) and span width × height.
 */
export type PathLayer = LayerBase & {
	type: "path";
	width: number;
	height: number;
	subpaths: Subpath[];
	fill: Fill;
	stroke: Stroke;
	fillRule: "nonzero" | "evenodd";
};

/**
 * A container without geometry of its own (and no clipping). Children point
 * to it with `parentId` and keep world coordinates, like frame children.
 * The group itself always sits at x = y = 0 with no rotation or scale:
 * moving or transforming it moves/transforms its children (see editor/transform.ts).
 */
export type GroupLayer = LayerBase & {
	type: "group";
	/** Always 0; groups take their size from their children. */
	width: number;
	height: number;
};

export type Layer =
	| ImageLayer
	| TextLayer
	| ShapeLayer
	| DrawingLayer
	| FrameLayer
	| PathLayer
	| GroupLayer;
export type LayerType = Layer["type"];

export type CanvasSettings = {
	width: number;
	height: number;
	background: Fill;
};

/**
 * "default": a single fixed-size artboard (Canva-style).
 * "freeform": an infinite canvas with frames (Figma-style).
 */
export type ProjectMode = "default" | "freeform";

export type ProjectDoc = {
	id: string;
	name: string;
	/** Missing on projects created before FreeForm existed; treated as "default". */
	mode?: ProjectMode;
	createdAt: number;
	updatedAt: number;
	canvas: CanvasSettings;
	layers: Layer[]; // index 0 is the bottom-most layer
	thumbnail?: string;
	version: 1;
};

export type AssetRecord = {
	id: string;
	projectId: string;
	name: string;
	mimeType: string;
	width: number;
	height: number;
	size: number;
	createdAt: number;
	blob: Blob;
};

export type AssetMeta = Omit<AssetRecord, "blob">;

export type Tool =
	| "select"
	| "hand"
	| "brush"
	| "eraser"
	| "text"
	| "crop"
	// FreeForm creation tools (click or drag on the canvas)
	| "frame"
	| "rect"
	| "ellipse"
	| "line"
	// FreeForm vector pen (click for corners, drag for curves)
	| "pen";

export type BrushSettings = {
	color: string;
	size: number;
	opacity: number;
	mode: BrushStroke["mode"];
};
