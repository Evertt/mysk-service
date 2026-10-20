/**
 * A customer's docks, as its page's card shows them, and what managers do with them there: add,
 * edit and delete a dock. A unit's use as a dock's door or leveller, for its page, and the dock of
 * a door, for the energy module's door card. And when the docks changed, for whatever shows them
 * live (the board, the door card).
 */
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { customerCode, recordId } from "#lib/schema.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { live } from "#lib/server/live.ts";

import { dockSchema } from "./form/dock-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { customerDocks, deleteDock, doorDock, dockUsage, saveDock } from "./server/docks.ts";

const code = customerCode();

/** The customer's docks and what they can be given (its sites, locations and units). */
export const getCustomerDocks = query(code, async (customerCode) => ({
	...(await customerDocks(customerCode)),
	canManage: isManager(currentTenant().roles),
}));

/** Adds or saves a dock at one of the customer's sites. */
export const saveCustomerDock = forManagers.form(
	dockSchema,
	async ({ customer, dockId, ...input }) => {
		await saveDock(customer, { ...input, id: dockId ?? undefined });
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
export const getDockUsage = query(
	v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
	(serialNumber) => dockUsage(serialNumber),
);

/** The dock whose door is the unit `unitId`, with its live state; `null` if it's no dock's door. */
export const getDoorDock = query(recordId(), (unitId) => doorDock(unitId));

/** The records the docks' live views show: a change to any of them outdates them. */
const dockTypes = ["dock", "customer"] as const;

/**
 * When the docks last changed (epoch ms, 0 if not since the server started), sent again on each
 * change: events applied, the rules' notices, docks added or edited.
 */
export const watchDocks = query.live(() => live(dockTypes));
