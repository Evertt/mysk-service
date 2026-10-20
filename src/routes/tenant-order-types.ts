import { browser } from "$app/env";

import { nameOrderTypes } from "#lib/orders/index.ts";
import { getOrderTypes } from "#lib/orders/remotes.ts";

/**
 * Has the order types read as the tenant named them, in a shell's layout: call it in the script,
 * before its first await, and await what it answers (the tenant's settings) with the shell's other
 * queries. In the browser the labels read this query from before that await, as the page may render
 * meanwhile; its `current` is reactive, so they follow a change. (The server reads the request's
 * tenant, see `nameOrderTypesOnServer()`.)
 */
export function useTenantOrderTypes() {
	const orderTypes = getOrderTypes();
	if (browser) nameOrderTypes(() => orderTypes.current);
	return orderTypes;
}
