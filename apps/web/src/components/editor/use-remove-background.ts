"use client";

import { useState } from "react";
import { toast } from "sonner";
import { removeBackground } from "@/editor/background-removal";
import type { Layer } from "@/editor/types";

export function useRemoveBackground() {
	const [isRunning, setIsRunning] = useState(false);

	const run = async (layer: Layer) => {
		if (layer.type !== "image" || isRunning) return;
		setIsRunning(true);
		const toastId = toast.loading("Removing background...", {
			description: "The first run downloads a ~170 MB model. It runs entirely on your device.",
		});
		try {
			await removeBackground(layer, (progress) => {
				toast.loading("Downloading model...", {
					id: toastId,
					description: `${Math.round(progress)}%`,
				});
			});
			toast.success("Background removed", { id: toastId, description: undefined });
		} catch (error) {
			console.error(error);
			toast.error("Background removal failed", {
				id: toastId,
				description: error instanceof Error ? error.message : "Please try again",
			});
		} finally {
			setIsRunning(false);
		}
	};

	return { run, isRunning };
}
