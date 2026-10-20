/**
 * The tenant's credit notes: the list, one credit note, what an invoice can be credited for, and
 * making one, against an invoice or standalone. Its status changes and draft edits are in
 * `detail/credit-note.remote.ts`. The rules are in `./credit-note.ts`.
 */
import { redirect, invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import { canCredit, leftOf, typedCreditLine } from "./credit-note.ts";
import { creditInvoiceFields, standaloneCreditFields } from "./form/credit-note-schema.ts";
import { invoiceTotals } from "./invoice.ts";
import { getInvoice, getInvoices } from "./invoices.remote.ts";
import { form, query } from "./remote-functions.ts";
import {
	creditableLines,
	creditInvoice,
	createStandalone,
	creditsOf,
	creditSummary,
	listCreditNotes,
	loadCreditNote,
} from "./server/credit-notes.ts";
import { invoice } from "./server/schema.ts";

/** The tenant's credit notes with their customer, invoice and totals, latest first. */
export const getCreditNotes = query(async () => listCreditNotes());

/**
 * One credit note with its customer, lines and totals, the organization that sends it, and, for
 * one against an invoice, what's left of that to pay.
 */
export const getCreditNote = query(v.string(), async (number) => {
	const tenant = currentTenant();
	const loaded = await loadCreditNote(number);
	const credited = loaded.creditNote.invoice;
	let remaining: number | null = null;
	if (credited) {
		const found = await db.query.invoice.findFirst({
			where: idInTenant(invoice, credited.id),
			with: { lines: { columns: { amount: true } } },
		});
		if (found) {
			const totals = invoiceTotals(found.lines, found.vatRate);
			remaining = creditSummary(totals, await creditsOf(db, [found.id]), found.status).remaining;
		}
	}
	return { ...loaded, organization: tenant.name, remaining };
});

/**
 * What one of the tenant's invoices can be credited for: its lines, each with what's left of it,
 * and what's left of the invoice; whether it can be credited at all (sent or paid).
 */
export const getCreditable = query(v.string(), async (number) => {
	const found = orNotFound(
		await db.query.invoice.findFirst({
			where: and(eq(invoice.number, number), inTenant(invoice)),
			with: { customer: { columns: { name: true, code: true } } },
		}),
		m.invoices_number_not_found({ number }),
	);
	const lines = await creditableLines(db, found.id);
	const totals = invoiceTotals(lines, found.vatRate);
	const summary = creditSummary(totals, await creditsOf(db, [found.id]), found.status);
	return {
		invoice: {
			id: found.id,
			number: found.number,
			status: found.status,
			vatRate: found.vatRate,
			customer: found.customer,
		},
		creditable: canCredit(found.status) && summary.creditable > 0,
		left: summary.creditable,
		lines: lines.map((line) => ({ ...line, left: leftOf(line) })),
	};
});

/** Makes a draft credit note against an invoice for the chosen lines, then shows it. */
export const createInvoiceCredit = form(v.object(creditInvoiceFields), async (input) => {
	const made = await creditInvoice({
		invoiceId: input.invoiceId,
		reason: input.reason,
		lines: input.lines.flatMap((line) =>
			line.credit ? [{ lineId: line.lineId, amount: line.amount }] : [],
		),
	});
	void getCreditNotes().refresh();
	void getInvoices().refresh();
	void getInvoice(made.invoice.number).refresh();
	redirect(303, `/invoices/credit-notes/${made.number}`);
});

/** Makes a draft standalone credit note for a customer with one line, then shows it. */
export const createCreditNote = form(v.object(standaloneCreditFields), async (input, issue) => {
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	if (!owner) invalid(issue.customerId(m.invoices_unknown_customer()));
	const made = await db.transaction((tx) =>
		createStandalone(tx, {
			customerId: input.customerId,
			reason: input.reason,
			lines: [
				typedCreditLine({ description: input.description, quantity: 1, unitPrice: input.amount }),
			],
		}),
	);
	void getCreditNotes().refresh();
	redirect(303, `/invoices/credit-notes/${made.number}`);
});
