/**
 * Minimal 2D affine matrices, laid out like canvas/SVG: [a, b, c, d, e, f]
 * maps (x, y) to (a·x + c·y + e, b·x + d·y + f).
 */
export type Matrix = [number, number, number, number, number, number];
export type Vec = { x: number; y: number };

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 · m2: applies m2 first, then m1. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
	const [a1, b1, c1, d1, e1, f1] = m1;
	const [a2, b2, c2, d2, e2, f2] = m2;
	return [
		a1 * a2 + c1 * b2,
		b1 * a2 + d1 * b2,
		a1 * c2 + c1 * d2,
		b1 * c2 + d1 * d2,
		a1 * e2 + c1 * f2 + e1,
		b1 * e2 + d1 * f2 + f1,
	];
}

export function apply(m: Matrix, p: Vec): Vec {
	return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Applies only the linear part (for direction vectors such as bezier handles). */
export function applyLinear(m: Matrix, v: Vec): Vec {
	return { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y };
}

export function invert(m: Matrix): Matrix {
	const [a, b, c, d, e, f] = m;
	const det = a * d - b * c;
	if (Math.abs(det) < 1e-12) return [...IDENTITY];
	return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number = sx): Matrix => [sx, 0, 0, sy, 0, 0];
export function rotate(degrees: number): Matrix {
	const r = (degrees * Math.PI) / 180;
	const cos = Math.cos(r);
	const sin = Math.sin(r);
	return [cos, sin, -sin, cos, 0, 0];
}

/** translate · rotate · scale, the order Konva (and our SVG export) use. */
export function compose(t: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }): Matrix {
	return multiply(multiply(translate(t.x, t.y), rotate(t.rotation)), scale(t.scaleX, t.scaleY));
}

/**
 * Splits a matrix into translate · rotate · scale, dropping any skew.
 * A mirrored matrix comes back with a negative scaleY.
 */
export function decompose(m: Matrix) {
	const [a, b, c, d, e, f] = m;
	const sx = Math.hypot(a, b);
	const det = a * d - b * c;
	const sy = sx > 1e-12 ? det / sx : Math.hypot(c, d);
	const rotation = (Math.atan2(b, a) * 180) / Math.PI;
	return { x: e, y: f, rotation, scaleX: sx, scaleY: sy };
}

export function isIdentity(m: Matrix, eps = 1e-9) {
	return m.every((v, i) => Math.abs(v - IDENTITY[i]) < eps);
}
