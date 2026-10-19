/**
 * Notifications, worked out from the activity log: an entry is one for the signed-in user when a
 * rule of their audience matches it (the core's, `./rules.ts`, and those of the tenant's modules,
 * `notificationRules`), it's in the window (the last 30 days), and someone else made it (or the
 * system). Nothing is stored per user but how far they've read (`notification_seen`): the entries
 * after it are unread. A rule added later covers past entries too.
 *
 * The office's bell (`forMembers`) and the engineer portal's (`forEngineers`, whose rules read the
 * engineer's orders through `engineerActivity()`) share these.
 */
import { error } from "@sveltejs/kit";
import { and, desc, eq, gt, gte, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import {
	type NotificationAudience,
	type NotificationCategory,
	type NotificationRule,
	notificationRules,
} from "#lib/notifications/extensions.ts";
import { type ActivityEntry, present } from "#lib/server/activity/index.ts";
import { currentTenant, engineerActivity, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList, literal } from "#lib/server/db/parameters.ts";
import { activity, notificationSeen } from "#lib/server/db/schema.ts";
import { collectNow } from "#lib/server/extensions.ts";

import { coreNotificationRules } from "./rules.ts";

/** How far back the bell looks. */
export const NOTIFICATION_DAYS = 30;
/** The most entries the tray shows: the newest. */
export const TRAY_SIZE = 50;
/** The most unread entries the dot counts: one more reads as "9+". */
export const UNREAD_CAP = 9;

/** A notification: an activity entry as the feed shows it, with its category and whether it's new. */
export interface NotificationEntry extends ActivityEntry {
	category: NotificationCategory;
	/** Newer than what the user had seen when the tray was read. */
	unread: boolean;
}

/** What the dot says (see `Notifications.unread()`). */
export interface UnreadNotifications {
	/** How many came in after what the user has seen, up to one more than `UNREAD_CAP`. */
	count: number;
	/** The newest one's id, or `null` without any. */
	newest: number | null;
}

/** The rules of `audience`: the core's, then the `modules`' (those that are on), in registry order. */
export function rulesFor(
	audience: NotificationAudience,
	modules: readonly string[],
): NotificationRule[] {
	const contributed = collectNow(notificationRules, undefined, modules).flat();
	return [...coreNotificationRules, ...contributed].filter((rule) => rule.audience === audience);
}

/** The signed-in user's notifications, for reading now and after later changes. */
export interface Notifications {
	/** What the dot says: the unread ones, counted up to a cap, and the newest one. */
	unread(): Promise<UnreadNotifications>;
	/** How far the user has read: an activity entry's id, or 0. */
	lastSeen(): Promise<number>;
	/** The newest notifications' ids and categories (at most `limit`), after entry `after`. */
	matching(
		limit: number,
		after?: number,
	): Promise<{ id: number; category: NotificationCategory }[]>;
}

/**
 * The signed-in user's notifications in the current tenant, of `audience`. Everything it needs from
 * the request (the tenant, the user, the modules, the rules' conditions) is read here, once, so a
 * live query can ask again after each change, outside the request's own context. The rules'
 * conditions are one `case`, built once: the first rule that matches gives the category.
 */
export async function notificationsFor(audience: NotificationAudience): Promise<Notifications> {
	const { organizationId, user, modules } = currentTenant();
	const rules = rulesFor(audience, modules);
	const context = {
		userId: user.id,
		engineer: audience === "engineer" ? await engineerActivity() : null,
	};
	const category = sql<NotificationCategory | null>`case ${sql.join(
		rules.map((rule) => sql`when ${rule.where(context)} then ${literal(rule.category)}`),
		sql` `,
	)} end`;
	// The tenant the request admitted, as `inTenant()` reads it (here once, for later answers too).
	const ofTenant = eq(activity.organizationId, organizationId);

	async function lastSeen() {
		const [row] = await db
			.select({ id: notificationSeen.lastSeenActivityId })
			.from(notificationSeen)
			.where(
				and(
					eq(notificationSeen.organizationId, organizationId),
					eq(notificationSeen.userId, user.id),
				),
			);
		return row?.id ?? 0;
	}

	async function matching(limit: number, after = 0) {
		if (!rules.length) return [];
		const since = Temporal.Now.instant().subtract({ hours: 24 * NOTIFICATION_DAYS });
		const candidates = db
			.select({ id: activity.id, category: category.as("category") })
			.from(activity)
			.where(
				and(
					ofTenant,
					// Never the user's own; the system's (no user) are someone else's.
					or(isNull(activity.userId), ne(activity.userId, user.id)),
					gte(activity.createdAt, since),
					after ? gt(activity.id, after) : undefined,
				),
			)
			.as("candidates");
		const found = await db
			.select({ id: candidates.id, category: candidates.category })
			.from(candidates)
			.where(isNotNull(candidates.category))
			.orderBy(desc(candidates.id))
			.limit(limit);
		return found as { id: number; category: NotificationCategory }[];
	}

	return {
		lastSeen,
		matching,
		async unread() {
			const found = await matching(UNREAD_CAP + 1, await lastSeen());
			return { count: found.length, newest: found[0]?.id ?? null };
		},
	};
}

/**
 * The tray: the newest notifications for the signed-in user (at most `TRAY_SIZE`), as the feed
 * presents them, each with its category and whether it's unread, and how far they had read.
 */
export async function notificationTray(audience: NotificationAudience): Promise<{
	entries: NotificationEntry[];
	lastSeen: number;
}> {
	const notifications = await notificationsFor(audience);
	const [found, seen] = await Promise.all([
		notifications.matching(TRAY_SIZE),
		notifications.lastSeen(),
	]);
	if (!found.length) return { entries: [], lastSeen: seen };
	const rows = await db
		.select()
		.from(activity)
		.where(
			and(
				inTenant(activity),
				inList(
					activity.id,
					found.map((each) => each.id),
				),
			),
		)
		.orderBy(desc(activity.id));
	const categories = new Map(found.map((each) => [each.id, each.category]));
	const entries = await present(rows);
	return {
		entries: entries.map((entry) => ({
			...entry,
			category: categories.get(entry.id)!,
			unread: entry.id > seen,
		})),
		lastSeen: seen,
	};
}

/**
 * Marks the signed-in user's notifications read up to entry `upToId` (the newest the tray showed,
 * so one that came in while it was open stays unread). Never back: an older id leaves it as it is.
 * A 404 when the entry isn't the tenant's.
 */
export async function markSeenUpTo(upToId: number) {
	const { organizationId, user } = currentTenant();
	const [entry] = await db
		.select({ id: activity.id })
		.from(activity)
		.where(idInTenant(activity, upToId));
	if (!entry) error(404, m.common_error_not_found());
	await db
		.insert(notificationSeen)
		.values({ organizationId, userId: user.id, lastSeenActivityId: entry.id })
		.onConflictDoUpdate({
			target: [notificationSeen.organizationId, notificationSeen.userId],
			set: {
				lastSeenActivityId: sql`max(${notificationSeen.lastSeenActivityId}, excluded.last_seen_activity_id)`,
				updatedAt: Temporal.Now.instant(),
			},
		});
}
