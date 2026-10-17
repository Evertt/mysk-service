/**
 * What the partner programme's remote functions are made with: refused with a 404 for a tenant
 * without the module (see `moduleRemote()`). Every office member may see the figures and classify
 * orders; `forManagers` is for what only an owner or admin may do: the rules, accepting partners,
 * closing years, the bonus choice and the wallet.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query } = moduleRemote("partner-programme");
export const forManagers = moduleRemote("partner-programme", "manager");
