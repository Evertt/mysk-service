// The status cell of the orders list, which changes an order's status right in the table.
import { error, isValidationError } from "@sveltejs/kit";
import * as v from "valibot";

import { manualOrderStatuses } from "#lib/models.ts";
import { db } from "#lib/server/db/index.ts";
import { refreshRequested } from "#lib/server/lists/index.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { transitionOrder } from "../server/lifecycle.ts";
import { getOrderFacets, getOrders } from "./order-list.remote.ts";

/**
 * Gives one of the tenant's orders a status that can be given by hand, as the order form and the
 * bulk action do (`transitionOrder()`'s `set`: not an invoiced order; the modules' parts follow, and a
 * module may refuse, e.g. for a shortage of stock). A refusal is a 400 with its reason, a 404 if
 * there's no such order; the list's pages and its filters' counts that the client asks for are
 * refreshed.
 */
export const setOrderStatus = forMembers.command(
	v.object({
		id: v.pipe(v.number(), v.integer(), v.minValue(1)),
		status: v.picklist(manualOrderStatuses),
	}),
	async ({ id, status }) => {
		try {
			await db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: status }));
		} catch (thrown) {
			if (isValidationError(thrown)) error(400, thrown.issues.map((i) => i.message).join("; "));
			throw thrown;
		}
		await refreshRequested(getOrders, getOrderFacets);
	},
);
