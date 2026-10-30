/** The widgets' drawings: arrowheads drawn as shapes of their own, so they take the line's colour class. */

export interface Point {
	x: number;
	y: number;
}

/** The points of a triangle with its tip at `tip`, pointing along `from` → `tip`. */
export function arrowHead(from: Point, tip: Point, size = 8) {
	const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
	const [ux, uy] = [(tip.x - from.x) / length, (tip.y - from.y) / length];
	const base = { x: tip.x - size * ux, y: tip.y - size * uy };
	const corner = (side: number) =>
		`${round(base.x - (side * size * uy) / 2)},${round(base.y + (side * size * ux) / 2)}`;
	return `${round(tip.x)},${round(tip.y)} ${corner(1)} ${corner(-1)}`;
}

/** `value` to a tenth, to keep the drawing's numbers short. */
export const round = (value: number) => Math.round(value * 10) / 10;
