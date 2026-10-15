/**
 * The activity log, as the feed at /activity, a record's "Activity" card and the dashboard show
 * it: entries newest first, each with its subject's noun, its changes and links ready to show, in
 * the request's language. `activity-list.svelte` puts them in the action's sentence.
 */
import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, desc, eq, isNotNull, lt, or, type SQL } from "drizzle-orm";
import * as v from "valibot";

import { subjectTypeLabel, subjectTypes } from "#lib/activity/index.ts";
import { isDay } from "#lib/dates.ts";
import { intlLocale } from "#lib/i18n/index.ts";
import { modules as appModules } from "#lib/modules/manifests.ts";
import { present } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, type TenantTable } from "#lib/server/auth/index.ts";
import { watchSubject } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { activity, customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { inDays } from "#lib/server/lists/index.ts";
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
const day = v.pipe(
	v.string(),
	v.check((value) => isDay(value)),
);

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
			// The days in the user's time zone.
			from || to ? inDays(activity.createdAt, [{ from: from ?? null, to: to ?? null }]) : undefined,
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

/**
 * The records whose pages can say that someone else changed them (`watchRecordChanges`), by their
 * activity subject type, with their table, to check that the record is the tenant's. Add a type
 * here to give its pages `<ChangedElsewhere>`.
 */
const watchedRecords = { order, customer, equipment, engineer } satisfies Record<
	string,
	TenantTable
>;

/** A change to a record that a page has open: what was done, by whom, and when. */
export interface RecordChange {
	/** E.g. `updated` or `deleted` (an activity action). */
	action: string;
	/** Who did it, as the activity log names them. */
	name: string;
	/** Whether it was the signed-in user (on this page or another). */
	mine: boolean;
	at: Temporal.Instant;
}

/**
 * The changes to a record of the tenant (and to its parts, e.g. an order's lines) as they're
 * made, for a page that has it open (`<ChangedElsewhere>`): `null` at first, then each change
 * (the latest of a burst). A 404 if the record isn't the tenant's.
 */
export const watchRecordChanges = forMembers.query.live(
	v.object({
		type: v.picklist(Object.keys(watchedRecords) as (keyof typeof watchedRecords)[]),
		id: v.pipe(v.number(), v.integer()),
	}),
	async function* ({ type, id }) {
		const { organizationId, user } = currentTenant();
		// Watching before checking, so a change in between isn't missed.
		const changes = watchSubject(organizationId, { type, id: String(id) });
		getRequestEvent().request.signal.addEventListener("abort", changes.stop, { once: true });
		try {
			const table = watchedRecords[type];
			const [found] = await db.select({ id: table.id }).from(table).where(idInTenant(table, id));
			if (!found) error(404, m.common_error_not_found());
			yield null;
			for await (const change of changes) {
				yield {
					action: change.action ?? "updated",
					name: change.user?.name ?? "",
					mine: change.user?.id === user.id,
					at: Temporal.Instant.fromEpochMilliseconds(change.at),
				} satisfies RecordChange as RecordChange | null;
			}
		} finally {
			changes.stop();
		}
	},
);
