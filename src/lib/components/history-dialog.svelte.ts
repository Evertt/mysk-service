/**
 * A dialog with a history entry of its own (SvelteKit's shallow routing): opening it adds one, with
 * the dialog in `page.state`, so the browser's back button (or a swipe back, on a phone or tablet)
 * closes it instead of leaving the page, and forward opens it again. The URL stays the same, and a
 * reload shows the page without the dialog.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";

export interface HistoryDialog {
	/** Whether the dialog is open: bind a dialog's `open` to it. Closing it goes back. */
	open: boolean;
	/** What the dialog was opened for (`show(value)`), while it's open. */
	readonly value: string | undefined;
	/** Opens the dialog for `value` (e.g. a record's id). */
	show(value?: string): void;
	/**
	 * Leaves the page for `url` from the dialog, in place of its history entry, so going back from
	 * there returns to the page without the dialog.
	 */
	leave(url: string): Promise<void>;
}

/** The dialog named `key` (unique on the page) in `page.state`. */
export function historyDialog(key: string): HistoryDialog {
	const current = () => (page.state.dialog?.key === key ? page.state.dialog : undefined);

	// While it leaves the page, closing it mustn't go back as well.
	let leaving = false;

	function show(value?: string) {
		void goto("", { shallow: true, state: { dialog: { key, value } } });
	}

	return {
		get open() {
			return current() !== undefined;
		},
		set open(open) {
			if (open && !current()) show();
			else if (!open && current() && !leaving) history.back();
		},
		get value() {
			return current()?.value;
		},
		show,
		async leave(url) {
			leaving = true;
			try {
				await goto(url, { replace: current() !== undefined });
			} finally {
				leaving = false;
			}
		},
	};
}
