/**
 * The checklists module's domain rules: a template's limits, and the order of its points, whose
 * groups are just a text on each point. Pure and isomorphic.
 *
 * A template's points are in one order (`position`), with each group's points together: the groups
 * come in the order of their first point, and the points of a group in their own order. Moving a
 * point past the edge of its group takes it into the next group; changing its group puts it last
 * in the other.
 */

/** How many months an inspection by a template stays valid, unless the template says otherwise. */
export const defaultValidityMonths = 12;

/** How many months a template may say an inspection stays valid. */
export const validityLimits = { min: 1, max: 120 } as const;

/** The most a template's name, its norm, a group and a point's text may have. */
export const textLimits = { name: 80, norm: 80, group: 60, text: 240 } as const;

/** A point as far as its order goes. */
export interface PointPlace {
	id: number;
	group: string;
	position: number;
}

export type MoveDirection = "up" | "down";

/**
 * The points in their order, each group's together: groups in the order of their first point
 * (by `position`, then id), points within a group by the same.
 */
export function orderPoints<Point extends PointPlace>(points: readonly Point[]): Point[] {
	const sorted = points.toSorted((a, b) => a.position - b.position || a.id - b.id);
	return [...Map.groupBy(sorted, (point) => point.group).values()].flat();
}

/** The points under their groups' headings, in order (see `orderPoints()`). */
export function groupPoints<Point extends PointPlace>(points: readonly Point[]) {
	const groups = Map.groupBy(orderPoints(points), (point) => point.group);
	return [...groups].map(([group, items]) => ({ group, points: items }));
}

/** The order of points as their ids and groups, first to last: what `changedPlaces()` compares. */
type Order = { id: number; group: string }[];

const asOrder = (points: readonly PointPlace[]): Order =>
	orderPoints(points).map(({ id, group }) => ({ id, group }));

/**
 * The order with the point `id` moved one place `direction`: past its neighbour in its group, or,
 * at its group's edge, into the group before (as its last) or after (as its first). Unchanged for
 * the very first point up, the very last down, or an id that isn't among them.
 */
export function movePoint(points: readonly PointPlace[], id: number, direction: MoveDirection) {
	const order = asOrder(points);
	const at = order.findIndex((point) => point.id === id);
	if (at < 0) return order;
	const point = order[at];
	const next = order[direction === "up" ? at - 1 : at + 1];
	if (!next) return order;
	if (next.group !== point.group) {
		// At its group's edge: it joins the neighbouring group, where it stands.
		order[at] = { ...point, group: next.group };
		return order;
	}
	const to = direction === "up" ? at - 1 : at + 1;
	[order[at], order[to]] = [order[to], order[at]];
	return order;
}

/**
 * The order with the group `group` moved one place `direction`, past the group before or after
 * it. Unchanged for the first group up, the last down, or a group that isn't among them.
 */
export function moveGroup(points: readonly PointPlace[], group: string, direction: MoveDirection) {
	const groups = [...Map.groupBy(asOrder(points), (point) => point.group).values()];
	const at = groups.findIndex(([first]) => first.group === group);
	const to = direction === "up" ? at - 1 : at + 1;
	if (at < 0 || to < 0 || to >= groups.length) return groups.flat();
	[groups[at], groups[to]] = [groups[to], groups[at]];
	return groups.flat();
}

/**
 * The order with the point `id` in `group`: where it is when that's its group already, else last
 * in that group, or in a new group at the end. A point that isn't among them is added so (a new
 * point, with an id of its own).
 */
export function placePoint(points: readonly PointPlace[], id: number, group: string): Order {
	const order = asOrder(points);
	const current = order.find((point) => point.id === id);
	if (current?.group === group) return order;
	const rest = order.filter((point) => point.id !== id);
	const last = rest.findLastIndex((point) => point.group === group);
	const at = last < 0 ? rest.length : last + 1;
	return [...rest.slice(0, at), { id, group }, ...rest.slice(at)];
}

/**
 * The points whose group or position `order` changes, with their new ones: positions from 0, in
 * the order's order. Points the order leaves out keep theirs.
 */
export function changedPlaces(points: readonly PointPlace[], order: Order): PointPlace[] {
	const byId = new Map(points.map((point) => [point.id, point]));
	return order
		.map(({ id, group }, position) => ({ id, group, position }))
		.filter((place) => {
			const was = byId.get(place.id);
			return !was || was.group !== place.group || was.position !== place.position;
		});
}
