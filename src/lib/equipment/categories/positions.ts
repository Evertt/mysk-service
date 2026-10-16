import type { MoveDirection } from "./category-schema.ts";

/**
 * The ids of `ids` (in their order) with `id` moved one place in `direction`; the same order when
 * it's already first (up) or last (down), or not among them.
 */
export function moved(ids: readonly number[], id: number, direction: MoveDirection): number[] {
	const from = ids.indexOf(id);
	const to = direction === "up" ? from - 1 : from + 1;
	if (from < 0 || to < 0 || to >= ids.length) return [...ids];
	const next = [...ids];
	[next[from], next[to]] = [next[to], next[from]];
	return next;
}
