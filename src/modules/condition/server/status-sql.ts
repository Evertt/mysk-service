/**
 * A unit's condition and status in SQL, as `rolledUpStatus()` in `../model.ts` has them: correlated
 * subqueries over the `equipment` row of the query they go in. Its latest condition as a whole, its
 * thresholds (the tenant's settings, read in SQL so the equipment list's columns, which are built
 * at once, can have them), whether an open order on it is scheduled, what the other modules know
 * (`condition.signals`: checklists' inspection status, maintenance's next visit; null without
 * them), and its components' latest conditions, the worst of which its status takes in. A
 * component's own (`componentSql()`) is over the `component` row of a query that joins it to its
 * unit. Built per request.
 *
 * The status repeats its parts many times over (in a list's select, its sort and its filter), so
 * they bind no parameters, which would soon pass the 100 a statement may have: each subquery is in
 * the unit's tenant by its own `organization_id` (`sameTenant()`, the outer query holds the unit
 * to the request's tenant with `inTenant(equipment)`), and constants are written in (`literal()`).
 */
import { and, desc, eq, isNull, type SQL, sql, type SQLWrapper } from "drizzle-orm";

import { doneOrderStatuses } from "#lib/models.ts";
import { inLiterals, literal } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";
import { collectNow } from "#lib/server/extensions.ts";

import { unitSignals } from "../api/extensions.ts";
import { type Concern, defaultThresholds, type UnitStatus } from "../model.ts";
import { component, conditionSettings, unitCondition } from "./schema.ts";

/** The order statuses that make a unit's work planned: scheduled, or under way. */
const plannedStatuses = ["scheduled", "in_progress"] as const;

/** A row of `organizationId`'s table is in the tenant of the unit it's correlated with. */
const sameTenant = (organizationId: SQLWrapper) =>
	eq(organizationId as typeof equipment.organizationId, equipment.organizationId);

/** A status's place, worst first (`unitStatuses`), in SQL. */
const rankOf = (status: SQL) =>
	sql<number>`(case ${status} when 'critical' then 0 when 'attention' then 1 when 'planned' then 2 else 3 end)`;

/** A concern by its place (0 critical, 1 attention, else ok), in SQL. */
const concernAt = (rank: SQL) =>
	sql<Concern>`(case ${rank} when 0 then 'critical' when 1 then 'attention' else 'ok' end)`;

/**
 * `what` of the latest condition `where` picks (a unit's as a whole, or a component's), null
 * without one, in the tenant of `tenant` (the unit's, or the component's own).
 */
const latestWhere = (
	where: SQL | undefined,
	what: SQL,
	tenant: SQLWrapper = equipment.organizationId,
) =>
	sql`(select ${what} from ${unitCondition} where ${and(
		where,
		eq(unitCondition.organizationId, tenant as typeof equipment.organizationId),
	)} order by ${desc(unitCondition.recordedAt)}, ${desc(unitCondition.id)} limit 1)`;

/**
 * `what` of the latest condition of the `component` row the query has, null without one: in the
 * component's tenant, not its unit's, as SQLite can't look two queries out from a subquery in an
 * `order by` (a unit's worst component, `automatic.ts`).
 */
const latestOfComponent = (what: SQL) =>
	latestWhere(
		and(
			eq(unitCondition.equipmentId, component.equipmentId),
			sql`${unitCondition.componentId} = ${component.id}`,
		),
		what,
		component.organizationId,
	);

/** A latest score, as a number. */
const asScore = (score: SQL) =>
	score.mapWith((value: number | null) => (value === null ? null : Number(value))) as SQL<
		number | null
	>;

/**
 * The latest score of the `component` row the query has, null without one: its condition's
 * (`componentSql()`), and the score the work orders page shows with it (`componentsOfUnits()`).
 */
export const componentScoreSql = () => asScore(latestOfComponent(sql`${unitCondition.score}`));

/** The SQL of a unit's condition and status (see above). */
export function conditionSql() {
	const signals = collectNow(unitSignals, undefined);
	const inspection = signals.find((signal) => signal.inspection)?.inspection ?? null;
	const nextDue = signals.find((signal) => signal.nextDue)?.nextDue ?? null;

	/** `what` of the unit's latest condition as a whole, null without one. */
	const latest = (what: SQL) =>
		latestWhere(
			and(eq(unitCondition.equipmentId, equipment.id), isNull(unitCondition.componentId)),
			what,
		);
	const score = asScore(latest(sql`${unitCondition.score}`));
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

	/**
	 * What a condition's score and advice ask for, as a place (0 critical, 1 attention, 3 ok), with
	 * or without the unit's inspection (`concernOf()`).
	 */
	const rankFor = (of: { score: SQL; advice: SQL }, withInspection: boolean) =>
		sql<number>`(case when ${of.score} < ${critical}${
			withInspection ? sql` or ${expired}` : sql``
		} then 0 when ${of.score} < ${attention}${
			withInspection ? sql` or ${rejected}` : sql``
		} or trim(coalesce(${of.advice}, '')) <> '' then 1 else 3 end)`;

	/**
	 * What the unit's components' latest conditions ask for, the worst, by their scores and advice
	 * alone: the inspection is the unit's, which its own place has already. Null without components.
	 */
	const componentsRank = sql<number | null>`(select min(${rankFor(
		{
			score: latestOfComponent(sql`${unitCondition.score}`),
			advice: latestOfComponent(sql`${unitCondition.advice}`),
		},
		false,
	)}) from ${component} where ${and(
		eq(component.equipmentId, equipment.id),
		sameTenant(component.organizationId),
	)})`;

	/** What its state and its components' ask for, the worst (`rolledUpStatus()`). */
	const concern = concernAt(
		sql`min(${rankFor({ score, advice }, true)}, coalesce(${componentsRank}, 3))`,
	);
	/** Its status: planned while its work is in hand. */
	const status = sql<UnitStatus>`(case when ${planned} then 'planned' else ${concern} end)`;
	/** A score's band (`scoreBand()`), `none` without one. */
	const bandOf = (of: SQL) =>
		sql<string>`(case when ${of} is null then 'none' when ${of} < ${critical} then 'low' when ${of} < ${attention} then 'fair' else 'good' end)`;

	return {
		score,
		advice,
		recordedAt,
		band: bandOf(score),
		inspection: inspection as SQL<string> | null,
		nextDue,
		planned,
		lastService,
		concern,
		status,
		/** Worst first: by status, then (for planned ones) what's behind it, then the lowest score. */
		sort: [rankOf(status), rankOf(concern), sql`coalesce(${score}, 101)`],
		/** For `componentSql()`. */
		parts: { critical, attention, expired, rejected, planned, rankFor, bandOf },
	};
}

export type ConditionSql = ReturnType<typeof conditionSql>;

/**
 * The SQL of a component's condition and status (`componentStatus()`), over the `component` row of
 * a query that joins it to its unit (`equipment`): its own latest condition, with its unit's
 * inspection and planned work from `unit` (built once for the request).
 */
export function componentSql(unit: ConditionSql = conditionSql()) {
	const { planned, rankFor, bandOf } = unit.parts;
	const latest = latestOfComponent;
	const score = componentScoreSql();
	const advice = latest(sql`${unitCondition.advice}`) as SQL<string | null>;
	const recordedAt = latest(sql`${unitCondition.recordedAt}`).mapWith(unitCondition.recordedAt);
	const concern = concernAt(rankFor({ score, advice }, true));
	const status = sql<UnitStatus>`(case when ${planned} then 'planned' else ${concern} end)`;
	return {
		score,
		advice,
		recordedAt,
		band: bandOf(score),
		concern,
		status,
		sort: [rankOf(status), rankOf(concern), sql`coalesce(${score}, 101)`],
	};
}

export type ComponentSql = ReturnType<typeof componentSql>;

/** `rankOf()`, for the lists that sort by a status of their own making. */
export { rankOf as statusRankSql };
