import { invalid } from "@sveltejs/kit";

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
