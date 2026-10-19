/**
 * Keeps a page up to date with a live query that answers when its records last changed (`live()`
 * in `#lib/server/live.ts`, e.g. `watchPortal`): when the answer changes, the page looks again.
 */
import { untrack } from "svelte";

/** A live query, as the page has it: its latest answer, `undefined` until the first. */
type LiveAnswer = { readonly current: number | undefined };

/**
 * Calls `refresh` when a live query's answer changes. Call it while a component initializes.
 *
 * - `watch` gives the live query (`watchPortal`), or none yet (`() => dock && watchDocks()`); a
 *   different one starts over.
 * - The first answer only says when the records last changed, which the page shows already. With
 *   `readTime` (the data's, `readAt()` on the server), a first answer later than it counts as a
 *   change: one made after the data was read, before the live query opened.
 * - `refresh` runs untracked: what it reads doesn't run it again.
 */
export function refreshOnChange(
	watch: () => LiveAnswer | false | null | undefined,
	refresh: () => unknown,
	readTime?: () => number,
) {
	const source = $derived(watch());
	/** The live query `seen` came from, and its last answer. */
	let from: LiveAnswer | false | null | undefined;
	let seen: number | undefined;
	$effect(() => {
		const changed = source ? source.current : undefined;
		if (source !== from) {
			from = source;
			seen = undefined;
		}
		if (changed === undefined) return;
		const news =
			seen === undefined ? readTime !== undefined && changed > untrack(readTime) : changed !== seen;
		seen = changed;
		if (news) untrack(refresh);
	});
}
