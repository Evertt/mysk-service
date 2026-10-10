/**
 * What the contracts module's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`).
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form, command } = moduleRemote("contracts");
