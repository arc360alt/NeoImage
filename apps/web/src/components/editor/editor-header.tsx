"use client";

import { Button } from "../ui/button";
import { useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import Link from "next/link";
import { DeleteProjectDialog } from "@/project/components/delete-project-dialog";
import { useRouter } from "next/navigation";
import { FaDiscord } from "react-icons/fa6";
import { ExportButton } from "./export-button";
import { ThemeToggle } from "../theme-toggle";
import { DEFAULT_LOGO_URL } from "@/site/brand";
import { SOCIAL_LINKS } from "@/site/social";
import { toast } from "sonner";
import { getEditor, useEditorStore } from "@/editor/store";
import {
	CommandIcon,
	Logout05Icon,
	Delete02Icon,
	Undo02Icon,
	Redo02Icon,
	CloudSavingDone01Icon,
	Loading03Icon,
	AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "./shortcuts-dialog";
import Image from "next/image";
import { cn } from "@/utils/ui";
import { deleteProjects } from "@/storage/projects";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export function EditorHeader() {
	return (
		<header className="bg-background flex h-[3.4rem] items-center justify-between px-3 pt-0.5">
			<div className="flex items-center gap-1">
				<ProjectDropdown />
				<EditableProjectName />
				<SaveIndicator />
			</div>
			<nav className="flex items-center gap-2">
				<HistoryButtons />
				<ExportButton />
				<ThemeToggle />
			</nav>
		</header>
	);
}

function HistoryButtons() {
	const canUndo = useEditorStore((s) => s.past.length > 0 || s.pending !== null);
	const canRedo = useEditorStore((s) => s.future.length > 0);
	return (
		<div className="mr-1 flex items-center gap-0.5">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						disabled={!canUndo}
						onClick={() => getEditor().undo()}
						aria-label="Undo"
					>
						<HugeiconsIcon icon={Undo02Icon} />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Undo (Ctrl+Z)</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						disabled={!canRedo}
						onClick={() => getEditor().redo()}
						aria-label="Redo"
					>
						<HugeiconsIcon icon={Redo02Icon} />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
			</Tooltip>
		</div>
	);
}

function SaveIndicator() {
	const status = useEditorStore((s) => s.saveStatus);
	const icon =
		status === "saving"
			? Loading03Icon
			: status === "error"
				? AlertCircleIcon
				: CloudSavingDone01Icon;
	const label =
		status === "saving"
			? "Saving..."
			: status === "error"
				? "Couldn't save. Check your browser storage."
				: "All changes saved on this device";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"text-muted-foreground flex size-8 items-center justify-center",
						status === "error" && "text-destructive",
					)}
				>
					<HugeiconsIcon
						icon={icon}
						className={cn("size-4", status === "saving" && "animate-spin")}
					/>
				</span>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function ProjectDropdown() {
	const [openDialog, setOpenDialog] = useState<"delete" | "shortcuts" | null>(
		null,
	);
	const [isExiting, setIsExiting] = useState(false);
	const router = useRouter();
	const activeProject = useEditorStore((s) => s.doc);

	const handleExit = async () => {
		if (isExiting) return;
		setIsExiting(true);
		try {
			await getEditor().saveNow();
		} catch (error) {
			console.error("Failed to save before exit:", error);
		} finally {
			router.push("/projects");
		}
	};

	const handleDeleteProject = async () => {
		if (!activeProject) return;
		try {
			await deleteProjects({ ids: [activeProject.id] });
			getEditor().closeProject();
			router.push("/projects");
		} catch (error) {
			toast.error("Failed to delete project", {
				description: error instanceof Error ? error.message : "Please try again",
			});
		} finally {
			setOpenDialog(null);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="size-8 rounded-sm p-1">
						<Image
							src={DEFAULT_LOGO_URL}
							alt="OpenImage logo"
							width={32}
							height={32}
							className="size-5 invert dark:invert-0"
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="z-100 w-44">
					<DropdownMenuItem
						onClick={handleExit}
						disabled={isExiting}
						icon={<HugeiconsIcon icon={Logout05Icon} />}
					>
						Exit project
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => setOpenDialog("shortcuts")}
						icon={<HugeiconsIcon icon={CommandIcon} />}
					>
						Shortcuts
					</DropdownMenuItem>

					<DropdownMenuItem
						variant="destructive"
						onClick={() => setOpenDialog("delete")}
						icon={<HugeiconsIcon icon={Delete02Icon} />}
					>
						Delete project
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem asChild icon={<FaDiscord className="size-4!" />}>
						<Link
							href={SOCIAL_LINKS.discord}
							target="_blank"
							rel="noopener noreferrer"
						>
							Discord
						</Link>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteProjectDialog
				isOpen={openDialog === "delete"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "delete" : null)}
				onConfirm={handleDeleteProject}
				projectNames={[activeProject?.name || ""]}
			/>
			<ShortcutsDialog
				isOpen={openDialog === "shortcuts"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
			/>
		</>
	);
}

function EditableProjectName() {
	const projectName = useEditorStore((s) => s.doc?.name ?? "");
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalNameRef = useRef("");

	const startEditing = () => {
		if (isEditing) return;
		originalNameRef.current = projectName;
		setIsEditing(true);
		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	};

	const saveEdit = () => {
		if (!inputRef.current) return;
		const newName = inputRef.current.value.trim();
		setIsEditing(false);
		if (!newName) {
			inputRef.current.value = originalNameRef.current;
			return;
		}
		if (newName !== originalNameRef.current) {
			getEditor().renameProject(newName);
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.value = originalNameRef.current;
				inputRef.current.setSelectionRange(0, 0);
			}
			setIsEditing(false);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			key={projectName}
			ref={inputRef}
			type="text"
			defaultValue={projectName}
			readOnly={!isEditing}
			onClick={startEditing}
			onBlur={saveEdit}
			onKeyDown={handleKeyDown}
			style={{ fieldSizing: "content" } as React.CSSProperties}
			className={cn(
				"hover:bg-accent hover:text-accent-foreground h-8 cursor-pointer rounded-sm bg-transparent px-2 py-1 text-[0.9rem] outline-none",
				isEditing && "ring-ring cursor-text ring-1 hover:bg-transparent",
			)}
		/>
	);
}
