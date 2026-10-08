/**
 * The server side of the invoicing module (see `#lib/modules.ts`): what a customer can be billed
 * for, an invoice with its totals (for its page and its PDF), and the module's hook into core (see
 * `#lib/server/modules.ts`). The rules themselves are in `#lib/components/invoicing/invoice.ts`.
 *
 * A customer can be billed for their completed orders, priced by `priceOrders()` like everywhere
 * else, and for what the tenant's other modules offer through `billableItems()` (e.g. a contract's
 * monthly fees). Either is billed while it's on an invoice that isn't void: on a draft, or sent or
 * paid. Issuing an invoice marks its orders invoiced; voiding a sent one puts them back.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, asc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";

import {
	invoiceState,
	invoiceTotals,
	itemLine,
	type LineDraft,
	orderLines,
	today,
} from "#lib/components/invoicing/invoice.js";
// The module's queries, to refresh; they use this file in turn.
import { getOrderInvoice } from "#lib/components/invoicing/invoicing.remote.js";
import { formatCents } from "#lib/format.js";
import { m } from "#lib/paraglide/messages.js";

import { recordActivity } from "./activity.ts";
import { db, type Transaction } from "./db/index.ts";
import { customer, engineer, invoice, invoiceLine, invoicingSettings, order } from "./db/schema.ts";
import { type BillableItem, billableItems, type ServerModule } from "./modules.ts";
import { nextNumber } from "./numbering.ts";
import { materialsPerOrder, priceOrders } from "./pricing.ts";
import { idInTenant, inTenant, requireMember, tenantJoin } from "./session.ts";

export const invoicing: ServerModule = {
	orderSaved(number) {
		void getOrderInvoice(number).refresh();
	},
};

/**
 * The tenant's invoicing settings. Made with the defaults the first time they're needed, billing
 * other modules' items from the start of that month.
 */
export async function settingsOf(organizationId = requireMember().organizationId) {
	const where = eq(invoicingSettings.organizationId, organizationId);
	const found = await db.query.invoicingSettings.findFirst({ where });
	if (found) return found;
	const now = new Date();
	await db
		.insert(invoicingSettings)
		.values({ organizationId, billFrom: new Date(now.getFullYear(), now.getMonth(), 1) })
		.onConflictDoNothing();
	return (await db.query.invoicingSettings.findFirst({ where }))!;
}

/** A completed order that can be billed, with the lines it becomes. */
export interface BillableOrder {
	id: number;
	number: string;
	description: string;
	completedAt: Date | null;
	lines: LineDraft[];
	total: number;
}

/** The customer's completed orders that aren't on an invoice yet, oldest first, priced. */
async function billableOrders(customerId: number): Promise<BillableOrder[]> {
	const materials = materialsPerOrder();

	const rows = await db
		.select({
			id: order.id,
			number: order.number,
			description: order.description,
			type: order.type,
			status: order.status,
			equipmentId: order.equipmentId,
			createdAt: order.createdAt,
			completedAt: order.completedAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
			materials: sql<number>`coalesce(${materials.total}, 0)`,
		})
		.from(order)
		.leftJoin(materials, eq(materials.orderId, order.id))
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(
			and(
				inTenant(order),
				eq(order.customerId, customerId),
				eq(order.status, "completed"),
				notExists(
					db
						.select({ id: invoiceLine.id })
						.from(invoiceLine)
						.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
						.where(
							and(
								inTenant(invoiceLine),
								eq(invoiceLine.orderId, order.id),
								ne(invoice.status, "void"),
							),
						),
				),
			),
		)
		.orderBy(asc(order.completedAt), asc(order.number));

	const prices = await priceOrders(rows);
	return rows.map((row, i) => ({
		id: row.id,
		number: row.number,
		description: row.description,
		completedAt: row.completedAt,
		lines: orderLines(row, prices[i], m.invoices_line_materials_labour()),
		total: prices[i].total,
	}));
}

/** Of `references`, the ones on the tenant's invoices that aren't void. */
async function billedReferences(references: string[]) {
	if (!references.length) return new Set<string>();
	const rows = await db
		.select({ source: invoiceLine.source })
		.from(invoiceLine)
		.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
		.where(
			and(
				inTenant(invoiceLine),
				inArray(invoiceLine.source, references),
				ne(invoice.status, "void"),
			),
		);
	return new Set(rows.map((row) => row.source));
}

/** The modules' items for the customer that are due by `at` and not billed yet. */
async function unbilledItems(customerId: number, at: Date): Promise<BillableItem[]> {
	const settings = await settingsOf();
	const items = await billableItems(customerId, { from: settings.billFrom, until: today(at) });
	const done = await billedReferences(items.map((item) => item.reference));
	return items.filter((item) => !done.has(item.reference));
}

/** What the customer can be billed for now: completed orders and other modules' items. */
export async function billableFor(customerId: number, at = new Date()) {
	const [orders, items] = await Promise.all([
		billableOrders(customerId),
		unbilledItems(customerId, at),
	]);
	return { orders, items };
}

/**
 * The lines for the chosen orders and items of what the customer can be billed for. Lists what
 * was chosen but can't be billed (another tenant's or customer's, not completed, already billed,
 * or made up).
 */
export async function linesFor(customerId: number, orderIds: number[], references: string[]) {
	const { orders, items } = await billableFor(customerId);
	const chosenOrders = orders.filter((o) => orderIds.includes(o.id));
	const chosenItems = items.filter((item) => references.includes(item.reference));
	return {
		lines: [...chosenOrders.flatMap((o) => o.lines), ...chosenItems.map(itemLine)],
		unknownOrders: orderIds.filter((id) => !chosenOrders.some((o) => o.id === id)),
		unknownItems: references.filter((ref) => !chosenItems.some((item) => item.reference === ref)),
	};
}

/**
 * Inside a transaction: which of `lines` are billed meanwhile (by another request that got there
 * first), as order ids and references. Empty if none.
 */
export async function alreadyBilled(
	tx: Transaction,
	lines: Pick<LineDraft, "orderId" | "source">[],
) {
	const orderIds = [...new Set(lines.flatMap((line) => (line.orderId ? [line.orderId] : [])))];
	const sources = lines.flatMap((line) => (line.source ? [line.source] : []));
	if (!orderIds.length && !sources.length) return [];
	return tx
		.select({ orderId: invoiceLine.orderId, source: invoiceLine.source })
		.from(invoiceLine)
		.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
		.where(
			and(
				inTenant(invoiceLine),
				ne(invoice.status, "void"),
				or(
					orderIds.length ? inArray(invoiceLine.orderId, orderIds) : undefined,
					sources.length ? inArray(invoiceLine.source, sources) : undefined,
				),
			),
		);
}

/** Why a draft can't be made, at the field it's about (if any). */
export interface DraftProblem {
	field?: "customerId" | "orderIds" | "items";
	message: string;
}

/**
 * Makes a draft invoice for one of the tenant's customers with the chosen completed orders and
 * other modules' items, all of which must be billable (see `linesFor`). It gets the tenant's next
 * number (see `nextNumber`), payment term and VAT rate. Returns its number, or what's wrong;
 * refuses with `invalid()` if another request billed some of it meanwhile. The new invoice form
 * and the orders list's "Create invoice" share it.
 */
export async function createDraft(input: {
	customerId: number;
	orderIds: number[];
	items: string[];
}): Promise<{ id: number; number: string } | { problem: DraftProblem }> {
	const { organizationId } = requireMember();
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	if (!owner) return { problem: { field: "customerId", message: m.invoices_unknown_customer() } };

	const { lines, unknownOrders, unknownItems } = await linesFor(
		input.customerId,
		input.orderIds,
		input.items,
	);
	if (unknownOrders.length) {
		return { problem: { field: "orderIds", message: m.invoices_only_billable_orders() } };
	}
	if (unknownItems.length) {
		return { problem: { field: "items", message: m.invoices_only_billable_items() } };
	}
	if (!lines.length) return { problem: { message: m.invoices_choose_something() } };

	const settings = await settingsOf(organizationId);
	return db.transaction(async (tx) => {
		if ((await alreadyBilled(tx, lines)).length) invalid(m.invoices_billed_meanwhile());
		const number = await nextNumber(tx, "invoice");
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
			subject: { type: "invoice", id: created.id, label: number },
			// In the language of whoever made it, like the lines.
			note: m.invoices_created_note({ count: lines.length, amount: formatCents(total) }),
		});
		return { id: created.id, number };
	});
}

/** One of the tenant's invoices with its customer, lines and totals, or a 404. */
export async function loadInvoice(number: string, now = new Date()) {
	const found = await db.query.invoice.findFirst({
		where: and(eq(invoice.number, number), inTenant(invoice)),
		with: {
			customer: true,
			lines: {
				orderBy: (line, { asc }) => asc(line.id),
				with: { order: { columns: { number: true, status: true } } },
			},
		},
	});
	if (!found) error(404, m.invoices_number_not_found({ number }));
	return {
		invoice: { ...found, state: invoiceState(found, now) },
		totals: invoiceTotals(found.lines, found.vatRate),
	};
}

/** The tenant's invoice by id (e.g. from a form), with its lines' orders; or a 404. */
export async function invoiceById(tx: Transaction, id: number) {
	const found = await tx.query.invoice.findFirst({
		where: idInTenant(invoice, id),
		with: { lines: { columns: { id: true, orderId: true } } },
	});
	if (!found) error(404, m.invoices_not_found());
	return found;
}
