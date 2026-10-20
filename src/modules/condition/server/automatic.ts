/**
 * Planning critical units: the module's daily job (`jobs.daily`, see `index.ts`). Off by default;
 * for a tenant that has "Plan critical units automatically" on, each critical unit in care without
 * an open order gets a maintenance order (a quote of high priority, for the office to plan), to be
 * done within 5 working days, through the core's `createOrders()`, so it's numbered, checked and
 * logged like any other (as the system's). Safe to run again: a unit with an open order gets none,
 * checked again in each order's own transaction (transactions take turns).
 */
import { and, eq, sql } from "drizzle-orm";

import { formatDate, formatNumber } from "#lib/i18n/index.ts";
import type { DailyReport, DailyRun } from "#lib/jobs/extensions.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { createOrders } from "#lib/orders/server/index.ts";
import { currentTenant, idInTenant, inTenant, sameTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { addWorkingDays, PLAN_WITHIN_WORKING_DAYS } from "../model.ts";
import { inCare } from "./list-sql.ts";
import { component, conditionSettings } from "./schema.ts";
import { settingsOf } from "./settings.ts";
import { componentSql, conditionSql } from "./status-sql.ts";

/** Whether the unit has an open order (quoted, scheduled or under way), in SQL. */
const hasOpenOrder = () =>
	sql<boolean>`exists (select 1 from ${orderUnit}, ${order} where ${and(
		eq(orderUnit.equipmentId, equipment.id),
		sameTenant(order, orderUnit),
		eq(order.id, orderUnit.orderId),
		inTenant(orderUnit),
		inList(order.status, [...openOrderStatuses]),
	)})`;

/** A unit's critical component, the lowest scored: what makes a unit critical but for itself. */
interface CriticalComponent {
	number: string;
	name: string;
	score: number;
	advice: string | null;
}

/**
 * The tenant's critical units in care without an open order, with what makes them critical (their
 * own condition, their worst component's, or their inspection).
 */
async function criticalUnits(tx: Transaction | typeof db, id?: number) {
	const unit = conditionSql();
	const part = componentSql(unit);
	const worstComponent = sql`(select json_object('number', ${component.number}, 'name', ${
		component.name
	}, 'score', ${part.score}, 'advice', ${part.advice}) from ${component} where ${eq(
		component.equipmentId,
		equipment.id,
	)} and ${sameTenant(component, equipment)} and ${part.score} < ${
		unit.parts.critical
	} order by ${part.score}, ${component.position} limit 1)`.mapWith(
		(text: string | null): CriticalComponent | null => (text ? JSON.parse(text) : null),
	);
	return tx
		.select({
			id: equipment.id,
			customerId: equipment.customerId,
			score: unit.score,
			band: unit.band,
			advice: unit.advice,
			component: worstComponent,
		})
		.from(equipment)
		.where(
			and(
				id === undefined ? inCare() : and(inCare(), idInTenant(equipment, id)),
				eq(unit.concern, "critical"),
				sql`not ${hasOpenOrder()}`,
			),
		)
		.orderBy(equipment.id);
}

/** The order's description: why the unit is critical, and the day it's to be done by. */
function describe(
	unit: {
		score: number | null;
		band: string;
		advice: string | null;
		component: CriticalComponent | null;
	},
	by: Temporal.PlainDate,
) {
	const date = formatDate(by);
	// Its score is below the critical threshold, or a component's is, or else its inspection has
	// expired.
	if (unit.score !== null && unit.band === "low") {
		return m
			.condition_auto_order_score({
				score: `${formatNumber(unit.score)}%`,
				date,
				advice: unit.advice ?? "",
			})
			.trim();
	}
	if (unit.component) {
		return m
			.condition_auto_order_component({
				component: `${unit.component.number} ${unit.component.name}`,
				score: `${formatNumber(unit.component.score)}%`,
				date,
				advice: unit.component.advice ?? "",
			})
			.trim();
	}
	return m.condition_auto_order_inspection({ date });
}

/**
 * The tenant's daily condition job: plans its critical units, if it wants that. Each order in a
 * transaction of its own, which checks the unit again: one that fails is logged and the others go
 * ahead. Reports how many orders it made (and how many units failed, if any).
 */
export async function planCriticalUnits({ today }: DailyRun): Promise<DailyReport> {
	const { organizationId } = currentTenant();
	const settings = await settingsOf(organizationId);
	if (!settings.autoPlan) return {};

	const by = addWorkingDays(today, PLAN_WITHIN_WORKING_DAYS);
	let made = 0;
	let failed = 0;
	for (const { id } of await criticalUnits(db)) {
		try {
			const planned = await db.transaction(async (tx) => {
				const [unit] = await criticalUnits(tx, id);
				if (!unit) return false;
				await createOrders(tx, [
					{
						customerId: unit.customerId,
						units: [unit.id],
						type: "maintenance",
						priority: "high",
						description: describe(unit, by),
					},
				]);
				return true;
			});
			if (planned) made++;
		} catch (error) {
			failed++;
			console.error(`Critical unit ${id} got no automatic order:`, error);
		}
	}
	await db
		.update(conditionSettings)
		.set({ lastRunAt: Temporal.Now.instant(), lastRunOrders: made })
		.where(eq(conditionSettings.organizationId, organizationId));
	return { "condition.orders": made, ...(failed ? { "condition.failed": failed } : {}) };
}
