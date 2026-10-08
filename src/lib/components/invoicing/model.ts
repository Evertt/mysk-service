/**
 * The invoicing module's domain enums, shared by its database tables, the seed script and the UI.
 * Kept out of `$lib/server` so client code (filters, badges) can import them.
 */

/**
 * Where an invoice is: a draft (still editable), sent to the customer, paid, or void (cancelled;
 * it keeps its number, so the numbers have no gaps). Overdue isn't stored: it's a sent invoice
 * past its due date, see `invoiceState` in `./invoice.ts`.
 */
export const invoiceStatuses = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];
