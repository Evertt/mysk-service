/**
 * What's done on a credit note's page: issuing, settling and voiding it, and changing a draft (its
 * lines and its reason, unless another module made it). See `../credit-note.ts` for the rules.
 */
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { deleteAndLog, orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { lineNote } from "../activity.ts";
import { isMadeElsewhere, typedCreditLine } from "../credit-note.ts";
import { reasonFields } from "../form/credit-note-schema.ts";
import { lineFields } from "../form/invoice-schema.ts";
import { isEditable } from "../invoice.ts";
import { form } from "../remote-functions.ts";
import {
	creditNoteById,
	creditNoteSubject,
	creditParent,
	settleCredit,
	voidCredit,
} from "../server/credit-notes.ts";
import { refreshCreditNote, refreshInvoice } from "../server/invoice-refresh.ts";
import { creditNote, creditNoteLine } from "../server/schema.ts";
import { issueCredit } from "../server/settlement.ts";

/** The tenant's draft credit note by id, inside a transaction; refuses anything else. */
async function draftById(tx: Transaction, id: number) {
	const found = await creditNoteById(tx, id);
	if (!isEditable(found.status))
		throw new Refused(m.invoices_not_editable({ number: found.number }));
	return found;
}

/** The tenant's draft credit note by id whose lines may change: not another module's. */
async function linesDraftById(tx: Transaction, id: number) {
	const found = await draftById(tx, id);
	if (isMadeElsewhere(found))
		throw new Refused(m.invoices_credit_lines_elsewhere({ number: found.number }));
	return found;
}

/** The columns of a line the activity log needs. */
const loggedLine = {
	id: creditNoteLine.id,
	description: creditNoteLine.description,
	quantity: creditNoteLine.quantity,
	unitPrice: creditNoteLine.unitPrice,
	amount: creditNoteLine.amount,
};

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

/** Adds a line typed in to a standalone draft: what it credits, as a positive unit price. */
export const addCreditLine = form(v.object({ id: id(), ...lineFields }), async (input) => {
	const { organizationId } = currentTenant();
	const draft = await db.transaction(async (tx) => {
		const draft = await linesDraftById(tx, input.id);
		// One against an invoice credits the invoice's lines only (`creditLines()`).
		if (draft.invoice) throw new Refused(m.invoices_credit_lines_of_invoice());
		const line = typedCreditLine(input);
		const [added] = await tx
			.insert(creditNoteLine)
			.values({ ...line, organizationId, creditNoteId: draft.id })
			.returning(loggedLine);
		await recordActivity(tx, {
			action: "created",
			subject: { type: "credit_note_line", id: added.id, label: added.description },
			parent: creditNoteSubject(draft),
			note: lineNote(added),
		});
		return draft;
	});
	refreshCreditNote(draft);
});

/** Removes a line from a draft credit note. */
export const removeCreditLine = form(v.object({ id: id() }), async ({ id }) => {
	const draft = await db.transaction(async (tx) => {
		const line = orNotFound(
			await tx
				.select({ ...loggedLine, creditNoteId: creditNoteLine.creditNoteId })
				.from(creditNoteLine)
				.where(idInTenant(creditNoteLine, id)),
			m.invoices_line_not_found(),
		);
		const draft = await linesDraftById(tx, line.creditNoteId);
		await deleteAndLog(creditNoteLine, {
			tx,
			subject: { type: "credit_note_line", id: line.id, label: line.description },
			parent: creditNoteSubject(draft),
			note: lineNote(line),
		});
		return draft;
	});
	refreshCreditNote(draft);
});

/** Changes a draft credit note's reason: not another module's, whose reason is that module's too. */
export const updateCreditReason = form(v.object({ id: id(), ...reasonFields }), async (input) => {
	const draft = await db.transaction(async (tx) => {
		const draft = await draftById(tx, input.id);
		if (isMadeElsewhere(draft)) {
			throw new Refused(m.invoices_credit_reason_elsewhere({ number: draft.number }));
		}
		const after = { reason: input.reason };
		await tx.update(creditNote).set(after).where(idInTenant(creditNote, draft.id));
		await recordActivity(tx, {
			action: "updated",
			subject: creditNoteSubject(draft),
			parent: creditParent(draft),
			before: draft,
			after,
		});
		return draft;
	});
	refreshCreditNote(draft);
});
