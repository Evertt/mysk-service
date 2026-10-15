/**
 * What shows a changed invoice, for the remote functions that change one
 * (`invoice-status.remote.ts`, `[number]/draft.remote.ts`).
 */
import { getSubjectActivity } from "#lib/components/activity/activity.remote.ts";

import { getBillable, getInvoice, getInvoices } from "../invoices.remote.ts";

/** Refreshes what shows a changed invoice. */
export function refreshInvoice(found: { id: number; number: string; customerId: number }) {
	void getInvoices().refresh();
	void getInvoice(found.number).refresh();
	void getBillable(found.customerId).refresh();
	void getSubjectActivity({ type: "invoice", id: String(found.id) }).refresh();
}
