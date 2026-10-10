import { DAY, startOfDay } from "#lib/dates.ts";
import {
	isDoneOrder,
	isOpenOrder,
	type MaterialUnit,
	type OrderStatus,
	type OrderType,
	orderTypes,
} from "#lib/models.ts";
import type { PriceAdjustment } from "#lib/orders/extensions.ts";

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
	scheduledFor: Date | null;
	completedAt: Date | null;
	createdAt: Date;
	laborHours: number;
	engineer: { id: number; name: string } | null;
	materials: { id: number; sku: string; name: string; unit: MaterialUnit; quantity: number }[];
	/** As `priceOrders()` prices it, with the modules' adjustments (e.g. contract coverage). In cents. */
	cost: { materials: number; labor: number; adjustments: PriceAdjustment[]; total: number };
}

export type ServiceEvent =
	| { kind: "installation"; date: Date }
	| { kind: "order"; date: Date; order: HistoryOrder }
	/** The warranty's last day; `upcoming` while it still covers work. */
	| { kind: "warranty"; date: Date; upcoming: boolean };

/** When an order happened: when it was completed, else when it's scheduled, else when it was made. */
export const orderDate = (
	order: Pick<HistoryOrder, "completedAt" | "scheduledFor" | "createdAt">,
) => order.completedAt ?? order.scheduledFor ?? order.createdAt;

/** On the same day, the warranty's end goes above orders, and the installation below them. */
const rank: Record<ServiceEvent["kind"], number> = { warranty: 0, order: 1, installation: 2 };

/**
 * Everything that happened (or is about to) to a unit, newest first: its installation, its orders
 * and the end of its warranty, which may still be ahead.
 */
export function buildTimeline(
	unit: { installedAt: Date; warrantyUntil: Date },
	orders: HistoryOrder[],
	now = new Date(),
): ServiceEvent[] {
	const events: ServiceEvent[] = [
		{ kind: "installation", date: unit.installedAt },
		...orders.map((order) => ({ kind: "order" as const, date: orderDate(order), order })),
		{
			kind: "warranty",
			date: unit.warrantyUntil,
			upcoming: isUnderWarranty(unit.warrantyUntil, now),
		},
	];
	return events.sort(
		(a, b) =>
			b.date.getTime() - a.date.getTime() ||
			rank[a.kind] - rank[b.kind] ||
			(a.kind === "order" && b.kind === "order" ? b.order.id - a.order.id : 0),
	);
}

/** Calendar days from one date to another, e.g. 1 from late on Monday to early on Tuesday. */
export function daysBetween(from: Date, to: Date) {
	// Rounded, as a day across a daylight saving change is an hour shorter or longer.
	return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
}

export interface ServiceStats {
	/** All orders on the unit, of every status. */
	orders: number;
	ordersByType: Record<OrderType, number>;
	/** Quoted, scheduled or in progress. */
	openOrders: number;
	/** Completed or invoiced. */
	doneOrders: number;
	/** What the completed and invoiced orders cost, after adjustments, in cents. */
	cost: number;
	/** When the latest completed or invoiced order was completed. */
	lastService: Date | null;
	/** Completed or invoiced repairs. */
	repairs: number;
	daysSinceLastRepair: number | null;
	/** The mean time between repairs, in whole days; needs at least two repairs. */
	daysBetweenRepairs: number | null;
}

/** The figures of a unit's service history. Repairs count once they are done, when they were. */
export function serviceStats(orders: HistoryOrder[], now = new Date()): ServiceStats {
	const done = orders.filter((order) => isDoneOrder(order.status) && order.completedAt);
	const completions = (list: HistoryOrder[]) =>
		list.map((order) => order.completedAt as Date).sort((a, b) => a.getTime() - b.getTime());
	const services = completions(done);
	const repairs = completions(done.filter((order) => order.type === "repair"));
	const lastRepair = repairs.at(-1);

	const ordersByType = Object.fromEntries(orderTypes.map((type) => [type, 0])) as Record<
		OrderType,
		number
	>;
	for (const order of orders) ordersByType[order.type]++;

	return {
		orders: orders.length,
		ordersByType,
		openOrders: orders.filter((order) => isOpenOrder(order.status)).length,
		doneOrders: done.length,
		cost: done.reduce((sum, order) => sum + order.cost.total, 0),
		lastService: services.at(-1) ?? null,
		repairs: repairs.length,
		daysSinceLastRepair: lastRepair ? daysBetween(lastRepair, now) : null,
		daysBetweenRepairs:
			repairs.length >= 2
				? Math.round(daysBetween(repairs[0], lastRepair!) / (repairs.length - 1))
				: null,
	};
}
