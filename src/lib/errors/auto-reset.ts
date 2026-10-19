/**
 * How often a failed part of a page tries again by itself. An `unknown` error (`classify.ts`) is
 * often transient: a top-level `await` that reads `undefined` for a moment renders fine the second
 * time. So a boundary resets once by itself (with a toast), but if it fails again within the window
 * it shows its failure, with Try again and Reload, rather than looping.
 */
export const AUTO_RESET_WINDOW_MS = 30_000;

/**
 * The automatic resets of one boundary (an `ErrorBoundary` instance, or the `+error` pages
 * together), by key: the page's pathname, so navigating to another page starts a new window.
 */
export class AutoResets {
	#last = new Map<string, number>();

	/** Whether `key` may reset by itself now; if so, starts its window. */
	allow(key: string, now = Date.now()): boolean {
		const last = this.#last.get(key);
		if (last !== undefined && now - last < AUTO_RESET_WINDOW_MS) return false;
		this.#last.set(key, now);
		return true;
	}
}
