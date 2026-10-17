import { untrack } from "svelte";

import { watchPortal } from "./client.remote.ts";

/**
 * Live: calls `refresh` when the office changes an order, a site or a unit (`watchPortal`), e.g.
 * accepts, rejects or plans a reported breakdown, so an open portal page shows it without a
 * reload. Call it while a component initializes.
 */
export function refreshOnChanges(refresh: () => unknown) {
	const changes = watchPortal();
	let seen: number | undefined;
	$effect(() => {
		const changed = changes.current;
		if (changed === undefined) return;
		if (seen !== undefined && changed !== seen) untrack(refresh);
		seen = changed;
	});
}
