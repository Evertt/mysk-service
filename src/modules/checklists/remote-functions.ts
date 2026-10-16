/**
 * What the checklists module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may read the templates;
 * `forManagers`, only an owner or admin, changes them.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query } = moduleRemote("checklists");
export const forManagers = moduleRemote("checklists", "manager");
