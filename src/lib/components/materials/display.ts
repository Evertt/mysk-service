import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import CircleXIcon from "@lucide/svelte/icons/circle-x";
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import { formatNumber } from "#lib/format.js";
import { type MaterialUnit, materialUnits } from "#lib/models.js";

export const unitLabels: Record<MaterialUnit, string> = {
	pcs: "Pieces",
	m: "Metres",
	kg: "Kilograms",
	l: "Litres",
};

/** Options for a unit select or faceted filter. */
export const unitOptions = materialUnits.map((value) => ({ value, label: unitLabels[value] }));

/** A quantity with its unit, e.g. `12 pcs` or `2.5 kg`. */
export const formatQuantity = (quantity: number, unit: MaterialUnit) =>
	`${formatNumber(quantity)} ${unit}`;

export const stockLevels = ["out", "low", "in_stock"] as const;
export type StockLevel = (typeof stockLevels)[number];

/** Below this much a material is running low: 10 pieces, or 50 metres, kilos or litres. */
export const lowStockThreshold = (unit: MaterialUnit) => (unit === "pcs" ? 10 : 50);

export const stockLevel = (stock: number, unit: MaterialUnit): StockLevel =>
	stock <= 0 ? "out" : stock < lowStockThreshold(unit) ? "low" : "in_stock";

export const stockLevelDisplay: Record<
	StockLevel,
	{ label: string; icon: Component; variant: BadgeVariant }
> = {
	out: { label: "Out of stock", icon: CircleXIcon, variant: "destructive" },
	low: { label: "Low", icon: TriangleAlertIcon, variant: "outline" },
	in_stock: { label: "In stock", icon: CircleCheckIcon, variant: "secondary" },
};

/** Options for a faceted filter on the stock level, from worst to best. */
export const stockLevelOptions = stockLevels.map((value) => ({
	value,
	...stockLevelDisplay[value],
}));
