import { en, Faker, nl } from "@faker-js/faker";

import { formatCode } from "#lib/numbering.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { addDays, DAY, HOUR, now, today } from "#lib/server/db/seed/clock.ts";
import {
	defineSeed,
	type SeedCollectors,
	type SeedOrder,
} from "#lib/server/db/seed/module-seed.ts";
import { fromDay, toDay, toMoment, toMomentOrNull } from "#lib/server/db/seed/temporal.ts";
import type { TenantData } from "#lib/server/db/seed/tenant.ts";

import { type CreditLineDraft, typedCreditLine } from "../credit-note.ts";
import { itemLine, type LineDraft, orderLines } from "../invoice.ts";
import { creditNoteNumberFormat, invoiceNumberFormat } from "../model.ts";
import { creditNote, creditNoteLine, invoice, invoiceLine, invoicingSettings } from "./schema.ts";

/** From when the demo tenants bill contract fees through the app (see the invoicing settings). */
const billFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);

/** The part of a tenant's core data that the invoices follow from. */
type InvoicedData = Pick<TenantData, "engineers" | "orders">;

/**
 * Invoices for the orders the generator marked invoiced: one per customer for each month's work,
 * issued early the next month, with that month's fees that other modules offer (a contract's) from
 * `billFrom` on (so only this month's are still to bill). Older ones are paid; of the last two
 * months', some are still open, and past their due date overdue. A few were voided and issued
 * again, and two customers have a
 * draft for their completed orders; a few credit notes follow (`generateCredits()`). Priced like `priceOrders()` does, and billed like invoicing
 * does, which the seed can't call: through the tenant's modules' collectors (see `module-seed.ts`).
 * With a faker of its own, so the rest of the data is the same with or without it.
 */
function generateInvoices(data: InvoicedData, seed: number, collect: SeedCollectors) {
	const random = new Faker({ locale: [nl, en] });
	random.seed(seed);
	const engineers = new Map(data.engineers.map((e) => [e.id, e]));

	/** An order's price, as `priceOrders()` makes it with the tenant's modules. */
	function price(o: SeedOrder) {
		const costs = collect.costs(o);
		const costsTotal = costs.reduce((sum, cost) => sum + cost.amount, 0);
		const rate = o.engineerId ? engineers.get(o.engineerId)!.hourlyRate : 8500;
		const labor = Math.round(o.laborHours * rate);
		const adjustments = collect.adjustPrices(o, { costs: costsTotal, labor });
		const total = Math.max(
			0,
			adjustments.reduce((sum, adjustment) => sum + adjustment.amount, costsTotal + labor),
		);
		return { costs, labor, adjustments, total };
	}

	// What an order's line says it is, like `orderLineDetail()` in `billable.ts`, in Dutch (the
	// seed's texts are): "Materialen en arbeid", or "Arbeid" without costs.
	const detailOf = (o: SeedOrder) => {
		const costs = collect.costs(o);
		return costs.length ? `${costs.map((cost) => cost.label).join(", ")} en arbeid` : "Arbeid";
	};
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
		groupOf(o.customerId, o.completedAt!).lines.push(...orderLines(o, price(o), detailOf(o)));
	const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
	for (const item of collect.billableItems({ from: toDay(billFrom), until: toDay(lastMonthEnd) })) {
		groupOf(item.customerId, fromDay(item.date)).lines.push(itemLine(item));
	}

	const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);
	/** `days` calendar days after `day`. */
	const dueDate = (day: Date, after: number) =>
		new Date(day.getFullYear(), day.getMonth(), day.getDate() + after);
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
				voidedAt: new Date(invoice.createdAt.getTime() + 2 * HOUR),
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
			.flatMap((o) => orderLines(o, price(o), detailOf(o))),
	}));

	const invoices = [...issued, ...drafts].map((invoice, i) => ({
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
	// After the invoices, with the faker where they left it: they stay the same.
	return { invoices, credits: generateCredits(invoices, random, today) };
}

/** An invoice as `generateInvoices()` makes it, as far as its credit notes need it. */
interface SeedInvoice {
	id: number;
	customerId: number;
	status: "draft" | "sent" | "paid" | "void";
	issuedOn: Date | null;
	paidOn: Date | null;
	lines: LineDraft[];
}

/** A credit note of the demo, with its lines; an invoice's line by its place on the invoice. */
interface SeedCredit {
	customerId: number;
	/** The invoice it credits (the draft's id), none if standalone. */
	invoiceId: number | null;
	reason: string;
	status: "draft" | "sent" | "paid";
	issuedOn: Date | null;
	settledOn: Date | null;
	createdAt: Date;
	lines: (CreditLineDraft & { lineIndex: number | null })[];
}

/**
 * A few credit notes (see `../credit-note.ts`): part of an order's line on a paid invoice (a
 * returned part, refunded a week after the payment), part of one on a sent invoice (a correction,
 * taken off what's left to pay) and a goodwill credit on its own, still to refund. Only for what's
 * there: a tenant without paid or sent invoices gets fewer.
 */
function generateCredits(invoices: SeedInvoice[], random: Faker, today: Date): SeedCredit[] {
	const notAfterToday = (day: Date) => (day > today ? today : day);
	/** The first order line of the invoice worth crediting part of, by its place. */
	const orderLine = (invoice: SeedInvoice) =>
		invoice.lines.findIndex((line) => line.orderId && line.amount >= 20_000);
	/** `share` of a line, in whole euros, as the credit (negative). */
	const partOf = (invoice: SeedInvoice, lineIndex: number, share: number, detail: string) => {
		const line = invoice.lines[lineIndex];
		const amount = -Math.round((line.amount * share) / 100) * 100;
		return {
			description: line.description,
			detail,
			quantity: 1,
			unitPrice: amount,
			amount,
			invoiceLineId: null,
			orderId: line.orderId,
			source: line.source,
			lineIndex,
		};
	};

	const credits: SeedCredit[] = [];
	const paid = invoices.filter(
		(invoice) =>
			invoice.status === "paid" && invoice.paidOn! < addDays(today, -14) && orderLine(invoice) >= 0,
	);
	if (paid.length) {
		const returned = random.helpers.arrayElement(paid.slice(-12));
		credits.push({
			customerId: returned.customerId,
			invoiceId: returned.id,
			reason: "Onderdeel geretourneerd",
			status: "paid",
			issuedOn: notAfterToday(addDays(returned.paidOn!, 3)),
			settledOn: notAfterToday(addDays(returned.paidOn!, 10)),
			createdAt: notAfterToday(addDays(returned.paidOn!, 3)),
			lines: [partOf(returned, orderLine(returned), 0.3, "Retour: ongebruikt onderdeel")],
		});
	}
	const sent = invoices.filter((invoice) => invoice.status === "sent" && orderLine(invoice) >= 0);
	if (sent.length) {
		const corrected = random.helpers.arrayElement(sent);
		credits.push({
			customerId: corrected.customerId,
			invoiceId: corrected.id,
			reason: "Correctie: minder arbeidsuren dan gefactureerd",
			status: "sent",
			issuedOn: notAfterToday(addDays(corrected.issuedOn!, 5)),
			settledOn: null,
			createdAt: notAfterToday(addDays(corrected.issuedOn!, 5)),
			lines: [partOf(corrected, orderLine(corrected), 0.2, "Een uur arbeid minder")],
		});
	}
	const customers = [...new Set(invoices.map((invoice) => invoice.customerId))];
	if (customers.length) {
		const issuedOn = addDays(today, -5);
		credits.push({
			customerId: random.helpers.arrayElement(customers),
			invoiceId: null,
			reason: "Coulance na herhaalde storing",
			status: "sent",
			issuedOn,
			settledOn: null,
			createdAt: issuedOn,
			lines: [
				{
					...typedCreditLine({ description: "Coulancebedrag", quantity: 1, unitPrice: 15_000 }),
					lineIndex: null,
				},
			],
		});
	}
	return credits.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export default defineSeed<InvoicedData>({
	// What the invoices follow from; they are made in `run()`, when every module has made its data
	// and can be asked what it adds to prices and what it bills (the collectors).
	generate: ({ engineers, orders }) => ({ engineers, orders }),

	async run({ tx, tenants, ids, count }) {
		for (const tenant of tenants) {
			const { invoices, credits } = generateInvoices(tenant.data, tenant.seed, tenant.collect);
			const invoiceId = ids.claim(invoice, invoices.length);
			const lineId = ids.claim(
				invoiceLine,
				invoices.reduce((sum, row) => sum + row.lines.length, 0),
			);
			const creditNoteId = ids.claim(creditNote, credits.length);
			const invoiceRows = invoices.map(({ lines: _lines, ...row }) => ({
				...row,
				organizationId: tenant.id,
				id: invoiceId(row.id),
				customerId: tenant.customerId(row.customerId),
				issuedOn: row.issuedOn && toDay(row.issuedOn),
				dueOn: row.dueOn && toDay(row.dueOn),
				paidOn: row.paidOn && toDay(row.paidOn),
				voidedAt: toMomentOrNull(row.voidedAt),
				createdAt: toMoment(row.createdAt),
			}));
			const lineRows = invoices
				.flatMap((row) =>
					row.lines.map((line) => ({
						...line,
						organizationId: tenant.id,
						invoiceId: invoiceId(row.id),
						orderId: line.orderId && tenant.orderId(line.orderId),
					})),
				)
				.map((row, i) => ({ ...row, id: lineId(i + 1) }));
			/** The id of an invoice's line, by the invoice's draft id and the line's place on it. */
			const lineIds = new Map<string, number>();
			let next = 0;
			for (const row of invoices) {
				for (const [i] of row.lines.entries()) lineIds.set(`${row.id}:${i}`, lineId(++next));
			}
			const creditRows = credits.map((credit, i) => ({
				id: creditNoteId(i + 1),
				organizationId: tenant.id,
				number: formatCode(
					creditNoteNumberFormat,
					i + 1,
					(credit.issuedOn ?? credit.createdAt).getFullYear(),
				),
				customerId: tenant.customerId(credit.customerId),
				invoiceId: credit.invoiceId && invoiceId(credit.invoiceId),
				status: credit.status,
				vatRate: 21,
				reason: credit.reason,
				issuedOn: credit.issuedOn && toDay(credit.issuedOn),
				settledOn: credit.settledOn && toDay(credit.settledOn),
				createdAt: toMoment(credit.createdAt),
			}));
			const creditLineRows = credits.flatMap((credit, i) =>
				credit.lines.map(({ lineIndex, ...line }) => ({
					...line,
					organizationId: tenant.id,
					creditNoteId: creditNoteId(i + 1),
					invoiceLineId:
						credit.invoiceId && lineIndex !== null
							? lineIds.get(`${credit.invoiceId}:${lineIndex}`)!
							: null,
					orderId: line.orderId && tenant.orderId(line.orderId),
				})),
			);
			const settings = [
				{ organizationId: tenant.id, vatRate: 21, paymentTermDays: 30, billFrom: toDay(billFrom) },
			];
			await insertRows(tx, invoice, invoiceRows);
			await insertRows(tx, invoiceLine, lineRows);
			await insertRows(tx, invoicingSettings, settings);
			await insertRows(tx, creditNote, creditRows);
			await insertRows(tx, creditNoteLine, creditLineRows);
			count("invoices", invoiceRows);
			count("invoiceLines", lineRows);
			count("invoicingSettings", settings);
			count("creditNotes", creditRows);
			count("creditNoteLines", creditLineRows);
		}
	},
});
