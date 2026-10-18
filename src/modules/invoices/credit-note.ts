/**
 * What a credit note is, as rules: what it may credit, its lines, where it stands, and what's left
 * to pay of an invoice it credits. The server applies them (`server/credit-notes.ts`), the pages
 * show them. Like `./invoice.ts`, it imports nothing that needs SvelteKit, so the seed uses it too.
 *
 * - **A credit note** is a table of its own (`creditNote` in `server/schema.ts`, which says why),
 *   numbered in a series of its own (`CN-2026-0001`, `creditNoteNumberFormat` in `./model.ts`).
 *   Its lines are negative; its subtotal, VAT and total follow from them like an invoice's
 *   (`invoiceTotals()`), at the credited invoice's VAT rate, or the organization's for a standalone
 *   one.
 * - **Against an invoice**, a sent or paid one: some or all of its lines, each by an amount up to
 *   what's left of it after the earlier credit notes that aren't void (drafts too, so two drafts
 *   can't credit the same), and all of it together never more than what's left of the invoice's
 *   subtotal. A line that takes back a discount (a positive credit) is allowed, as long as the
 *   whole still credits something.
 * - **Status**: as an invoice's (`canChange()`): a draft is issued (sent), then settled (`paid`:
 *   refunded, or offset against its invoice) or voided. It's never overdue.
 * - **What's left to pay** of a sent invoice is its total less its issued credit notes' totals.
 *   Once nothing is left (all of it credited), the invoice is settled by them: marked paid, with
 *   them, when the last is issued. A sent invoice that's paid settles its sent credit notes the same
 *   day, as they were offset against it. Nothing is left of a paid invoice: a credit note against
 *   it, or a standalone one, is settled when the office refunds it.
 * - **Another module's** standalone credit note (`isMadeElsewhere()`) keeps the lines it was made
 *   with, and its reason: they're that module's figures (the partner programme's bonus, frozen
 *   with its year).
 */
import { invoiceTotals, lineAmount, type InvoiceTotals } from "./invoice.ts";
import type { InvoiceStatus } from "./model.ts";

// --- Status ----------------------------------------------------------------------------------

/** What a credit note shows: its status, without overdue. `paid` reads as settled. */
export const creditNoteStates = ["draft", "sent", "paid", "void"] as const;
export type CreditNoteState = (typeof creditNoteStates)[number];

/** Which invoices can be credited: sent or paid (a draft is changed instead, a void one bills nothing). */
export const canCredit = (status: InvoiceStatus) => status === "sent" || status === "paid";

/** Whether a credit note holds its credit against the invoice: unless it's void. */
export const holdsCredit = (status: InvoiceStatus) => status !== "void";

/** Whether a credit note changes what's owed: once it's issued (sent or settled). */
export const isIssued = (status: InvoiceStatus) => status === "sent" || status === "paid";

/**
 * How a sent credit note is still to be settled: refunded by the office (a standalone one, or one
 * against a paid invoice), or offset against the sent invoice it credits (settled with its payment).
 */
export const creditSettlements = ["refund", "offset"] as const;
export type CreditSettlement = (typeof creditSettlements)[number];

/**
 * How a credit note in `status` is still to be settled, against an invoice in `invoiceStatus`
 * (`null` for a standalone one); none unless it's sent.
 */
export function settlementOf(
	status: InvoiceStatus,
	invoiceStatus: InvoiceStatus | null,
): CreditSettlement | null {
	if (status !== "sent") return null;
	return invoiceStatus === "sent" ? "offset" : "refund";
}

// --- Crediting an invoice ----------------------------------------------------------------------

/** A line of an invoice, with what the credit notes that hold credit took off it already. */
export interface CreditableLine {
	id: number;
	description: string;
	detail: string | null;
	quantity: number;
	unitPrice: number;
	amount: number;
	orderId: number | null;
	source: string | null;
	/** The sum of the credit notes' lines on it, opposite in sign to its amount (or zero). */
	credited: number;
}

/** What's left to credit of a line, in cents: as signed as its amount, or zero. */
export const leftOf = (line: Pick<CreditableLine, "amount" | "credited">) =>
	line.amount + line.credited;

/** How much of a line to credit: an amount in cents up to what's left of it, in its direction. */
export interface CreditChoice {
	lineId: number;
	amount: number;
}

/** A line to put on a credit note. */
export interface CreditLineDraft {
	description: string;
	detail: string | null;
	quantity: number;
	unitPrice: number;
	amount: number;
	invoiceLineId: number | null;
	orderId: number | null;
	source: string | null;
}

/** Why a credit can't be made, with what the message needs. */
export type CreditProblem =
	| { kind: "unknown_line"; lineId: number }
	| { kind: "more_than_left"; lineId: number; description: string; left: number }
	| { kind: "nothing" }
	| { kind: "more_than_invoice"; left: number };

/**
 * The lines of a credit note for `chosen` of the invoice's `lines` (amounts of zero are left out),
 * or what's wrong: a line that isn't the invoice's, more than is left of a line, nothing credited,
 * or more than is left of the invoice's subtotal (`left`: the subtotal less the earlier credit
 * notes that hold credit). A line credited in full mirrors it (its quantity at minus its price);
 * part of one is a single amount.
 */
export function creditLines(
	lines: readonly CreditableLine[],
	chosen: readonly CreditChoice[],
	left: number,
): { lines: CreditLineDraft[] } | { problems: CreditProblem[] } {
	const problems: CreditProblem[] = [];
	const drafts: CreditLineDraft[] = [];
	for (const choice of chosen) {
		if (!choice.amount) continue;
		const line = lines.find((each) => each.id === choice.lineId);
		if (!line) {
			problems.push({ kind: "unknown_line", lineId: choice.lineId });
			continue;
		}
		const remaining = Math.abs(leftOf(line));
		if (choice.amount < 0 || choice.amount > remaining) {
			problems.push({
				kind: "more_than_left",
				lineId: line.id,
				description: line.description,
				left: remaining,
			});
			continue;
		}
		const amount = -Math.sign(line.amount) * choice.amount;
		const mirrored =
			!line.credited &&
			choice.amount === Math.abs(line.amount) &&
			lineAmount(line.quantity, -line.unitPrice) === amount;
		drafts.push({
			description: line.description,
			detail: line.detail,
			quantity: mirrored ? line.quantity : 1,
			unitPrice: mirrored ? -line.unitPrice : amount,
			amount,
			invoiceLineId: line.id,
			orderId: line.orderId,
			source: line.source,
		});
	}
	if (problems.length) return { problems };
	const subtotal = drafts.reduce((sum, line) => sum + line.amount, 0);
	if (!drafts.length || subtotal >= 0) return { problems: [{ kind: "nothing" }] };
	if (-subtotal > left)
		return { problems: [{ kind: "more_than_invoice", left: Math.max(0, left) }] };
	return { lines: drafts };
}

/** A line typed in on a standalone credit note: what it credits, as a positive unit price. */
export const typedCreditLine = (line: {
	description: string;
	detail?: string | null;
	quantity: number;
	unitPrice: number;
	source?: string | null;
}): CreditLineDraft => ({
	description: line.description,
	detail: line.detail ?? null,
	quantity: line.quantity,
	unitPrice: -line.unitPrice,
	amount: lineAmount(line.quantity, -line.unitPrice),
	invoiceLineId: null,
	orderId: null,
	source: line.source ?? null,
});

/**
 * Whether another module made a standalone credit note (the partner programme's cash bonus,
 * through `api/credit-notes.server.ts`): a line of it refers to that module's record (`source`).
 * Its lines are that module's figures and its reason that module's words, so neither changes here
 * (no line added or removed, the reason as it was made); it's issued, settled or voided like any
 * other. One against an invoice keeps its lines' references (a
 * contract's fee), and is the office's.
 */
export const isMadeElsewhere = (credit: {
	invoiceId: number | null;
	lines: readonly { source: string | null }[];
}) => credit.invoiceId === null && credit.lines.some((line) => line.source !== null);

// --- What's left to pay ------------------------------------------------------------------------

/** A credit note's totals, from its lines' subtotal (negative) at its VAT rate. */
export const creditTotals = (subtotal: number, vatRate: number) =>
	invoiceTotals([{ amount: subtotal }], vatRate);

/**
 * What's left to pay of an invoice of `status` whose issued credit notes have `credits` (their
 * totals, negative): its total less theirs, never below zero, and nothing once its subtotal is all
 * credited. Nothing of a paid invoice (a credit note against it is refunded: the credit note's to
 * settle) or a void one.
 */
export function remainingOf(
	totals: InvoiceTotals,
	credits: readonly InvoiceTotals[],
	status: InvoiceStatus,
) {
	if (status === "paid" || status === "void") return 0;
	const subtotal = credits.reduce((sum, credit) => sum + credit.subtotal, totals.subtotal);
	if (subtotal <= 0) return 0;
	return Math.max(
		0,
		credits.reduce((sum, credit) => sum + credit.total, totals.total),
	);
}
