import { formatQuantity } from "#lib/components/materials/display.js";
import type { MaterialUnit, StockMovementKind } from "#lib/models.js";

/** How each kind of stock movement is described in the history. */
export const movementKindLabels: Record<StockMovementKind, string> = {
	opening_balance: "Opening balance",
	receipt: "Received",
	adjustment: "Count adjustment",
	consumption: "Used on order",
	return: "Returned from order",
};

/** A change in stock with its sign and unit, e.g. `+12 pcs` or `−2.5 kg`. */
export const formatChange = (quantity: number, unit: MaterialUnit) =>
	`${quantity < 0 ? "−" : "+"}${formatQuantity(Math.abs(quantity), unit)}`;
