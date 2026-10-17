/**
 * What the docks module's remote functions are made with: refused with a 404 for a tenant without
 * the module (see `moduleRemote()`). Every office member may see the board and the docks;
 * `forManagers` is for what only an owner or admin may do: the docks themselves and the Salvo
 * feed's tokens.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query } = moduleRemote("docks");
export const forManagers = moduleRemote("docks", "manager");
