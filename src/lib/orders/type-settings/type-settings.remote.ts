/**
 * The tenant's order type settings (see `#lib/orders/types.ts`): everyone in the tenant reads
 * them (each shell's layout awaits `getOrderTypes()` through `useTenantOrderTypes()`, so the labels in the browser have the
 * tenant's names), managers change them on the settings page.
 */
import { forAnyRole, forManagers } from "#lib/server/remote-functions.ts";

import { orderTypeSetup, saveOrderTypeSetting, tenantOrderTypes } from "../server/types.ts";
import { orderTypeSchema } from "./type-schema.ts";

/** The tenant's settings as they work: the names the labels show, and the types the form leaves out. */
export const getOrderTypes = forAnyRole.query(async () => tenantOrderTypes());

/** Each type with the tenant's setting and what needs it offered: the settings page's. */
export const getOrderTypeSetup = forManagers.query(async () => orderTypeSetup());

export const saveOrderType = forManagers.form(orderTypeSchema, async (input) => {
	await saveOrderTypeSetting(input.type, input);
	void getOrderTypeSetup().refresh();
	void getOrderTypes().refresh();
});
