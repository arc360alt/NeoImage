"use client";

import { useState } from "react";
import { PanelView } from "./base-panel";
import { Input } from "@/components/ui/input";
import { createTextLayer, solid } from "@/editor/defaults";
import { getEditor } from "@/editor/store";
import { centerIn, getInsertionArea } from "@/editor/insertion";

const CATEGORIES: { label: string; emojis: string }[] = [
	{ label: "Smileys", emojis: "😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😛😜🤪😎🤩🥳😏😒😔😢😭😤😡🤯😳🥺😱🤔🤫🤭🙄😴🤤🤠😈👻💀🤖👽" },
	{ label: "Hearts & symbols", emojis: "❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝✨⭐🌟💫⚡🔥💥💯✅❌❗❓💬💭🎵🎶➡️⬅️⬆️⬇️🔴🟠🟡🟢🔵🟣" },
	{ label: "Gestures", emojis: "👍👎👏🙌👐🤝🙏✌️🤞🤟🤘👌🤌👈👉👆👇☝️✋🤚🖐️🖖👋🤙💪✍️💅👀" },
	{ label: "Nature", emojis: "🌸🌺🌻🌹🌷🌼🍀🌿🌱🌴🌵🍁🍂🌈☀️🌤️⛅🌧️❄️☃️🌊🌙⭐🌍🐶🐱🐭🐰🦊🐻🐼🐨🐯🦁🐸🐵🦄🐝🦋🐢🐬🐳" },
	{ label: "Food", emojis: "🍎🍓🍒🍑🍍🥭🍉🍋🍌🥑🍕🍔🍟🌭🌮🍣🍩🍪🎂🍰🧁🍫🍿🍦☕🍵🧋🍹🍾🥂" },
	{ label: "Objects & fun", emojis: "🎉🎊🎈🎁🏆🥇🎯🎮🎨🎬📷📸💡📌📍🔔📣💎👑🎀🛍️💰💸🚀✈️🚗🏠⏰📅📝📚🔒🔑" },
];

export function StickersView() {
	const [query, setQuery] = useState("");

	const add = (emoji: string) => {
		const doc = getEditor().doc;
		if (!doc) return;
		const area = getInsertionArea();
		const size = Math.round(Math.min(area.width, area.height) * 0.25);
		const layer = createTextLayer({
			text: emoji,
			name: `Sticker ${emoji}`,
			fontSize: size,
			width: Math.round(size * 1.3),
			lineHeight: 1,
			fill: solid("#000000"),
			fontFamily: "Inter",
		});
		const pos = centerIn(area, layer.width, size);
		layer.x = pos.x;
		layer.y = pos.y;
		getEditor().addLayers([layer]);
	};

	const filtered = CATEGORIES.filter((c) =>
		query ? c.label.toLowerCase().includes(query.toLowerCase()) : true,
	);

	return (
		<PanelView title="Stickers">
			<div className="flex flex-col gap-4 pb-4">
				<Input
					placeholder="Filter categories..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				{filtered.map((category) => (
					<div key={category.label} className="flex flex-col gap-1.5">
						<span className="text-muted-foreground text-xs font-medium">{category.label}</span>
						<div className="grid grid-cols-6 gap-0.5">
							{Array.from(new Intl.Segmenter().segment(category.emojis), (s) => s.segment).map(
								(emoji, i) => (
									<button
										// biome-ignore lint/suspicious/noArrayIndexKey: static list
										key={`${emoji}-${i}`}
										type="button"
										onClick={() => add(emoji)}
										className="hover:bg-accent flex aspect-square items-center justify-center rounded-md text-2xl transition-transform hover:scale-110"
									>
										{emoji}
									</button>
								),
							)}
						</div>
					</div>
				))}
			</div>
		</PanelView>
	);
}
