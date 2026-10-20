/**
 * The organization's invoicing settings: the defaults for the invoices it makes. Every member may
 * read them; only managers change them (`defineTenantSettings()`, in `server/settings.ts`).
 */
export { getSettings as getInvoicingSettings, saveSettings } from "./server/settings.ts";
