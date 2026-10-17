/**
 * The stock ledger's services for the modules that require materials (the parts shop): setting
 * stock aside for an order of their own, and letting it go again, in the caller's transaction,
 * through `moveStock()` (the only thing that changes a material's stock). The movement's note says
 * whose it is, e.g. the shop order's number: its `order` columns are the core's orders'.
 */
import type { Transaction } from "#lib/server/db/index.ts";

import { moveStock, StockShortage } from "../server/stock.ts";

export { StockShortage };

/**
 * Takes `quantity` (in the material's unit, more than zero) of one of the tenant's materials out
 * of stock, set aside with `note`. Throws a `StockShortage` (with what is in stock) if there isn't
 * that much, and a 404 for another tenant's material.
 */
export const reserveStock = (tx: Transaction, materialId: number, quantity: number, note: string) =>
	moveStock(tx, { materialId, quantity: -quantity, kind: "reservation", note });

/** Puts `quantity` of a material set aside (`reserveStock()`) back into stock, with `note`. */
export const releaseStock = (tx: Transaction, materialId: number, quantity: number, note: string) =>
	moveStock(tx, { materialId, quantity, kind: "release", note });
