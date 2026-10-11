/**
 * What the materials module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). `forEngineers` is for the engineer portal's card.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form, command } = moduleRemote("materials");
export const forEngineers = moduleRemote("materials", "engineer");
