/**
 * The service history of the tenant's units, or a customer's (see `../feed.ts`): the newest
 * orders completed on them, conditions recorded and, with checklists on, checklists completed.
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { unitTitle } from "#lib/equipment/index.ts";
import { doneOrderStatuses } from "#lib/models.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, engineer, equipment, order, orderUnit, user } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";

import { history } from "../api/extensions.ts";
import {
	type ConditionFeedEntry,
	type FeedEntry,
	mergeFeed,
	type OrderFeedEntry,
} from "../feed.ts";
import { unitCondition } from "./schema.ts";

/** The newest orders completed on units (of the customer), with those units in their order. */
async function completedOrders(
	customerId: number | null,
	limit: number,
): Promise<OrderFeedEntry[]> {
	const orders = await db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			completedAt: order.completedAt,
			by: engineer.name,
			customer: { code: customer.code, name: customer.name },
		})
		.from(order)
		.innerJoin(...tenantJoin(customer, order.customerId))
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(
			and(
				inTenant(order),
				inList(order.status, [...doneOrderStatuses]),
				isNotNull(order.completedAt),
				customerId === null ? undefined : eq(order.customerId, customerId),
			),
		)
		.orderBy(desc(order.completedAt), desc(order.id))
		.limit(limit);
	if (!orders.length) return [];
	const units = await db
		.select({
			orderId: orderUnit.orderId,
			serialNumber: equipment.serialNumber,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
		})
		.from(orderUnit)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.where(
			and(
				inList(
					orderUnit.orderId,
					orders.map((row) => row.id),
				),
				inTenant(orderUnit),
			),
		)
		.orderBy(orderUnit.orderId, orderUnit.position);
	const unitsOf = Map.groupBy(units, (unit) => unit.orderId);
	return orders.map(({ id, completedAt, ...row }) => ({
		...row,
		kind: "order",
		key: `order:${id}`,
		at: completedAt!,
		units: (unitsOf.get(id) ?? []).map((unit) => ({
			serialNumber: unit.serialNumber,
			title: unitTitle(unit),
		})),
	}));
}

/** The newest conditions recorded on units (of the customer). */
async function recordedConditions(
	customerId: number | null,
	limit: number,
): Promise<ConditionFeedEntry[]> {
	const found = await db
		.select({
			id: unitCondition.id,
			at: unitCondition.recordedAt,
			score: unitCondition.score,
			advice: unitCondition.advice,
			source: unitCondition.source,
			engineer: engineer.name,
			user: user.name,
			order: order.number,
			unit: {
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
			},
			customer: { code: customer.code, name: customer.name },
		})
		.from(unitCondition)
		.innerJoin(...tenantJoin(equipment, unitCondition.equipmentId))
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.leftJoin(...tenantJoin(engineer, unitCondition.engineerId))
		.leftJoin(user, eq(user.id, unitCondition.userId))
		.leftJoin(...tenantJoin(order, unitCondition.orderId))
		.where(
			and(
				inTenant(unitCondition),
				// The units' own: their components' come with them (a checklist's) or are on their page.
				isNull(unitCondition.componentId),
				customerId === null ? undefined : eq(equipment.customerId, customerId),
			),
		)
		.orderBy(desc(unitCondition.recordedAt), desc(unitCondition.id))
		.limit(limit);
	return found.map(({ id, engineer, user, unit, ...row }) => ({
		...row,
		kind: "condition",
		key: `condition:${id}`,
		by: engineer ?? user,
		unit: { serialNumber: unit.serialNumber, title: unitTitle(unit) },
	}));
}

/** The newest `limit` entries of the service history of the customer's units (or all). */
export async function serviceHistory(
	customerId: number | null,
	limit: number,
): Promise<FeedEntry[]> {
	const [orders, conditions, checklists] = await Promise.all([
		completedOrders(customerId, limit),
		recordedConditions(customerId, limit),
		collect(history, { customerId, limit }),
	]);
	return mergeFeed(
		[
			orders,
			conditions,
			checklists.flat().map((entry) => ({ ...entry, kind: "checklist" as const })),
		],
		limit,
	);
}
