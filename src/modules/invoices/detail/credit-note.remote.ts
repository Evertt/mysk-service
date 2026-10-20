/**
 * Issuing, settling and voiding a credit note, from its page; the changes are in `../server/`, the
 * rules in `../credit-note.ts`.
 */
import * as v from "valibot";

import { id } from "#lib/schema.ts";

import { form } from "../remote-functions.ts";
import { settleCredit, voidCredit } from "../server/credit-notes.ts";
import { refreshCreditNote, refreshInvoice } from "../server/invoice-refresh.ts";
import { issueCredit } from "../server/settlement.ts";

/** Issues a draft credit note, today; one that leaves nothing of its sent invoice to pay settles it. */
export const issueCreditNote = form(v.object({ id: id() }), async ({ id }) => {
	const { found, paid } = await issueCredit(id);
	refreshCreditNote(found);
	if (paid) refreshInvoice(paid);
});

/** Records that a sent credit note was settled (refunded), today. */
export const settleCreditNote = form(v.object({ id: id() }), async ({ id }) => {
	refreshCreditNote(await settleCredit(id));
});

/** Voids a draft or sent credit note: it keeps its number and credits nothing. */
export const voidCreditNote = form(v.object({ id: id() }), async ({ id }) => {
	refreshCreditNote(await voidCredit(id));
});
