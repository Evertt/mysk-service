/**
 * Runs what a button or form starts, and tells the user when it failed. `ran()` takes a command
 * (or any work), `submitted()` a remote form's `submit` from its `enhance` callback:
 *
 * ```svelte
 * <Button onclick={async () => {
 * 	if (await ran(pausePlan({ id }), m.pause_failed())) toast.success(m.paused());
 * }}>
 * <form {...form.enhance(async ({ element, submit }) => {
 * 	if (!(await submitted(submit))) return;
 * 	element.reset();
 * 	toast.success(m.saved());
 * })}>
 * ```
 *
 * A command throws when the request failed: an `error(status, message)`, a crash (a 500) or the
 * network. A caller that let it throw showed nothing; these toast the error's own message (see
 * `errorMessage()`), or the fallback, and answer false, so the caller's success steps (closing the
 * dialog, the reset, the success toast) only run when it went through.
 */
import { toast } from "svelte-sonner";

import { errorMessage } from "#lib/errors/messages.ts";
import { m } from "#lib/paraglide/messages.js";

/** Whether `run` (a command's promise, or a function doing the work) went through; else a toast. */
export async function ran(
	run: PromiseLike<unknown> | (() => unknown),
	fallback = m.common_error_generic(),
): Promise<boolean> {
	try {
		await (typeof run === "function" ? run() : run);
		return true;
	} catch (error) {
		toast.error(errorMessage(error, fallback));
		return false;
	}
}

/**
 * Whether the form was accepted: `submit()` is true once the server accepted the input (or
 * redirected), false when it refused it (its issues show at the fields). `submit` may add
 * `.updates(…)`.
 */
export async function submitted(submit: () => Promise<boolean>): Promise<boolean> {
	let accepted = false;
	await ran(async () => (accepted = await submit()));
	return accepted;
}
