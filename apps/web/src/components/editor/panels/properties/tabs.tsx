"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	AlignLeftIcon,
	AlignHorizontalCenterIcon,
	AlignRightIcon,
	AlignTopIcon,
	AlignVerticalCenterIcon,
	AlignBottomIcon,
	FlipHorizontalIcon,
	FlipVerticalIcon,
	CropIcon,
	AiMagicIcon,
	TextAlignLeftIcon,
	TextAlignCenterIcon,
	TextAlignRightIcon,
	TextBoldIcon,
	TextItalicIcon,
	TextUnderlineIcon,
	TextStrikethroughIcon,
	ArrowTurnBackwardIcon,
	ArrowDown01Icon,
	Image01Icon,
	PenTool03Icon,
	GroupItemsIcon,
	PathIcon,
	PathfinderUniteIcon,
	PathfinderMinusFrontIcon,
	PathfinderIntersectIcon,
	PathfinderExcludeIcon,
	PathfinderOutlineIcon,
} from "@hugeicons/core-free-icons";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/ui";
import { getEditor, useEditorStore } from "@/editor/store";
import { flipSelection, startCrop } from "@/editor/actions";
import { alignSelection, distributeSelection, type AlignMode } from "@/editor/align";
import { ADJUSTMENTS, hasAdjustments } from "@/editor/filters";
import { DEFAULT_ADJUSTMENTS } from "@/editor/defaults";
import { FONTS, ensureFont, preloadFontPreviews } from "@/editor/fonts";
import type {
	BlendMode,
	GroupLayer,
	ImageLayer,
	Layer,
	PathLayer,
	ShapeLayer,
	Stroke,
	TextLayer,
} from "@/editor/types";
import { ColorField, Field, FillField, NumField, SliderField } from "../controls";
import { useRemoveBackground } from "@/components/editor/use-remove-background";
import { openImagePicker, importImageBlobs } from "@/editor/import";
import { groupBounds, setGroupBox, ungroupSelection } from "@/editor/group-actions";
import { useShortcut } from "@/editor/use-shortcut";
import { booleanSelection, flattenSelection, outlineStrokeSelection, vectorTargets } from "@/editor/vector-actions";
import type { BooleanOp } from "@/editor/vector-ops";
import type { ActionId } from "@/editor/keybindings";

type Opts = { transient?: boolean };

function update<T extends Layer>(layer: T, patch: Partial<T>, options?: Opts) {
	getEditor().updateLayer(layer.id, patch as Partial<Layer>, options);
}

/* ------------------------------- Transform ------------------------------- */

const ALIGN_BUTTONS: { mode: AlignMode; label: string; icon: Parameters<typeof HugeiconsIcon>[0]["icon"] }[] = [
	{ mode: "left", label: "Align left", icon: AlignLeftIcon },
	{ mode: "center", label: "Align center", icon: AlignHorizontalCenterIcon },
	{ mode: "right", label: "Align right", icon: AlignRightIcon },
	{ mode: "top", label: "Align top", icon: AlignTopIcon },
	{ mode: "middle", label: "Align middle", icon: AlignVerticalCenterIcon },
	{ mode: "bottom", label: "Align bottom", icon: AlignBottomIcon },
];

export function AlignSection({ multiple = false }: { multiple?: boolean }) {
	return (
		<Section sectionKey={multiple ? "align-multi" : "align"}>
			<SectionHeader>
				<SectionTitle>{multiple ? "Align selection" : "Align to canvas"}</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<div className="grid grid-cols-6 gap-1">
					{ALIGN_BUTTONS.map((b) => (
						<Tooltip key={b.mode}>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									className="size-8 w-full"
									onClick={() => alignSelection(b.mode)}
									aria-label={b.label}
								>
									<HugeiconsIcon icon={b.icon} />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{b.label}</TooltipContent>
						</Tooltip>
					))}
				</div>
				{multiple && (
					<div className="mt-2 grid grid-cols-2 gap-1">
						<Button size="sm" variant="outline" onClick={() => distributeSelection("x")}>
							Distribute horizontally
						</Button>
						<Button size="sm" variant="outline" onClick={() => distributeSelection("y")}>
							Distribute vertically
						</Button>
					</div>
				)}
			</SectionContent>
		</Section>
	);
}

export function TransformTab({ layer }: { layer: Layer }) {
	const isLine = layer.type === "shape" && (layer.shape === "line" || layer.shape === "arrow");
	const hasHeight = layer.type !== "text" && !isLine;
	const [lockRatio, setLockRatio] = useState(layer.type === "image");
	const ratio = hasHeight && "height" in layer && layer.height > 0 ? layer.width / layer.height : 1;

	return (
		<>
			<AlignSection />
			<Section sectionKey="transform">
				<SectionHeader>
					<SectionTitle>Position & size</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<div className="grid grid-cols-2 gap-2">
							<NumField label="X" value={layer.x} onChange={(x, o) => update(layer, { x }, o)} />
							<NumField label="Y" value={layer.y} onChange={(y, o) => update(layer, { y }, o)} />
							<NumField
								label="W"
								value={layer.width}
								min={1}
								onChange={(width, o) => {
									if (hasHeight && lockRatio) {
										update(layer, { width, height: width / ratio } as Partial<Layer>, o);
									} else {
										update(layer, { width } as Partial<Layer>, o);
									}
								}}
							/>
							{hasHeight && "height" in layer && (
								<NumField
									label="H"
									value={layer.height}
									min={1}
									onChange={(height, o) => {
										if (lockRatio) {
											update(layer, { height, width: height * ratio } as Partial<Layer>, o);
										} else {
											update(layer, { height } as Partial<Layer>, o);
										}
									}}
								/>
							)}
						</div>
						{hasHeight && (
							<label className="flex items-center justify-between text-xs" htmlFor="lock-ratio">
								<span className="text-muted-foreground">Lock aspect ratio</span>
								<Switch id="lock-ratio" checked={lockRatio} onCheckedChange={setLockRatio} />
							</label>
						)}
						<SliderField
							label="Rotation"
							value={layer.rotation}
							min={-180}
							max={180}
							defaultValue={0}
							format={(v) => `${Math.round(v)}°`}
							onChange={(rotation, o) => rotateAroundCenter(layer, rotation, o)}
						/>
						<div className="grid grid-cols-2 gap-2">
							<Button variant="outline" size="sm" className="gap-1.5" onClick={() => flipSelection("x")}>
								<HugeiconsIcon icon={FlipHorizontalIcon} />
								Flip H
							</Button>
							<Button variant="outline" size="sm" className="gap-1.5" onClick={() => flipSelection("y")}>
								<HugeiconsIcon icon={FlipVerticalIcon} />
								Flip V
							</Button>
						</div>
					</SectionFields>
				</SectionContent>
			</Section>
		</>
	);
}

/** Rotates a layer around its center rather than its top-left origin. */
function rotateAroundCenter(layer: Layer, rotation: number, options?: Opts) {
	const width = layer.width * layer.scaleX;
	const height =
		(layer.type === "text"
			? layer.fontSize * layer.lineHeight * Math.max(1, layer.text.split("\n").length)
			: layer.height) * layer.scaleY;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const center = (deg: number, x: number, y: number) => ({
		x: x + (width / 2) * Math.cos(toRad(deg)) - (height / 2) * Math.sin(toRad(deg)),
		y: y + (width / 2) * Math.sin(toRad(deg)) + (height / 2) * Math.cos(toRad(deg)),
	});
	const c = center(layer.rotation, layer.x, layer.y);
	const origin = center(rotation, 0, 0);
	update(layer, { rotation, x: c.x - origin.x, y: c.y - origin.y }, options);
}

/* -------------------------------- Effects -------------------------------- */

const BLEND_MODES: { value: BlendMode; label: string }[] = [
	{ value: "source-over", label: "Normal" },
	{ value: "multiply", label: "Multiply" },
	{ value: "screen", label: "Screen" },
	{ value: "overlay", label: "Overlay" },
	{ value: "darken", label: "Darken" },
	{ value: "lighten", label: "Lighten" },
	{ value: "color-dodge", label: "Color dodge" },
	{ value: "color-burn", label: "Color burn" },
	{ value: "hard-light", label: "Hard light" },
	{ value: "soft-light", label: "Soft light" },
	{ value: "difference", label: "Difference" },
	{ value: "exclusion", label: "Exclusion" },
	{ value: "hue", label: "Hue" },
	{ value: "saturation", label: "Saturation" },
	{ value: "color", label: "Color" },
	{ value: "luminosity", label: "Luminosity" },
];

export function BlendingSection({ layers }: { layers: Layer[] }) {
	const first = layers[0];
	const setAll = (patch: Partial<Layer>, o?: Opts) =>
		getEditor().updateLayers(layers.map((l) => ({ id: l.id, patch })), o);

	return (
		<Section sectionKey="blending">
			<SectionHeader>
				<SectionTitle>Layer</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<SliderField
						label="Opacity"
						value={Math.round(first.opacity * 100)}
						min={0}
						max={100}
						defaultValue={100}
						format={(v) => `${Math.round(v)}%`}
						onChange={(v, o) => setAll({ opacity: v / 100 }, o)}
					/>
					<Field label="Blend mode">
						<Select
							value={first.blendMode}
							onValueChange={(value) => setAll({ blendMode: value as BlendMode })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{BLEND_MODES.map((m) => (
									<SelectItem key={m.value} value={m.value}>
										{m.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

export function EffectsTab({ layer }: { layer: Layer }) {
	const shadow = layer.shadow;
	const setShadow = (patch: Partial<Layer["shadow"]>, o?: Opts) =>
		update(layer, { shadow: { ...shadow, ...patch } }, o);

	return (
		<>
			<BlendingSection layers={[layer]} />
			<Section sectionKey="shadow">
				<SectionHeader
					trailing={
						<Switch
							checked={shadow.enabled}
							onCheckedChange={(enabled) => setShadow({ enabled })}
							aria-label="Toggle shadow"
						/>
					}
				>
					<SectionTitle>Shadow</SectionTitle>
				</SectionHeader>
				{shadow.enabled && (
					<SectionContent>
						<SectionFields>
							<Field label="Color">
								<ColorField value={shadow.color} onChange={(color, o) => setShadow({ color }, o)} />
							</Field>
							<SliderField label="Blur" value={shadow.blur} min={0} max={150} defaultValue={20} onChange={(blur, o) => setShadow({ blur }, o)} />
							<SliderField
								label="Opacity"
								value={Math.round(shadow.opacity * 100)}
								min={0}
								max={100}
								format={(v) => `${Math.round(v)}%`}
								onChange={(v, o) => setShadow({ opacity: v / 100 }, o)}
							/>
							<div className="grid grid-cols-2 gap-2">
								<NumField label="X" value={shadow.offsetX} onChange={(offsetX, o) => setShadow({ offsetX }, o)} />
								<NumField label="Y" value={shadow.offsetY} onChange={(offsetY, o) => setShadow({ offsetY }, o)} />
							</div>
						</SectionFields>
					</SectionContent>
				)}
			</Section>
		</>
	);
}

/* -------------------------------- Adjust --------------------------------- */

export function AdjustTab({ layer }: { layer: Layer }) {
	const adjustments = layer.adjustments;
	const groups = [
		{ id: "light", label: "Light" },
		{ id: "color", label: "Color" },
		{ id: "effects", label: "Effects" },
	] as const;

	return (
		<>
			<div className="flex h-11 items-center justify-between border-b px-3.5">
				<span className="text-muted-foreground text-sm font-medium">Adjustments</span>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1"
					disabled={!hasAdjustments(adjustments)}
					onClick={() => update(layer, { adjustments: { ...DEFAULT_ADJUSTMENTS } })}
				>
					<HugeiconsIcon icon={ArrowTurnBackwardIcon} />
					Reset
				</Button>
			</div>
			{groups.map((group) => (
				<Section key={group.id} collapsible sectionKey={`adjust-${group.id}`}>
					<SectionHeader>
						<SectionTitle>{group.label}</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<SectionFields>
							{ADJUSTMENTS.filter((a) => a.group === group.id).map((def) => (
								<SliderField
									key={def.key}
									label={def.label}
									value={adjustments[def.key]}
									min={def.min}
									max={def.max}
									step={def.step}
									defaultValue={DEFAULT_ADJUSTMENTS[def.key]}
									format={(v) => (def.step && def.step < 1 ? v.toFixed(1) : String(Math.round(v)))}
									onChange={(value, o) =>
										update(layer, { adjustments: { ...adjustments, [def.key]: value } }, o)
									}
								/>
							))}
						</SectionFields>
					</SectionContent>
				</Section>
			))}
		</>
	);
}

/* --------------------------------- Image --------------------------------- */

export function ImageTab({ layer }: { layer: ImageLayer }) {
	const { run, isRunning } = useRemoveBackground();
	const asset = getEditor().assets.find((a) => a.id === layer.assetId);

	const replaceImage = () => {
		openImagePicker(
			async (files) => {
				const [asset] = await importImageBlobs(files);
				if (!asset) return;
				// Keep the current width; fit the new image's aspect ratio.
				update(layer, {
					assetId: asset.id,
					crop: null,
					height: layer.width * (asset.height / asset.width),
				});
			},
			{ multiple: false },
		);
	};

	return (
		<>
			<Section sectionKey="image-tools">
				<SectionHeader
					trailing={
						asset && (
							<span className="text-muted-foreground text-xs tabular-nums">
								{asset.width} × {asset.height}
							</span>
						)
					}
				>
					<SectionTitle>Image</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<div className="flex flex-col gap-2">
						<Button className="gap-2" onClick={() => run(layer)} disabled={isRunning}>
							<HugeiconsIcon icon={AiMagicIcon} />
							{isRunning ? "Removing background..." : "Remove background"}
						</Button>
						<div className="grid grid-cols-2 gap-2">
							<Button variant="outline" className="gap-2" onClick={startCrop}>
								<HugeiconsIcon icon={CropIcon} />
								Crop
							</Button>
							<Button variant="outline" className="gap-2" onClick={replaceImage}>
								<HugeiconsIcon icon={Image01Icon} />
								Replace
							</Button>
						</div>
					</div>
				</SectionContent>
			</Section>
			<Section sectionKey="image-style">
				<SectionHeader>
					<SectionTitle>Style</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<SliderField
							label="Corner radius"
							value={layer.cornerRadius}
							min={0}
							max={Math.round(Math.min(layer.width, layer.height) / 2)}
							defaultValue={0}
							onChange={(cornerRadius, o) => update(layer, { cornerRadius }, o)}
						/>
						<StrokeFields
							stroke={layer.stroke}
							onChange={(stroke, o) => update(layer, { stroke }, o)}
						/>
					</SectionFields>
				</SectionContent>
			</Section>
		</>
	);
}

export function StrokeFields({
	stroke,
	onChange,
	label = "Border",
	advanced = false,
	closed = true,
}: {
	stroke: Stroke;
	onChange: (stroke: Stroke, options?: Opts) => void;
	label?: string;
	/** Vector layers: caps, joins, dashes and (for closed outlines) alignment. */
	advanced?: boolean;
	closed?: boolean;
}) {
	return (
		<div className="flex flex-col gap-3">
			<label className="flex items-center justify-between text-sm" htmlFor={`stroke-${label}`}>
				<span className="text-muted-foreground text-xs font-medium">{label}</span>
				<Switch
					id={`stroke-${label}`}
					checked={stroke.enabled}
					onCheckedChange={(enabled) => onChange({ ...stroke, enabled })}
				/>
			</label>
			{stroke.enabled && (
				<>
					<ColorField value={stroke.color} onChange={(color, o) => onChange({ ...stroke, color }, o)} />
					<SliderField
						label="Width"
						value={stroke.width}
						min={0}
						max={100}
						step={0.5}
						format={(v) => `${v}px`}
						onChange={(width, o) => onChange({ ...stroke, width }, o)}
					/>
					{advanced && <StrokeStyleFields stroke={stroke} onChange={onChange} closed={closed} />}
				</>
			)}
		</div>
	);
}

const DASH_PRESETS: { value: string; label: string; dash: number[] }[] = [
	{ value: "solid", label: "Solid", dash: [] },
	{ value: "dash", label: "Dashed", dash: [12, 8] },
	{ value: "dot", label: "Dotted", dash: [0, 8] },
	{ value: "long", label: "Long dash", dash: [24, 10] },
];

function StrokeStyleFields({
	stroke,
	onChange,
	closed,
}: {
	stroke: Stroke;
	onChange: (stroke: Stroke, options?: Opts) => void;
	closed: boolean;
}) {
	const dashText = (stroke.dash ?? []).join(" ");
	const [draft, setDraft] = useState(dashText);
	useEffect(() => setDraft(dashText), [dashText]);
	const preset = DASH_PRESETS.find((p) => p.dash.join(" ") === dashText)?.value ?? "custom";
	const commitDash = (text: string) => {
		const dash = text
			.split(/[\s,]+/)
			.map(Number)
			.filter((v) => Number.isFinite(v) && v >= 0);
		onChange({ ...stroke, dash: dash.some((v) => v > 0) ? dash : undefined });
	};
	return (
		<>
			<div className="grid grid-cols-2 gap-2">
				<Field label="Caps">
					<Select value={stroke.cap ?? "round"} onValueChange={(cap) => onChange({ ...stroke, cap: cap as Stroke["cap"] })}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="round">Round</SelectItem>
							<SelectItem value="butt">Flat</SelectItem>
							<SelectItem value="square">Square</SelectItem>
						</SelectContent>
					</Select>
				</Field>
				<Field label="Joins">
					<Select value={stroke.join ?? "round"} onValueChange={(join) => onChange({ ...stroke, join: join as Stroke["join"] })}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="round">Round</SelectItem>
							<SelectItem value="miter">Miter</SelectItem>
							<SelectItem value="bevel">Bevel</SelectItem>
						</SelectContent>
					</Select>
				</Field>
			</div>
			<Field label="Dashes">
				<div className="flex gap-2">
					<Select
						value={preset}
						onValueChange={(value) => {
							const p = DASH_PRESETS.find((d) => d.value === value);
							if (p) onChange({ ...stroke, dash: p.dash.length ? p.dash : undefined, cap: value === "dot" ? "round" : stroke.cap });
						}}
					>
						<SelectTrigger className="w-28 shrink-0">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{DASH_PRESETS.map((p) => (
								<SelectItem key={p.value} value={p.value}>
									{p.label}
								</SelectItem>
							))}
							<SelectItem value="custom" disabled>
								Custom
							</SelectItem>
						</SelectContent>
					</Select>
					<Input
						value={draft}
						placeholder="dash gap…"
						aria-label="Dash pattern"
						size="xs"
						onChange={(e) => setDraft(e.target.value)}
						onBlur={() => commitDash(draft)}
						onKeyDown={(e) => {
							if (e.key === "Enter") commitDash(draft);
						}}
					/>
				</div>
			</Field>
			{closed && (
				<Field label="Position">
					<Select
						value={stroke.align ?? "center"}
						onValueChange={(align) => onChange({ ...stroke, align: align as Stroke["align"] })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="center">Center</SelectItem>
							<SelectItem value="inside">Inside</SelectItem>
							<SelectItem value="outside">Outside</SelectItem>
						</SelectContent>
					</Select>
				</Field>
			)}
		</>
	);
}

/* --------------------------------- Shape --------------------------------- */

export function ShapeTab({ layer }: { layer: ShapeLayer }) {
	const isLine = layer.shape === "line" || layer.shape === "arrow";
	return (
		<>
		<Section sectionKey="shape">
			<SectionHeader>
				<SectionTitle>{isLine ? "Line" : "Shape"}</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					{!isLine && (
						<Field label="Fill">
							<FillField value={layer.fill} allowTransparent onChange={(fill, o) => update(layer, { fill }, o)} />
						</Field>
					)}
					{layer.shape === "rect" && (
						<SliderField
							label="Corner radius"
							value={layer.cornerRadius}
							min={0}
							max={Math.round(Math.min(layer.width, layer.height) / 2)}
							defaultValue={0}
							onChange={(cornerRadius, o) => update(layer, { cornerRadius }, o)}
						/>
					)}
					{(layer.shape === "polygon" || layer.shape === "star") && (
						<SliderField
							label={layer.shape === "star" ? "Points" : "Sides"}
							value={layer.sides}
							min={3}
							max={24}
							onChange={(sides, o) => update(layer, { sides }, o)}
						/>
					)}
					{layer.shape === "star" && (
						<SliderField
							label="Inner radius"
							value={Math.round(layer.innerRatio * 100)}
							min={10}
							max={95}
							format={(v) => `${Math.round(v)}%`}
							onChange={(v, o) => update(layer, { innerRatio: v / 100 }, o)}
						/>
					)}
					<StrokeFields
						label={isLine ? "Stroke" : "Border"}
						advanced
						closed={!isLine}
						stroke={layer.stroke}
						onChange={(stroke, o) => update(layer, { stroke: isLine ? { ...stroke, enabled: true } : stroke }, o)}
					/>
				</SectionFields>
			</SectionContent>
		</Section>
		<VectorSection layers={[layer]} />
		</>
	);
}

/* -------------------------------- Vector --------------------------------- */

const BOOLEAN_BUTTONS: {
	op: BooleanOp;
	label: string;
	shortcut: ActionId;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
}[] = [
	{ op: "union", label: "Union", shortcut: "vector.union", icon: PathfinderUniteIcon },
	{ op: "subtract", label: "Subtract", shortcut: "vector.subtract", icon: PathfinderMinusFrontIcon },
	{ op: "intersect", label: "Intersect", shortcut: "vector.intersect", icon: PathfinderIntersectIcon },
	{ op: "exclude", label: "Exclude", shortcut: "vector.exclude", icon: PathfinderExcludeIcon },
];

function BooleanButton({ op, label, shortcut, icon }: (typeof BOOLEAN_BUTTONS)[number]) {
	const hint = useShortcut(shortcut);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-full"
					aria-label={label}
					onClick={() => void booleanSelection(op)}
				>
					<HugeiconsIcon icon={icon} />
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{label} {hint && <span className="text-muted-foreground ml-1">{hint}</span>}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * Boolean operations (two or more vector layers), Flatten and Outline stroke.
 * Shapes are converted to paths on the way; the result is one path layer.
 */
export function VectorSection({ layers }: { layers: Layer[] }) {
	const flattenHint = useShortcut("vector.flatten");
	const outlineHint = useShortcut("vector.outlineStroke");
	const doc = getEditor().doc;
	const ids = layers.map((l) => l.id);
	const targets = doc ? vectorTargets(doc.layers, ids).vectors : [];
	if (targets.length === 0) return null;
	const canCombine = targets.length >= 2;
	const single = targets.length === 1 && layers.length === 1 ? targets[0] : undefined;
	const hasStroke = targets.some((t) => t.stroke.enabled && t.stroke.width > 0);
	return (
		<Section sectionKey="vector-ops">
			<SectionHeader>
				<SectionTitle>Vector</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					{canCombine && <div className="grid grid-cols-4 gap-1.5">{BOOLEAN_BUTTONS.map((b) => <BooleanButton key={b.op} {...b} />)}</div>}
					<div className="grid grid-cols-2 gap-2">
						{!(single?.type === "path") && (
							<Button variant="outline" size="sm" className="gap-1.5" onClick={() => flattenSelection()} title={flattenHint ?? undefined}>
								<HugeiconsIcon icon={PathIcon} />
								{single ? "Convert to path" : "Flatten"}
							</Button>
						)}
						{hasStroke && (
							<Button
								variant="outline"
								size="sm"
								className="gap-1.5"
								onClick={() => void outlineStrokeSelection()}
								title={outlineHint ?? undefined}
							>
								<HugeiconsIcon icon={PathfinderOutlineIcon} />
								Outline stroke
							</Button>
						)}
					</div>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

/* --------------------------------- Group --------------------------------- */

export function GroupTab({ layer }: { layer: GroupLayer }) {
	// Re-measure when anything inside changes.
	useEditorStore((s) => s.revision);
	const doc = getEditor().doc;
	const box = doc ? groupBounds(doc.layers, layer.id) : null;
	const count = doc ? doc.layers.filter((l) => l.parentId === layer.id).length : 0;
	const ungroupShortcut = useShortcut("arrange.ungroup");
	const set = (patch: Partial<{ x: number; y: number; width: number; height: number }>, o?: Opts) =>
		setGroupBox(layer.id, patch, o);
	return (
		<>
			<AlignSection />
			<Section sectionKey="group">
				<SectionHeader>
					<SectionTitle>Group</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<p className="text-muted-foreground text-xs">
							{count} {count === 1 ? "layer" : "layers"} · double-click or Ctrl/⌘-click to select inside
						</p>
						{box && (
							<div className="grid grid-cols-2 gap-2">
								<NumField label="X" value={Math.round(box.x * 100) / 100} onChange={(x, o) => set({ x }, o)} />
								<NumField label="Y" value={Math.round(box.y * 100) / 100} onChange={(y, o) => set({ y }, o)} />
								<NumField
									label="W"
									value={Math.round(box.width * 100) / 100}
									min={1}
									onChange={(width, o) => set({ width }, o)}
								/>
								<NumField
									label="H"
									value={Math.round(box.height * 100) / 100}
									min={1}
									onChange={(height, o) => set({ height }, o)}
								/>
							</div>
						)}
						<div className="grid grid-cols-2 gap-2">
							<Button variant="outline" size="sm" className="gap-1.5" onClick={() => flipSelection("x")}>
								<HugeiconsIcon icon={FlipHorizontalIcon} />
								Flip H
							</Button>
							<Button variant="outline" size="sm" className="gap-1.5" onClick={() => flipSelection("y")}>
								<HugeiconsIcon icon={FlipVerticalIcon} />
								Flip V
							</Button>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={() => {
								getEditor().select([layer.id]);
								ungroupSelection();
							}}
						>
							<HugeiconsIcon icon={GroupItemsIcon} />
							Ungroup
							{ungroupShortcut && <span className="text-muted-foreground ml-auto text-xs">{ungroupShortcut}</span>}
						</Button>
					</SectionFields>
				</SectionContent>
			</Section>
			<VectorSection layers={[layer]} />
			<BlendingSection layers={[layer]} />
		</>
	);
}

/* ---------------------------------- Path --------------------------------- */

export function PathTab({ layer }: { layer: PathLayer }) {
	const editing = useEditorStore((s) => s.editingPathId === layer.id);
	const points = layer.subpaths.reduce((sum, s) => sum + s.anchors.length, 0);
	return (
		<>
		<Section sectionKey="path">
			<SectionHeader>
				<SectionTitle>Vector</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<Button
						variant={editing ? "secondary" : "outline"}
						size="sm"
						className="gap-1.5"
						disabled={layer.locked}
						onClick={() => getEditor().setEditingPathId(editing ? null : layer.id)}
					>
						<HugeiconsIcon icon={PenTool03Icon} />
						{editing ? "Done editing" : "Edit points"}
						<span className="text-muted-foreground ml-auto text-xs">{editing ? "Esc" : "Enter"}</span>
					</Button>
					<p className="text-muted-foreground text-xs">
						{points} {points === 1 ? "point" : "points"} · {layer.subpaths.length}{" "}
						{layer.subpaths.length === 1 ? "subpath" : "subpaths"}
					</p>
					<Field label="Fill">
						<FillField value={layer.fill} allowTransparent onChange={(fill, o) => update(layer, { fill }, o)} />
					</Field>
					<Field label="Fill rule">
						<Select
							value={layer.fillRule}
							onValueChange={(fillRule) => update(layer, { fillRule: fillRule as PathLayer["fillRule"] })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="nonzero">Non-zero</SelectItem>
								<SelectItem value="evenodd">Even-odd (holes)</SelectItem>
							</SelectContent>
						</Select>
					</Field>
					<StrokeFields
						label="Stroke"
						advanced
						closed={layer.subpaths.length > 0 && layer.subpaths.every((sp) => sp.closed)}
						stroke={layer.stroke}
						onChange={(stroke, o) => update(layer, { stroke }, o)}
					/>
				</SectionFields>
			</SectionContent>
		</Section>
		<VectorSection layers={[layer]} />
		</>
	);
}

/* ---------------------------------- Text --------------------------------- */

export function TextTab({ layer }: { layer: TextLayer }) {
	const [draft, setDraft] = useState(layer.text);
	useEffect(() => setDraft(layer.text), [layer.text]);

	const toggle = (key: "underline" | "lineThrough" | "uppercase") =>
		update(layer, { [key]: !layer[key] } as Partial<TextLayer>);

	return (
		<>
			<Section sectionKey="text-content">
				<SectionHeader>
					<SectionTitle>Text</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<Textarea
						value={draft}
						rows={3}
						onChange={(e) => {
							setDraft(e.target.value);
							update(layer, { text: e.target.value }, { transient: true });
						}}
						onBlur={() => {
							update(layer, { name: draft.split("\n")[0].slice(0, 32) || "Text" }, { transient: true });
							getEditor().commit();
						}}
					/>
				</SectionContent>
			</Section>
			<Section sectionKey="text-font">
				<SectionHeader>
					<SectionTitle>Font</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<FontPicker value={layer.fontFamily} onChange={(fontFamily) => update(layer, { fontFamily })} />
						<div className="grid grid-cols-2 gap-2">
							<NumField label="Size" value={layer.fontSize} min={1} max={2000} onChange={(fontSize, o) => update(layer, { fontSize }, o)} />
							<NumField
								label="Line"
								value={layer.lineHeight}
								min={0.5}
								max={4}
								step={0.05}
								precision={2}
								onChange={(lineHeight, o) => update(layer, { lineHeight }, o)}
							/>
						</div>
						<NumField
							label="Spacing"
							value={layer.letterSpacing}
							min={-50}
							max={500}
							onChange={(letterSpacing, o) => update(layer, { letterSpacing }, o)}
						/>
						<div className="flex items-center gap-1">
							<ToggleButton
								active={layer.fontWeight === "bold"}
								label="Bold"
								icon={TextBoldIcon}
								onClick={() => update(layer, { fontWeight: layer.fontWeight === "bold" ? "normal" : "bold" })}
							/>
							<ToggleButton
								active={layer.fontStyle === "italic"}
								label="Italic"
								icon={TextItalicIcon}
								onClick={() => update(layer, { fontStyle: layer.fontStyle === "italic" ? "normal" : "italic" })}
							/>
							<ToggleButton active={layer.underline} label="Underline" icon={TextUnderlineIcon} onClick={() => toggle("underline")} />
							<ToggleButton active={layer.lineThrough} label="Strikethrough" icon={TextStrikethroughIcon} onClick={() => toggle("lineThrough")} />
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant={layer.uppercase ? "secondary" : "ghost"}
										size="icon"
										className="size-8 text-xs font-semibold"
										onClick={() => toggle("uppercase")}
										aria-label="Uppercase"
									>
										Aa
									</Button>
								</TooltipTrigger>
								<TooltipContent>Uppercase</TooltipContent>
							</Tooltip>
							<div className="bg-border mx-1 h-5 w-px" />
							{(["left", "center", "right"] as const).map((align) => (
								<ToggleButton
									key={align}
									active={layer.align === align}
									label={`Align ${align}`}
									icon={align === "left" ? TextAlignLeftIcon : align === "center" ? TextAlignCenterIcon : TextAlignRightIcon}
									onClick={() => update(layer, { align })}
								/>
							))}
						</div>
					</SectionFields>
				</SectionContent>
			</Section>
			<Section sectionKey="text-color">
				<SectionHeader>
					<SectionTitle>Color</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<FillField value={layer.fill} allowTransparent onChange={(fill, o) => update(layer, { fill }, o)} />
						<StrokeFields label="Outline" stroke={layer.stroke} onChange={(stroke, o) => update(layer, { stroke }, o)} />
					</SectionFields>
				</SectionContent>
			</Section>
		</>
	);
}

function ToggleButton({
	active,
	label,
	icon,
	onClick,
}: {
	active: boolean;
	label: string;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant={active ? "secondary" : "ghost"}
					size="icon"
					className={cn("size-8", !active && "text-muted-foreground")}
					onClick={onClick}
					aria-label={label}
					aria-pressed={active}
				>
					<HugeiconsIcon icon={icon} />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function FontPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (family: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	useEffect(() => {
		if (open) preloadFontPreviews();
	}, [open]);
	const fonts = FONTS.filter((f) => f.family.toLowerCase().includes(query.toLowerCase()));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="bg-accent flex h-8 w-full items-center justify-between rounded-md border px-2.5 text-sm"
				>
					<span style={{ fontFamily: `"${value}"` }}>{value}</span>
					<HugeiconsIcon icon={ArrowDown01Icon} className="text-muted-foreground size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent side="left" align="start" className="flex w-64 flex-col p-0">
				<div className="border-b p-2">
					<input
						autoFocus
						placeholder="Search fonts..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="bg-accent w-full rounded-md px-2 py-1.5 text-sm outline-none"
					/>
				</div>
				<div className="scrollbar-thin max-h-80 overflow-y-auto p-1">
					{fonts.map((font) => (
						<button
							key={font.family}
							type="button"
							onClick={() => {
								void ensureFont(font.family);
								onChange(font.family);
								setOpen(false);
							}}
							className={cn(
								"hover:bg-accent flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left",
								value === font.family && "bg-secondary text-secondary-foreground",
							)}
						>
							<span className="text-base" style={{ fontFamily: `"${font.family}"` }}>
								{font.family}
							</span>
							<span className="text-muted-foreground text-[0.65rem] capitalize">{font.category}</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
