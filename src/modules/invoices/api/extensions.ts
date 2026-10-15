/**
 * The invoicing module's extension points, for the modules that enhance it (see
 * `#lib/server/extensions.ts`).
 */
import type { BillableItem, BillingPeriod } from "#lib/billing.ts";
import { defineCollector } from "#lib/extensions/define.ts";

/**
 * What a customer owes for besides orders, e.g. a contract's monthly fees: the items that became
 * due in `period` (both days inclusive). Invoicing remembers which references it billed and leaves
 * those out; it asks in `server/billable.ts`. A module that fails fails the request.
 */
export const billableItems = defineCollector<
	{ customerId: number; period: BillingPeriod },
	BillableItem[]
>("invoices.billableItems", { onError: "fail" });
