/**
 * What the invoices module adds to the orders list's selection (see
 * `bulk-actions/orders.list.bulk.ts`).
 */
import { error } from "@sveltejs/kit";

import type { BulkResult } from "#lib/components/data-table/bulk-actions.ts";
import { idsInTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";
import { idsTarget, targetIds } from "#lib/server/lists/index.ts";

import { getOrderInvoice } from "./invoices.remote.ts";
import { command } from "./remote-functions.ts";
import { billableFor } from "./server/billable.ts";
import { createDraft } from "./server/invoices.ts";

/**
 * Makes one draft invoice for the selected orders, which must all be one customer's (refused
 * otherwise): those that can be billed (completed, and not on an invoice yet) go on it, the others
 * are skipped with the reason. The draft is made all at once, through the new invoice form's code
 * (`createDraft`); its page is the result's `href`, to open.
 */
export const invoiceOrders = command(idsTarget, async (target): Promise<BulkResult> => {
	// Only the selected ids (never "all matching"): it checks the selection as a whole.
	const ids = await targetIds(target);
	const found = await db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			customerId: order.customerId,
		})
		.from(order)
		.where(idsInTenant(order, ids))
		.orderBy(order.number);
	const missing = ids.length - found.length;
	if (new Set(found.map((o) => o.customerId)).size > 1) error(400, m.invoices_bulk_one_customer());
	if (!found.length) return { done: 0, skipped: [], missing };

	const { customerId } = found[0];
	const billable = new Set((await billableFor(customerId)).orders.map((o) => o.id));
	const chosen = found.filter((o) => billable.has(o.id));
	const skipped = found
		.filter((o) => !billable.has(o.id))
		.map((o) => ({
			label: o.number,
			reason:
				o.status === "completed"
					? m.invoices_bulk_already_billed({ number: o.number })
					: m.invoices_bulk_not_completed({ number: o.number }),
		}));
	if (!chosen.length) return { done: 0, skipped, missing };

	// Refused, e.g., when someone else billed them meanwhile.
	const created = await createDraft({ customerId, orderIds: chosen.map((o) => o.id), items: [] });
	for (const o of chosen) void getOrderInvoice(o.number).refresh();
	return { done: chosen.length, skipped, missing, href: `/invoices/${created.number}` };
});
