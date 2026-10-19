/**
 * Settling invoices and their credit notes, which go together (see `../credit-note.ts`): paying a
 * sent invoice settles its sent credit notes the same day (they were offset against it), and
 * issuing the credit note that leaves nothing of a sent invoice to pay settles the invoice with
 * them.
 */
import { invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";

import {
	changingCredit,
	creditNoteSubject,
	creditParent,
	remainingOfInvoice,
} from "./credit-notes.ts";
import { invoiceSubject } from "./invoices.ts";
import { creditNote, invoice } from "./schema.ts";
import { settingsOf } from "./settings.ts";

/** Settles the invoice's sent credit notes on `on`: offset against it. Answers which. */
async function settleCredits(
	tx: Transaction,
	found: { id: number; number: string },
	on: Temporal.PlainDate,
) {
	const settled = await tx
		.update(creditNote)
		.set({ status: "paid", settledOn: on })
		.where(
			and(inTenant(creditNote), eq(creditNote.invoiceId, found.id), eq(creditNote.status, "sent")),
		)
		.returning({ id: creditNote.id, number: creditNote.number });
	for (const credit of settled) {
		await recordActivity(tx, {
			action: "settled",
			subject: creditNoteSubject(credit),
			parent: invoiceSubject(found),
			note: m.invoices_credit_offset_note({ number: found.number }),
		});
	}
	return settled;
}

/**
 * Records that a sent invoice was paid on `on`, with its sent credit notes settled; logged, with
 * `note` (e.g. that its credit notes paid it). Answers the credit notes it settled.
 */
export async function recordPayment(
	tx: Transaction,
	found: { id: number; number: string },
	on: Temporal.PlainDate,
	note?: string,
) {
	await tx.update(invoice).set({ status: "paid", paidOn: on }).where(idInTenant(invoice, found.id));
	await recordActivity(tx, { action: "paid", subject: invoiceSubject(found), note });
	return settleCredits(tx, found, on);
}

/**
 * Issues (sends) a draft credit note, today: a standalone one gets the organization's VAT rate then,
 * one against an invoice keeps the invoice's. If it leaves nothing of a sent invoice to pay, the
 * invoice is paid by its credit notes, settled with it. Answers the credit note and, if it was
 * settled so, the invoice.
 */
export async function issueCredit(id: number) {
	const settings = await settingsOf();
	return db.transaction(async (tx) => {
		const found = await changingCredit(tx, id, "sent");
		if (found.lines.reduce((sum, line) => sum + line.amount, 0) >= 0) {
			invalid(m.invoices_credit_nothing());
		}
		const issuedOn = currentDay();
		const issued = {
			status: "sent" as const,
			issuedOn,
			vatRate: found.invoice ? found.invoice.vatRate : settings.vatRate,
		};
		await tx.update(creditNote).set(issued).where(idInTenant(creditNote, found.id));
		// Logged with its VAT rate if that changed (the status and date follow from the verb); an
		// entry with changes that change nothing would log nothing.
		const changed = issued.vatRate !== found.vatRate;
		await recordActivity(tx, {
			action: "issued",
			subject: creditNoteSubject(found),
			parent: creditParent(found),
			...(changed ? { before: found, after: { vatRate: issued.vatRate } } : {}),
		});
		if (found.invoice?.status !== "sent") return { found, paid: null };
		const { invoice: credited, remaining } = await remainingOfInvoice(tx, found.invoice.id);
		if (remaining > 0) return { found, paid: null };
		await recordPayment(
			tx,
			credited,
			issuedOn,
			m.invoices_paid_by_credit_notes({ number: found.number }),
		);
		return { found, paid: credited };
	});
}
