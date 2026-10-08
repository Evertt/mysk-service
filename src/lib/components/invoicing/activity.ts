/** How the activity log reads for the invoicing module's records (see `#lib/activity.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity.ts`: it imports the modules, and so this file, in turn.
import type { SubjectType } from "#lib/activity.js";
import { formatCents, formatDate, formatNumber } from "#lib/format.js";
import { m } from "#lib/paraglide/messages.js";

import { formatRate } from "./display.js";
import { invoicingLabels } from "./labels.js";

const day = (value: unknown) => formatDate(new Date(String(value)));
const days = (value: unknown) => m.activity_value_days({ count: Number(value) });
const rate = (value: unknown) => formatRate(Number(value));

export const invoicingSubjects: Record<string, SubjectType> = {
	invoice: {
		noun: m.activity_subject_invoice,
		href: ({ label }) => resolve("/(app)/invoices/[number]", { number: label }),
		fields: {
			status: { format: (value) => invoicingLabels.labelOrValue("invoiceState", String(value)) },
			customerId: { ref: "customer" },
			paymentTermDays: { format: days },
			vatRate: { format: rate },
			issuedOn: { format: day },
			dueOn: { format: day },
			paidOn: { format: day },
		},
	},
	/** A line on an invoice, by its description; logged against its invoice. */
	invoice_line: { noun: m.activity_subject_invoice_line },
	/** The organization's invoicing settings; they have no label, so they read as their noun. */
	invoicing_settings: {
		noun: m.activity_subject_invoicing_settings,
		href: () => resolve("/(app)/invoices/settings"),
		fields: {
			vatRate: { format: rate },
			paymentTermDays: { format: days },
			billFrom: { format: day },
		},
	},
};

/**
 * The amount of a line, as a note in the activity log, e.g. "2 × €45.00 = €90.00": stored as
 * text, formatted in the language of whoever made the change.
 */
export const lineNote = (line: { quantity: number; unitPrice: number; amount: number }) =>
	line.quantity === 1
		? formatCents(line.amount)
		: `${formatNumber(line.quantity)} × ${formatCents(line.unitPrice)} = ${formatCents(line.amount)}`;
