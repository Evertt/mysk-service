import type { PriceAdjustment } from "#lib/orders/extensions.ts";

/**
 * What an invoice is, as rules: its number, its totals, where it stands, and the lines an order
 * turns into. The one place that says so; the server applies it (`server/`, the remote functions
 * in `routes/(app)/invoices/`) and the pages show it. Without imports at runtime, so the seed
 * script can use it too.
 *
 * - **Numbers** are sequential per organization, across years: `INV-2026-00001`, `INV-2027-00002`,
 *   … (`invoiceNumberFormat` in `./model.ts`). A draft gets its number when it's made; a draft that isn't needed
 *   is voided rather than deleted, so there are no gaps.
 * - **Status**: a draft is issued (sent), then paid; a draft or a sent invoice can be voided. A
 *   sent invoice past its due date is overdue; that isn't stored.
 * - **Totals** are in cents: the subtotal is the sum of the lines, the VAT is the subtotal times
 *   the rate rounded to the cent (half away from zero), the total is both.
 * - **Orders** become a line at their price before adjustments (labour and the costs the tenant's
 *   modules add, e.g. materials), followed by
 *   a line per adjustment of the tenant's modules (e.g. what a contract includes, negative). The
 *   lines add up to the order's total from `priceOrders()`.
 */
import type { InvoiceStatus } from "./model.ts";

// --- Status ----------------------------------------------------------------------------------

/** What an invoice shows: its status, with sent ones past their due date as overdue. */
export const invoiceStates = ["draft", "sent", "overdue", "paid", "void"] as const;
export type InvoiceState = (typeof invoiceStates)[number];

/** The day after `date`, at midnight. */
const nextDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/** Whether a sent invoice is overdue at `now`: from the day after its due date. */
export const isOverdue = (
	invoice: { status: InvoiceStatus; dueOn: Date | null },
	now = new Date(),
) => invoice.status === "sent" && !!invoice.dueOn && now >= nextDay(invoice.dueOn);

export const invoiceState = (
	invoice: { status: InvoiceStatus; dueOn: Date | null },
	now = new Date(),
): InvoiceState => (isOverdue(invoice, now) ? "overdue" : invoice.status);

/** Where an invoice of each status can go next. */
const nextStatuses: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
	draft: ["sent", "void"],
	sent: ["paid", "void"],
	paid: [],
	void: [],
};

export const canChange = (from: InvoiceStatus, to: InvoiceStatus) =>
	nextStatuses[from].includes(to);

/** Only drafts can have their lines and terms changed. */
export const isEditable = (status: InvoiceStatus) => status === "draft";

/** Today at midnight. */
export const today = (now = new Date()) =>
	new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** The last day to pay an invoice issued on `issuedOn` with a term of `days`. */
export const dueDate = (issuedOn: Date, days: number) =>
	new Date(issuedOn.getFullYear(), issuedOn.getMonth(), issuedOn.getDate() + days);

// --- Amounts ---------------------------------------------------------------------------------

/** Rounds to whole cents, halves away from zero (so a refund rounds like a charge). */
export const roundCents = (cents: number) =>
	// `|| 0`: no negative zero, which would show as "-€0.00".
	Math.sign(cents) * Math.round(Math.abs(cents)) || 0;

/** A line's amount in cents: quantity × unit price. */
export const lineAmount = (quantity: number, unitPrice: number) => roundCents(quantity * unitPrice);

/** The VAT on `subtotal` (in cents) at `rate` percent. */
export const vatOf = (subtotal: number, rate: number) => roundCents((subtotal * rate) / 100);

export interface InvoiceTotals {
	subtotal: number;
	vat: number;
	total: number;
}

export function invoiceTotals(
	lines: readonly { amount: number }[],
	vatRate: number,
): InvoiceTotals {
	const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
	const vat = vatOf(subtotal, vatRate);
	return { subtotal, vat, total: subtotal + vat };
}

// --- Lines -----------------------------------------------------------------------------------

/** A line to put on an invoice. */
export interface LineDraft {
	description: string;
	detail: string | null;
	quantity: number;
	unitPrice: number;
	amount: number;
	orderId: number | null;
	source: string | null;
}

/** A line of a fixed amount, e.g. an order's price or a monthly fee. */
const single = (
	description: string,
	detail: string | null | undefined,
	amount: number,
	reference: { orderId?: number; source?: string },
): LineDraft => ({
	description,
	detail: detail ?? null,
	quantity: 1,
	unitPrice: amount,
	amount,
	orderId: reference.orderId ?? null,
	source: reference.source ?? null,
});

/**
 * The lines for an order: its costs (e.g. materials) and labour, then each adjustment. They add up
 * to the order's `total`, which is never below zero: should the adjustments take off more than the
 * order costs, the last one takes off only what's left. `detail` is the first line's detail, e.g.
 * "Materials and labour" in the language of whoever bills it (lines are stored as text).
 */
export function orderLines(
	order: { id: number; number: string; description: string },
	price: {
		costs: readonly { amount: number }[];
		labor: number;
		adjustments: PriceAdjustment[];
		total: number;
	},
	detail: string,
): LineDraft[] {
	const gross = price.costs.reduce((sum, cost) => sum + cost.amount, price.labor);
	const lines = [
		single(`${order.number}: ${order.description}`, detail, gross, {
			orderId: order.id,
		}),
		...price.adjustments.map((adjustment) =>
			single(adjustment.label, adjustment.detail, adjustment.amount, { orderId: order.id }),
		),
	];
	const sum = lines.reduce((total, line) => total + line.amount, 0);
	if (sum !== price.total && lines.length > 1) {
		const last = lines[lines.length - 1];
		last.amount = last.unitPrice = last.amount + price.total - sum;
	}
	return lines;
}

/** The line for another module's billable item. */
export const itemLine = (item: {
	reference: string;
	description: string;
	detail?: string;
	quantity: number;
	unitPrice: number;
}): LineDraft => ({
	description: item.description,
	detail: item.detail ?? null,
	quantity: item.quantity,
	unitPrice: item.unitPrice,
	amount: lineAmount(item.quantity, item.unitPrice),
	orderId: null,
	source: item.reference,
});
