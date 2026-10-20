/**
 * What the maintenance module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may use them; its settings' are
 * `defineTenantSettings()`'s, which only an owner or admin changes.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form, command } = moduleRemote("maintenance");
