"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { HashtagIcon, Image01Icon, ImageAdd02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/utils/ui";
import {
	CANVAS_PRESETS,
	FRAME_PRESETS,
	MAX_CANVAS_SIZE,
	type CanvasPreset,
} from "@/editor/canvas-presets";
import { TEMPLATES } from "@/editor/templates";
import { TemplatePreview } from "@/components/editor/template-preview";
import { useProjectsData } from "@/project/projects-store";
import { createAssetRecord } from "@/storage/assets";
import { createFrameLayer, createImageLayer, solid } from "@/editor/defaults";
import type { AssetRecord, Fill, Layer, ProjectMode } from "@/editor/types";
import { openImagePicker } from "@/editor/import";

export function NewProjectDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const createNewProject = useProjectsData((s) => s.createNewProject);
	const [name, setName] = useState("Untitled design");
	const [selected, setSelected] = useState<CanvasPreset>(CANVAS_PRESETS[0]);
	const [customWidth, setCustomWidth] = useState("1920");
	const [customHeight, setCustomHeight] = useState("1080");
	const [tab, setTab] = useState("presets");
	const [isCreating, setIsCreating] = useState(false);
	const [mode, setMode] = useState<ProjectMode>("default");
	const freeform = mode === "freeform";
	const presets = freeform ? FRAME_PRESETS : CANVAS_PRESETS;

	const open = async (create: () => Promise<string>) => {
		if (isCreating) return;
		setIsCreating(true);
		try {
			const id = await create();
			onOpenChange(false);
			router.push(`/editor/${id}`);
		} catch (error) {
			toast.error("Failed to create project", {
				description: error instanceof Error ? error.message : "Please try again",
			});
		} finally {
			setIsCreating(false);
		}
	};

	const projectName = name.trim() || "Untitled design";

	/**
	 * Creates the project for the chosen mode. Default: the size is the
	 * artboard. FreeForm: the size becomes the first frame, holding the layers.
	 */
	const createDesign = ({
		name: designName = projectName,
		width,
		height,
		background = solid("#ffffff"),
		layers = [],
		assets,
		frameName = "Frame 1",
	}: {
		name?: string;
		width: number;
		height: number;
		background?: Fill;
		layers?: Layer[];
		assets?: Omit<AssetRecord, "projectId">[];
		frameName?: string;
	}) => {
		if (!freeform) {
			return createNewProject({
				name: designName,
				canvas: { width, height, background },
				layers,
				assets,
			});
		}
		const frame = createFrameLayer({ name: frameName, width, height, fill: background });
		return createNewProject({
			name: designName,
			mode: "freeform",
			canvas: { width, height, background: solid("#ffffff") },
			layers: [frame, ...layers.map((l) => ({ ...l, parentId: frame.id }))],
			assets,
		});
	};

	const handleCreate = () => {
		if (tab === "custom") {
			const width = clampSize(Number.parseInt(customWidth, 10));
			const height = clampSize(Number.parseInt(customHeight, 10));
			if (!width || !height) {
				toast.error("Enter a valid width and height");
				return;
			}
			return open(() => createDesign({ width, height }));
		}
		return open(() =>
			createDesign({ width: selected.width, height: selected.height, frameName: selected.label }),
		);
	};

	const handleOpenPhoto = () => {
		openImagePicker(
			([file]) => {
				void open(async () => {
					const record = await createAssetRecord({
						projectId: "",
						blob: file,
						name: file.name,
					});
					const scale = Math.min(1, MAX_CANVAS_SIZE / Math.max(record.width, record.height));
					const width = Math.round(record.width * scale);
					const height = Math.round(record.height * scale);
					const { projectId: _p, ...asset } = record;
					return createDesign({
							name: file.name.replace(/\.[a-z0-9]+$/i, "") || projectName,
							width,
							height,
							frameName: "Photo",
							assets: [asset],
						layers: [
							createImageLayer({
								assetId: record.id,
								name: "Background photo",
								width,
								height,
							}),
						],
					});
				});
			},
			{ multiple: false },
		);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>New project</DialogTitle>
				</DialogHeader>
				<DialogBody className="gap-5">
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-project-name">Name</Label>
						<Input
							id="new-project-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							onFocus={(e) => e.target.select()}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label>Project type</Label>
						<div className="grid grid-cols-2 gap-2">
							<ModeCard
								active={!freeform}
								title="Default"
								description="One canvas at a fixed size. Quick designs, Canva-style."
								icon={Image01Icon}
								onClick={() => {
									setMode("default");
									setSelected(CANVAS_PRESETS[0]);
								}}
							/>
							<ModeCard
								active={freeform}
								title="FreeForm"
								description="Infinite canvas with frames, Figma-style. Export each frame."
								icon={HashtagIcon}
								onClick={() => {
									setMode("freeform");
									setSelected(FRAME_PRESETS[0]);
								}}
							/>
						</div>
					</div>

					<button
						type="button"
						onClick={handleOpenPhoto}
						className="hover:bg-accent flex items-center gap-4 rounded-lg border border-dashed p-4 text-left transition-colors"
					>
						<div className="bg-secondary text-secondary-foreground border-secondary-border flex size-10 items-center justify-center rounded-md border">
							<HugeiconsIcon icon={ImageAdd02Icon} className="size-5" />
						</div>
						<div className="flex flex-col">
							<span className="text-sm font-medium">Edit a photo</span>
							<span className="text-muted-foreground text-xs">
								{freeform
										? "Start with an image from your device in a frame of the same size."
										: "Start with an image from your device. The canvas matches its size."}
							</span>
						</div>
					</button>

					<Tabs value={tab} onValueChange={setTab}>
						<TabsList>
							<TabsTrigger value="presets">{freeform ? "Frame size" : "Sizes"}</TabsTrigger>
							<TabsTrigger value="templates">Templates</TabsTrigger>
							<TabsTrigger value="custom">Custom</TabsTrigger>
						</TabsList>
						<TabsContent value="presets">
							{freeform && (
								<button
									type="button"
									onClick={() =>
										void open(() =>
											createNewProject({
												name: projectName,
												mode: "freeform",
												canvas: { width: 1080, height: 1080, background: solid("#ffffff") },
											}),
										)
									}
									className="hover:bg-accent mb-2 flex w-full items-center justify-between rounded-md border border-dashed p-2.5 text-left"
								>
									<span className="text-xs font-medium">Blank canvas</span>
									<span className="text-muted-foreground text-[0.7rem]">
										No frames yet. Draw your own with F
									</span>
								</button>
							)}
							<div className="scrollbar-thin grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
								{presets.map((preset) => (
									<PresetCard
										key={preset.id}
										preset={preset}
										isSelected={selected.id === preset.id}
										onSelect={() => setSelected(preset)}
										onDoubleClick={() => {
											setSelected(preset);
											void open(() =>
												createDesign({
													width: preset.width,
													height: preset.height,
													frameName: preset.label,
												}),
											);
										}}
									/>
								))}
							</div>
						</TabsContent>
						<TabsContent value="templates">
							<div className="scrollbar-thin grid max-h-72 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
								{TEMPLATES.map((template) => (
									<button
										key={template.id}
										type="button"
										className="group flex flex-col gap-1.5 text-left"
										onClick={() => {
											const { canvas, layers } = template.build();
											void open(() =>
												createDesign({
													name: name.trim() ? projectName : template.name,
													width: canvas.width,
													height: canvas.height,
													background: canvas.background,
													layers,
													frameName: template.name,
												}),
											);
										}}
									>
										<TemplatePreview
											template={template}
											className="group-hover:ring-primary rounded-md ring-2 ring-transparent transition"
										/>
										<span className="truncate text-xs font-medium">
											{template.name}
										</span>
									</button>
								))}
							</div>
						</TabsContent>
						<TabsContent value="custom">
							<div className="flex items-end gap-3">
								<div className="flex flex-1 flex-col gap-2">
									<Label htmlFor="custom-width">Width (px)</Label>
									<Input
										id="custom-width"
										inputMode="numeric"
										value={customWidth}
										onChange={(e) => setCustomWidth(e.target.value.replace(/\D/g, ""))}
									/>
								</div>
								<span className="text-muted-foreground pb-2">×</span>
								<div className="flex flex-1 flex-col gap-2">
									<Label htmlFor="custom-height">Height (px)</Label>
									<Input
										id="custom-height"
										inputMode="numeric"
										value={customHeight}
										onChange={(e) => setCustomHeight(e.target.value.replace(/\D/g, ""))}
									/>
								</div>
							</div>
							<p className="text-muted-foreground mt-2 text-xs">
								Up to {MAX_CANVAS_SIZE} × {MAX_CANVAS_SIZE} pixels.
							</p>
						</TabsContent>
					</Tabs>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					{tab !== "templates" && (
						<Button onClick={handleCreate} disabled={isCreating}>
							{freeform ? "Create FreeForm project" : "Create design"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function clampSize(value: number) {
	if (!Number.isFinite(value) || value <= 0) return 0;
	return Math.min(MAX_CANVAS_SIZE, Math.max(1, Math.round(value)));
}

function PresetCard({
	preset,
	isSelected,
	onSelect,
	onDoubleClick,
}: {
	preset: CanvasPreset;
	isSelected: boolean;
	onSelect: () => void;
	onDoubleClick: () => void;
}) {
	const ratio = preset.width / preset.height;
	const boxW = ratio >= 1 ? 32 : 32 * ratio;
	const boxH = ratio >= 1 ? 32 / ratio : 32;
	return (
		<button
			type="button"
			onClick={onSelect}
			onDoubleClick={onDoubleClick}
			className={cn(
				"flex items-center gap-3 rounded-md border p-2.5 text-left transition-colors",
				isSelected
					? "border-primary bg-primary/5"
					: "hover:bg-accent border-border",
			)}
		>
			<div className="flex size-9 shrink-0 items-center justify-center">
				<div
					className={cn(
						"rounded-[3px] border-2",
						isSelected ? "border-primary" : "border-muted-foreground/50",
					)}
					style={{ width: boxW, height: boxH }}
				/>
			</div>
			<div className="flex min-w-0 flex-col">
				<span className="truncate text-xs font-medium">{preset.label}</span>
				<span className="text-muted-foreground text-[0.7rem]">
					{preset.width} × {preset.height}
				</span>
			</div>
		</button>
	);
}

function ModeCard({
	active,
	title,
	description,
	icon,
	onClick,
}: {
	active: boolean;
	title: string;
	description: string;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
				active ? "border-primary bg-primary/5" : "hover:bg-accent",
			)}
		>
			<div
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-md border",
					active
						? "bg-secondary text-secondary-foreground border-secondary-border"
						: "text-muted-foreground",
				)}
			>
				<HugeiconsIcon icon={icon} className="size-4.5" />
			</div>
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">{title}</span>
				<span className="text-muted-foreground text-xs leading-snug">{description}</span>
			</div>
		</button>
	);
}
