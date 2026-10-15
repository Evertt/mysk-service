/**
 * The invoicing module's domain enums, shared by its database tables, the seed script and the UI.
 * Kept out of `server/` so client code (filters, badges) can import them.
 */
import type { NumberFormat } from "#lib/numbering.ts";

/** What an invoice's number looks like, e.g. `INV-2026-00007` (see `#lib/numbering.ts`). */
export const invoiceNumberFormat: NumberFormat = { prefix: "INV-", digits: 5, yearly: true };

/**
 * Where an invoice is: a draft (still editable), sent to the customer, paid, or void (cancelled;
 * it keeps its number, so the numbers have no gaps). Overdue isn't stored: it's a sent invoice
 * past its due date, see `invoiceState` in `./invoice.ts`.
 */
export const invoiceStatuses = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];
