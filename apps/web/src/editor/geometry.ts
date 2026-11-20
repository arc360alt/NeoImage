/** Shape outlines in a width × height box, as flat [x0, y0, x1, y1, ...] arrays. */

export function polygonPoints(width: number, height: number, sides: number) {
	const points: number[] = [];
	const n = Math.max(3, Math.round(sides));
	for (let i = 0; i < n; i++) {
		const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
		points.push(
			width / 2 + (Math.cos(angle) * width) / 2,
			height / 2 + (Math.sin(angle) * height) / 2,
		);
	}
	return points;
}

export function starPoints(
	width: number,
	height: number,
	spikes: number,
	innerRatio: number,
) {
	const points: number[] = [];
	const n = Math.max(3, Math.round(spikes));
	for (let i = 0; i < n * 2; i++) {
		const r = i % 2 === 0 ? 1 : innerRatio;
		const angle = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
		points.push(
			width / 2 + (Math.cos(angle) * width * r) / 2,
			height / 2 + (Math.sin(angle) * height * r) / 2,
		);
	}
	return points;
}

export function trianglePoints(width: number, height: number) {
	return [width / 2, 0, width, height, 0, height];
}

/** SVG path for a heart in a width × height box. */
export function heartPath(width: number, height: number) {
	const w = width;
	const h = height;
	return [
		`M ${w / 2} ${h * 0.95}`,
		`C ${w * 0.15} ${h * 0.68}, ${-w * 0.05} ${h * 0.38}, ${w * 0.12} ${h * 0.16}`,
		`C ${w * 0.27} ${-h * 0.02}, ${w * 0.45} ${h * 0.05}, ${w / 2} ${h * 0.22}`,
		`C ${w * 0.55} ${h * 0.05}, ${w * 0.73} ${-h * 0.02}, ${w * 0.88} ${h * 0.16}`,
		`C ${w * 1.05} ${h * 0.38}, ${w * 0.85} ${h * 0.68}, ${w / 2} ${h * 0.95}`,
		"Z",
	].join(" ");
}

export function pointsToSvg(points: number[]) {
	const pairs: string[] = [];
	for (let i = 0; i < points.length; i += 2) {
		pairs.push(`${points[i]},${points[i + 1]}`);
	}
	return pairs.join(" ");
}
