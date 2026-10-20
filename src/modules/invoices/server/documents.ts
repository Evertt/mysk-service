/**
 * What's done the same way to both kinds of billing document (`../document.ts`): changing one's
 * status (`changing()`), finding a draft, and adding or removing a draft's lines typed in, logged
 * against the document. What only one kind does is in `./invoices.ts` and `./credit-notes.ts`.
 */
import { and, eq } from "drizzle-orm";

import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { lineNote } from "../activity.ts";
import { isMadeElsewhere, typedCreditLine } from "../credit-note.ts";
import type { DocumentKind } from "../document.ts";
import { canChange, isEditable, lineAmount } from "../invoice.ts";
import { invoicesLabels } from "../labels.ts";
import type { InvoiceStatus } from "../model.ts";
import { creditNoteById, creditNoteSubject } from "./credit-notes.ts";
import { invoiceById, invoiceSubject } from "./invoices.ts";
import { creditNoteLine, invoiceLine } from "./schema.ts";

/** The tenant's document of `kind` by id (e.g. from a form); or a 404. */
const byId = { invoice: invoiceById, creditNote: creditNoteById };

type Found<Kind extends DocumentKind> = Awaited<ReturnType<(typeof byId)[Kind]>>;

/** The tenant's document of `kind` by id, if it can go to `to`; refuses otherwise. */
export async function changing<Kind extends DocumentKind>(
	tx: Transaction,
	kind: Kind,
	id: number,
	to: InvoiceStatus,
) {
	const found = (await byId[kind](tx, id)) as Found<Kind>;
	if (!canChange(found.status, to)) {
		throw new Refused(
			m.invoices_cannot_change({
				number: found.number,
				status: invoicesLabels.label(`${kind}Is`, found.status),
				change: invoicesLabels.label(`${kind}Change`, to),
			}),
		);
	}
	return found;
}

/** The tenant's draft of `kind` by id, inside a transaction; refuses anything else. */
export async function draftById<Kind extends DocumentKind>(
	tx: Transaction,
	kind: Kind,
	id: number,
) {
	const found = (await byId[kind](tx, id)) as Found<Kind>;
	if (!isEditable(found.status)) {
		throw new Refused(m.invoices_not_editable({ number: found.number }));
	}
	return found;
}

/** The tenant's draft credit note by id whose lines may change: not another module's. */
async function creditLinesDraft(tx: Transaction, id: number) {
	const found = await draftById(tx, "creditNote", id);
	if (isMadeElsewhere(found)) {
		throw new Refused(m.invoices_credit_lines_elsewhere({ number: found.number }));
	}
	return found;
}

/** The columns of a line the activity log needs. */
export const loggedLine = (table: typeof invoiceLine | typeof creditNoteLine) => ({
	id: table.id,
	description: table.description,
	quantity: table.quantity,
	unitPrice: table.unitPrice,
	amount: table.amount,
});

/** Logs lines added to (`created`) or removed from (`deleted`) a document, against it. */
export async function logLines(
	tx: Transaction,
	kind: DocumentKind,
	found: { id: number; number: string },
	action: "created" | "deleted",
	lines: { id: number; description: string; quantity: number; unitPrice: number; amount: number }[],
) {
	const parent = kind === "invoice" ? invoiceSubject(found) : creditNoteSubject(found);
	const type = kind === "invoice" ? "invoice_line" : "credit_note_line";
	for (const line of lines) {
		await recordActivity(tx, {
			action,
			subject: { type, id: line.id, label: line.description },
			parent,
			note: lineNote(line),
		});
	}
}

/**
 * Adds a line typed in to a draft: on an invoice as it's typed, on a standalone credit note what it
 * credits (a positive price, see `typedCreditLine()`). One against an invoice credits the invoice's
 * lines only (`creditLines()`). Answers the draft.
 */
export async function addDraftLine(
	kind: DocumentKind,
	id: number,
	input: { description: string; quantity: number; unitPrice: number },
) {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		if (kind === "invoice") {
			const draft = await draftById(tx, kind, id);
			const amount = lineAmount(input.quantity, input.unitPrice);
			const added = await tx
				.insert(invoiceLine)
				.values({ ...input, amount, organizationId, invoiceId: draft.id })
				.returning(loggedLine(invoiceLine));
			await logLines(tx, kind, draft, "created", added);
			return draft;
		}
		const draft = await creditLinesDraft(tx, id);
		if (draft.invoice) throw new Refused(m.invoices_credit_lines_of_invoice());
		const added = await tx
			.insert(creditNoteLine)
			.values({ ...typedCreditLine(input), organizationId, creditNoteId: draft.id })
			.returning(loggedLine(creditNoteLine));
		await logLines(tx, kind, draft, "created", added);
		return draft;
	});
}

/**
 * Removes a line from a draft; an invoice's order's lines (its price and adjustments) go together.
 * Answers the draft.
 */
export async function removeDraftLine(kind: DocumentKind, lineId: number) {
	return db.transaction(async (tx) => {
		if (kind === "invoice") {
			const line = orNotFound(
				await tx.query.invoiceLine.findFirst({
					columns: { id: true, invoiceId: true, orderId: true },
					where: idInTenant(invoiceLine, lineId),
				}),
				m.invoices_line_not_found(),
			);
			const draft = await draftById(tx, kind, line.invoiceId);
			const removed = await tx
				.delete(invoiceLine)
				.where(
					and(
						inTenant(invoiceLine),
						eq(invoiceLine.invoiceId, draft.id),
						line.orderId ? eq(invoiceLine.orderId, line.orderId) : eq(invoiceLine.id, line.id),
					),
				)
				.returning(loggedLine(invoiceLine));
			await logLines(tx, kind, draft, "deleted", removed);
			return draft;
		}
		const line = orNotFound(
			await tx.query.creditNoteLine.findFirst({
				columns: { creditNoteId: true },
				where: idInTenant(creditNoteLine, lineId),
			}),
			m.invoices_line_not_found(),
		);
		const draft = await creditLinesDraft(tx, line.creditNoteId);
		const removed = await tx
			.delete(creditNoteLine)
			.where(idInTenant(creditNoteLine, lineId))
			.returning(loggedLine(creditNoteLine));
		await logLines(tx, kind, draft, "deleted", removed);
		return draft;
	});
}
