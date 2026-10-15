/**
 * What the invoicing module's remote functions are made with: refused with a 404 for a tenant
 * without the module, and `forManagers` also for a user who isn't an owner or admin (see
 * `moduleRemote()`).
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form, command } = moduleRemote("invoices");

/** For the organization's invoicing settings. */
export const forManagers = moduleRemote("invoices", "manager");
