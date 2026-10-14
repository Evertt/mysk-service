/**
 * Whether the user has left the app alone for a while: with a new version deployed, the root
 * layout reloads a tab nobody has touched for an hour (`+layout.svelte`), when a reload interrupts
 * nothing.
 */

/** What counts as the user doing something on the page. */
const activities = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];

/**
 * Starts watching for the user doing something on the page (pointer, keys, wheel, scrolling,
 * touch) and answers with when they last did, a timestamp. Watches for as long as the page lives.
 */
export function watchActivity(target: EventTarget = window): () => number {
	let last = Date.now();
	const active = () => {
		last = Date.now();
	};
	// Captured, so it hears scrolling (which doesn't bubble) and what handlers stop.
	for (const type of activities)
		target.addEventListener(type, active, { capture: true, passive: true });
	return () => last;
}

/**
 * Calls `then` once the user last did something (`lastActive`) `idleFor` ms ago, checking again
 * whenever the tab is shown: a hidden tab's timers can run late. Answers with a function that
 * stops waiting.
 */
export function whenIdle(
	lastActive: () => number,
	idleFor: number,
	then: () => void,
	page: EventTarget & { visibilityState: DocumentVisibilityState } = document,
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const check = () => {
		clearTimeout(timer);
		const left = lastActive() + idleFor - Date.now();
		if (left <= 0) then();
		else timer = setTimeout(check, left);
	};
	const shown = () => {
		if (page.visibilityState === "visible") check();
	};
	page.addEventListener("visibilitychange", shown);
	check();
	return () => {
		clearTimeout(timer);
		page.removeEventListener("visibilitychange", shown);
	};
}
