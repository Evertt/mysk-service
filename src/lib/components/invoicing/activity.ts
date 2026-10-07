/** How the activity log reads for the invoicing module's records (see `#lib/activity.ts`). */
import { resolve } from "$app/paths";

import type { SubjectType } from "#lib/activity.js";
import { formatCents, formatDate, formatNumber } from "#lib/format.js";

import { states } from "./display.js";
import { formatRate } from "./invoice.js";

const day = (value: unknown) => formatDate(new Date(String(value)));
const days = (value: unknown) => `${String(value)} days`;

export const invoicingSubjects: Record<string, SubjectType> = {
	invoice: {
		noun: "invoice",
		href: ({ label }) => resolve("/(app)/invoices/[number]", { number: label }),
		fields: {
			status: { format: (value) => states[value as keyof typeof states]?.label ?? String(value) },
			customerId: { ref: "customer" },
			paymentTermDays: { label: "payment term", format: days },
			vatRate: { label: "VAT rate", format: (value) => formatRate(Number(value)) },
			issuedOn: { label: "issued", format: day },
			dueOn: { label: "due", format: day },
			paidOn: { label: "paid", format: day },
		},
	},
	/** A line on an invoice, by its description; logged against its invoice. */
	invoice_line: { noun: "invoice line" },
	/** The organization's invoicing settings; they have no label, so they read as their noun. */
	invoicing_settings: {
		noun: "invoicing settings",
		href: () => resolve("/(app)/invoices/settings"),
		fields: {
			vatRate: { label: "VAT rate", format: (value) => formatRate(Number(value)) },
			paymentTermDays: { label: "payment term", format: days },
			billFrom: { label: "bill fees from", format: day },
		},
	},
};

/** The amount of a line, as a note in the activity log, e.g. "2 × €45.00 = €90.00". */
export const lineNote = (line: { quantity: number; unitPrice: number; amount: number }) =>
	line.quantity === 1
		? formatCents(line.amount)
		: `${formatNumber(line.quantity)} × ${formatCents(line.unitPrice)} = ${formatCents(line.amount)}`;
