/**
 * The core's notification rules (see `NotificationRule`, `#lib/notifications/extensions.ts`), and
 * the conditions the modules' rules are made of. Each is a condition on an `activity` entry, which
 * the query (`./notifications.ts`) has already kept to the tenant's, the window's and other
 * people's. Constants are written in (`literal()`), so a statement with every rule binds little.
 */
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { LoggedType } from "#lib/activity/index.ts";
import type { ActivityAction } from "#lib/models.ts";
import type { NotificationRule } from "#lib/notifications/extensions.ts";
import { sameTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inLiterals, literal } from "#lib/server/db/parameters.ts";
import { activity, orderRequest } from "#lib/server/db/schema.ts";

/** An entry about a record of `type`, with one of `actions` (any, without). */
export const entryAbout = (type: LoggedType, actions?: readonly ActivityAction[]): SQL =>
	and(
		sql`${activity.subjectType} = ${literal(type)}`,
		actions ? inLiterals(activity.action, actions) : undefined,
	)!;

/**
 * An entry the system made by itself (`asSystem()`: the daily jobs, an integration's feed): no user,
 * and no user's name (a deleted user's entries keep theirs).
 */
export const bySystem: SQL = and(isNull(activity.userId), sql`${activity.userName} = ''`)!;

/**
 * The entry's subject's id as a number, for a correlated subquery on its table (subjects' ids are
 * text in the log).
 */
export const subjectNumber: SQL = sql`cast(${activity.subjectId} as integer)`;

/** Another entry about the same subject as the entry the rules look at. */
const sameSubject = alias(activity, "same_subject");
const aboutSameSubject = and(
	sameTenant(sameSubject, activity),
	eq(sameSubject.subjectType, activity.subjectType),
	eq(sameSubject.subjectId, activity.subjectId),
);

/**
 * An entry about a record `userId` created (its `created` entry is theirs), or whose previous entry
 * was theirs: who made or last changed a record hears of the next change, without following it.
 */
function aboutTheirRecord(userId: string): SQL {
	const created = db
		.select({ id: sameSubject.id })
		.from(sameSubject)
		.where(
			and(
				aboutSameSubject,
				eq(sameSubject.action, literal("created")),
				eq(sameSubject.userId, userId),
			),
		);
	const previousBy = db
		.select({ userId: sameSubject.userId })
		.from(sameSubject)
		.where(and(aboutSameSubject, sql`${sameSubject.id} < ${activity.id}`))
		.orderBy(sql`${sameSubject.id} desc`)
		.limit(1);
	return sql`(exists ${created} or ${previousBy} = ${userId})`;
}

/**
 * An order a customer's contact reported in the customer portal (`requestOrder()`). Built per
 * request, as every query (`db` is the request's).
 */
const reported = () =>
	db
		.select({ id: orderRequest.orderId })
		.from(orderRequest)
		.where(and(eq(orderRequest.orderId, subjectNumber), sameTenant(orderRequest, activity)));

/** An order's change whose status became `status` (`changes.status`, before and after). */
const statusBecame = (status: string) =>
	sql`json_extract(${activity.changes}, '$.status[1]') = ${literal(status)}`;

/** An entry recording when the order is planned for (`changes.scheduledFor`). */
const replanned = sql`json_type(${activity.changes}, '$.scheduledFor') is not null`;

/**
 * The core's rules, in the order the tray picks an entry's category by: the first that matches.
 * The modules add theirs (`notificationRules`) after the core's of the same audience.
 */
export const coreNotificationRules: readonly NotificationRule[] = [
	// The office.
	{
		id: "orders.reported",
		audience: "office",
		category: "reports",
		where: () => and(entryAbout("order", ["created"]), sql`exists ${reported()}`)!,
	},
	{
		// The orders the system made by itself: maintenance's due plans, condition's critical units, a
		// dock door's escalation. The order's entry doesn't say which module made it.
		id: "orders.automatic",
		audience: "office",
		category: "alerts",
		where: () => and(entryAbout("order", ["created"]), bySystem)!,
	},
	{
		// Only an engineer starts and completes an order (`orderTransitions`).
		id: "orders.fieldProgress",
		audience: "office",
		category: "field",
		where: () => entryAbout("order", ["work_started", "completed"]),
	},
	{
		id: "records.mine",
		audience: "office",
		category: "mine",
		where: ({ userId }) => aboutTheirRecord(userId),
	},
	// The engineer portal: their orders, and those taken off them.
	{
		// Cancelled while theirs (it keeps its engineer), or deleted while theirs (its entry records the
		// engineer it had).
		id: "orders.cancelled",
		audience: "engineer",
		category: "cancelled",
		where: ({ engineer }) =>
			sql`((${engineer!.aboutTheirOrder} and ${statusBecame("cancelled")}) or (${entryAbout("order", ["deleted"])} and ${engineer!.unassigned}))`,
	},
	{
		id: "orders.unassigned",
		audience: "engineer",
		category: "unassigned",
		where: ({ engineer }) => engineer!.unassigned,
	},
	{
		id: "orders.assigned",
		audience: "engineer",
		category: "assigned",
		where: ({ engineer }) => engineer!.assigned,
	},
	{
		id: "orders.planned",
		audience: "engineer",
		category: "planned",
		where: ({ engineer }) => sql`(${engineer!.aboutTheirOrder} and ${replanned})`,
	},
];
