import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import CircleXIcon from "@lucide/svelte/icons/circle-x";
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import { formatNumber } from "#lib/format.js";
import { label, labelOptions, withLabels } from "#lib/i18n/labels.js";
import { type MaterialUnit, materialUnits, type StockLevel, stockLevels } from "#lib/models.js";

/** Options for a unit select or faceted filter, e.g. `Pieces`. */
export const unitOptions = labelOptions("materialUnit", materialUnits);

/** A quantity with its unit, e.g. `12 pcs` or `2.5 kg` (in Dutch `12 st.`, `2,5 kg`). */
export const formatQuantity = (quantity: number, unit: MaterialUnit) =>
	`${formatNumber(quantity)} ${label("materialUnitSymbol", unit)}`;

// The stock levels are defined with the units, in `#lib/models.ts`.
export { lowStockThreshold, type StockLevel, stockLevel, stockLevels } from "#lib/models.js";

const stockLevelDetails: Record<StockLevel, { icon: Component; variant: BadgeVariant }> = {
	out: { icon: CircleXIcon, variant: "destructive" },
	low: { icon: TriangleAlertIcon, variant: "outline" },
	in_stock: { icon: CircleCheckIcon, variant: "secondary" },
};

/** Each stock level's translated `label`, icon and badge variant. */
export const stockLevelDisplay = withLabels("stockLevel", stockLevelDetails);

/** Options for a faceted filter on the stock level, from worst to best. */
export const stockLevelOptions = labelOptions("stockLevel", stockLevels, stockLevelDetails);
