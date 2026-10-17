/**
 * What the parts shop's remote functions are made with: refused with a 404 for a tenant without
 * the module (see `moduleRemote()`). Every office member may manage the products and handle the
 * orders; `forManagers`, only an owner or admin, sets up the categories; `forCustomers` is for the
 * customer portal, where a partner's contact shops with its credit.
 */
import { moduleRemote } from "#lib/server/remote-functions.ts";

export const { query, form } = moduleRemote("parts-shop");
export const forManagers = moduleRemote("parts-shop", "manager");
export const forCustomers = moduleRemote("parts-shop", "customer");
