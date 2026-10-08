import { formatQuantity } from "#lib/materials/display.js";
import type { MaterialUnit } from "#lib/models.js";

/** A change in stock with its sign and unit, e.g. `+12 pcs` or `−2.5 kg`. */
export const formatChange = (quantity: number, unit: MaterialUnit) =>
	`${quantity < 0 ? "−" : "+"}${formatQuantity(Math.abs(quantity), unit)}`;
