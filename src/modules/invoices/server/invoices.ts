/**
 * The invoices themselves: making a draft from what can be billed (see `./billable.ts`), changing
 * it and its status, and loading an invoice with its totals, for its page and its PDF, or all of
 * them for the list and the receivables. The rules are in `../invoice.ts`; what credit notes do
 * the same way in `./documents.ts`.
 */
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { formatCents } from "#lib/i18n/index.ts";
import { can } from "#lib/orders/index.ts";
import { transitionOrder } from "#lib/orders/server/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	idInTenant,
	idsInTenant,
	inTenant,
	requireMember,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { insertBatches, insertRows } from "#lib/server/db/parameters.ts";
import { customer, order } from "#lib/server/db/schema.ts";
import { nextNumber, type NumberTarget } from "#lib/server/numbering.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { holdsCredit } from "../credit-note.ts";
import { invoiceState, invoiceTotals } from "../invoice.ts";
import { invoiceNumberFormat } from "../model.ts";
import { alreadyBilled, linesFor } from "./billable.ts";
import { creditsByInvoice, creditSummary, creditsOf } from "./credit-notes.ts";
import { changing, draftById, loggedLine, logLines } from "./documents.ts";
import { invoice, invoiceLine } from "./schema.ts";
import { settingsOf } from "./settings.ts";
import { recordPayment } from "./settlement.ts";

/** Where invoice numbers are kept, for `nextNumber()`. */
const invoiceNumbers: NumberTarget = {
	format: invoiceNumberFormat,
	table: invoice,
	column: invoice.number,
};

/** How an invoice shows in the activity log. */
export const invoiceSubject = (found: { id: number; number: string }): Subject => ({
	type: "invoice",
	id: found.id,
	label: found.number,
});

/** The lines for a customer's chosen orders and items; refuses any that can't be billed. */
async function billableLines(customerId: number, chosen: { orderIds: number[]; items: string[] }) {
	const { lines, unknownOrders, unknownItems } = await linesFor(
		customerId,
		chosen.orderIds,
		chosen.items,
	);
	if (unknownOrders.length) {
		throw new Refused({ path: ["orderIds"], message: m.invoices_only_billable_orders() });
	}
	if (unknownItems.length) {
		throw new Refused({ path: ["items"], message: m.invoices_only_billable_items() });
	}
	return lines;
}

/**
 * Makes a draft invoice for one of the tenant's customers with the chosen completed orders and
 * other modules' items, all of which must be billable (see `linesFor`). It gets the tenant's next
 * number (see `nextNumber`), payment term and VAT rate. Returns its id and number; refuses
 * (`Refused`) what's wrong, on the form's field, and if another request billed some of it
 * meanwhile. The new invoice form and the orders list's "Create invoice" share it.
 */
export async function createDraft(input: {
	customerId: number;
	orderIds: number[];
	items: string[];
}): Promise<{ id: number; number: string }> {
	const { organizationId } = requireMember();
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	if (!owner) throw new Refused({ path: ["customerId"], message: m.invoices_unknown_customer() });

	const lines = await billableLines(input.customerId, input);
	if (!lines.length) throw new Refused(m.invoices_choose_something());

	const settings = await settingsOf();
	return db.transaction(async (tx) => {
		if ((await alreadyBilled(tx, lines)).length) throw new Refused(m.invoices_billed_meanwhile());
		const number = await nextNumber(tx, invoiceNumbers);
		const [created] = await tx
			.insert(invoice)
			.values({
				organizationId,
				number,
				customerId: input.customerId,
				status: "draft",
				paymentTermDays: settings.paymentTermDays,
				vatRate: settings.vatRate,
			})
			.returning({ id: invoice.id });
		await insertRows(
			tx,
			invoiceLine,
			lines.map((line) => ({ ...line, organizationId, invoiceId: created.id })),
		);
		const total = lines.reduce((sum, line) => sum + line.amount, 0);
		await recordActivity(tx, {
			action: "created",
			subject: { type: "invoice", id: created.id, label: number },
			// In the language of whoever made it, like the lines.
			note: m.invoices_created_note({ count: lines.length, amount: formatCents(total) }),
		});
		return { id: created.id, number };
	});
}

/** One of the tenant's invoices with its customer, lines and totals, or a 404. */
export async function loadInvoice(number: string, today = currentDay()) {
	const found = orNotFound(
		await db.query.invoice.findFirst({
			where: and(eq(invoice.number, number), inTenant(invoice)),
			with: {
				customer: true,
				lines: {
					orderBy: (line, { asc }) => asc(line.id),
					with: { order: { columns: { number: true, status: true } } },
				},
			},
		}),
		m.invoices_number_not_found({ number }),
	);
	const totals = invoiceTotals(found.lines, found.vatRate);
	const credits = await creditsOf(db, [found.id]);
	return {
		invoice: { ...found, state: invoiceState(found, today) },
		totals,
		/** Its credit notes, oldest first, and what's left of it to pay and to credit. */
		credits: {
			notes: credits.map(({ id, number, status, issuedOn, settledOn, totals }) => ({
				id,
				number,
				status,
				issuedOn,
				settledOn,
				total: totals.total,
			})),
			...creditSummary(totals, credits, found.status),
		},
	};
}

/** The tenant's invoice by id (e.g. from a form), with its lines' orders; or a 404. */
export async function invoiceById(tx: Transaction, id: number) {
	return orNotFound(
		await tx.query.invoice.findFirst({
			where: idInTenant(invoice, id),
			with: { lines: { columns: { id: true, orderId: true } } },
		}),
		m.invoices_not_found(),
	);
}

/**
 * The tenant's invoices (those `where` keeps, all when left out) with their customer, line count,
 * totals and state, and what their issued credit notes took off (negative) and left to pay;
 * latest first. The list and the dashboard's receivables share it.
 */
export async function invoiceSummaries(where?: SQL) {
	const lines = db
		.select({
			invoiceId: invoiceLine.invoiceId,
			count: count().as("line_count"),
			subtotal: sql<number>`sum(${invoiceLine.amount})`.as("subtotal"),
		})
		.from(invoiceLine)
		.where(inTenant(invoiceLine))
		.groupBy(invoiceLine.invoiceId)
		.as("lines");
	const rows = await db
		.select({
			id: invoice.id,
			number: invoice.number,
			status: invoice.status,
			issuedOn: invoice.issuedOn,
			dueOn: invoice.dueOn,
			paidOn: invoice.paidOn,
			vatRate: invoice.vatRate,
			createdAt: invoice.createdAt,
			customer: { id: customer.id, code: customer.code, name: customer.name },
			lineCount: sql<number>`coalesce(${lines.count}, 0)`,
			subtotal: sql<number>`coalesce(${lines.subtotal}, 0)`,
		})
		.from(invoice)
		.innerJoin(...tenantJoin(customer, invoice.customerId))
		.leftJoin(lines, eq(lines.invoiceId, invoice.id))
		.where(and(inTenant(invoice), where))
		.orderBy(desc(invoice.id));
	const today = currentDay();
	const credits = await creditsByInvoice();
	return rows.map(({ subtotal, ...row }) => {
		const totals = invoiceTotals([{ amount: subtotal }], row.vatRate);
		const { credited, remaining } = creditSummary(totals, credits.get(row.id) ?? [], row.status);
		return { ...row, state: invoiceState(row, today), ...totals, credited, remaining };
	});
}

// --- Changing a draft --------------------------------------------------------------------------

/** Adds more of the customer's orders and items to a draft. Answers the draft. */
export async function addToDraft(input: { id: number; orderIds: number[]; items: string[] }) {
	const { organizationId } = currentTenant();
	const found = orNotFound(
		await db.query.invoice.findFirst({
			columns: { customerId: true },
			where: idInTenant(invoice, input.id),
		}),
		m.invoices_not_found(),
	);
	const lines = await billableLines(found.customerId, input);
	if (!lines.length) throw new Refused(m.invoices_choose_to_add());
	return db.transaction(async (tx) => {
		const draft = await draftById(tx, "invoice", input.id);
		if ((await alreadyBilled(tx, lines)).length) throw new Refused(m.invoices_billed_meanwhile());
		const rows = lines.map((line) => ({ ...line, organizationId, invoiceId: draft.id }));
		const added = [];
		for (const batch of insertBatches(invoiceLine, rows)) {
			added.push(
				...(await tx.insert(invoiceLine).values(batch).returning(loggedLine(invoiceLine))),
			);
		}
		await logLines(tx, "invoice", draft, "created", added);
		return draft;
	});
}

/** Changes a draft's payment term and notes. Answers the draft. */
export async function updateTerms(input: {
	id: number;
	paymentTermDays: number;
	notes: string | null;
}) {
	return db.transaction(async (tx) => {
		const draft = await draftById(tx, "invoice", input.id);
		const terms = { paymentTermDays: input.paymentTermDays, notes: input.notes };
		await tx.update(invoice).set(terms).where(idInTenant(invoice, draft.id));
		const subject = invoiceSubject(draft);
		await recordActivity(tx, { action: "updated", subject, before: draft, after: terms });
		return draft;
	});
}

// --- Changing its status -----------------------------------------------------------------------

/** What an invoice's orders say about their change of status. */
const invoiceNote = (found: { number: string }) =>
	m.invoices_invoice_number({ number: found.number });

const orderIdsOf = (found: { lines: { orderId: number | null }[] }) => [
	...new Set(found.lines.flatMap((line) => (line.orderId ? [line.orderId] : []))),
];

/**
 * Issues (sends) a draft: it gets today's date, its due date and the tenant's current VAT rate,
 * and its orders become invoiced. Its lines keep the amounts they have. Answers it.
 */
export async function issueInvoice(id: number) {
	const settings = await settingsOf();
	return db.transaction(async (tx) => {
		const found = await changing(tx, "invoice", id, "sent");
		if (!found.lines.length) throw new Refused(m.invoices_add_before_issuing());

		const orderIds = orderIdsOf(found);
		if (orderIds.length) {
			const orders = await tx
				.select({ id: order.id, number: order.number, status: order.status })
				.from(order)
				.where(idsInTenant(order, orderIds));
			const undone = orders.filter((o) => !can("invoice", o.status)).map((o) => o.number);
			if (undone.length) {
				throw new Refused(
					m.invoices_orders_not_completed({ count: undone.length, orders: undone.join(", ") }),
				);
			}
			await transitionOrder(tx, { verb: "invoice", orders, note: invoiceNote(found) });
		}

		// Today, the user's.
		const issuedOn = currentDay();
		const issued = {
			status: "sent" as const,
			issuedOn,
			dueOn: issuedOn.add({ days: found.paymentTermDays }),
			vatRate: settings.vatRate,
		};
		await tx.update(invoice).set(issued).where(idInTenant(invoice, found.id));
		// The status follows from the verb.
		const subject = invoiceSubject(found);
		const ignore = ["status", "issuedOn"];
		await recordActivity(tx, { action: "issued", subject, before: found, after: issued, ignore });
		return found;
	});
}

/**
 * Records that one of the tenant's sent invoices was paid, today, settling its sent credit notes
 * (`recordPayment()`); refuses any other. Answers it, with the credit notes it settled. The
 * invoice's page and the list's bulk action share it.
 */
export function payInvoice(id: number) {
	return db.transaction(async (tx) => {
		const found = await changing(tx, "invoice", id, "paid");
		const settled = await recordPayment(tx, found, currentDay());
		return { ...found, settled };
	});
}

/**
 * Voids a draft or a sent invoice. It keeps its number and lines, but no longer bills them: its
 * orders go back to completed and its items can be billed again. Answers it.
 */
export async function voidInvoice(id: number) {
	return db.transaction(async (tx) => {
		const found = await changing(tx, "invoice", id, "void");
		const credits = (await creditsOf(tx, [found.id])).filter((each) => holdsCredit(each.status));
		if (credits.length) {
			throw new Refused(
				m.invoices_void_has_credit_notes({
					number: found.number,
					credits: credits.map((each) => each.number).join(", "),
				}),
			);
		}
		const orderIds = orderIdsOf(found);
		if (found.status === "sent" && orderIds.length) {
			// Only those still invoiced go back.
			const invoiced = await tx
				.select({ id: order.id, number: order.number, status: order.status })
				.from(order)
				.where(and(idsInTenant(order, orderIds), eq(order.status, "invoiced")));
			await transitionOrder(tx, { verb: "uninvoice", orders: invoiced, note: invoiceNote(found) });
		}
		await tx
			.update(invoice)
			.set({ status: "void", voidedAt: Temporal.Now.instant() })
			.where(idInTenant(invoice, found.id));
		await recordActivity(tx, { action: "voided", subject: invoiceSubject(found) });
		return found;
	});
}
