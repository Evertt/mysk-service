/**
 * The units an order is about (`orderUnit`): none (a new installation, a survey), one, or several
 * (the yearly inspection of all of a customer's doors), in the order they're worked on. Reading
 * them for a batch of orders, saving an order's, and the SQL that the lists and a unit's history ask
 * them with. An order made or changed by core goes through `createOrders()` (`./creation.ts`) and
 * the order form, which save them here.
 */
import { and, asc, eq, sql, type SQLWrapper } from "drizzle-orm";

import { currentTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { saveUnitParts } from "./hooks.ts";

/** What lists show of a unit on an order: what it's called and its serial number. */
export interface ListedUnit {
	id: number;
	serialNumber: string;
	name: string | null;
	manufacturer: string;
	model: string;
}

/** The ids of the units of these orders of the tenant's, in their order, by order id. */
export async function unitIdsOf(
	orderIds: readonly number[],
	tx: Transaction | typeof db = db,
): Promise<Map<number, number[]>> {
	const ids = [...new Set(orderIds)];
	const units = new Map(ids.map((id) => [id, [] as number[]]));
	if (!ids.length) return units;
	const rows = await tx
		.select({ orderId: orderUnit.orderId, equipmentId: orderUnit.equipmentId })
		.from(orderUnit)
		.where(and(inList(orderUnit.orderId, ids), inTenant(orderUnit)))
		.orderBy(asc(orderUnit.orderId), asc(orderUnit.position));
	for (const row of rows) units.get(row.orderId)?.push(row.equipmentId);
	return units;
}

/**
 * The orders with the ids of their units (`equipmentIds`, in their order): what the modules get to
 * know of an order (`OrderFacts`), e.g. to price and badge it.
 */
export async function withUnitIds<T extends { id: number }>(
	orders: T[],
): Promise<(T & { equipmentIds: number[] })[]> {
	const units = await unitIdsOf(orders.map((row) => row.id));
	return orders.map((row) => ({ ...row, equipmentIds: units.get(row.id) ?? [] }));
}

/** What lists show of the units of these orders of the tenant's, in their order, by order id. */
export async function listedUnitsOf(
	orderIds: readonly number[],
): Promise<Map<number, ListedUnit[]>> {
	const ids = [...new Set(orderIds)];
	const units = new Map(ids.map((id) => [id, [] as ListedUnit[]]));
	if (!ids.length) return units;
	const rows = await db
		.select({
			orderId: orderUnit.orderId,
			id: equipment.id,
			serialNumber: equipment.serialNumber,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
		})
		.from(orderUnit)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.where(and(inList(orderUnit.orderId, ids), inTenant(orderUnit)))
		.orderBy(asc(orderUnit.orderId), asc(orderUnit.position));
	for (const { orderId, ...unit } of rows) units.get(orderId)?.push(unit);
	return units;
}

/**
 * The orders with their first unit (`unit`, none for an order without units) and how many units
 * they have (`unitCount`): what a card or a row shows of them, e.g. "Deur 07 +14" (`unitsSummary()`
 * in `#lib/orders/display.ts`).
 */
export async function withFirstUnit<T extends { id: number }>(
	orders: T[],
): Promise<(T & { unit: ListedUnit | null; unitCount: number })[]> {
	const units = await listedUnitsOf(orders.map((row) => row.id));
	return orders.map((row) => {
		const own = units.get(row.id) ?? [];
		return { ...row, unit: own[0] ?? null, unitCount: own.length };
	});
}

/**
 * Makes `unitIds` the units of the tenant's order, in that order (none: no units), in `tx`.
 * `order.customerId` is the order's customer as stored: the units must be that customer's (the
 * foreign keys refuse anything else), so an order whose customer changes loses its units first
 * (`setOrderUnits(tx, existing, [])`) and gets the new ones once it has its new customer.
 *
 * The units it keeps keep their rows (only their places change), so what the modules keep about
 * an order's unit stays. The modules save their part of it (`orders.units`, `saveUnitParts()`)
 * once the new units are in and before the ones it loses go; throws an `OrderRefused` when one
 * can't let go of a unit, which rolls the transaction back.
 */
export async function setOrderUnits(
	tx: Transaction,
	target: { id: number; customerId: number },
	unitIds: readonly number[],
) {
	const wanted = [...new Set(unitIds)];
	const ofOrder = and(eq(orderUnit.orderId, target.id), inTenant(orderUnit));
	const current = await tx
		.select({ equipmentId: orderUnit.equipmentId })
		.from(orderUnit)
		.where(ofOrder);
	const had = new Set(current.map((row) => row.equipmentId));
	const removed = [...had].filter((id) => !wanted.includes(id));
	// Out of the way of the new places first (each place is the order's once): below zero.
	if (current.length) {
		await tx
			.update(orderUnit)
			.set({ position: sql`-1 - ${orderUnit.position}` })
			.where(ofOrder);
	}
	const { organizationId } = currentTenant();
	await insertRows(
		tx,
		orderUnit,
		wanted.flatMap((equipmentId, position) =>
			had.has(equipmentId)
				? []
				: [
						{
							organizationId,
							orderId: target.id,
							customerId: target.customerId,
							equipmentId,
							position,
						},
					],
		),
	);
	await saveUnitParts({ tx, order: { id: target.id }, equipmentIds: wanted, removed });
	if (removed.length) {
		await tx.delete(orderUnit).where(and(ofOrder, inList(orderUnit.equipmentId, removed)));
	}
	for (const [position, equipmentId] of wanted.entries()) {
		if (!had.has(equipmentId)) continue;
		await tx
			.update(orderUnit)
			.set({ position })
			.where(and(ofOrder, eq(orderUnit.equipmentId, equipmentId)));
	}
}

/*
 * The SQL below is for queries built with `db.select()`, not relational ones (`db.query`), which
 * take every column in a `where` for one of the queried table's.
 */

/**
 * For a query on `order`: whether the order is about the unit `equipmentId` (a unit's id or a
 * column), e.g. a unit's service history, or the open orders of each unit in the equipment list.
 */
export const onUnit = (equipmentId: SQLWrapper | number) =>
	sql`exists (select 1 from ${orderUnit} where ${and(
		eq(orderUnit.orderId, order.id),
		eq(orderUnit.equipmentId, equipmentId),
		inTenant(orderUnit),
	)})`;

/** For a query on `order`: whether the order is about any of the units `equipmentIds`. */
export const onAnyUnit = (equipmentIds: readonly number[]) =>
	sql`exists (select 1 from ${orderUnit} where ${and(
		eq(orderUnit.orderId, order.id),
		inList(orderUnit.equipmentId, equipmentIds),
		inTenant(orderUnit),
	)})`;

/** For a query on `order`: how many units the order is about. */
export const unitCount = () =>
	sql<number>`(select count(*) from ${orderUnit} where ${and(
		eq(orderUnit.orderId, order.id),
		inTenant(orderUnit),
	)})`.mapWith(Number);
