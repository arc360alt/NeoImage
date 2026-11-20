"use client";

import { useState } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { Download, Copy } from "lucide-react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { cn } from "@/utils/ui";
import { useEditorStore } from "@/editor/store";
import {
	type ExportFormat,
	dataUrlToBlob,
	downloadDataUrl,
	renderArtboard,
} from "@/editor/stage";
import { exportLayers, settingsFor } from "@/editor/export";

export const useExportDialogStore = create<{
	isOpen: boolean;
	setOpen: (open: boolean) => void;
}>()((set) => ({ isOpen: false, setOpen: (isOpen) => set({ isOpen }) }));

const FORMATS: { value: ExportFormat; label: string }[] = [
	{ value: "png", label: "PNG - Best quality, supports transparency" },
	{ value: "jpeg", label: "JPEG - Smallest file size" },
	{ value: "webp", label: "WebP - Modern, small and sharp" },
];

const SCALES = [0.5, 1, 2, 3];

export function ExportButton() {
	const isOpen = useExportDialogStore((s) => s.isOpen);
	const setOpen = useExportDialogStore((s) => s.setOpen);
	const hasProject = useEditorStore((s) => s.doc !== null);

	return (
		<Popover open={isOpen} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-md bg-[#38BDF8] px-[0.12rem] py-[0.12rem] text-white",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
					disabled={!hasProject}
				>
					<div className="relative flex items-center gap-1.5 rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7] px-4 py-1 shadow-[0_1px_3px_0px_rgba(0,0,0,0.65)]">
						<HugeiconsIcon icon={TransitionTopIcon} className="z-50 size-3.5" />
						<span className="z-50 text-[0.875rem]">Export</span>
						<div className="absolute top-0 left-0 z-10 flex size-full items-center justify-center rounded-[0.6rem] bg-linear-to-t from-white/0 to-white/50">
							<div className="absolute top-[0.08rem] z-50 h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7]" />
						</div>
					</div>
				</button>
			</PopoverTrigger>
			{hasProject && <ExportPopover onDone={() => setOpen(false)} />}
		</Popover>
	);
}

function ExportPopover({ onDone }: { onDone: () => void }) {
	const freeform = useEditorStore((s) => s.doc?.mode === "freeform");
	return freeform ? <FreeformExportPopover onDone={onDone} /> : <ArtboardExportPopover onDone={onDone} />;
}

/** FreeForm: pick frames and export each with its own export settings. */
function FreeformExportPopover({ onDone }: { onDone: () => void }) {
	const layers = useEditorStore((s) => s.doc?.layers ?? []);
	const selectedIds = useEditorStore((s) => s.selectedIds);
	const frames = layers.filter((l) => l.type === "frame");
	const selectedFrames = frames.filter((f) => selectedIds.includes(f.id));
	const [checked, setChecked] = useState<Set<string>>(
		() => new Set((selectedFrames.length ? selectedFrames : frames).map((f) => f.id)),
	);
	const [isExporting, setIsExporting] = useState(false);
	const ids = frames.filter((f) => checked.has(f.id)).map((f) => f.id);

	const handleExport = async () => {
		setIsExporting(true);
		try {
			const count = await exportLayers(ids);
			toast.success(count === 1 ? "Exported 1 file" : `Exported ${count} files (zip)`);
			onDone();
		} catch (error) {
			toast.error("Export failed", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<PopoverContent className="bg-background mr-4 flex w-80 flex-col p-0">
			<div className="flex items-center justify-between border-b p-3">
				<h3 className="text-sm font-medium">Export frames</h3>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground text-xs"
					onClick={() =>
						setChecked(checked.size === frames.length ? new Set() : new Set(frames.map((f) => f.id)))
					}
				>
					{checked.size === frames.length ? "Select none" : "Select all"}
				</button>
			</div>
			{frames.length === 0 ? (
				<p className="text-muted-foreground p-4 text-sm">
					No frames yet. Press F and drag on the canvas to create one.
				</p>
			) : (
				<div className="scrollbar-thin flex max-h-72 flex-col overflow-y-auto p-1.5">
					{frames.map((frame) => (
						<label
							key={frame.id}
							htmlFor={`export-frame-${frame.id}`}
							className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5"
						>
							<Checkbox
								id={`export-frame-${frame.id}`}
								checked={checked.has(frame.id)}
								onCheckedChange={(value) =>
									setChecked((prev) => {
										const next = new Set(prev);
										if (value) next.add(frame.id);
										else next.delete(frame.id);
										return next;
									})
								}
							/>
							<span className="flex-1 truncate text-sm">{frame.name}</span>
							<span className="text-muted-foreground text-xs">
								{settingsFor(frame)
									.map((s) => `${s.scale}x ${s.format === "jpeg" ? "JPG" : s.format.toUpperCase()}`)
									.join(", ")}
							</span>
						</label>
					))}
				</div>
			)}
			<div className="flex flex-col gap-2 border-t p-3">
				<p className="text-muted-foreground text-xs">
					Change scale and format per frame in the Export section of the right panel.
				</p>
				<Button onClick={handleExport} disabled={isExporting || ids.length === 0} className="gap-2">
					<Download className="size-4" />
					{isExporting
						? "Exporting..."
						: ids.length === 1
							? "Export 1 frame"
							: `Export ${ids.length} frames`}
				</Button>
			</div>
		</PopoverContent>
	);
}

function ArtboardExportPopover({ onDone }: { onDone: () => void }) {
	const doc = useEditorStore((s) => s.doc);
	const [format, setFormat] = useState<ExportFormat>("png");
	const [scale, setScale] = useState(1);
	const [quality, setQuality] = useState(92);
	const [transparent, setTransparent] = useState(false);
	const [isExporting, setIsExporting] = useState(false);

	if (!doc) return null;
	const outWidth = Math.round(doc.canvas.width * scale);
	const outHeight = Math.round(doc.canvas.height * scale);
	const supportsAlpha = format !== "jpeg";

	const render = () =>
		renderArtboard({
			scale,
			format,
			quality: quality / 100,
			transparent: supportsAlpha && transparent,
		});

	const handleExport = async () => {
		setIsExporting(true);
		try {
			const dataUrl = await render();
			const ext = format === "jpeg" ? "jpg" : format;
			const safeName = doc.name.replace(/[^\w\- ]+/g, "").trim() || "neoimage";
			downloadDataUrl(dataUrl, `${safeName}.${ext}`);
			toast.success("Export complete", {
				description: `${outWidth} × ${outHeight} ${format.toUpperCase()}`,
			});
			onDone();
		} catch (error) {
			toast.error("Export failed", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsExporting(false);
		}
	};

	const handleCopy = async () => {
		setIsExporting(true);
		try {
			const dataUrl = await renderArtboard({ scale, format: "png", transparent });
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": dataUrlToBlob(dataUrl) }),
			]);
			toast.success("Copied image to clipboard");
			onDone();
		} catch (error) {
			toast.error("Couldn't copy to clipboard", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<PopoverContent className="bg-background mr-4 flex w-80 flex-col p-0">
			<div className="flex items-center justify-between border-b p-3">
				<h3 className="text-sm font-medium">Export image</h3>
				<span className="text-muted-foreground text-xs tabular-nums">
					{outWidth} × {outHeight}
				</span>
			</div>

			<div className="flex flex-col gap-4">
				<div className="flex flex-col">
					<Section collapsible defaultOpen showTopBorder={false} sectionKey="export-format">
						<SectionHeader>
							<SectionTitle>Format</SectionTitle>
						</SectionHeader>
						<SectionContent>
							<RadioGroup
								value={format}
								onValueChange={(value) => setFormat(value as ExportFormat)}
							>
								{FORMATS.map((f) => (
									<div key={f.value} className="flex items-center space-x-2">
										<RadioGroupItem value={f.value} id={`export-${f.value}`} />
										<Label htmlFor={`export-${f.value}`}>{f.label}</Label>
									</div>
								))}
							</RadioGroup>
						</SectionContent>
					</Section>

					<Section collapsible defaultOpen sectionKey="export-size">
						<SectionHeader>
							<SectionTitle>Size</SectionTitle>
						</SectionHeader>
						<SectionContent>
							<div className="grid grid-cols-4 gap-1.5">
								{SCALES.map((s) => (
									<Button
										key={s}
										size="sm"
										variant={scale === s ? "secondary" : "outline"}
										onClick={() => setScale(s)}
									>
										{s}x
									</Button>
								))}
							</div>
						</SectionContent>
					</Section>

					{format !== "png" && (
						<Section collapsible defaultOpen sectionKey="export-quality">
							<SectionHeader>
								<SectionTitle>Quality</SectionTitle>
								<span className="text-muted-foreground text-xs tabular-nums">
									{quality}%
								</span>
							</SectionHeader>
							<SectionContent>
								<Slider
									min={10}
									max={100}
									step={1}
									value={[quality]}
									onValueChange={([v]) => setQuality(v)}
								/>
							</SectionContent>
						</Section>
					)}

					{supportsAlpha && (
						<Section collapsible defaultOpen={false} sectionKey="export-bg">
							<SectionHeader>
								<SectionTitle>Background</SectionTitle>
							</SectionHeader>
							<SectionContent>
								<div className="flex items-center space-x-2">
									<Checkbox
										id="export-transparent"
										checked={transparent}
										onCheckedChange={(checked) => setTransparent(!!checked)}
									/>
									<Label htmlFor="export-transparent">
										Transparent background
									</Label>
								</div>
							</SectionContent>
						</Section>
					)}
				</div>

				<div className="flex gap-2 p-3 pt-0">
					<Button
						variant="outline"
						size="icon"
						className="size-9 shrink-0"
						onClick={handleCopy}
						disabled={isExporting}
						aria-label="Copy to clipboard"
					>
						<Copy className="size-4" />
					</Button>
					<Button
						onClick={handleExport}
						disabled={isExporting}
						className="flex-1 gap-2"
					>
						<Download className="size-4" />
						{isExporting ? "Exporting..." : "Download"}
					</Button>
				</div>
			</div>
		</PopoverContent>
	);
}
