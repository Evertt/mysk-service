/**
 * What the condition module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may read the conditions and
 * record one, and keep a unit's components (its settings' are `defineTenantSettings()`'s, which
 * only an owner or admin changes); `forEngineers` is for the engineer portal, where engineers
 * record the condition of the units of their own orders.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form } = moduleRemote("condition");
export const forEngineers = moduleRemote("condition", "engineer");
/**
 * For the customer portal: a customer's contact reads the condition of their customer's units at
 * the sites they see (`client/client-condition.remote.ts`).
 */
export const forCustomers = moduleRemote("condition", "customer");
