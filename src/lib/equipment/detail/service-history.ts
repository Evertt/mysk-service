import { dayOf } from "#lib/dates.ts";
import {
	isCorrectiveWork,
	isDoneOrder,
	isOpenOrder,
	type OrderStatus,
	type OrderType,
	orderTypes,
} from "#lib/models.ts";
/**
 * A unit's service history in figures (`serviceStats`), above its page's timeline (what happened
 * to it, `../timeline/`).
 */
import type { OrderCost, PriceAdjustment } from "#lib/orders/extensions.ts";

/** An order on the unit, with what it took and cost. */
export interface HistoryOrder {
	id: number;
	number: string;
	type: OrderType;
	status: OrderStatus;
	description: string;
	scheduledFor: Temporal.Instant | null;
	completedAt: Temporal.Instant | null;
	createdAt: Temporal.Instant;
	laborHours: number;
	engineer: { id: number; name: string } | null;
	/** How many units the order is about, this one included: its cost is theirs together. */
	units: number;
	/**
	 * As `priceOrders()` prices it, with the modules' costs and what they're made of (e.g. the
	 * materials used) and adjustments (e.g. contract coverage). In cents. The whole order's.
	 */
	cost: { costs: OrderCost[]; labor: number; adjustments: PriceAdjustment[]; total: number };
}

/**
 * The unit's share of what an order cost, in cents: all of it if it's the order's only unit, else
 * as much as each of its units' (the yearly inspection of fifteen doors costs each a fifteenth).
 */
export const unitShare = (order: Pick<HistoryOrder, "units" | "cost">) =>
	Math.round(order.cost.total / Math.max(1, order.units));

/** When an order happened: when it was completed, else when it's scheduled, else when it was made. */
export const orderDate = (
	order: Pick<HistoryOrder, "completedAt" | "scheduledFor" | "createdAt">,
) => order.completedAt ?? order.scheduledFor ?? order.createdAt;

/**
 * Calendar days from one moment to another in the user's time zone, e.g. 1 from late on Monday
 * to early on Tuesday.
 */
export const daysBetween = (from: Temporal.Instant, to: Temporal.Instant) =>
	dayOf(from).until(dayOf(to)).days;

export interface ServiceStats {
	/** All orders on the unit, of every status. */
	orders: number;
	/** Per type, in the order they're picked in: the types it has orders of. */
	ordersByType: { type: OrderType; count: number }[];
	/** Quoted, scheduled or in progress. */
	openOrders: number;
	/** Completed or invoiced. */
	doneOrders: number;
	/**
	 * What the completed and invoiced orders cost, after adjustments, in cents: the unit's share of
	 * those it's one of several units of (`unitShare`).
	 */
	cost: number;
	/** When the latest completed or invoiced order was completed. */
	lastService: Temporal.Instant | null;
	/** Completed or invoiced repairs: breakdowns and repairs (`correctiveOrderTypes`). */
	repairs: number;
	daysSinceLastRepair: number | null;
	/** The mean time between repairs, in whole days; needs at least two repairs. */
	daysBetweenRepairs: number | null;
}

/**
 * The figures of a unit's service history: an order counts for each of its units. Repairs
 * (breakdowns too: corrective work) count once they are done, when they were.
 */
export function serviceStats(orders: HistoryOrder[], now = Temporal.Now.instant()): ServiceStats {
	const done = orders.filter((order) => isDoneOrder(order.status) && order.completedAt);
	const completions = (list: HistoryOrder[]) =>
		list.map((order) => order.completedAt!).sort((a, b) => Temporal.Instant.compare(a, b));
	const services = completions(done);
	const repairs = completions(done.filter((order) => isCorrectiveWork(order.type)));
	const lastRepair = repairs.at(-1);

	const ordersByType = orderTypes
		.map((type) => ({ type, count: orders.filter((order) => order.type === type).length }))
		.filter(({ count }) => count > 0);

	return {
		orders: orders.length,
		ordersByType,
		openOrders: orders.filter((order) => isOpenOrder(order.status)).length,
		doneOrders: done.length,
		cost: done.reduce((sum, order) => sum + unitShare(order), 0),
		lastService: services.at(-1) ?? null,
		repairs: repairs.length,
		daysSinceLastRepair: lastRepair ? daysBetween(lastRepair, now) : null,
		daysBetweenRepairs:
			repairs.length >= 2
				? Math.round(daysBetween(repairs[0], lastRepair!) / (repairs.length - 1))
				: null,
	};
}
