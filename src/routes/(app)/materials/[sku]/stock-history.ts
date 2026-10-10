import { formatQuantity } from "#lib/materials";
import type { MaterialUnit } from "#lib/models.ts";

/** A change in stock with its sign and unit, e.g. `+12 pcs` or `−2.5 kg`. */
export const formatChange = (quantity: number, unit: MaterialUnit) =>
	`${quantity < 0 ? "−" : "+"}${formatQuantity(Math.abs(quantity), unit)}`;
