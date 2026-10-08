/** The invoices list's bulk actions (see `#lib/components/data-table/bulk-actions.ts`). */
import BadgeCheckIcon from "@lucide/svelte/icons/badge-check";

import type { BulkAction } from "#lib/components/data-table/bulk-actions.js";
import { m } from "#lib/paraglide/messages.js";

import { canChange } from "../../../invoice.js";
import type { InvoiceRow } from "./columns.js";
import { bulkMarkPaid } from "./invoice-status.remote.js";

export const markPaid: BulkAction<InvoiceRow> = {
	id: "mark-paid",
	label: m.invoices_mark_paid,
	icon: BadgeCheckIcon,
	skip: (row) =>
		canChange(row.status, "paid") ? undefined : m.invoices_bulk_not_sent({ number: row.number }),
	confirm: {
		title: () => m.invoices_bulk_mark_paid_title(),
		description: m.invoices_bulk_mark_paid_description,
	},
	run: (target) => bulkMarkPaid(target),
	done: m.invoices_bulk_marked_paid,
};
