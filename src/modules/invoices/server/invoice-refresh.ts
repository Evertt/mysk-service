/**
 * What shows a changed invoice or credit note, for the remote functions that change one
 * (`invoice-status.remote.ts`, `detail/draft.remote.ts`, `detail/credit-note.remote.ts`).
 */
import { getSubjectActivity } from "#lib/components/activity/activity.remote.ts";

import { getCreditNote, getCreditNotes } from "../credit-notes.remote.ts";
import { getBillable, getInvoice, getInvoices } from "../invoices.remote.ts";

/** Refreshes what shows a changed invoice. */
export function refreshInvoice(found: { id: number; number: string; customerId: number }) {
	void getInvoices().refresh();
	void getInvoice(found.number).refresh();
	void getBillable(found.customerId).refresh();
	void getSubjectActivity({ type: "invoice", id: String(found.id) }).refresh();
}

/** Refreshes what shows a changed credit note, and the invoice it credits. */
export function refreshCreditNote(found: {
	id: number;
	number: string;
	invoice?: { id: number; number: string } | null;
}) {
	void getCreditNotes().refresh();
	void getCreditNote(found.number).refresh();
	void getSubjectActivity({ type: "credit_note", id: String(found.id) }).refresh();
	if (found.invoice) {
		void getInvoices().refresh();
		void getInvoice(found.invoice.number).refresh();
		void getSubjectActivity({ type: "invoice", id: String(found.invoice.id) }).refresh();
	}
}
