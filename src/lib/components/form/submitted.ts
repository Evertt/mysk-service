/**
 * Submits a remote form from its `enhance` callback, and tells the user when submitting failed:
 *
 * ```svelte
 * <form {...form.enhance(async ({ element, submit }) => {
 * 	if (!(await submitted(submit))) return;
 * 	element.reset();
 * 	toast.success(m.saved());
 * })}>
 * ```
 *
 * `submit()` is true once the server accepted the input (or redirected), false when it refused it
 * (its issues show at the fields), and throws when the request failed: an `error(status, message)`,
 * a crash (a 500) or the network. A callback that let it throw showed nothing; this toasts the
 * error's message, or the generic one, and answers false, so the callback's success steps (closing
 * the dialog, the reset, the success toast) only run for an accepted submission.
 */
import { toast } from "svelte-sonner";

import { m } from "#lib/paraglide/messages.js";
import { errorMessage } from "#lib/utils.ts";

/** Whether the form was accepted; a toast if submitting threw. `submit` may add `.updates(…)`. */
export async function submitted(submit: () => Promise<boolean>): Promise<boolean> {
	try {
		return await submit();
	} catch (error) {
		toast.error(errorMessage(error, m.common_error_generic()));
		return false;
	}
}
