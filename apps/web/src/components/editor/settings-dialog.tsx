"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Cancel01Icon,
	ComputerSettingsIcon,
	GridViewIcon,
	KeyboardIcon,
	PlusSignIcon,
	ArrowTurnBackwardIcon,
	PencilEdit02Icon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/ui";
import { FONTS } from "@/editor/fonts";
import {
	ACTION_GROUPS,
	ACTIONS,
	bindingsFor,
	comboFromEvent,
	comboParts,
	conflictsFor,
	getAction,
	type ActionDef,
	type ActionId,
} from "@/editor/keybindings";
import { DEFAULT_SETTINGS, useSettingsStore, type EditorSettings } from "@/editor/settings-store";
import { ColorField, NumField } from "./panels/controls";
import { useEditorDialogs, type SettingsTab } from "./editor-dialogs-store";

const TABS: {
	id: SettingsTab;
	label: string;
	icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
}[] = [
	{ id: "general", label: "General", icon: ComputerSettingsIcon },
	{ id: "canvas", label: "Canvas & snapping", icon: GridViewIcon },
	{ id: "tools", label: "Tool defaults", icon: PencilEdit02Icon },
	{ id: "keyboard", label: "Keyboard shortcuts", icon: KeyboardIcon },
];

export function SettingsDialog() {
	const open = useEditorDialogs((s) => s.settingsOpen);
	const setOpen = useEditorDialogs((s) => s.setSettingsOpen);
	const tab = useEditorDialogs((s) => s.settingsTab);
	const setTab = useEditorDialogs((s) => s.setSettingsTab);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="h-[min(640px,85vh)] overflow-hidden p-0 sm:max-w-3xl">
				<div className="flex h-full min-h-0 flex-col sm:flex-row">
					<nav className="bg-muted/30 flex shrink-0 gap-0.5 overflow-x-auto border-b p-2 sm:w-52 sm:flex-col sm:border-r sm:border-b-0">
						<DialogTitle className="text-muted-foreground hidden px-2 pt-2 pb-3 text-xs font-semibold tracking-wider uppercase sm:block">
							Settings
						</DialogTitle>
						{TABS.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => setTab(t.id)}
								className={cn(
									"flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
									tab === t.id
										? "bg-secondary text-secondary-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-foreground",
								)}
							>
								<HugeiconsIcon icon={t.icon} className="size-4" />
								{t.label}
							</button>
						))}
					</nav>
					<div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
						{tab === "general" && <GeneralSettings />}
						{tab === "canvas" && <CanvasSettings />}
						{tab === "tools" && <ToolSettings />}
						{tab === "keyboard" && <KeyboardSettings />}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/* --------------------------------- Layout -------------------------------- */

function Heading({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-muted-foreground mt-6 mb-1 text-xs font-semibold tracking-wider uppercase first:mt-0">
			{children}
		</h3>
	);
}

function Row({
	label,
	description,
	children,
	htmlFor,
}: {
	label: string;
	description?: string;
	children: React.ReactNode;
	htmlFor?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-6 border-b py-3 last:border-b-0">
			<label htmlFor={htmlFor} className="min-w-0">
				<div className="text-sm">{label}</div>
				{description && (
					<p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>
				)}
			</label>
			<div className="flex shrink-0 items-center gap-2">{children}</div>
		</div>
	);
}

type BoolKey = {
	[K in keyof EditorSettings]: EditorSettings[K] extends boolean ? K : never;
}[keyof EditorSettings];
type NumKey = {
	[K in keyof EditorSettings]: EditorSettings[K] extends number ? K : never;
}[keyof EditorSettings];
type StrKey = {
	[K in keyof EditorSettings]: EditorSettings[K] extends string ? K : never;
}[keyof EditorSettings];

function Toggle({ id, label, description }: { id: BoolKey; label: string; description?: string }) {
	const value = useSettingsStore((s) => s[id]);
	const set = useSettingsStore((s) => s.set);
	return (
		<Row label={label} description={description} htmlFor={`setting-${id}`}>
			<Switch id={`setting-${id}`} checked={value} onCheckedChange={(v) => set({ [id]: v })} />
		</Row>
	);
}

function Num({
	id,
	label,
	description,
	min,
	max,
	suffix = "px",
}: {
	id: NumKey;
	label: string;
	description?: string;
	min?: number;
	max?: number;
	suffix?: string;
}) {
	const value = useSettingsStore((s) => s[id]);
	const set = useSettingsStore((s) => s.set);
	return (
		<Row label={label} description={description}>
			<NumField
				className="w-28"
				label=""
				value={value}
				min={min}
				max={max}
				suffix={suffix}
				onChange={(v) => set({ [id]: v })}
			/>
		</Row>
	);
}

function Color({ id, label }: { id: StrKey; label: string }) {
	const value = useSettingsStore((s) => s[id]);
	const set = useSettingsStore((s) => s.set);
	return (
		<Row label={label}>
			<ColorField className="w-40" value={value} onChange={(v) => set({ [id]: v })} />
		</Row>
	);
}

/* --------------------------------- Tabs ---------------------------------- */

function GeneralSettings() {
	const s = useSettingsStore();
	return (
		<>
			<Heading>Navigation</Heading>
			<Row
				label="Mouse wheel"
				description="Figma-style: the wheel pans and Ctrl/⌘ + wheel zooms. Pinch-to-zoom always works."
			>
				<Select
					value={s.wheelBehavior}
					onValueChange={(v) => s.set({ wheelBehavior: v as EditorSettings["wheelBehavior"] })}
				>
					<SelectTrigger className="w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="pan">Scroll to pan</SelectItem>
						<SelectItem value="zoom">Scroll to zoom</SelectItem>
					</SelectContent>
				</Select>
			</Row>
			<Row label="Zoom speed" description="How fast the wheel and trackpad zoom.">
				<Slider
					className="w-36"
					min={0.25}
					max={3}
					step={0.25}
					value={[s.zoomSpeed]}
					onValueChange={([v]) => s.set({ zoomSpeed: v })}
					aria-label="Zoom speed"
				/>
				<span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
					{s.zoomSpeed}×
				</span>
			</Row>

			<Heading>Tools</Heading>
			<Toggle
				id="keepToolActive"
				label="Keep tools selected after drawing"
				description="When off, NeoImage returns to the Move tool after you draw a frame or shape, like Figma."
			/>

			<Heading>Reset</Heading>
			<Row label="Restore default settings" description="Resets every setting and shortcut on this device.">
				<Button
					variant="destructive-foreground"
					size="sm"
					onClick={() => {
						s.resetAll();
						toast.success("Settings restored to defaults");
					}}
				>
					Reset everything
				</Button>
			</Row>
		</>
	);
}

function CanvasSettings() {
	const rotationSnap = useSettingsStore((s) => s.rotationSnap);
	const set = useSettingsStore((s) => s.set);
	return (
		<>
			<Heading>View</Heading>
			<Toggle id="showDotGrid" label="Dot grid" description="Background dots on the FreeForm canvas." />
			<Toggle
				id="showPixelGrid"
				label="Pixel grid"
				description="Shows a line around every pixel when zoomed in to 800% or more."
			/>
			<Toggle
				id="showLayoutGrids"
				label="Layout grids"
				description="Show the column, row and grid overlays set on frames."
			/>
			<Toggle id="showFrameNames" label="Frame names" description="Labels above each frame." />

			<Heading>Snapping</Heading>
			<Toggle
				id="snapToObjects"
				label="Snap to objects"
				description="Align edges and centers to other layers while dragging. Hold Alt to skip it."
			/>
			<Num id="snapThreshold" label="Snap distance" description="Measured on screen." min={1} max={30} />
			<Toggle
				id="snapToPixels"
				label="Snap to pixel grid"
				description="Round positions and sizes to whole pixels after moving, resizing and drawing."
			/>
			<Row label="Rotation snapping" description="Hold Shift while rotating to always snap.">
				<Select value={String(rotationSnap)} onValueChange={(v) => set({ rotationSnap: Number(v) })}>
					<SelectTrigger className="w-28">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="0">Shift only</SelectItem>
						{[5, 15, 45, 90].map((deg) => (
							<SelectItem key={deg} value={String(deg)}>
								{deg}°
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>

			<Heading>Nudge</Heading>
			<Num id="nudge" label="Small nudge" description="Arrow keys." min={0.1} max={1000} />
			<Num id="bigNudge" label="Big nudge" description="Shift + arrow keys." min={0.1} max={1000} />
		</>
	);
}

function ToolSettings() {
	const s = useSettingsStore();
	return (
		<>
			<p className="text-muted-foreground mb-2 text-xs leading-relaxed">
				Defaults for new layers drawn with the FreeForm tools. Existing layers are not changed.
			</p>
			<Heading>Frame (F)</Heading>
			<Row label="Size when clicking" description="Dragging draws any size.">
				<NumField
					className="w-24"
					label="W"
					value={s.frameWidth}
					min={1}
					onChange={(v) => s.set({ frameWidth: v })}
				/>
				<NumField
					className="w-24"
					label="H"
					value={s.frameHeight}
					min={1}
					onChange={(v) => s.set({ frameHeight: v })}
				/>
			</Row>
			<Color id="frameFill" label="Fill" />
			<Toggle id="frameClip" label="Clip content" description="Hide anything that sticks out of the frame." />

			<Heading>Rectangle & ellipse (R, O)</Heading>
			<Color id="shapeFill" label="Fill" />

			<Heading>Line (L)</Heading>
			<Color id="lineColor" label="Color" />
			<Num id="lineWidth" label="Width" min={0.5} max={200} />

			<Heading>Text (T)</Heading>
			<Row label="Font">
				<Select value={s.textFont} onValueChange={(v) => s.set({ textFont: v })}>
					<SelectTrigger className="w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="max-h-72">
						{FONTS.map((f) => (
							<SelectItem key={f.family} value={f.family}>
								{f.family}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
			<Num id="textSize" label="Size" min={1} max={1000} />
			<Color id="textColor" label="Color" />

			<div className="mt-4 flex justify-end">
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						s.set({
							frameWidth: DEFAULT_SETTINGS.frameWidth,
							frameHeight: DEFAULT_SETTINGS.frameHeight,
							frameFill: DEFAULT_SETTINGS.frameFill,
							frameClip: DEFAULT_SETTINGS.frameClip,
							shapeFill: DEFAULT_SETTINGS.shapeFill,
							lineColor: DEFAULT_SETTINGS.lineColor,
							lineWidth: DEFAULT_SETTINGS.lineWidth,
							textFont: DEFAULT_SETTINGS.textFont,
							textSize: DEFAULT_SETTINGS.textSize,
							textColor: DEFAULT_SETTINGS.textColor,
						})
					}
				>
					Reset tool defaults
				</Button>
			</div>
		</>
	);
}

/* -------------------------------- Keyboard ------------------------------- */

type Recording = { actionId: ActionId; index: number | null };

function KeyboardSettings() {
	const overrides = useSettingsStore((s) => s.keybindings);
	const setKeybinding = useSettingsStore((s) => s.setKeybinding);
	const resetKeybinding = useSettingsStore((s) => s.resetKeybinding);
	const resetKeybindings = useSettingsStore((s) => s.resetKeybindings);
	const [query, setQuery] = useState("");
	const [recording, setRecording] = useState<Recording | null>(null);

	// Capture the next key combo. Window capture runs before the dialog's own
	// Escape handling and the editor's shortcuts.
	useEffect(() => {
		if (!recording) return;
		const handler = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopImmediatePropagation();
			if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
				setRecording(null);
				return;
			}
			const combo = comboFromEvent(event);
			if (!combo) return; // modifier only: keep waiting
			assign(recording, combo);
			setRecording(null);
		};
		window.addEventListener("keydown", handler, { capture: true });
		return () => window.removeEventListener("keydown", handler, { capture: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [recording]);

	const assign = ({ actionId, index }: Recording, combo: string) => {
		const state = useSettingsStore.getState();
		const current = state.keybindings;
		const conflicts = conflictsFor(combo, current, actionId);
		const fixed = conflicts.find((a) => a.fixed);
		if (fixed) {
			toast.error(`${comboParts(combo).join(" ")} is reserved for “${fixed.label}”`);
			return;
		}
		for (const other of conflicts) {
			setBindings(other, bindingsFor(other.id, current).filter((c) => c !== combo));
		}
		if (conflicts.length > 0) {
			toast(`Removed ${comboParts(combo).join(" ")} from “${conflicts.map((c) => c.label).join("”, “")}”`);
		}
		const existing = bindingsFor(actionId, useSettingsStore.getState().keybindings).filter(
			(c, i) => c !== combo || i === index,
		);
		const next =
			index === null ? [...existing, combo] : existing.map((c, i) => (i === index ? combo : c));
		const action = getAction(actionId);
		if (action) setBindings(action, Array.from(new Set(next)));
	};

	const setBindings = (action: ActionDef, combos: string[]) => {
		if (sameList(combos, action.defaults)) resetKeybinding(action.id);
		else setKeybinding(action.id, combos);
	};

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return ACTIONS;
		return ACTIONS.filter(
			(a) =>
				a.label.toLowerCase().includes(q) ||
				a.group.toLowerCase().includes(q) ||
				bindingsFor(a.id, overrides).some((c) => comboParts(c).join(" ").toLowerCase().includes(q)),
		);
	}, [query, overrides]);

	const modifiedCount = Object.keys(overrides).length;

	return (
		<>
			<div className="bg-popover sticky -top-5 z-10 -mx-6 -mt-5 flex items-center gap-2 border-b px-6 py-3">
				<div className="relative flex-1">
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
					/>
					<Input
						size="sm"
						className="pl-8"
						placeholder="Search shortcuts"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={modifiedCount === 0}
					onClick={() => {
						resetKeybindings();
						toast.success("Shortcuts restored to defaults");
					}}
				>
					Reset all
				</Button>
			</div>
			<p className="text-muted-foreground mt-3 text-xs leading-relaxed">
				Click a shortcut to change it, or + to add another. Press Esc to cancel.{" "}
				Arrow keys nudge the selection and Space pans; those can't be changed.
			</p>
			{ACTION_GROUPS.map((group) => {
				const actions = filtered.filter((a) => a.group === group);
				if (actions.length === 0) return null;
				return (
					<div key={group}>
						<Heading>{group}</Heading>
						{actions.map((action) => (
							<ShortcutRow
								key={action.id}
								action={action}
								combos={bindingsFor(action.id, overrides)}
								modified={action.id in overrides}
								recording={recording?.actionId === action.id ? recording : null}
								onRecord={(index) => setRecording({ actionId: action.id, index })}
								onRemove={(index) =>
									setBindings(
										action,
										bindingsFor(action.id, overrides).filter((_, i) => i !== index),
									)
								}
								onReset={() => resetKeybinding(action.id)}
							/>
						))}
					</div>
				);
			})}
			{filtered.length === 0 && (
				<p className="text-muted-foreground py-8 text-center text-sm">No shortcuts match “{query}”.</p>
			)}
		</>
	);
}

function ShortcutRow({
	action,
	combos,
	modified,
	recording,
	onRecord,
	onRemove,
	onReset,
}: {
	action: ActionDef;
	combos: string[];
	modified: boolean;
	recording: Recording | null;
	onRecord: (index: number | null) => void;
	onRemove: (index: number) => void;
	onReset: () => void;
}) {
	return (
		<div className="group flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<span className="truncate">{action.label}</span>
				{action.freeformOnly && (
					<span className="text-muted-foreground rounded border px-1 text-[0.65rem]">FreeForm</span>
				)}
				{modified && <span className="bg-primary size-1.5 shrink-0 rounded-full" title="Customized" />}
			</div>
			<div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
				{combos.map((combo, index) =>
					recording?.index === index ? (
						<RecordingChip key={combo} />
					) : (
						<span key={combo} className="relative inline-flex">
							<button
								type="button"
								disabled={action.fixed}
								onClick={() => onRecord(index)}
								className={cn(
									"flex items-center gap-0.5 rounded-md border px-1 py-0.5",
									action.fixed ? "cursor-default opacity-70" : "hover:border-primary/60",
								)}
								title={action.fixed ? "This shortcut can't be changed" : "Click to change"}
							>
								<Keys combo={combo} />
							</button>
							{!action.fixed && (
								<button
									type="button"
									onClick={() => onRemove(index)}
									aria-label="Remove shortcut"
									className="bg-background text-muted-foreground hover:text-foreground absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full border group-hover:flex"
								>
									<HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
								</button>
							)}
						</span>
					),
				)}
				{recording?.index === null && <RecordingChip />}
				{!action.fixed && combos.length === 0 && recording === null && (
					<span className="text-muted-foreground text-xs">None</span>
				)}
				{!action.fixed && (
					<Button
						variant="ghost"
						size="icon"
						className="text-muted-foreground size-6"
						onClick={() => onRecord(null)}
						aria-label={`Add shortcut for ${action.label}`}
					>
						<HugeiconsIcon icon={PlusSignIcon} />
					</Button>
				)}
				{modified && (
					<Button
						variant="ghost"
						size="icon"
						className="text-muted-foreground size-6"
						onClick={onReset}
						aria-label={`Reset ${action.label}`}
						title="Reset to default"
					>
						<HugeiconsIcon icon={ArrowTurnBackwardIcon} />
					</Button>
				)}
			</div>
		</div>
	);
}

function RecordingChip() {
	return (
		<span className="border-primary text-primary animate-pulse rounded-md border px-2 py-0.5 text-xs">
			Press keys…
		</span>
	);
}

export function Keys({ combo, className }: { combo: string; className?: string }) {
	return (
		<span className={cn("flex items-center gap-0.5", className)}>
			{comboParts(combo).map((part, i) => (
				<kbd
					// biome-ignore lint/suspicious/noArrayIndexKey: parts can repeat
					key={i}
					className="bg-accent text-accent-foreground min-w-5 rounded px-1 py-px text-center font-mono text-[0.7rem]"
				>
					{part}
				</kbd>
			))}
		</span>
	);
}

function sameList(a: string[], b: string[]) {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}
