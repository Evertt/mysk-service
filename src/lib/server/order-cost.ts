import { lineTotal } from "#lib/models.js";

import { laborCost } from "./pricing.js";

/** What `orderCost` needs of an order: its labour, its engineer's rate and its material lines. */
export interface CostedOrder {
	laborHours: number;
	/** The assigned engineer's rate in cents, or none while unassigned. */
	hourlyRate: number | null | undefined;
	lines: { quantity: number; unitPrice: number }[];
}

/**
 * What an order costs in cents: its material lines at the prices they were quoted at, plus labour
 * at the engineer's rate, the same way the order pages compute their totals. Service history and
 * customer activity price orders only through this, so a change in pricing is made here once.
 */
export function orderCost({ laborHours, hourlyRate, lines }: CostedOrder) {
	const materials = lines.reduce((sum, line) => sum + lineTotal(line.quantity, line.unitPrice), 0);
	const labor = laborCost(laborHours, hourlyRate);
	return { materials, labor, total: materials + labor };
}
