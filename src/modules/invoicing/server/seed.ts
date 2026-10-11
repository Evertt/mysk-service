import { en, Faker, nl } from "@faker-js/faker";

import { formatCode } from "#lib/numbering.ts";
import { addDays, DAY, now } from "#lib/server/db/seed/clock.ts";
import {
	defineSeed,
	type SeedCollectors,
	type SeedOrder,
} from "#lib/server/db/seed/module-seed.ts";
import type { TenantData } from "#lib/server/db/seed/tenant.ts";

import { dueDate, itemLine, type LineDraft, orderLines } from "../invoice.ts";
import { invoiceNumberFormat } from "../model.ts";
import { invoice, invoiceLine, invoicingSettings } from "./schema.ts";

/** From when the demo tenants bill contract fees through the app (see the invoicing settings). */
const billFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);

/** The part of a tenant's core data that the invoices follow from. */
type InvoicedData = Pick<TenantData, "engineers" | "orders" | "orderLines">;

/**
 * Invoices for the orders the generator marked invoiced: one per customer for each month's work,
 * issued early the next month, with that month's fees that other modules offer (a contract's) from
 * `billFrom` on (so only this month's are still to bill). Older ones are paid; of the last two
 * months', some are still open, and past their due date overdue. A few were voided and issued
 * again, and two customers have a
 * draft for their completed orders. Priced like `priceOrders()` does, and billed like invoicing
 * does, which the seed can't call: through the tenant's modules' collectors (see `module-seed.ts`).
 * With a faker of its own, so the rest of the data is the same with or without it.
 */
function generateInvoices(data: InvoicedData, seed: number, collect: SeedCollectors) {
	const random = new Faker({ locale: [nl, en] });
	random.seed(seed);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const engineers = new Map(data.engineers.map((e) => [e.id, e]));
	const linesOf = Map.groupBy(data.orderLines, (line) => line.orderId);

	/** An order's price, as `priceOrders()` makes it with the tenant's modules. */
	function price(o: SeedOrder) {
		const materials = (linesOf.get(o.id) ?? []).reduce(
			(sum, line) => sum + Math.round(line.quantity * line.unitPrice),
			0,
		);
		const rate = o.engineerId ? engineers.get(o.engineerId)!.hourlyRate : 8500;
		const labor = Math.round(o.laborHours * rate);
		const adjustments = collect.adjustPrices(o, { materials, labor });
		const total = Math.max(
			0,
			adjustments.reduce((sum, adjustment) => sum + adjustment.amount, materials + labor),
		);
		return { costs: [{ amount: materials }], labor, adjustments, total };
	}

	// The seed's texts are in Dutch.
	const billedDetail = "Materialen en arbeid";
	// One invoice per customer and month of work (or of fees).
	const groups = new Map<string, { customerId: number; month: Date; lines: LineDraft[] }>();
	const groupOf = (customerId: number, date: Date) => {
		const month = new Date(date.getFullYear(), date.getMonth(), 1);
		const key = `${month.getTime()}:${customerId}`;
		if (!groups.has(key)) groups.set(key, { customerId, month, lines: [] });
		return groups.get(key)!;
	};
	const invoiced = data.orders
		.filter((o) => o.status === "invoiced")
		.sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());
	for (const o of invoiced)
		groupOf(o.customerId, o.completedAt!).lines.push(...orderLines(o, price(o), billedDetail));
	const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
	for (const item of collect.billableItems({ from: billFrom, until: lastMonthEnd })) {
		groupOf(item.customerId, item.date).lines.push(itemLine(item));
	}

	const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);
	const atNine = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9);
	const issued = [...groups.values()]
		.sort((a, b) => a.month.getTime() - b.month.getTime() || a.customerId - b.customerId)
		.flatMap(({ customerId, month, lines }) => {
			const third = new Date(month.getFullYear(), month.getMonth() + 1, 3);
			const issuedOn = third < today ? third : today;
			const age = days(issuedOn, today);
			const paid =
				age > 75 ||
				(age > 30 && random.datatype.boolean(0.7)) ||
				(age >= 2 && random.datatype.boolean(0.35));
			const paidAfter = random.number.int({ min: Math.min(3, age), max: Math.min(age, 45) });
			const invoice = {
				customerId,
				issuedOn,
				dueOn: dueDate(issuedOn, 30),
				status: paid ? ("paid" as const) : ("sent" as const),
				paidOn: paid ? dueDate(issuedOn, paidAfter) : null,
				voidedAt: null as Date | null,
				createdAt: atNine(issuedOn),
				lines,
			};
			// Now and then one went out wrong, was voided and issued again.
			if (!random.datatype.boolean(0.04)) return [invoice];
			const voided = {
				...invoice,
				status: "void" as const,
				paidOn: null,
				voidedAt: new Date(invoice.createdAt.getTime() + 2 * 60 * 60 * 1000),
			};
			return [voided, invoice];
		});

	// Drafts for two customers' completed orders.
	const completed = data.orders.filter(
		(o) => o.status === "completed" && o.completedAt! < addDays(now, -3),
	);
	const drafted = random.helpers.arrayElements(
		[...new Set(completed.map((o) => o.customerId))],
		Math.min(2, completed.length),
	);
	const drafts = drafted.map((customerId) => ({
		customerId,
		issuedOn: null,
		dueOn: null,
		status: "draft" as const,
		paidOn: null,
		voidedAt: null,
		createdAt: addDays(now, -1),
		lines: completed
			.filter((o) => o.customerId === customerId)
			.flatMap((o) => orderLines(o, price(o), billedDetail)),
	}));

	return [...issued, ...drafts].map((invoice, i) => ({
		...invoice,
		id: i + 1,
		number: formatCode(
			invoiceNumberFormat,
			i + 1,
			(invoice.issuedOn ?? invoice.createdAt).getFullYear(),
		),
		paymentTermDays: 30,
		vatRate: 21,
	}));
}

export default defineSeed<InvoicedData>({
	clear: async (tx) => {
		await tx.delete(invoiceLine);
		await tx.delete(invoice);
		await tx.delete(invoicingSettings);
	},

	// What the invoices follow from; they are made in `run()`, when every module has made its data
	// and can be asked what it adds to prices and what it bills (the collectors).
	generate: ({ engineers, orders, orderLines }) => ({ engineers, orders, orderLines }),

	async run({ tx, tenants, insertAll, count }) {
		// Ids are global, so each tenant's invoices follow the ones before.
		let offset = 0;
		for (const tenant of tenants) {
			const invoices = generateInvoices(tenant.data, tenant.seed, tenant.collect);
			const invoiceRows = invoices.map(({ lines: _lines, ...row }) => ({
				...row,
				organizationId: tenant.id,
				id: row.id + offset,
				customerId: tenant.customerIds[row.customerId - 1],
			}));
			const lineRows = invoices.flatMap((row) =>
				row.lines.map((line) => ({
					...line,
					organizationId: tenant.id,
					invoiceId: row.id + offset,
					orderId: line.orderId && tenant.orderIds[line.orderId - 1],
				})),
			);
			const settings = [{ organizationId: tenant.id, vatRate: 21, paymentTermDays: 30, billFrom }];
			await insertAll(invoiceRows, (chunk) => tx.insert(invoice).values(chunk));
			await insertAll(lineRows, (chunk) => tx.insert(invoiceLine).values(chunk));
			await insertAll(settings, (chunk) => tx.insert(invoicingSettings).values(chunk));
			count("invoices", invoiceRows);
			count("invoiceLines", lineRows);
			count("invoicingSettings", settings);
			offset += invoiceRows.length;
		}
	},
});
