import { getTimeZone } from "#lib/dates.ts";
import {
	isCorrectiveWork,
	isDoneOrder,
	isOpenOrder,
	type OrderStatus,
	type OrderType,
	orderTypes,
} from "#lib/models.ts";
import type { OrderCost, PriceAdjustment } from "#lib/orders/extensions.ts";

/**
 * A unit's service history: what happened to it in order (`buildTimeline`) and the figures that
 * sum it up (`serviceStats`).
 */
import { isUnderWarranty } from "../display.ts";

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

/** Something that happened to a unit, on a day (an order's in the user's time zone). */
export type ServiceEvent =
	| { kind: "installation"; date: Temporal.PlainDate }
	| { kind: "order"; date: Temporal.PlainDate; order: HistoryOrder }
	/** The warranty's last day; `upcoming` while it still covers work. */
	| { kind: "warranty"; date: Temporal.PlainDate; upcoming: boolean };

/** When an order happened: when it was completed, else when it's scheduled, else when it was made. */
export const orderDate = (
	order: Pick<HistoryOrder, "completedAt" | "scheduledFor" | "createdAt">,
) => order.completedAt ?? order.scheduledFor ?? order.createdAt;

/** A moment's day, in the user's time zone. */
const dayOf = (moment: Temporal.Instant) => moment.toZonedDateTimeISO(getTimeZone()).toPlainDate();

/** On the same day, the warranty's end goes above orders, and the installation below them. */
const rank: Record<ServiceEvent["kind"], number> = { warranty: 0, order: 1, installation: 2 };

/**
 * Everything that happened (or is about to) to a unit, newest first: its installation, its orders
 * and the end of its warranty, which may still be ahead.
 */
export function buildTimeline(
	unit: { installedAt: Temporal.PlainDate; warrantyUntil: Temporal.PlainDate },
	orders: HistoryOrder[],
	now: Temporal.Instant | Temporal.PlainDate = Temporal.Now.instant(),
): ServiceEvent[] {
	const events: ServiceEvent[] = [
		{ kind: "installation", date: unit.installedAt },
		...orders.map((order) => ({ kind: "order" as const, date: dayOf(orderDate(order)), order })),
		{
			kind: "warranty",
			date: unit.warrantyUntil,
			upcoming: isUnderWarranty(unit.warrantyUntil, now),
		},
	];
	return events.sort(
		(a, b) =>
			Temporal.PlainDate.compare(b.date, a.date) ||
			rank[a.kind] - rank[b.kind] ||
			(a.kind === "order" && b.kind === "order"
				? Temporal.Instant.compare(orderDate(b.order), orderDate(a.order)) ||
					b.order.id - a.order.id
				: 0),
	);
}

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
