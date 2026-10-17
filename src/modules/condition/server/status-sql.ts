/**
 * A unit's condition and status in SQL, as `unitStatus()` in `../model.ts` has them: correlated
 * subqueries over the `equipment` row of the query they go in. Its latest condition, its
 * thresholds (the tenant's settings, read in SQL so the equipment list's columns, which are built
 * at once, can have them), whether an open order on it is scheduled, and what the other modules
 * know (`condition.signals`: checklists' inspection status, maintenance's next visit; null without
 * them). Built per request.
 *
 * The status repeats its parts many times over (in a list's select, its sort and its filter), so
 * they bind no parameters, which would soon pass the 100 a statement may have: each subquery is in
 * the unit's tenant by its own `organization_id` (`sameTenant()`, the outer query holds the unit
 * to the request's tenant with `inTenant(equipment)`), and constants are written in (`literal()`).
 */
import { and, desc, eq, type SQL, sql, type SQLWrapper } from "drizzle-orm";

import { doneOrderStatuses } from "#lib/models.ts";
import { inLiterals, literal } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";
import { collectNow } from "#lib/server/extensions.ts";

import { unitSignals } from "../api/extensions.ts";
import { defaultThresholds, type UnitStatus } from "../model.ts";
import { conditionSettings, unitCondition } from "./schema.ts";

/** The order statuses that make a unit's work planned: scheduled, or under way. */
const plannedStatuses = ["scheduled", "in_progress"] as const;

/** A row of `organizationId`'s table is in the tenant of the unit it's correlated with. */
const sameTenant = (organizationId: SQLWrapper) =>
	eq(organizationId as typeof equipment.organizationId, equipment.organizationId);

/** A status's place, worst first (`unitStatuses`), in SQL. */
const rankOf = (status: SQL) =>
	sql<number>`(case ${status} when 'critical' then 0 when 'attention' then 1 when 'planned' then 2 else 3 end)`;

/** The SQL of a unit's condition and status (see above). */
export function conditionSql() {
	const signals = collectNow(unitSignals, undefined);
	const inspection = signals.find((signal) => signal.inspection)?.inspection ?? null;
	const nextDue = signals.find((signal) => signal.nextDue)?.nextDue ?? null;

	/** `what` of the unit's latest condition, null without one. */
	const latest = (what: SQL) =>
		sql`(select ${what} from ${unitCondition} where ${and(
			eq(unitCondition.equipmentId, equipment.id),
			sameTenant(unitCondition.organizationId),
		)} order by ${desc(unitCondition.recordedAt)}, ${desc(unitCondition.id)} limit 1)`;
	const score = latest(sql`${unitCondition.score}`).mapWith((value: number | null) =>
		value === null ? null : Number(value),
	) as SQL<number | null>;
	const advice = latest(sql`${unitCondition.advice}`) as SQL<string | null>;
	const recordedAt = latest(sql`${unitCondition.recordedAt}`).mapWith(unitCondition.recordedAt);

	const setting = (column: SQLWrapper, fallback: number) =>
		sql<number>`coalesce((select ${column} from ${conditionSettings} where ${sameTenant(
			conditionSettings.organizationId,
		)}), ${literal(fallback)})`;
	const critical = setting(conditionSettings.criticalBelow, defaultThresholds.critical);
	const attention = setting(conditionSettings.attentionBelow, defaultThresholds.attention);

	const onUnit = and(
		eq(orderUnit.equipmentId, equipment.id),
		sameTenant(orderUnit.organizationId),
		eq(order.organizationId, orderUnit.organizationId),
		eq(order.id, orderUnit.orderId),
	);
	const planned = sql<boolean>`exists (select 1 from ${orderUnit}, ${order} where ${and(
		onUnit,
		inLiterals(order.status, plannedStatuses),
	)})`;
	const lastService = sql`(select max(${order.completedAt}) from ${orderUnit}, ${order} where ${and(
		onUnit,
		inLiterals(order.status, doneOrderStatuses),
	)})`.mapWith(order.completedAt);

	const expired = inspection ? sql`${inspection} = 'expired'` : sql`0`;
	const rejected = inspection ? sql`${inspection} = 'rejected'` : sql`0`;
	/** What its state asks for (`concernOf()`). */
	const concern = sql<
		Exclude<UnitStatus, "planned">
	>`(case when ${score} < ${critical} or ${expired} then 'critical' when ${score} < ${attention} or ${rejected} or trim(coalesce(${advice}, '')) <> '' then 'attention' else 'ok' end)`;
	/** Its status (`unitStatus()`): planned while its work is in hand. */
	const status = sql<UnitStatus>`(case when ${planned} then 'planned' else ${concern} end)`;
	/** Its score's band (`scoreBand()`), `none` without one. */
	const band = sql<string>`(case when ${score} is null then 'none' when ${score} < ${critical} then 'low' when ${score} < ${attention} then 'fair' else 'good' end)`;

	return {
		score,
		advice,
		recordedAt,
		band,
		inspection: inspection as SQL<string> | null,
		nextDue,
		planned,
		lastService,
		concern,
		status,
		/** Worst first: by status, then (for planned ones) what's behind it, then the lowest score. */
		sort: [rankOf(status), rankOf(concern), sql`coalesce(${score}, 101)`],
	};
}

export type ConditionSql = ReturnType<typeof conditionSql>;
