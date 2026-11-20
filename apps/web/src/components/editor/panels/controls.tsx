"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { NumberField } from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { ColorPicker } from "@/components/ui/color-picker";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/ui";
import {
	GRADIENT_SWATCHES,
	SOLID_SWATCHES,
	fillToCss,
	primaryColor,
} from "@/editor/fill";
import { getEditor } from "@/editor/store";
import type { Fill } from "@/editor/types";

type ChangeOptions = { transient?: boolean };

export function NumField({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
	suffix,
	precision = 0,
	className,
}: {
	label: React.ReactNode;
	value: number;
	onChange: (value: number, options?: ChangeOptions) => void;
	min?: number;
	max?: number;
	step?: number;
	suffix?: string;
	precision?: number;
	className?: string;
}) {
	const format = (v: number) =>
		Number.isFinite(v) ? String(Number(v.toFixed(precision))) : "0";
	const [draft, setDraft] = useState(format(value));
	const [isFocused, setIsFocused] = useState(false);

	useEffect(() => {
		if (!isFocused) setDraft(format(value));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, isFocused]);

	const clamp = (v: number) => {
		let next = v;
		if (min !== undefined) next = Math.max(min, next);
		if (max !== undefined) next = Math.min(max, next);
		return next;
	};

	const commitDraft = () => {
		const parsed = evaluate(draft);
		if (parsed === null) {
			setDraft(format(value));
			return;
		}
		const next = clamp(parsed);
		if (next !== value) onChange(next);
		setDraft(format(next));
	};

	return (
		<NumberField
			className={className}
			icon={<span className="text-[0.7rem] font-medium">{label}</span>}
			value={draft}
			suffix={suffix}
			scrubClamp={{ min, max }}
			onScrub={(v) => onChange(clamp(Math.round(v / step) * step), { transient: true })}
			onScrubEnd={() => getEditor().commit()}
			onChange={(e) => setDraft(e.target.value)}
			onFocus={() => setIsFocused(true)}
			onBlur={() => {
				setIsFocused(false);
				commitDraft();
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					commitDraft();
					(e.target as HTMLInputElement).blur();
				}
				if (e.key === "ArrowUp" || e.key === "ArrowDown") {
					e.preventDefault();
					const delta = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
					onChange(clamp(value + delta));
				}
			}}
		/>
	);
}

/** Evaluates simple arithmetic like "100*2" or "50+10" safely. */
function evaluate(input: string): number | null {
	const trimmed = input.trim();
	if (!/^[\d\s.+\-*/()]+$/.test(trimmed)) {
		const n = Number.parseFloat(trimmed);
		return Number.isFinite(n) ? n : null;
	}
	try {
		// biome-ignore lint/security/noGlobalEval: input is restricted to arithmetic characters
		const result = Function(`"use strict"; return (${trimmed});`)();
		return typeof result === "number" && Number.isFinite(result) ? result : null;
	} catch {
		return null;
	}
}

export function SliderField({
	label,
	value,
	min,
	max,
	step = 1,
	onChange,
	format = (v) => String(Math.round(v)),
	defaultValue,
	className,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number, options?: ChangeOptions) => void;
	format?: (value: number) => string;
	defaultValue?: number;
	className?: string;
}) {
	const isDefault = defaultValue !== undefined && value === defaultValue;
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex h-4 items-center justify-between">
				<Label className={cn(!isDefault && defaultValue !== undefined && "text-foreground")}>
					{label}
				</Label>
				<button
					type="button"
					className={cn(
						"text-muted-foreground text-xs tabular-nums",
						defaultValue !== undefined && !isDefault && "hover:text-foreground cursor-pointer",
					)}
					title={defaultValue !== undefined && !isDefault ? "Reset" : undefined}
					onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
					onClick={() => defaultValue !== undefined && !isDefault && onChange(defaultValue)}
				>
					{format(value)}
				</button>
			</div>
			<Slider
				min={min}
				max={max}
				step={step}
				value={[value]}
				onValueChange={([v]) => onChange(v, { transient: true })}
				onValueCommit={() => getEditor().commit()}
				aria-label={label}
			/>
		</div>
	);
}

/** Hex helpers: our document stores "#rrggbb[aa]"; ColorPicker uses bare hex. */
const toBare = (color: string) => color.replace("#", "");
const toHash = (bare: string) => `#${bare.replace("#", "")}`;

export function ColorField({
	value,
	onChange,
	className,
}: {
	value: string;
	onChange: (value: string, options?: ChangeOptions) => void;
	className?: string;
}) {
	return (
		<ColorPicker
			className={className}
			value={toBare(value)}
			onChange={(v) => onChange(toHash(v), { transient: true })}
			onChangeEnd={(v) => {
				onChange(toHash(v), { transient: true });
				getEditor().commit();
			}}
		/>
	);
}

export function Field({
	label,
	children,
	className,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex h-4 items-center">
				<Label>{label}</Label>
			</div>
			{children}
		</div>
	);
}

/** Solid / gradient / transparent fill editor. */
export function FillField({
	value,
	onChange,
	allowTransparent = false,
}: {
	value: Fill;
	onChange: (fill: Fill, options?: ChangeOptions) => void;
	allowTransparent?: boolean;
}) {
	const isGradient = value.type === "linear" || value.type === "radial";

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="hover:ring-foreground/20 relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md border hover:ring-1"
							aria-label="Choose fill"
						>
							<span className="absolute inset-0 bg-[conic-gradient(#ddd_25%,#fff_0_50%,#ddd_0_75%,#fff_0)] bg-[length:8px_8px]" />
							<span className="absolute inset-0" style={{ background: fillToCss(value) }} />
						</button>
					</PopoverTrigger>
					<PopoverContent side="left" className="w-64 p-3">
						<FillSwatches value={value} onChange={onChange} allowTransparent={allowTransparent} />
					</PopoverContent>
				</Popover>
				{value.type === "solid" && (
					<ColorField
						value={value.color}
						onChange={(color, o) => onChange({ type: "solid", color }, o)}
					/>
				)}
				{value.type === "transparent" && (
					<span className="text-muted-foreground text-xs">Transparent</span>
				)}
				{isGradient && (
					<span className="text-muted-foreground text-xs">
						{value.type === "linear" ? "Linear gradient" : "Radial gradient"}
					</span>
				)}
			</div>
			{isGradient && <GradientEditor value={value} onChange={onChange} />}
		</div>
	);
}

function GradientEditor({
	value,
	onChange,
}: {
	value: Extract<Fill, { type: "linear" | "radial" }>;
	onChange: (fill: Fill, options?: ChangeOptions) => void;
}) {
	const [first, last] = [value.stops[0], value.stops[value.stops.length - 1]];
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<ColorField
					value={first?.color ?? "#000000"}
					onChange={(color, o) =>
						onChange(
							{ ...value, stops: value.stops.map((s, i) => (i === 0 ? { ...s, color } : s)) },
							o,
						)
					}
				/>
				<ColorField
					value={last?.color ?? "#ffffff"}
					onChange={(color, o) =>
						onChange(
							{
								...value,
								stops: value.stops.map((s, i) =>
									i === value.stops.length - 1 ? { ...s, color } : s,
								),
							},
							o,
						)
					}
				/>
			</div>
			<div className="flex gap-1">
				{(["linear", "radial"] as const).map((type) => (
					<button
						key={type}
						type="button"
						onClick={() =>
							onChange(
								type === "linear"
									? { type, angle: value.type === "linear" ? value.angle : 135, stops: value.stops }
									: { type, stops: value.stops },
							)
						}
						className={cn(
							"flex-1 rounded-md border px-2 py-1 text-xs capitalize",
							value.type === type ? "bg-secondary border-secondary-border text-secondary-foreground" : "hover:bg-accent",
						)}
					>
						{type}
					</button>
				))}
			</div>
			{value.type === "linear" && (
				<SliderField
					label="Angle"
					value={value.angle}
					min={0}
					max={360}
					format={(v) => `${Math.round(v)}°`}
					onChange={(angle, o) => onChange({ ...value, angle }, o)}
				/>
			)}
		</div>
	);
}

export function FillSwatches({
	value,
	onChange,
	allowTransparent,
}: {
	value?: Fill;
	onChange: (fill: Fill) => void;
	allowTransparent?: boolean;
}) {
	const current = value ? fillToCss(value) : null;
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-2">
				<span className="text-muted-foreground text-xs font-medium">Solid colors</span>
				<div className="grid grid-cols-8 gap-1.5">
					{allowTransparent && (
						<button
							type="button"
							aria-label="Transparent"
							onClick={() => onChange({ type: "transparent" })}
							className={cn(
								"relative aspect-square overflow-hidden rounded-md border",
								value?.type === "transparent" && "ring-primary ring-2 ring-offset-1",
							)}
						>
							<span className="absolute inset-0 bg-[conic-gradient(#ddd_25%,#fff_0_50%,#ddd_0_75%,#fff_0)] bg-[length:8px_8px]" />
							<HugeiconsIcon icon={Cancel01Icon} className="absolute inset-0 m-auto size-3 text-red-500" />
						</button>
					)}
					{SOLID_SWATCHES.map((color) => (
						<button
							key={color}
							type="button"
							aria-label={color}
							onClick={() => onChange({ type: "solid", color })}
							className={cn(
								"aspect-square rounded-md border",
								current === color && "ring-primary ring-2 ring-offset-1",
							)}
							style={{ background: color }}
						/>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<span className="text-muted-foreground text-xs font-medium">Gradients</span>
				<div className="grid grid-cols-5 gap-1.5">
					{GRADIENT_SWATCHES.map((fill) => {
						const css = fillToCss(fill);
						return (
							<button
								key={css}
								type="button"
								aria-label="Gradient"
								onClick={() => onChange(fill)}
								className={cn(
									"aspect-square rounded-md border",
									current === css && "ring-primary ring-2 ring-offset-1",
								)}
								style={{ background: css }}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}

export { primaryColor };
