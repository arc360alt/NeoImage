"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	PlusSignIcon,
	MinusSignIcon,
	Download04Icon,
	ViewIcon,
	HashtagIcon,
	FullScreenIcon,
} from "@hugeicons/core-free-icons";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getEditor, useEditorStore } from "@/editor/store";
import { createExportSetting, createFrameLayer } from "@/editor/defaults";
import { exportLayers, fileNameFor, settingsFor } from "@/editor/export";
import { renderLayer } from "@/editor/stage";
import { FRAME_PRESETS } from "@/editor/canvas-presets";
import { frameRect, nextFrameName, nextFramePosition } from "@/editor/freeform";
import type { ExportFormat, ExportSetting, FrameLayer, Layer } from "@/editor/types";
import { ColorField, Field, FillField, NumField, SliderField } from "../controls";

const SCALES = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const FORMATS: { value: ExportFormat; label: string }[] = [
	{ value: "png", label: "PNG" },
	{ value: "jpeg", label: "JPG" },
	{ value: "webp", label: "WEBP" },
];

/* --------------------------------- Frame --------------------------------- */

export function FrameTab({ layer }: { layer: FrameLayer }) {
	const update = (patch: Partial<FrameLayer>, options?: { transient?: boolean }) =>
		getEditor().updateLayer(layer.id, patch, options);
	const presetId =
		FRAME_PRESETS.find((p) => p.width === layer.width && p.height === layer.height)?.id ?? "custom";

	return (
		<>
			<Section sectionKey="frame">
				<SectionHeader>
					<SectionTitle>Frame</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<Select
							value={presetId}
							onValueChange={(id) => {
								const preset = FRAME_PRESETS.find((p) => p.id === id);
								if (preset) update({ width: preset.width, height: preset.height });
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent className="max-h-80">
								<SelectItem value="custom">Custom size</SelectItem>
								{FRAME_PRESETS.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.label} · {p.width}×{p.height}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="grid grid-cols-2 gap-2">
							<NumField label="X" value={layer.x} onChange={(x, o) => moveFrame(layer, { x }, o)} />
							<NumField label="Y" value={layer.y} onChange={(y, o) => moveFrame(layer, { y }, o)} />
							<NumField label="W" value={layer.width} min={1} onChange={(width, o) => update({ width }, o)} />
							<NumField label="H" value={layer.height} min={1} onChange={(height, o) => update({ height }, o)} />
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => update({ width: layer.height, height: layer.width })}
							>
								Swap orientation
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="gap-1.5"
								onClick={() => getEditor().requestFit(frameRect(layer))}
							>
								<HugeiconsIcon icon={FullScreenIcon} />
								Zoom to frame
							</Button>
						</div>
						<label className="flex items-center justify-between text-xs" htmlFor="clip-content">
							<span className="text-muted-foreground">Clip content</span>
							<Switch
								id="clip-content"
								checked={layer.clipContent}
								onCheckedChange={(clipContent) => update({ clipContent })}
							/>
						</label>
					</SectionFields>
				</SectionContent>
			</Section>
			<Section sectionKey="frame-fill">
				<SectionHeader>
					<SectionTitle>Fill</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<FillField value={layer.fill} allowTransparent onChange={(fill, o) => update({ fill }, o)} />
						<SliderField
							label="Corner radius"
							value={layer.cornerRadius}
							min={0}
							max={Math.round(Math.min(layer.width, layer.height) / 2)}
							defaultValue={0}
							onChange={(cornerRadius, o) => update({ cornerRadius }, o)}
						/>
					</SectionFields>
				</SectionContent>
			</Section>
			<Section sectionKey="frame-stroke">
				<SectionHeader
					trailing={
						<Switch
							checked={layer.stroke.enabled}
							onCheckedChange={(enabled) => update({ stroke: { ...layer.stroke, enabled } })}
							aria-label="Toggle border"
						/>
					}
				>
					<SectionTitle>Border</SectionTitle>
				</SectionHeader>
				{layer.stroke.enabled && (
					<SectionContent>
						<SectionFields>
							<ColorField
								value={layer.stroke.color}
								onChange={(color, o) => update({ stroke: { ...layer.stroke, color } }, o)}
							/>
							<SliderField
								label="Width"
								value={layer.stroke.width}
								min={0}
								max={40}
								step={0.5}
								format={(v) => `${v}px`}
								onChange={(width, o) => update({ stroke: { ...layer.stroke, width } }, o)}
							/>
						</SectionFields>
					</SectionContent>
				)}
			</Section>
			<ExportSection layers={[layer]} />
		</>
	);
}

/** Moving a frame from the inputs moves its contents too. */
function moveFrame(
	frame: FrameLayer,
	patch: { x?: number; y?: number },
	options?: { transient?: boolean },
) {
	const doc = getEditor().doc;
	if (!doc) return;
	const dx = (patch.x ?? frame.x) - frame.x;
	const dy = (patch.y ?? frame.y) - frame.y;
	getEditor().updateLayers(
		[
			{ id: frame.id, patch },
			...doc.layers
				.filter((l) => l.parentId === frame.id)
				.map((l) => ({ id: l.id, patch: { x: l.x + dx, y: l.y + dy } })),
		],
		options,
	);
}

/* --------------------------------- Export -------------------------------- */

export function ExportSection({
	layers,
	title = "Export",
}: {
	layers: Layer[];
	title?: string;
}) {
	const [isExporting, setIsExporting] = useState(false);
	const single = layers.length === 1 ? layers[0] : null;
	const settings = single ? settingsFor(single) : [];

	const setSettings = (next: ExportSetting[]) => {
		if (single) getEditor().updateLayer(single.id, { exportSettings: next });
	};
	const updateRow = (id: string, patch: Partial<ExportSetting>) =>
		setSettings(settings.map((s) => (s.id === id ? { ...s, ...patch } : s)));

	const handleExport = async () => {
		setIsExporting(true);
		try {
			const count = await exportLayers(layers.map((l) => l.id));
			toast.success(count === 1 ? "Exported 1 file" : `Exported ${count} files`);
		} catch (error) {
			toast.error("Export failed", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsExporting(false);
		}
	};

	const label =
		layers.length === 0
			? "Nothing to export"
			: single
				? `Export ${single.name}`
				: `Export ${layers.length} layers`;

	return (
		<Section sectionKey={`export-${single ? "single" : "multi"}`}>
			<SectionHeader
				trailing={
					single && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() =>
								setSettings([
									...settings,
									createExportSetting({ scale: settings.length === 0 ? 1 : settings.length + 1 }),
								])
							}
							aria-label="Add export setting"
						>
							<HugeiconsIcon icon={PlusSignIcon} />
						</Button>
					)
				}
			>
				<SectionTitle>{title}</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<div className="flex flex-col gap-2">
					{single &&
						settings.map((setting) => (
							<div key={setting.id} className="flex items-center gap-1.5">
								<Select
									value={String(setting.scale)}
									onValueChange={(v) => updateRow(setting.id, { scale: Number(v) })}
								>
									<SelectTrigger className="w-[4.5rem]" aria-label="Scale">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SCALES.map((scale) => (
											<SelectItem key={scale} value={String(scale)}>
												{scale}x
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Input
									placeholder="Suffix"
									aria-label="File name suffix"
									value={setting.suffix}
									onChange={(e) => updateRow(setting.id, { suffix: e.target.value })}
									className="h-7 min-w-0 flex-1 text-xs"
								/>
								<Select
									value={setting.format}
									onValueChange={(v) => updateRow(setting.id, { format: v as ExportFormat })}
								>
									<SelectTrigger className="w-[4.75rem]" aria-label="Format">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{FORMATS.map((f) => (
											<SelectItem key={f.value} value={f.value}>
												{f.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									variant="ghost"
									size="icon"
									className="shrink-0"
									disabled={settings.length <= 1}
									onClick={() => setSettings(settings.filter((s) => s.id !== setting.id))}
									aria-label="Remove export setting"
								>
									<HugeiconsIcon icon={MinusSignIcon} />
								</Button>
							</div>
						))}
					{!single && layers.length > 0 && (
						<p className="text-muted-foreground text-xs">
							Each layer uses its own export settings.
						</p>
					)}
					<Button
						variant="outline"
						className="mt-1 gap-2"
						disabled={layers.length === 0 || isExporting}
						onClick={handleExport}
					>
						<HugeiconsIcon icon={Download04Icon} />
						<span className="truncate">{isExporting ? "Exporting..." : label}</span>
					</Button>
					{single && <ExportPreview layer={single} setting={settings[0]} />}
				</div>
			</SectionContent>
		</Section>
	);
}

function ExportPreview({ layer, setting }: { layer: Layer; setting?: ExportSetting }) {
	const [open, setOpen] = useState(false);
	const [src, setSrc] = useState<string | null>(null);
	const revision = useEditorStore((s) => s.revision);

	useEffect(() => {
		if (!open) return;
		const timer = setTimeout(async () => {
			try {
				setSrc(await renderLayer({ layerId: layer.id, scale: 0.5, format: "png" }));
			} catch {
				setSrc(null);
			}
		}, 250);
		return () => clearTimeout(timer);
	}, [open, layer.id, revision]);

	return (
		<div className="flex flex-col gap-2">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
			>
				<HugeiconsIcon icon={ViewIcon} className="size-3.5" />
				{open ? "Hide preview" : "Preview"}
				{setting && (
					<span className="ml-auto truncate opacity-70">{fileNameFor(layer, setting)}</span>
				)}
			</button>
			{open && (
				<div className="flex max-h-56 items-center justify-center overflow-hidden rounded-md border bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:12px_12px] p-2">
					{src ? (
						// biome-ignore lint/performance/noImgElement: data URL preview
						<img src={src} alt="Export preview" className="max-h-52 object-contain" />
					) : (
						<span className="text-muted-foreground text-xs">Rendering…</span>
					)}
				</div>
			)}
		</div>
	);
}

/* ---------------------------------- Page --------------------------------- */

/** Shown when nothing is selected in FreeForm: frames overview and export. */
export function PageProperties() {
	const layers = useEditorStore((s) => s.doc?.layers ?? []);
	const frames = layers.filter((l): l is FrameLayer => l.type === "frame");

	return (
		<>
			<div className="flex h-11 items-center border-b px-3.5">
				<span className="text-muted-foreground text-sm">Page</span>
			</div>
			<Section sectionKey="page-frames">
				<SectionHeader>
					<SectionTitle>Frames</SectionTitle>
					<span className="text-muted-foreground ml-auto text-xs">{frames.length}</span>
				</SectionHeader>
				<SectionContent>
					{frames.length === 0 ? (
						<p className="text-muted-foreground text-xs leading-relaxed">
							Press <kbd className="bg-accent rounded border px-1">F</kbd> and drag on the
							canvas to draw a frame, or pick a size below.
						</p>
					) : (
						<div className="flex flex-col">
							{frames.map((frame) => (
								<button
									key={frame.id}
									type="button"
									onClick={() => {
										getEditor().select([frame.id]);
										getEditor().requestFit(frameRect(frame));
									}}
									className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
								>
									<HugeiconsIcon icon={HashtagIcon} className="text-muted-foreground size-3.5" />
									<span className="flex-1 truncate">{frame.name}</span>
									<span className="text-muted-foreground tabular-nums">
										{frame.width}×{frame.height}
									</span>
								</button>
							))}
						</div>
					)}
				</SectionContent>
			</Section>
			<Section sectionKey="page-new-frame">
				<SectionHeader>
					<SectionTitle>New frame</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<NewFramePresets />
				</SectionContent>
			</Section>
			<ExportSection layers={frames} title="Export all frames" />
			<div className="text-muted-foreground p-4 text-xs leading-relaxed">
				Select a frame or layer to edit it. Drop layers onto a frame to put them inside.
			</div>
		</>
	);
}

export function NewFramePresets() {
	const [presetId, setPresetId] = useState(FRAME_PRESETS[0].id);
	return (
		<Field label="Size">
			<div className="flex gap-1.5">
				<Select value={presetId} onValueChange={setPresetId}>
					<SelectTrigger className="min-w-0 flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="max-h-80">
						{FRAME_PRESETS.map((p) => (
							<SelectItem key={p.id} value={p.id}>
								{p.label} · {p.width}×{p.height}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					size="sm"
					onClick={() => {
						const preset = FRAME_PRESETS.find((p) => p.id === presetId);
						if (preset) addFrame(preset.width, preset.height, preset.label);
					}}
				>
					Add
				</Button>
			</div>
		</Field>
	);
}

export function addFrame(width: number, height: number, name?: string) {
	const doc = getEditor().doc;
	if (!doc) return;
	const frame = createFrameLayer({
		width,
		height,
		name: name ?? nextFrameName(doc.layers),
		...nextFramePosition(doc.layers),
	});
	getEditor().addLayers([frame]);
	getEditor().requestFit(frameRect(frame));
	return frame;
}
