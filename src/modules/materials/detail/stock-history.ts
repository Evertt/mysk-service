import { formatQuantity } from "../display.ts";
import type { MaterialUnit } from "../model.ts";

/** A change in stock with its sign and unit, e.g. `+12 pcs` or `−2.5 kg`. */
export const formatChange = (quantity: number, unit: MaterialUnit) =>
	`${quantity < 0 ? "−" : "+"}${formatQuantity(Math.abs(quantity), unit)}`;
