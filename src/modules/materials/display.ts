import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import CircleXIcon from "@lucide/svelte/icons/circle-x";
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

import { type BadgeDisplay, formatNumber } from "#lib/i18n/index.ts";

import { materialLabels } from "./labels.ts";
import { type MaterialUnit, materialUnits, type StockLevel, stockLevels } from "./model.ts";

/** Options for a unit select or faceted filter, e.g. `Pieces`. */
export const unitOptions = materialLabels.labelOptions("materialUnit", materialUnits);

/** A quantity with its unit, e.g. `12 pcs` or `2.5 kg` (in Dutch `12 st.`, `2,5 kg`). */
export const formatQuantity = (quantity: number, unit: MaterialUnit) =>
	`${formatNumber(quantity)} ${materialLabels.label("materialUnitSymbol", unit)}`;

// The stock levels are defined with the units, in `./model.ts`.
export { lowStockThreshold, type StockLevel, stockLevel, stockLevels } from "./model.ts";

const stockLevelDetails: Record<StockLevel, BadgeDisplay> = {
	out: { icon: CircleXIcon, tone: "danger" },
	low: { icon: TriangleAlertIcon, tone: "warning" },
	in_stock: { icon: CircleCheckIcon, tone: "success" },
};

/** Each stock level's translated `label`, icon and badge tone. */
export const stockLevelDisplay = materialLabels.withLabels("stockLevel", stockLevelDetails);

/** Options for a faceted filter on the stock level, from worst to best. */
export const stockLevelOptions = materialLabels.labelOptions(
	"stockLevel",
	stockLevels,
	stockLevelDetails,
);
