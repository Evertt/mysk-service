/**
 * What the condition module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may read the conditions and
 * record one; `forManagers`, only an owner or admin, changes the settings; `forEngineers` is for
 * the engineer portal, where engineers record the condition of the units of their own orders.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form } = moduleRemote("condition");
export const forManagers = moduleRemote("condition", "manager");
export const forEngineers = moduleRemote("condition", "engineer");
