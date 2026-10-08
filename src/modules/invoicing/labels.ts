/** The translated names of the invoicing module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/labels.ts";
import { m } from "#lib/paraglide/messages.js";

import type { InvoiceState } from "./invoice.ts";

export const invoicingLabels = defineLabels({
	invoiceState: {
		draft: m.invoices_state_draft,
		sent: m.invoices_state_sent,
		overdue: m.invoices_state_overdue,
		paid: m.invoices_state_paid,
		void: m.invoices_state_void,
	} satisfies Labels<InvoiceState>,
});
