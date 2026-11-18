/**
 * What the maintenance module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may use them; its settings' are
 * `defineTenantSettings()`'s, which only an owner or admin changes; `forCustomers` is for the
 * customer portal.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form, command } = moduleRemote("maintenance");
/**
 * For the customer portal: a customer's contact reads when their customer's units were last
 * maintained, at the sites they see (`client/client-maintenance.remote.ts`).
 */
export const forCustomers = moduleRemote("maintenance", "customer");
