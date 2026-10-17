/**
 * What the checklists module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may read the templates and the
 * checklists; `forManagers`, only an owner or admin, changes the templates; `forEngineers` is for
 * the engineer portal, where engineers fill in the checklists of their own orders.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query } = moduleRemote("checklists");
export const forManagers = moduleRemote("checklists", "manager");
export const forEngineers = moduleRemote("checklists", "engineer");
