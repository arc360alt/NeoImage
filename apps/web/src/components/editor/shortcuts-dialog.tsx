"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "@/editor/shortcuts";

export function ShortcutsDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));
	const isMac =
		typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
				</DialogHeader>
				<DialogBody className="scrollbar-thin max-h-[60vh] gap-6 overflow-y-auto">
					{groups.map((group) => (
						<div key={group} className="flex flex-col gap-2">
							<h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
								{group}
							</h3>
							<div className="flex flex-col">
								{SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
									<div
										key={shortcut.label}
										className="flex items-center justify-between border-b py-2 last:border-b-0"
									>
										<span className="text-sm">{shortcut.label}</span>
										<div className="flex items-center gap-1">
											{shortcut.keys.map((key) => (
												<kbd
													key={key}
													className="bg-accent text-accent-foreground min-w-6 rounded border px-1.5 py-0.5 text-center font-mono text-xs"
												>
													{key === "Ctrl" && isMac ? "⌘" : key}
												</kbd>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</DialogBody>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
