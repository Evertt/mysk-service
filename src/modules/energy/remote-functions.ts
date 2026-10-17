/**
 * What the energy module's remote functions are made with: refused with a 404 for a tenant without
 * the module (see `moduleRemote()`). Every office member may watch the sites, make an order of an
 * alert and resolve one; `forManagers`, only an owner or admin, changes a zone's thresholds and the
 * integration tokens the meters post with; `forCustomers` is for the customer portal, where a
 * customer's contact reads their own sites' figures.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, command } = moduleRemote("energy");
export const forManagers = moduleRemote("energy", "manager");
export const forCustomers = moduleRemote("energy", "customer");
