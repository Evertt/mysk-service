/**
 * The history entry of a dialog component (`FormDialog`, `ConfirmDialog`) with a bindable `open`:
 * its own `historyDialog()`, or the one its opener keeps (`given`, e.g. to open it for a record).
 * The two stay in step: opening the dialog (its trigger, or the parent setting `open`) adds the
 * entry, and the entry going (back, or closing the dialog) sets `open` false. Call it while the
 * component initializes; bind the dialog's `open` to the answer's.
 */
import { untrack } from "svelte";
import { toast } from "svelte-sonner";

import { type HistoryDialog, historyDialog } from "../history-dialog.svelte.ts";

export function dialogHistory(
	key: string,
	given: () => HistoryDialog | undefined,
	open: { get(): boolean; set(open: boolean): void },
): () => HistoryDialog {
	const own = historyDialog(key);
	const dialog = $derived(given() ?? own);

	// Mounted with its entry there (its opener showed it first): it's open.
	let shown = untrack(() => dialog.open);
	if (shown && !open.get()) open.set(true);

	// The parent opens or closes it: so does its entry.
	$effect.pre(() => {
		const wanted = open.get();
		untrack(() => {
			if (wanted !== dialog.open) dialog.open = wanted;
		});
	});

	// The entry comes or goes: so does the parent's `open`. Only a change counts, so a dialog the
	// parent mounts open isn't closed before its entry is there.
	$effect.pre(() => {
		const now = dialog.open;
		if (now === shown) return;
		shown = now;
		untrack(() => {
			if (open.get() !== now) open.set(now);
		});
	});

	return () => dialog;
}

/** What a dialog does once its form or confirmation went through, besides closing. */
export interface DialogDone<Result> {
	/** Called first, with the form's result. */
	ondone?: (result: Result | undefined) => unknown;
	/** The toast, e.g. `m.x_saved()`; a function to read the result. None if not given. */
	done?: string | ((result: Result | undefined) => string | undefined);
	/** The page to go to from the dialog, in place of its history entry (see `leave()`). */
	leave?: string | ((result: Result | undefined) => string | undefined);
}

/** Closes `dialog` once it went through: `ondone`, the toast, then closing it or leaving. */
export async function finish<Result>(
	dialog: HistoryDialog,
	result: Result | undefined,
	{ ondone, done, leave }: DialogDone<Result>,
) {
	await ondone?.(result);
	const message = typeof done === "function" ? done(result) : done;
	if (message) toast.success(message);
	const to = typeof leave === "function" ? leave(result) : leave;
	// Closing it after the form redirected does nothing: the entry went with the page.
	if (to) await dialog.leave(to);
	else dialog.open = false;
}
