/** The translated names of the invoicing module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/labels.js";
import { m } from "#lib/paraglide/messages.js";

import type { InvoiceState } from "./invoice.js";

export const invoicingLabels = defineLabels({
	invoiceState: {
		draft: m.enum_invoice_state_draft,
		sent: m.enum_invoice_state_sent,
		overdue: m.enum_invoice_state_overdue,
		paid: m.enum_invoice_state_paid,
		void: m.enum_invoice_state_void,
	} satisfies Labels<InvoiceState>,
});
