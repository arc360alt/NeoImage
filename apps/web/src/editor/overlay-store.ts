import { create } from "zustand";

/**
 * Tracks open overlays (dialogs, menus, popovers) so editor keyboard
 * shortcuts can be suspended while one of them has focus.
 */
interface OverlayStore {
	openOverlayIds: string[];
	overlayDepth: number;
	openOverlay: (overlayId: string) => void;
	closeOverlay: (overlayId: string) => void;
}

export const useOverlayStore = create<OverlayStore>()((set) => ({
	openOverlayIds: [],
	overlayDepth: 0,
	openOverlay: (overlayId) =>
		set((s) => {
			const openOverlayIds = s.openOverlayIds.includes(overlayId)
				? s.openOverlayIds
				: [...s.openOverlayIds, overlayId];
			return { openOverlayIds, overlayDepth: openOverlayIds.length };
		}),
	closeOverlay: (overlayId) =>
		set((s) => {
			const openOverlayIds = s.openOverlayIds.filter((id) => id !== overlayId);
			return { openOverlayIds, overlayDepth: openOverlayIds.length };
		}),
}));
