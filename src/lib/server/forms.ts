import { invalid } from "@sveltejs/kit";

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
	const label = (id: string) => modules.find((module) => module.id === id)?.label ?? id;
	invalid(...off.map((id) => m.common_error_module_off({ module: label(id) })));
}
