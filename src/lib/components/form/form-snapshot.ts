/**
 * Keeps what's been typed into a remote form and isn't saved yet with the page's history entry
 * (SvelteKit's snapshots), so leaving the page and coming back to it (the back button, or a
 * reload) brings it back instead of losing it. What's kept is the form's input (`fields.value()`:
 * the fields that were changed), stored in the tab's `sessionStorage`; the rest of the fields show
 * the record as it is now. Call it while the form's component initializes, with an `id` unique on
 * the page.
 *
 * Not for a form with secrets (a password), which would end up in `sessionStorage`.
 */
import { browser } from "$app/env";
import { snapshot } from "$app/navigation";

/** What the snapshot needs of a remote form (SvelteKit's `RemoteForm`). */
interface SnapshotForm {
	readonly pending: number;
	readonly fields: { value(): unknown; set(value: never): unknown };
}

export function formSnapshot(id: string, form: () => SnapshotForm) {
	// A form keeps its input for as long as the tab is open, also once the page is left (or the
	// record saved): start afresh, unless the snapshot brings this visit's input back.
	if (browser) form().fields.set({} as never);
	snapshot<Record<string, unknown> | null>({
		id: `form:${id}`,
		// Not while it's being submitted: leaving the page then is the redirect after saving.
		capture: () => {
			const { pending, fields } = form();
			const input = fields.value() as Record<string, unknown> | undefined;
			return pending || !input || Object.keys(input).length === 0 ? null : input;
		},
		restore: (input) => {
			if (input) form().fields.set(input as never);
		},
	});
}
