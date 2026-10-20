/**
 * What the invoicing module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Its settings' are `defineTenantSettings()`'s.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form, command } = moduleRemote("invoices");
