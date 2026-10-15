/**
 * What the maintenance module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may use them; `forManagers` only
 * an owner or admin (the module's settings).
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form, command } = moduleRemote("maintenance");
export const forManagers = moduleRemote("maintenance", "manager");
