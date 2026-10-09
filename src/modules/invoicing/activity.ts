/** How the activity log reads for the invoicing module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { FieldFormat, Sentence, SubjectType } from "#lib/activity";
import { formatCents, formatDate, formatNumber } from "#lib/i18n";

import { formatRate } from "./display.ts";
import { invoicingLabels } from "./labels.ts";

const day = (value: unknown) => formatDate(new Date(String(value)));
const days = (value: unknown) => m.invoices_activity_value_days({ count: Number(value) });
const rate = (value: unknown) => formatRate(Number(value));

/** Fields of both an invoice and the invoicing settings. */
const paymentTermDays: FieldFormat = {
	label: m.invoices_activity_field_payment_term_days,
	format: days,
};
const vatRate: FieldFormat = { label: m.invoices_activity_field_vat_rate, format: rate };

/** What the user did to an invoice, as a sentence per verb (see `actionVerbs` in `#lib/activity/subjects.ts`). */
export const invoicingActions = {
	issued: m.invoices_action_issued,
	paid: m.invoices_action_paid,
	voided: m.invoices_action_voided,
} satisfies Record<string, Sentence>;

export const invoicingSubjects: Record<string, SubjectType> = {
	invoice: {
		noun: m.invoices_activity_subject,
		href: ({ label }) => resolve("/(app)/invoices/[number]", { number: label }),
		fields: {
			status: { format: (value) => invoicingLabels.labelOrValue("invoiceState", String(value)) },
			customerId: { ref: "customer" },
			paymentTermDays,
			vatRate,
			issuedOn: { label: m.invoices_activity_field_issued_on, format: day },
			dueOn: { label: m.invoices_activity_field_due_on, format: day },
			paidOn: { label: m.invoices_activity_field_paid_on, format: day },
		},
	},
	/** A line on an invoice, by its description; logged against its invoice. */
	invoice_line: { noun: m.invoices_activity_subject_line },
	/** The organization's invoicing settings; they have no label, so they read as their noun. */
	invoicing_settings: {
		noun: m.invoices_activity_subject_settings,
		href: () => resolve("/(app)/invoices/settings"),
		fields: {
			vatRate,
			paymentTermDays,
			billFrom: { label: m.invoices_activity_field_bill_from, format: day },
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
