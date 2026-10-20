/** Issuing, paying and voiding invoices; the changes are in `server/invoices.ts`. */
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { bulkChange, idsTarget } from "#lib/server/lists/index.ts";

import { getCreditNotes } from "./credit-notes.remote.ts";
import { getInvoices } from "./invoices.remote.ts";
import { command, form } from "./remote-functions.ts";
import { refreshCreditNote, refreshInvoice } from "./server/invoice-refresh.ts";
import { issueInvoice as issue, payInvoice, voidInvoice as cancel } from "./server/invoices.ts";
import { invoice } from "./server/schema.ts";

/** Issues (sends) a draft, today: its orders become invoiced. */
export const issueInvoice = form(v.object({ id: id() }), async ({ id }) => {
	refreshInvoice(await issue(id));
});

/** Records that a sent invoice was paid, today. */
export const markPaid = form(v.object({ id: id() }), async ({ id }) => {
	const paid = await payInvoice(id);
	refreshInvoice(paid);
	for (const credit of paid.settled) refreshCreditNote(credit);
});

/** Marks the selected invoices paid, today: the sent ones (see `canChange`). */
export const bulkMarkPaid = command(idsTarget, async (target) => {
	const result = await bulkChange(target, {
		table: invoice,
		label: invoice.number,
		change: (each) => payInvoice(each.id),
	});
	void getInvoices().refresh();
	void getCreditNotes().refresh();
	return result;
});

/** Voids a draft or a sent invoice: it keeps its number, and its orders go back to completed. */
export const voidInvoice = form(v.object({ id: id() }), async ({ id }) => {
	refreshInvoice(await cancel(id));
});
