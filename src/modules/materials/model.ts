/**
 * The materials module's model: units and quantities, stock levels, which orders hold stock, the
 * kinds of stock movement, and how materials are numbered. Isomorphic, without imports at runtime,
 * so the seed script can use it too.
 */
import type { OrderStatus } from "#lib/models.ts";
import type { NumberFormat } from "#lib/numbering.ts";

export const materialUnits = ["pcs", "m", "kg", "l"] as const;
export type MaterialUnit = (typeof materialUnits)[number];

/** The smallest amount of a unit: whole pieces; metres, kilos and litres to two decimals. */
export const quantityStep = (unit: MaterialUnit) => (unit === "pcs" ? 1 : 0.01);

/** Whether `quantity` is a multiple of the unit's step, e.g. no half pieces. */
export const fitsUnit = (quantity: number, unit: MaterialUnit) => {
	const steps = quantity / quantityStep(unit);
	return Math.abs(steps - Math.round(steps)) < 1e-9;
};

export const stockLevels = ["out", "low", "in_stock"] as const;
export type StockLevel = (typeof stockLevels)[number];

/**
 * Below how much of each unit a material is running low: 10 pieces, or 50 metres, kilos or
 * litres. The materials list works out stock levels in SQL from these too (`stockLevelSql` in `./server/stock.ts`).
 */
export const lowStockThresholds: Readonly<Record<MaterialUnit, number>> = {
	pcs: 10,
	m: 50,
	kg: 50,
	l: 50,
};

/** Below this much a material is running low. */
export const lowStockThreshold = (unit: MaterialUnit) => lowStockThresholds[unit];

/** Out of stock at nothing (or less), low below the unit's threshold, else in stock. */
export const stockLevel = (stock: number, unit: MaterialUnit): StockLevel =>
	stock <= 0 ? "out" : stock < lowStockThreshold(unit) ? "low" : "in_stock";

/** The amount of an order line in cents: quantity × unit price, rounded to the cent. */
export const lineTotal = (quantity: number, unitPrice: number) => Math.round(quantity * unitPrice);

/** A quantity to two decimals (the finest any unit is counted in), without floating-point noise. */
export const roundQuantity = (quantity: number) => Math.round(quantity * 100) / 100 || 0;

/**
 * Orders whose material lines hold stock: from scheduled on. A quote's lines are only a proposal,
 * and a cancelled order gives its materials back.
 */
const stockHoldingStatuses = [
	"scheduled",
	"in_progress",
	"completed",
	"invoiced",
] as const satisfies OrderStatus[];

/** Whether an order with `status` holds its lines' stock. */
export const holdsStock = (status: OrderStatus) =>
	(stockHoldingStatuses as readonly OrderStatus[]).includes(status);

/**
 * Why a material's stock changed: its opening balance, a delivery, a count that found a different
 * amount, an order line taking it (consumption) or giving it back (return), or another module
 * setting it aside for an order of its own (reservation, e.g. a parts shop's order) and letting it
 * go again (release, when that's cancelled).
 */
export const stockMovementKinds = [
	"opening_balance",
	"receipt",
	"adjustment",
	"consumption",
	"return",
	"reservation",
	"release",
] as const;
export type StockMovementKind = (typeof stockMovementKinds)[number];

/** A material's code: `MAT-0001`, sequential per organization. */
export const materialNumberFormat: NumberFormat = { prefix: "MAT-", digits: 4 };
