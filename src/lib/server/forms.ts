import { error, invalid, isValidationError } from "@sveltejs/kit";

import { formPartKey } from "#lib/extensions/form-part-key.ts";
import { partsOfModulesOff } from "#lib/extensions/form-parts.ts";
import { modules } from "#lib/modules/manifests.ts";

import { currentTenant } from "./auth/session.ts";

/** Why a form can't be saved: a message for one of its fields, or for the form without a field. */
export interface Problem<F extends string = string> {
	field?: F;
	message: string;
}

/**
 * Refuses the form with `invalid()`, each problem on its field (or on the form, without one), if
 * there are any. `issue` is the one a remote `form` callback gets, e.g.
 * `refuse(issue, [{ field: "customerId", message: m.orders_unknown_customer() }])`.
 */
export function refuse<F extends string>(
	issue: Record<F, (message: string) => Parameters<typeof invalid>[number]>,
	problems: Problem<F>[],
) {
	if (!problems.length) return;
	invalid(...problems.map(({ field, message }) => (field ? issue[field](message) : message)));
}

/**
 * Refuses a form that submitted a part of a module the tenant doesn't have (`parts`, the form's
 * `modules` field, see `#lib/extensions/form-parts.ts`): only a page loaded before the module was
 * switched off, or a tampered submission, sends one. Call it in the form's handler before saving.
 */
export function refuseOffParts(parts: Readonly<Record<string, unknown>>) {
	const off = partsOfModulesOff(parts, currentTenant().modules);
	if (!off.length) return;
	const label = (key: string) =>
		modules.find((module) => formPartKey(module.id) === key)?.label ?? key;
	invalid(...off.map((id) => m.common_error_module_off({ module: label(id) })));
}

/**
 * Runs a command's change, turning what it refuses with `invalid()` into a 400 with the reasons: a
 * command has no form fields to show issues on, so the client shows the message.
 */
export async function refusedAsBadRequest<T>(change: () => Promise<T>): Promise<T> {
	try {
		return await change();
	} catch (thrown) {
		if (isValidationError(thrown)) error(400, thrown.issues.map((i) => i.message).join("; "));
		throw thrown;
	}
}
