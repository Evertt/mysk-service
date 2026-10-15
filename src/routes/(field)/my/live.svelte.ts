import { untrack } from "svelte";

import { watchMyWork } from "./portal.remote.ts";

/**
 * Live: calls `refresh` when the office changes an order, a customer or a unit (`watchMyWork`),
 * so an open portal page shows it without a reload. Call it while a component initializes.
 */
export function refreshOnChanges(refresh: () => unknown) {
	const changes = watchMyWork();
	let seen: number | undefined;
	$effect(() => {
		const changed = changes.current;
		if (changed === undefined) return;
		if (seen !== undefined && changed !== seen) untrack(refresh);
		seen = changed;
	});
}
