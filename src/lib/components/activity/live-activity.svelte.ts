/**
 * Keeps a page up to date with the activity log: when anyone in the organization changes something
 * (`watchActivity`), the page looks again (`refresh`). Light on purpose: a burst of changes (a bulk
 * action, several transactions in a row) brings one refresh, not one each. At most one refresh per
 * `delay`, never two at once (a change during one brings one more after it), and none while the
 * tab is hidden (one when it shows again).
 */
import { onMount } from "svelte";

import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";

import { watchActivity } from "./activity.remote.ts";

/** How long a change waits for the rest of its burst before the page looks again (ms). */
const defaultDelay = 400;

/** Calls `refresh` after changes in the activity log. Call it while a component initializes. */
export function refreshOnActivity(refresh: () => Promise<unknown>, delay = defaultDelay) {
	/** A change came in that no refresh has answered yet. */
	let outdated = false;
	let running = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	/** The component is gone: nothing more to refresh. */
	let gone = false;

	function schedule() {
		outdated = true;
		if (!gone && timer === undefined && !running) timer = setTimeout(run, delay);
	}

	async function run() {
		timer = undefined;
		// Hidden tabs wait: `visibilitychange` runs it when the tab shows again.
		if (document.hidden) return;
		outdated = false;
		running = true;
		try {
			await refresh();
		} catch {
			// The page's queries show their own errors; the next change tries again.
		} finally {
			running = false;
		}
		if (outdated) schedule();
	}

	refreshOnChange(watchActivity, schedule);

	onMount(() => {
		const onVisible = () => {
			if (!document.hidden && outdated) schedule();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			gone = true;
			clearTimeout(timer);
		};
	});
}
