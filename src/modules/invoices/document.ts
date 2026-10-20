/**
 * A billing document, an invoice or a credit note, as the customer gets it: who it's from and for,
 * its dates, lines and totals, and what it says besides. Its page (`detail/billing-document.svelte`)
 * and its PDF (`server/document-pdf.ts`) both lay out `documentView()`, so they can't drift. The
 * server changes both kinds the same way (`server/documents.ts`).
 */
import { formatCents, formatDate } from "#lib/i18n/index.ts";

import { formatRate } from "./display.ts";
import type { InvoiceState, InvoiceTotals } from "./invoice.ts";
import type { InvoiceStatus } from "./model.ts";

export const documentKinds = ["invoice", "creditNote"] as const;
export type DocumentKind = (typeof documentKinds)[number];

/** A line as the document shows it. */
export interface DocumentLine {
	description: string;
	detail: string | null;
	quantity: number;
	unitPrice: number;
	amount: number;
}

/** An invoice or credit note, with its organization's name and its totals. */
export type BillingDocument<Line extends DocumentLine = DocumentLine> = {
	organization: string;
	number: string;
	status: InvoiceStatus;
	issuedOn: Temporal.PlainDate | null;
	vatRate: number;
	customer: {
		code: string;
		name: string;
		contactName: string;
		email: string;
		city: string;
		country: string;
	};
	lines: Line[];
	totals: InvoiceTotals;
} & (
	| {
			kind: "invoice";
			/** Its status, overdue past its due date. */
			state: InvoiceState;
			dueOn: Temporal.PlainDate | null;
			paidOn: Temporal.PlainDate | null;
			paymentTermDays: number;
			notes: string | null;
	  }
	| {
			kind: "creditNote";
			reason: string;
			/** The invoice it credits; none for a standalone one. */
			invoice: { number: string } | null;
			settledOn: Temporal.PlainDate | null;
	  }
);

/** A line of a document's view: its dates, or its totals (`total` the last, in bold). */
interface Row<Value> {
	label: string;
	value: Value;
	/** A date's value is the number of the invoice it credits. */
	invoice?: true;
	total?: true;
}

/**
 * What a document says besides its customer and lines, in the request's language: its title, its
 * dates, a credit note's reason, its totals, and its closing paragraphs (an invoice's notes, then
 * what to pay, or what's credited).
 */
export function documentView(doc: BillingDocument) {
	const issued = doc.issuedOn ? formatDate(doc.issuedOn) : m.invoices_not_yet();
	const dates: Row<string>[] = [{ label: m.invoices_column_issued(), value: issued }];
	const totals: Row<number>[] = [
		{ label: m.invoices_subtotal(), value: doc.totals.subtotal },
		{ label: m.invoices_vat({ rate: formatRate(doc.vatRate) }), value: doc.totals.vat },
		{ label: m.invoices_total(), value: doc.totals.total, total: true },
	];
	if (doc.kind === "invoice") {
		const due = doc.dueOn
			? formatDate(doc.dueOn)
			: m.invoices_due_after_issuing({ count: doc.paymentTermDays });
		dates.push({ label: m.invoices_column_due(), value: due });
		if (doc.paidOn) dates.push({ label: m.invoices_paid(), value: formatDate(doc.paidOn) });
		const amount = formatCents(doc.totals.total);
		return {
			title: m.invoices_invoice_number({ number: doc.number }),
			dates,
			reason: null,
			totals,
			closing: [
				...(doc.notes ? [doc.notes] : []),
				...(doc.dueOn && doc.status !== "void"
					? [m.invoices_please_pay({ amount, date: formatDate(doc.dueOn), number: doc.number })]
					: []),
			],
		};
	}
	if (doc.invoice) {
		dates.push({ label: m.invoices_credit_credits(), value: doc.invoice.number, invoice: true });
	}
	if (doc.settledOn) {
		const settled = formatDate(doc.settledOn);
		dates.push({ label: m.invoices_enum_credit_note_state_paid(), value: settled });
	}
	const amount = formatCents(-doc.totals.total);
	return {
		title: m.invoices_credit_number({ number: doc.number }),
		dates,
		reason: m.invoices_credit_reason_line({ reason: doc.reason }),
		totals,
		closing:
			doc.status === "void" ? [] : [m.invoices_credit_closing({ amount, number: doc.number })],
	};
}
