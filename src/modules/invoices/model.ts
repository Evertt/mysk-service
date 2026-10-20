/**
 * The invoices module's domain enums, shared by its database tables, the seed script and the UI.
 * Kept out of `server/` so client code (filters, badges) can import them.
 */
import type { NumberFormat } from "#lib/numbering.ts";

/** What an invoice's number looks like, e.g. `INV-2026-00007` (see `#lib/numbering.ts`). */
export const invoiceNumberFormat: NumberFormat = { prefix: "INV-", digits: 5, yearly: true };

/**
 * Where an invoice is: a draft (still editable), sent to the customer, paid, or void (cancelled;
 * it keeps its number, so the numbers have no gaps). Overdue isn't stored: it's a sent invoice
 * past its due date, see `invoiceState` in `./invoice.ts`. A credit note's statuses are the same.
 * Labelled as what a document is (`invoiceIs`, "… is a draft") and what can't be done to it
 * (`invoiceChange`, "… can't be issued"), a credit note's (`creditNoteIs`, `creditNoteChange`)
 * saying settled for paid.
 * @labels invoiceIs invoiceChange creditNoteIs creditNoteChange
 */
export const invoiceStatuses = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

/**
 * What a credit note's number looks like, e.g. `CN-2026-0007`: a series of its own, sequential per
 * organization across years like the invoices' (see `#lib/numbering.ts`).
 */
export const creditNoteNumberFormat: NumberFormat = { prefix: "CN-", digits: 4, yearly: true };
