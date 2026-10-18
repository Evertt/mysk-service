/** The translated names of the invoicing module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { CreditNoteState, CreditSettlement } from "./credit-note.ts";
import type { InvoiceState } from "./invoice.ts";

export const invoicingLabels = defineLabels({
	invoiceState: {
		draft: m.invoices_state_draft,
		sent: m.invoices_state_sent,
		overdue: m.invoices_state_overdue,
		paid: m.invoices_state_paid,
		void: m.invoices_state_void,
	} satisfies Labels<InvoiceState>,
	/** A credit note's: paid reads as settled (refunded, or offset against its invoice). */
	creditNoteState: {
		draft: m.invoices_state_draft,
		sent: m.invoices_state_sent,
		paid: m.invoices_credit_state_settled,
		void: m.invoices_state_void,
	} satisfies Labels<CreditNoteState>,
	/** How a sent credit note is still to be settled. */
	creditSettlement: {
		refund: m.invoices_credit_settlement_refund,
		offset: m.invoices_credit_settlement_offset,
	} satisfies Labels<CreditSettlement>,
});
