/**
 * The activity log, as the feed at /activity, a record's "Activity" card and the dashboard show
 * it: entries newest first, each with its subject's noun, its changes and links ready to show, in
 * the request's language. `activity-list.svelte` puts them in the action's sentence.
 */
import { error } from "@sveltejs/kit";
import { and, desc, eq, gte, isNotNull, lt, or, type SQL } from "drizzle-orm";
import * as v from "valibot";

import { subjectTypeLabel, subjectTypes } from "#lib/activity/index.ts";
import { nextDay } from "#lib/dates.ts";
import { intlLocale } from "#lib/i18n/index.ts";
import { modules as appModules } from "#lib/modules/manifests.ts";
import { present } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { activity } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

const allModules = appModules.map((module) => module.id);

/** Entries per page of the feed. */
const PAGE = 50;
/** Entries on a record's card and on the dashboard. */
const RECENT = 8;

/** Entries about a subject, or about records that are part of it (e.g. an order's lines). */
const about = (type: string, id: string) =>
	or(
		and(eq(activity.subjectType, type), eq(activity.subjectId, id)),
		and(eq(activity.parentType, type), eq(activity.parentId, id)),
	);

/** A day of a date input (`yyyy-mm-dd`). */
const day = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));
const startOf = (value: string) => new Date(`${value}T00:00`);

/**
 * One page of the tenant's activity, newest first, optionally of one subject `type` (with `id`:
 * of one subject and its parts), by one `user`, between `from` and `to` (days, inclusive), and
 * `before` an entry (the previous page's `older`).
 */
export const getActivity = forMembers.query(
	v.object({
		type: v.optional(v.string()),
		id: v.optional(v.string()),
		user: v.optional(v.string()),
		from: v.optional(day),
		to: v.optional(day),
		before: v.optional(v.pipe(v.number(), v.integer())),
	}),
	async ({ type, id, user, from, to, before }) => {
		const filters: (SQL | undefined)[] = [
			inTenant(activity),
			type && id ? about(type, id) : type ? eq(activity.subjectType, type) : undefined,
			user ? eq(activity.userId, user) : undefined,
			from ? gte(activity.createdAt, startOf(from)) : undefined,
			to ? lt(activity.createdAt, nextDay(startOf(to))) : undefined,
			before ? lt(activity.id, before) : undefined,
		];
		const rows = await db
			.select()
			.from(activity)
			.where(and(...filters))
			.orderBy(desc(activity.id))
			.limit(PAGE + 1);
		const page = rows.slice(0, PAGE);
		return {
			entries: await present(page),
			/** Where the next (older) page starts, if there is one. */
			older: rows.length > PAGE ? page[page.length - 1].id : null,
		};
	},
);

/** The latest entries about a subject of the tenant and its parts, e.g. an order and its lines. */
export const getSubjectActivity = forMembers.query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { modules } = currentTenant();
		// A module's records are a 404 to a tenant without the module, like the rest of it.
		if (!(type in subjectTypes(modules)) && type in subjectTypes(allModules)) {
			error(404, m.common_error_not_found());
		}
		const rows = await db
			.select()
			.from(activity)
			.where(and(inTenant(activity), about(type, id)))
			.orderBy(desc(activity.id))
			.limit(RECENT);
		return present(rows);
	},
);

/** The tenant's latest entries, for the dashboard. */
export const getRecentActivity = forMembers.query(async () => {
	const rows = await db
		.select()
		.from(activity)
		.where(inTenant(activity))
		.orderBy(desc(activity.id))
		.limit(RECENT);
	return present(rows);
});

/** What the feed can be filtered by: the subject types and users in the tenant's log. */
export const getActivityFilters = forMembers.query(async () => {
	const { modules } = currentTenant();
	const types = subjectTypes(modules);
	const [subjects, users] = await Promise.all([
		db.selectDistinct({ type: activity.subjectType }).from(activity).where(inTenant(activity)),
		db
			.selectDistinct({ id: activity.userId, name: activity.userName })
			.from(activity)
			.where(and(inTenant(activity), isNotNull(activity.userId))),
	]);
	const byLabel = (a: { label: string }, b: { label: string }) =>
		a.label.localeCompare(b.label, intlLocale());
	return {
		types: subjects
			.map(({ type }) => ({ value: type, label: subjectTypeLabel(type, types[type]) }))
			.sort(byLabel),
		// One option per user, even if their name changed in between.
		users: [...new Map(users.map((u) => [u.id!, { value: u.id!, label: u.name }])).values()].sort(
			byLabel,
		),
	};
});
