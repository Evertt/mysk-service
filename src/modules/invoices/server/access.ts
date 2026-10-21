/**
 * Who may read and change the invoices module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). Invoicing is the office's: neither portal reads an invoice or a credit note
 * today, so no other audience has an entry. A line is a part of its invoice or credit note, and
 * the tenant's invoicing settings are read by the office and changed by managers.
 */
import { type AccessRule, partOf, rows, tenantWide } from "#lib/server/access/rules.ts";

import type { invoicesSubjects } from "../activity.ts";
import { creditNote, creditNoteLine, invoice, invoiceLine } from "./schema.ts";

export const invoicesAccess = {
	invoice: rows(invoice, invoice.id, { office: true }),
	invoice_line: partOf("invoice", invoiceLine, invoiceLine.invoiceId),
	credit_note: rows(creditNote, creditNote.id, { office: true }),
	credit_note_line: partOf("credit_note", creditNoteLine, creditNoteLine.creditNoteId),
	invoicing_settings: tenantWide({ office: true }, { change: "manager" }),
} satisfies Record<keyof typeof invoicesSubjects, AccessRule>;
