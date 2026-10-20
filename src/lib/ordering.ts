import type { MoveDirection } from "./schema.ts";

/**
 * `items` with the one at `index` moved one place in `direction`, past its neighbour; the same
 * order when it's already first (up) or last (down), or `index` isn't one of theirs. On the server,
 * `reorder()` (`#lib/server/records.ts`) moves a record so and stores the new order.
 */
export function moved<T>(items: readonly T[], index: number, direction: MoveDirection): T[] {
	const to = direction === "up" ? index - 1 : index + 1;
	if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
	const next = [...items];
	[next[index], next[to]] = [next[to], next[index]];
	return next;
}
