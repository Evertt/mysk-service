/**
 * A stand-in for `historyDialog()` (`#lib/components/history-dialog.svelte.ts`) in component tests,
 * which have no SvelteKit router for its shallow routing (`goto()` throws without one): the open
 * dialog is kept here instead of in `page.state`, and closing it forgets it instead of going back.
 * Leaving the page from it closes it and notes where to, in `leaves`.
 *
 *     vi.mock("#lib/components/history-dialog.svelte.ts", () => import("#unit/lib/components/fake-history-dialog.svelte.ts"));
 *
 * Call `resetHistoryDialogs()` before each test, so a dialog left open isn't open in the next.
 */
import type { HistoryDialog } from "#lib/components/history-dialog.svelte.ts";

/** The open dialog, as `page.state.dialog` would hold it. */
let shown = $state<{ key: string; value?: string }>();

/** The pages dialogs left for (`leave(url)`), oldest first. */
export const leaves: string[] = [];

export function historyDialog(key: string): HistoryDialog {
	const current = () => (shown?.key === key ? shown : undefined);
	return {
		get open() {
			return current() !== undefined;
		},
		set open(open) {
			if (open && !current()) shown = { key };
			else if (!open && current()) shown = undefined;
		},
		get value() {
			return current()?.value;
		},
		show(value) {
			shown = { key, value };
		},
		async leave(url) {
			leaves.push(url);
			shown = undefined;
		},
	};
}

export function resetHistoryDialogs() {
	shown = undefined;
	leaves.length = 0;
}
