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
import { ACTION_GROUPS, ACTIONS, bindingsFor } from "@/editor/keybindings";
import { useSettingsStore } from "@/editor/settings-store";
import { useEditorDialogs } from "./editor-dialogs-store";
import { Keys } from "./settings-dialog";

/** Read-only cheat sheet of the current bindings; editing lives in Settings. */
export function ShortcutsDialog() {
	const isOpen = useEditorDialogs((s) => s.shortcutsOpen);
	const setOpen = useEditorDialogs((s) => s.setShortcutsOpen);
	const openSettings = useEditorDialogs((s) => s.openSettings);
	const overrides = useSettingsStore((s) => s.keybindings);

	return (
		<Dialog open={isOpen} onOpenChange={setOpen}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
				</DialogHeader>
				<DialogBody className="scrollbar-thin max-h-[60vh] gap-6 overflow-y-auto sm:grid sm:grid-cols-2 sm:gap-x-8">
					{ACTION_GROUPS.map((group) => (
						<div key={group} className="flex flex-col gap-2">
							<h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
								{group}
							</h3>
							<div className="flex flex-col">
								{ACTIONS.filter((a) => a.group === group).map((action) => {
									const combos = bindingsFor(action.id, overrides);
									return (
										<div
											key={action.id}
											className="flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0"
										>
											<span className="text-sm">{action.label}</span>
											<div className="flex shrink-0 items-center gap-1.5">
												{combos.length === 0 ? (
													<span className="text-muted-foreground text-xs">None</span>
												) : (
													<Keys combo={combos[0]} />
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					))}
					<div className="flex flex-col gap-2">
						<h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
							Mouse
						</h3>
						{[
							["Hold Space + drag", "Pan"],
							["Shift while drawing", "Square / circle"],
							["Alt while drawing", "Draw from center"],
							["Shift while rotating", "Snap rotation"],
							["Alt while dragging", "Skip snapping"],
							["Arrows / Shift+Arrows", "Nudge selection"],
						].map(([keys, label]) => (
							<div key={label} className="flex items-center justify-between border-b py-1.5 text-sm last:border-b-0">
								<span>{label}</span>
								<span className="text-muted-foreground text-xs">{keys}</span>
							</div>
						))}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => openSettings("keyboard")}>
						Customize shortcuts
					</Button>
					<Button onClick={() => setOpen(false)}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
