/**
 * A customer's docks, as its page's card shows them, and what managers do with them there: add,
 * edit and delete a dock. And a unit's use as a dock's door or leveller, for its page.
 */
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { refuse } from "#lib/server/forms.ts";

import { dockSchema } from "./form/dock-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { customerDocks, deleteDock, dockUsage, saveDock } from "./server/docks.ts";

const code = v.pipe(v.string(), v.nonEmpty(), v.maxLength(64));

/** The customer's docks and what they can be given (its sites, locations and units). */
export const getCustomerDocks = query(code, async (customerCode) => ({
	...(await customerDocks(customerCode)),
	canManage: isManager(currentTenant().roles),
}));

/** Adds or saves a dock at one of the customer's sites. */
export const saveCustomerDock = forManagers.form(
	dockSchema,
	async ({ customer, dockId, ...input }, issue) => {
		refuse(issue, await saveDock(customer, { ...input, id: dockId ?? undefined }));
		void getCustomerDocks(customer).refresh();
		return { code: input.code };
	},
);

/** Deletes one of the customer's docks. */
export const deleteCustomerDock = forManagers.form(
	v.object({ customer: code, id: v.pipe(v.string(), v.transform(Number), v.integer()) }),
	async (input) => {
		const deleted = await deleteDock(input.customer, input.id);
		void getCustomerDocks(input.customer).refresh();
		return { code: deleted.code };
	},
);

/** How the unit is used as a dock's door or leveller; `null` if it's no dock's. */
export const getDockUsage = query(code, (serialNumber) => dockUsage(serialNumber));
