/**
 * The invoicing module's bulk actions on the orders list (see `bulkActions` in `#lib/modules/manifests.ts`):
 * a draft invoice for the selected completed orders of one customer, which then opens.
 */
import ReceiptTextIcon from "@lucide/svelte/icons/receipt-text";

import type { TableBulkAction } from "#lib/modules/manifests.ts";

import { invoiceOrders } from "./bulk.remote.ts";

export const createInvoice: TableBulkAction<"orders"> = {
	id: "invoicing:create-invoice",
	label: m.invoices_bulk_create,
	icon: ReceiptTextIcon,
	// Whether one is on an invoice already, only the server knows.
	skip: (row) =>
		row.status === "completed" ? undefined : m.invoices_bulk_not_completed({ number: row.number }),
	disabled: (rows) =>
		new Set(rows.map((row) => row.customer.id)).size > 1
			? m.invoices_bulk_one_customer()
			: undefined,
	matching: false,
	confirm: {
		title: (count) => m.invoices_bulk_create_title({ orders: m.common_count_orders({ count }) }),
		description: m.invoices_bulk_create_description,
	},
	// Never "all matching" (see `matching`): the action bar only sends ids.
	run: (target) => invoiceOrders(target as { ids: number[] }),
	done: m.invoices_bulk_created,
};

export default [createInvoice];
