import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import * as v from "valibot";

import { getSubjectActivity } from "#lib/components/activity/activity.remote.js";
import { lineNote } from "#lib/components/invoicing/activity.js";
import {
	canChange,
	dueDate,
	invoiceNumber,
	invoiceState,
	invoiceTotals,
	isEditable,
	lineAmount,
	SEQUENCE_START,
	today,
} from "#lib/components/invoicing/invoice.js";
import { formatCents } from "#lib/format.js";
import type { InvoiceStatus, OrderStatus } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { db } from "#lib/server/db/index.js";
import { customer, invoice, invoiceLine, invoicingSettings, order } from "#lib/server/db/schema.js";
import {
	alreadyBilled,
	billableFor,
	invoiceById,
	linesFor,
	loadInvoice,
	settingsOf,
	type Transaction,
} from "#lib/server/invoicing.js";
import { inTenant, requireModule, requireRole } from "#lib/server/session.js";

import {
	billingFields,
	lineFields,
	newInvoiceFields,
	settingsFields,
	termsFields,
} from "./invoice-schema.js";

/** Who may change the organization's invoicing settings. */
const managers = ["owner", "admin"];

/** The tenant's invoices with their customer and totals, latest first. */
export const getInvoices = query(async () => {
	requireModule("invoicing");
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
		.innerJoin(customer, and(eq(invoice.customerId, customer.id), inTenant(customer)))
		.leftJoin(lines, eq(lines.invoiceId, invoice.id))
		.where(inTenant(invoice))
		.orderBy(desc(invoice.id));

	const now = new Date();
	return rows.map(({ subtotal, ...row }) => ({
		...row,
		state: invoiceState(row, now),
		...invoiceTotals([{ amount: subtotal }], row.vatRate),
	}));
});

/** One invoice with its customer, lines and totals, and the organization that sends it. */
export const getInvoice = query(v.string(), async (number) => {
	const tenant = requireModule("invoicing");
	return { ...(await loadInvoice(number)), organization: tenant.name };
});

/** The customers to choose from for a new invoice. */
export const getCustomers = query(async () => {
	requireModule("invoicing");
	return db
		.select({ id: customer.id, code: customer.code, name: customer.name })
		.from(customer)
		.where(inTenant(customer))
		.orderBy(asc(customer.name));
});

/**
 * What a customer can be billed for now: their completed orders that aren't on an invoice, with
 * the lines they become, and other modules' items (e.g. contract fees).
 */
export const getBillable = query(v.number(), async (customerId) => {
	requireModule("invoicing");
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: and(eq(customer.id, customerId), inTenant(customer)),
	});
	if (!owner) error(404, m.invoices_customer_not_found());

	const { orders, items } = await billableFor(customerId);
	return {
		orders: orders.map(({ lines, ...rest }) => ({
			...rest,
			lines: lines.map(({ description, detail, amount }) => ({ description, detail, amount })),
		})),
		items: items.map(({ reference, description, detail, quantity, unitPrice, date }) => ({
			reference,
			description,
			detail: detail ?? null,
			amount: lineAmount(quantity, unitPrice),
			date,
		})),
	};
});

// --- Making and changing drafts ----------------------------------------------------------------

/** How an invoice shows in the activity log. */
const subjectOf = (found: { id: number; number: string }) => ({
	type: "invoice",
	id: found.id,
	label: found.number,
});

/** Logs lines added to an invoice, against it. */
async function recordLines(
	tx: Transaction,
	found: { id: number; number: string },
	lines: { id: number; description: string; quantity: number; unitPrice: number; amount: number }[],
) {
	for (const line of lines) {
		await recordActivity(tx, {
			action: "created",
			subject: { type: "invoice_line", id: line.id, label: line.description },
			parent: subjectOf(found),
			note: lineNote(line),
		});
	}
}

/** The columns of a line the activity log needs. */
const loggedLine = {
	id: invoiceLine.id,
	description: invoiceLine.description,
	quantity: invoiceLine.quantity,
	unitPrice: invoiceLine.unitPrice,
	amount: invoiceLine.amount,
};

/**
 * Creates a draft for a customer with the chosen orders and items, then shows it. It gets the
 * tenant's next number (see `invoiceNumber`), and the tenant's payment term and VAT rate.
 */
export const createInvoice = form(v.object(newInvoiceFields), async (input, issue) => {
	const { organizationId } = requireModule("invoicing");
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: and(eq(customer.id, input.customerId), inTenant(customer)),
	});
	if (!owner) invalid(issue.customerId(m.invoices_unknown_customer()));

	const { lines, unknownOrders, unknownItems } = await linesFor(
		input.customerId,
		input.orderIds,
		input.items,
	);
	if (unknownOrders.length) invalid(issue.orderIds(m.invoices_only_billable_orders()));
	if (unknownItems.length) invalid(issue.items(m.invoices_only_billable_items()));
	if (!lines.length) invalid(m.invoices_choose_something());

	const settings = await settingsOf(organizationId);
	const number = await db.transaction(async (tx) => {
		if ((await alreadyBilled(tx, lines)).length) invalid(m.invoices_billed_meanwhile());
		const [last] = await tx
			.select({
				sequence: sql<
					number | null
				>`max(cast(substr(${invoice.number}, ${SEQUENCE_START}) as integer))`,
			})
			.from(invoice)
			.where(inTenant(invoice));
		const number = invoiceNumber(new Date().getFullYear(), (last?.sequence ?? 0) + 1);
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
		await tx
			.insert(invoiceLine)
			.values(lines.map((line) => ({ ...line, organizationId, invoiceId: created.id })));
		const total = lines.reduce((sum, line) => sum + line.amount, 0);
		await recordActivity(tx, {
			action: "created",
			subject: subjectOf({ id: created.id, number }),
			// In the language of whoever made it, like the lines.
			note: m.invoices_created_note({ count: lines.length, amount: formatCents(total) }),
		});
		return number;
	});
	void getInvoices().refresh();
	// The draft's page offers what's left to bill.
	void getBillable(input.customerId).refresh();
	redirect(303, `/invoices/${number}`);
});

/** The tenant's draft by id, inside a transaction; refuses anything else. */
async function draftById(tx: Transaction, id: number) {
	const found = await invoiceById(tx, id);
	if (!isEditable(found.status)) invalid(m.invoices_not_editable({ number: found.number }));
	return found;
}

/** Refreshes what shows a changed invoice. */
function changed(found: { id: number; number: string; customerId: number }) {
	void getInvoices().refresh();
	void getInvoice(found.number).refresh();
	void getBillable(found.customerId).refresh();
	void getSubjectActivity({ type: "invoice", id: String(found.id) }).refresh();
}

/** Adds more of the customer's orders and items to a draft. */
export const addToInvoice = form(
	v.object({ id: id(), ...billingFields }),
	async ({ id, orderIds, items }, issue) => {
		const { organizationId } = requireModule("invoicing");
		const found = await db.query.invoice.findFirst({
			columns: { customerId: true },
			where: and(eq(invoice.id, id), inTenant(invoice)),
		});
		if (!found) error(404, m.invoices_not_found());

		const { lines, unknownOrders, unknownItems } = await linesFor(
			found.customerId,
			orderIds,
			items,
		);
		if (unknownOrders.length) invalid(issue.orderIds(m.invoices_only_billable_orders()));
		if (unknownItems.length) invalid(issue.items(m.invoices_only_billable_items()));
		if (!lines.length) invalid(m.invoices_choose_to_add());

		const draft = await db.transaction(async (tx) => {
			const draft = await draftById(tx, id);
			if ((await alreadyBilled(tx, lines)).length) invalid(m.invoices_billed_meanwhile());
			const added = await tx
				.insert(invoiceLine)
				.values(lines.map((line) => ({ ...line, organizationId, invoiceId: draft.id })))
				.returning(loggedLine);
			await recordLines(tx, draft, added);
			return draft;
		});
		changed(draft);
	},
);

/** Adds a line typed in by hand to a draft. */
export const addLine = form(v.object({ id: id(), ...lineFields }), async (input) => {
	const { organizationId } = requireModule("invoicing");
	const draft = await db.transaction(async (tx) => {
		const draft = await draftById(tx, input.id);
		const added = await tx
			.insert(invoiceLine)
			.values({
				organizationId,
				invoiceId: draft.id,
				description: input.description,
				quantity: input.quantity,
				unitPrice: input.unitPrice,
				amount: lineAmount(input.quantity, input.unitPrice),
			})
			.returning(loggedLine);
		await recordLines(tx, draft, added);
		return draft;
	});
	changed(draft);
});

/** Removes a line from a draft; an order's lines (its price and adjustments) go together. */
export const removeLine = form(v.object({ id: id() }), async ({ id }) => {
	requireModule("invoicing");
	const draft = await db.transaction(async (tx) => {
		const line = await tx.query.invoiceLine.findFirst({
			columns: { id: true, invoiceId: true, orderId: true },
			where: and(eq(invoiceLine.id, id), inTenant(invoiceLine)),
		});
		if (!line) error(404, m.invoices_line_not_found());
		const draft = await draftById(tx, line.invoiceId);
		const removed = await tx
			.delete(invoiceLine)
			.where(
				and(
					inTenant(invoiceLine),
					eq(invoiceLine.invoiceId, draft.id),
					line.orderId ? eq(invoiceLine.orderId, line.orderId) : eq(invoiceLine.id, line.id),
				),
			)
			.returning(loggedLine);
		for (const gone of removed) {
			await recordActivity(tx, {
				action: "deleted",
				subject: { type: "invoice_line", id: gone.id, label: gone.description },
				parent: subjectOf(draft),
				note: lineNote(gone),
			});
		}
		return draft;
	});
	changed(draft);
});

/** Changes a draft's payment term and notes. */
export const updateTerms = form(v.object({ id: id(), ...termsFields }), async (input) => {
	requireModule("invoicing");
	const draft = await db.transaction(async (tx) => {
		const draft = await draftById(tx, input.id);
		const terms = { paymentTermDays: input.paymentTermDays, notes: input.notes };
		await tx
			.update(invoice)
			.set(terms)
			.where(and(eq(invoice.id, draft.id), inTenant(invoice)));
		const subject = subjectOf(draft);
		await recordActivity(tx, { action: "updated", subject, before: draft, after: terms });
		return draft;
	});
	changed(draft);
});

// --- Issuing, payment and voiding --------------------------------------------------------------

/** What an invoice is, as in "… is a draft". */
const statusLabel: Record<InvoiceStatus, () => string> = {
	draft: m.invoices_is_draft,
	sent: m.invoices_is_sent,
	paid: m.invoices_is_paid,
	void: m.invoices_is_void,
};

/** What can't be done to it, as in "… can't be issued". */
const changeLabel: Record<InvoiceStatus, () => string> = {
	draft: m.invoices_change_draft,
	sent: m.invoices_change_sent,
	paid: m.invoices_change_paid,
	void: m.invoices_change_void,
};

/** The tenant's invoice by id, if it can go to `to`; refuses otherwise. */
async function changing(tx: Transaction, id: number, to: InvoiceStatus) {
	const found = await invoiceById(tx, id);
	if (!canChange(found.status, to)) {
		invalid(
			m.invoices_cannot_change({
				number: found.number,
				status: statusLabel[found.status](),
				change: changeLabel[to](),
			}),
		);
	}
	return found;
}

const orderIdsOf = (found: { lines: { orderId: number | null }[] }) => [
	...new Set(found.lines.flatMap((line) => (line.orderId ? [line.orderId] : []))),
];

/** Logs the change of status of an invoice's orders, which issuing or voiding it makes. */
async function recordOrderStatuses(
	tx: Transaction,
	orders: { id: number; number: string; status: OrderStatus }[],
	status: OrderStatus,
	found: { number: string },
) {
	for (const changed of orders) {
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "order", id: changed.id, label: changed.number },
			before: changed,
			after: { status },
			note: m.invoices_invoice_number({ number: found.number }),
		});
	}
}

/**
 * Issues (sends) a draft: it gets today's date, its due date and the tenant's current VAT rate,
 * and its orders become invoiced. Its lines keep the amounts they have.
 */
export const issueInvoice = form(v.object({ id: id() }), async ({ id }) => {
	const { organizationId } = requireModule("invoicing");
	const settings = await settingsOf(organizationId);
	const found = await db.transaction(async (tx) => {
		const found = await changing(tx, id, "sent");
		if (!found.lines.length) invalid(m.invoices_add_before_issuing());

		const orderIds = orderIdsOf(found);
		if (orderIds.length) {
			const orders = await tx
				.select({ id: order.id, number: order.number, status: order.status })
				.from(order)
				.where(and(inArray(order.id, orderIds), inTenant(order)));
			const undone = orders.filter((o) => o.status !== "completed").map((o) => o.number);
			if (undone.length) {
				invalid(
					m.invoices_orders_not_completed({ count: undone.length, orders: undone.join(", ") }),
				);
			}
			await tx
				.update(order)
				.set({ status: "invoiced" })
				.where(and(inArray(order.id, orderIds), inTenant(order)));
			await recordOrderStatuses(tx, orders, "invoiced", found);
		}

		const issuedOn = today();
		const issued = {
			status: "sent" as const,
			issuedOn,
			dueOn: dueDate(issuedOn, found.paymentTermDays),
			vatRate: settings.vatRate,
		};
		await tx
			.update(invoice)
			.set(issued)
			.where(and(eq(invoice.id, found.id), inTenant(invoice)));
		// The status follows from the verb.
		const subject = subjectOf(found);
		const ignore = ["status", "issuedOn"];
		await recordActivity(tx, { action: "issued", subject, before: found, after: issued, ignore });
		return found;
	});
	changed(found);
});

/** Records that a sent invoice was paid, today. */
export const markPaid = form(v.object({ id: id() }), async ({ id }) => {
	requireModule("invoicing");
	const found = await db.transaction(async (tx) => {
		const found = await changing(tx, id, "paid");
		await tx
			.update(invoice)
			.set({ status: "paid", paidOn: today() })
			.where(and(eq(invoice.id, found.id), inTenant(invoice)));
		await recordActivity(tx, { action: "paid", subject: subjectOf(found) });
		return found;
	});
	changed(found);
});

/**
 * Voids a draft or a sent invoice. It keeps its number and lines, but no longer bills them: its
 * orders go back to completed and its items can be billed again.
 */
export const voidInvoice = form(v.object({ id: id() }), async ({ id }) => {
	requireModule("invoicing");
	const found = await db.transaction(async (tx) => {
		const found = await changing(tx, id, "void");
		const orderIds = orderIdsOf(found);
		if (found.status === "sent" && orderIds.length) {
			const orders = await tx
				.update(order)
				.set({ status: "completed" })
				.where(and(inArray(order.id, orderIds), eq(order.status, "invoiced"), inTenant(order)))
				.returning({ id: order.id, number: order.number });
			const before = orders.map((o) => ({ ...o, status: "invoiced" as const }));
			await recordOrderStatuses(tx, before, "completed", found);
		}
		await tx
			.update(invoice)
			.set({ status: "void", voidedAt: new Date() })
			.where(and(eq(invoice.id, found.id), inTenant(invoice)));
		await recordActivity(tx, { action: "voided", subject: subjectOf(found) });
		return found;
	});
	changed(found);
});

// --- Settings ----------------------------------------------------------------------------------

export const getSettings = query(async () => {
	const tenant = requireModule("invoicing");
	const settings = await settingsOf(tenant.organizationId);
	return { ...settings, canManage: tenant.roles.some((role) => managers.includes(role)) };
});

export const saveSettings = form(v.object(settingsFields), async (input) => {
	requireModule("invoicing");
	const { organizationId } = requireRole(...managers);
	const before = await settingsOf(organizationId);
	await db.transaction(async (tx) => {
		await tx
			.update(invoicingSettings)
			.set(input)
			.where(eq(invoicingSettings.organizationId, organizationId));
		// The settings have no name of their own: they read as "invoicing settings".
		const subject = { type: "invoicing_settings", id: organizationId, label: "" };
		await recordActivity(tx, { action: "updated", subject, before, after: input });
	});
	void getSettings().refresh();
	redirect(303, "/invoices");
});
