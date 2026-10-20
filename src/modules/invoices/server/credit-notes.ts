/**
 * Credit notes on the server: crediting an invoice (some or all of its lines), a standalone credit
 * note (typed in, or another module's through `../api/credit-notes.server.ts`), loading and listing
 * them, the credits of invoices, and their status changes. The rules are in `../credit-note.ts`,
 * paying an invoice with its credit notes in `./settlement.ts`.
 */
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { formatCents } from "#lib/i18n/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import { customer } from "#lib/server/db/schema.ts";
import { nextNumber, type NumberTarget } from "#lib/server/numbering.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused, type Problem } from "#lib/server/refused.ts";

import {
	canCredit,
	type CreditChoice,
	creditLines,
	type CreditLineDraft,
	type CreditProblem,
	creditTotals,
	holdsCredit,
	isIssued,
	remainingOf,
	settlementOf,
} from "../credit-note.ts";
import { canChange, invoiceTotals } from "../invoice.ts";
import { creditNoteNumberFormat, type InvoiceStatus } from "../model.ts";
import { invoiceSubject } from "./invoices.ts";
import { creditNote, creditNoteLine, invoice, invoiceLine } from "./schema.ts";
import { settingsOf } from "./settings.ts";

/** Where credit note numbers are kept, for `nextNumber()`. */
const creditNoteNumbers: NumberTarget = {
	format: creditNoteNumberFormat,
	table: creditNote,
	column: creditNote.number,
};

/** How a credit note shows in the activity log. */
export const creditNoteSubject = (found: { id: number; number: string }): Subject => ({
	type: "credit_note",
	id: found.id,
	label: found.number,
});

// --- What's credited ---------------------------------------------------------------------------

/** The invoice's lines, each with what the credit notes that hold credit took off it, in order. */
export async function creditableLines(tx: Transaction | typeof db, invoiceId: number) {
	const credited = tx
		.select({
			lineId: creditNoteLine.invoiceLineId,
			credited: sql<number>`sum(${creditNoteLine.amount})`.as("credited"),
		})
		.from(creditNoteLine)
		.innerJoin(...tenantJoin(creditNote, creditNoteLine.creditNoteId))
		.where(
			and(
				inTenant(creditNoteLine),
				eq(creditNote.invoiceId, invoiceId),
				ne(creditNote.status, "void"),
			),
		)
		.groupBy(creditNoteLine.invoiceLineId)
		.as("credited");
	return tx
		.select({
			id: invoiceLine.id,
			description: invoiceLine.description,
			detail: invoiceLine.detail,
			quantity: invoiceLine.quantity,
			unitPrice: invoiceLine.unitPrice,
			amount: invoiceLine.amount,
			orderId: invoiceLine.orderId,
			source: invoiceLine.source,
			credited: sql<number>`coalesce(${credited.credited}, 0)`,
		})
		.from(invoiceLine)
		.leftJoin(credited, eq(credited.lineId, invoiceLine.id))
		.where(and(inTenant(invoiceLine), eq(invoiceLine.invoiceId, invoiceId)))
		.orderBy(asc(invoiceLine.id));
}

/**
 * The tenant's credit notes against `invoiceIds` (all of its invoices when left out), with their
 * totals, oldest first.
 */
export async function creditsOf(tx: Transaction | typeof db, invoiceIds?: readonly number[]) {
	if (invoiceIds && !invoiceIds.length) return [];
	const rows = await tx
		.select({
			id: creditNote.id,
			number: creditNote.number,
			status: creditNote.status,
			invoiceId: creditNote.invoiceId,
			vatRate: creditNote.vatRate,
			issuedOn: creditNote.issuedOn,
			settledOn: creditNote.settledOn,
			subtotal: sql<number>`coalesce(sum(${creditNoteLine.amount}), 0)`,
		})
		.from(creditNote)
		.leftJoin(
			creditNoteLine,
			and(eq(creditNoteLine.creditNoteId, creditNote.id), inTenant(creditNoteLine)),
		)
		.where(
			and(
				inTenant(creditNote),
				isNotNull(creditNote.invoiceId),
				invoiceIds ? inList(creditNote.invoiceId, [...invoiceIds]) : undefined,
			),
		)
		.groupBy(creditNote.id)
		.orderBy(asc(creditNote.id));
	return rows.map(({ subtotal, ...row }) => ({
		...row,
		totals: creditTotals(subtotal, row.vatRate),
	}));
}

/** The tenant's credit notes against invoices, by invoice id. */
export async function creditsByInvoice(tx: Transaction | typeof db = db) {
	const byInvoice = new Map<number, Awaited<ReturnType<typeof creditsOf>>>();
	for (const credit of await creditsOf(tx)) {
		const list = byInvoice.get(credit.invoiceId!) ?? [];
		list.push(credit);
		byInvoice.set(credit.invoiceId!, list);
	}
	return byInvoice;
}

/**
 * Of the credit notes of an invoice of `status`, what they credit and what's left of it to pay
 * (nothing once it's paid, see `remainingOf()`) and to credit.
 */
export function creditSummary(
	totals: { subtotal: number; vat: number; total: number },
	credits: { status: InvoiceStatus; totals: { subtotal: number; vat: number; total: number } }[],
	status: InvoiceStatus,
) {
	const issued = credits.filter((credit) => isIssued(credit.status)).map((credit) => credit.totals);
	const held = credits
		.filter((credit) => holdsCredit(credit.status))
		.reduce((sum, credit) => sum + credit.totals.subtotal, 0);
	return {
		/** The issued credit notes' totals together, negative (or zero). */
		credited: issued.reduce((sum, credit) => sum + credit.total, 0),
		/** What's left to pay, after the issued credit notes. */
		remaining: remainingOf(totals, issued, status),
		/** What's left of the subtotal to credit, after the credit notes that aren't void. */
		creditable: Math.max(0, totals.subtotal + held),
	};
}

// --- Making them -------------------------------------------------------------------------------

/** Why a credit can't be made, as the form's messages. */
const problemMessage = (problem: CreditProblem): Problem => {
	switch (problem.kind) {
		case "unknown_line":
			return { path: ["lines"], message: m.invoices_credit_unknown_line() };
		case "more_than_left":
			return {
				path: ["lines"],
				message: m.invoices_credit_more_than_line({
					description: problem.description,
					amount: formatCents(problem.left),
				}),
			};
		case "nothing":
			return { path: ["lines"], message: m.invoices_credit_nothing() };
		case "more_than_invoice":
			return {
				path: ["lines"],
				message: m.invoices_credit_more_than_invoice({ amount: formatCents(problem.left) }),
			};
	}
};

/** Inserts a draft credit note with its lines, numbered, and logs it (on its invoice's card too). */
async function insertCreditNote(
	tx: Transaction,
	values: { customerId: number; invoiceId: number | null; vatRate: number; reason: string },
	lines: CreditLineDraft[],
	parent?: Subject,
) {
	const { organizationId } = currentTenant();
	const number = await nextNumber(tx, creditNoteNumbers);
	const [created] = await tx
		.insert(creditNote)
		.values({ ...values, organizationId, number, status: "draft" })
		.returning({ id: creditNote.id });
	await insertRows(
		tx,
		creditNoteLine,
		lines.map((line) => ({ ...line, organizationId, creditNoteId: created.id })),
	);
	const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
	await recordActivity(tx, {
		action: "created",
		subject: creditNoteSubject({ id: created.id, number }),
		parent,
		// In the language of whoever made it, like the lines.
		note: m.invoices_created_note({ count: lines.length, amount: formatCents(subtotal) }),
	});
	return { id: created.id, number };
}

/**
 * Makes a draft credit note against one of the tenant's sent or paid invoices, for the chosen
 * amounts of its lines (see `creditLines()`), at the invoice's VAT rate, with the next number.
 * Returns its number; refuses (`Refused`) what's wrong with the lines, on the form's `lines`; a 404
 * for an invoice that isn't the tenant's.
 */
export async function creditInvoice(input: {
	invoiceId: number;
	reason: string;
	lines: CreditChoice[];
}): Promise<{ id: number; number: string; invoice: { id: number; number: string } }> {
	return db.transaction(async (tx) => {
		const found = orNotFound(
			await tx.query.invoice.findFirst({ where: idInTenant(invoice, input.invoiceId) }),
			m.invoices_not_found(),
		);
		if (!canCredit(found.status))
			throw new Refused(m.invoices_credit_not_creditable({ number: found.number }));
		const lines = await creditableLines(tx, found.id);
		const left = lines.reduce((sum, line) => sum + line.amount + line.credited, 0);
		const made = creditLines(lines, input.lines, left);
		if ("problems" in made) throw new Refused(...made.problems.map(problemMessage));
		const created = await insertCreditNote(
			tx,
			{
				customerId: found.customerId,
				invoiceId: found.id,
				vatRate: found.vatRate,
				reason: input.reason,
			},
			made.lines,
			invoiceSubject(found),
		);
		return { ...created, invoice: { id: found.id, number: found.number } };
	});
}

/**
 * Makes a draft standalone credit note for one of the tenant's customers, in `tx`, with the next
 * number and the organization's VAT rate (fixed when it's issued). The lines must credit something.
 * A 404 for a customer that isn't the tenant's. The new credit note form and other modules (through
 * `../api/credit-notes.server.ts`) share it.
 */
export async function createStandalone(
	tx: Transaction,
	input: {
		customerId: number;
		reason: string;
		lines: CreditLineDraft[];
		parent?: Subject;
	},
) {
	const { organizationId } = currentTenant();
	orNotFound(
		await tx.query.customer.findFirst({
			columns: { id: true },
			where: idInTenant(customer, input.customerId),
		}),
		m.invoices_customer_not_found(),
	);
	if (input.lines.reduce((sum, line) => sum + line.amount, 0) >= 0)
		throw new Refused(m.invoices_credit_nothing());
	const settings = await settingsOf(organizationId, tx);
	return insertCreditNote(
		tx,
		{
			customerId: input.customerId,
			invoiceId: null,
			vatRate: settings.vatRate,
			reason: input.reason,
		},
		input.lines,
		input.parent,
	);
}

// --- Reading them ------------------------------------------------------------------------------

/** One of the tenant's credit notes with its customer, invoice, lines and totals, or a 404. */
export async function loadCreditNote(number: string) {
	const found = orNotFound(
		await db.query.creditNote.findFirst({
			where: and(eq(creditNote.number, number), inTenant(creditNote)),
			with: {
				customer: true,
				invoice: { columns: { id: true, number: true, status: true, issuedOn: true } },
				lines: {
					orderBy: (line, { asc }) => asc(line.id),
					with: { order: { columns: { number: true } } },
				},
			},
		}),
		m.invoices_credit_number_not_found({ number }),
	);
	return { creditNote: found, totals: invoiceTotals(found.lines, found.vatRate) };
}

/**
 * The tenant's credit notes with their customer, invoice, totals and how a sent one is still to be
 * settled (`settlementOf()`), latest first.
 */
export async function listCreditNotes() {
	const lines = db
		.select({
			creditNoteId: creditNoteLine.creditNoteId,
			subtotal: sql<number>`sum(${creditNoteLine.amount})`.as("subtotal"),
		})
		.from(creditNoteLine)
		.where(inTenant(creditNoteLine))
		.groupBy(creditNoteLine.creditNoteId)
		.as("lines");
	const rows = await db
		.select({
			id: creditNote.id,
			number: creditNote.number,
			status: creditNote.status,
			reason: creditNote.reason,
			issuedOn: creditNote.issuedOn,
			settledOn: creditNote.settledOn,
			vatRate: creditNote.vatRate,
			createdAt: creditNote.createdAt,
			customer: { id: customer.id, code: customer.code, name: customer.name },
			invoice: sql<string | null>`${invoice.number}`,
			invoiceStatus: sql<InvoiceStatus | null>`${invoice.status}`,
			subtotal: sql<number>`coalesce(${lines.subtotal}, 0)`,
		})
		.from(creditNote)
		.innerJoin(...tenantJoin(customer, creditNote.customerId))
		.leftJoin(...tenantJoin(invoice, creditNote.invoiceId))
		.leftJoin(lines, eq(lines.creditNoteId, creditNote.id))
		.where(inTenant(creditNote))
		.orderBy(desc(creditNote.id));
	return rows.map(({ subtotal, invoiceStatus, ...row }) => ({
		...row,
		settlement: settlementOf(row.status, invoiceStatus),
		...creditTotals(subtotal, row.vatRate),
	}));
}

/** The tenant's credit note by id (e.g. from a form), with its lines; or a 404. */
export async function creditNoteById(tx: Transaction, id: number) {
	return orNotFound(
		await tx.query.creditNote.findFirst({
			where: idInTenant(creditNote, id),
			with: {
				lines: { columns: { id: true, amount: true, source: true } },
				invoice: { columns: { id: true, number: true, status: true, vatRate: true } },
			},
		}),
		m.invoices_credit_not_found(),
	);
}

// --- Changing them -----------------------------------------------------------------------------

/** What a credit note is, as in "… is a draft". */
const statusLabel: Record<InvoiceStatus, () => string> = {
	draft: m.invoices_is_draft,
	sent: m.invoices_is_sent,
	paid: m.invoices_credit_is_settled,
	void: m.invoices_is_void,
};

/** What can't be done to it, as in "… can't be issued". */
const changeLabel: Record<InvoiceStatus, () => string> = {
	draft: m.invoices_change_draft,
	sent: m.invoices_change_sent,
	paid: m.invoices_credit_change_settled,
	void: m.invoices_change_void,
};

/** The tenant's credit note by id, if it can go to `to`; refuses otherwise. */
export async function changingCredit(tx: Transaction, id: number, to: InvoiceStatus) {
	const found = await creditNoteById(tx, id);
	if (!canChange(found.status, to)) {
		throw new Refused(
			m.invoices_cannot_change({
				number: found.number,
				status: statusLabel[found.status](),
				change: changeLabel[to](),
			}),
		);
	}
	return found;
}

/** The parent a credit note's entries also show on: its invoice's card. */
export const creditParent = (found: { invoice: { id: number; number: string } | null }) =>
	found.invoice ? invoiceSubject(found.invoice) : undefined;

/** Voids a draft or a sent credit note: it keeps its number, and no longer credits anything. */
export async function voidCredit(id: number) {
	return db.transaction(async (tx) => {
		const found = await changingCredit(tx, id, "void");
		await tx
			.update(creditNote)
			.set({ status: "void", voidedAt: Temporal.Now.instant() })
			.where(idInTenant(creditNote, found.id));
		await recordActivity(tx, {
			action: "voided",
			subject: creditNoteSubject(found),
			parent: creditParent(found),
		});
		return found;
	});
}

/**
 * Records that a sent credit note was settled today: refunded (a standalone one, or one against a
 * paid invoice). One against a sent invoice is settled with the invoice's payment instead.
 */
export async function settleCredit(id: number) {
	return db.transaction(async (tx) => {
		const found = await changingCredit(tx, id, "paid");
		if (found.invoice?.status === "sent") {
			throw new Refused(m.invoices_credit_settled_with_invoice({ number: found.invoice.number }));
		}
		await tx
			.update(creditNote)
			.set({ status: "paid", settledOn: currentDay() })
			.where(idInTenant(creditNote, found.id));
		await recordActivity(tx, {
			action: "settled",
			subject: creditNoteSubject(found),
			parent: creditParent(found),
		});
		return found;
	});
}

/** A sent invoice's remaining amount, after its issued credit notes. */
export async function remainingOfInvoice(tx: Transaction, invoiceId: number) {
	const found = orNotFound(
		await tx.query.invoice.findFirst({
			where: idInTenant(invoice, invoiceId),
			with: { lines: { columns: { amount: true } } },
		}),
		m.invoices_not_found(),
	);
	const credits = await creditsOf(tx, [found.id]);
	return {
		invoice: found,
		...creditSummary(invoiceTotals(found.lines, found.vatRate), credits, found.status),
	};
}
