/**
 * The activity log, as the feed at /activity, a record's "Activity" card and the dashboard show
 * it: entries newest first, each with its subject's noun, its changes and links ready to show, in
 * the request's language. `activity-list.svelte` puts them in the action's sentence.
 */
import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, count, desc, eq, gt, isNotNull, lt, max, or } from "drizzle-orm";
import * as v from "valibot";

import { type LoggedType, subjectTypeLabel, subjectTypes } from "#lib/activity/index.ts";
import { isDay } from "#lib/dates.ts";
import { intlLocale } from "#lib/i18n/index.ts";
import { modules as appModules } from "#lib/modules/manifests.ts";
import { present } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, type TenantTable } from "#lib/server/auth/index.ts";
import { changedAt, watchChanges, watchSubject } from "#lib/server/changes.ts";
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

/** What the feed can be narrowed to (the URL's filters, but its page). */
const feedFilters = v.object({
	type: v.optional(v.string()),
	id: v.optional(v.string()),
	user: v.optional(v.string()),
	from: v.optional(day),
	to: v.optional(day),
});

/** The conditions of the feed's `filters`, in the tenant. */
const matching = ({ type, id, user, from, to }: v.InferOutput<typeof feedFilters>) => [
	inTenant(activity),
	type && id ? about(type, id) : type ? eq(activity.subjectType, type) : undefined,
	user ? eq(activity.userId, user) : undefined,
	// The days in the user's time zone.
	from || to ? inDays(activity.createdAt, [{ from: from ?? null, to: to ?? null }]) : undefined,
];

/**
 * One page of the tenant's activity, newest first, optionally of one subject `type` (with `id`:
 * of one subject and its parts), by one `user`, between `from` and `to` (days, inclusive), and
 * `before` an entry (the previous page's `older`).
 */
export const getActivity = forMembers.query(
	v.object({ ...feedFilters.entries, before: v.optional(v.pipe(v.number(), v.integer())) }),
	async ({ before, ...filters }) => {
		const conditions = matching(filters);
		const rows = await db
			.select()
			.from(activity)
			.where(and(...conditions, before ? lt(activity.id, before) : undefined))
			.orderBy(desc(activity.id))
			.limit(PAGE + 1);
		const page = rows.slice(0, PAGE);
		// The newest entry of the filters on any page: what `countNewActivity()` counts from.
		const [newest] = before
			? await db
					.select({ id: max(activity.id) })
					.from(activity)
					.where(and(...conditions))
			: [{ id: page[0]?.id ?? null }];
		return {
			entries: await present(page),
			/** Where the next (older) page starts, if there is one. */
			older: rows.length > PAGE ? page[page.length - 1].id : null,
			/** The newest entry matching the filters (on the first page or not), if any. */
			newest: newest?.id ?? null,
		};
	},
);

/**
 * How many entries matching the feed's filters came in `after` an entry (the feed's `newest`), for
 * a page past the first, which says so rather than move its entries.
 */
export const countNewActivity = forMembers.query(
	v.object({ ...feedFilters.entries, after: v.nullable(v.pipe(v.number(), v.integer())) }),
	async ({ after, ...filters }) => {
		const [found] = await db
			.select({ count: count() })
			.from(activity)
			.where(and(...matching(filters), after === null ? undefined : gt(activity.id, after)));
		return found.count;
	},
);

/**
 * Every subject type the log may name, the core's and all modules' (not only the tenant's: a module
 * switched on while a page watches logs as well).
 */
const loggedTypes = Object.keys(subjectTypes(allModules)) as LoggedType[];

/**
 * When the tenant's log last had an entry (epoch ms, 0 if not since the server started), sent again
 * on each change (once per burst), so the feed and the dashboard look again when anyone changes
 * something. See `watchSchedule` in the schedule module.
 */
export const watchActivity = forMembers.query.live(async function* () {
	const { organizationId } = currentTenant();
	// Watching before the first answer, so a change in between isn't missed.
	const changes = watchChanges(organizationId, loggedTypes);
	getRequestEvent().request.signal.addEventListener("abort", changes.stop, { once: true });
	try {
		yield changedAt(organizationId, loggedTypes);
		for await (const _ of changes) yield changedAt(organizationId, loggedTypes);
	} finally {
		changes.stop();
	}
});

/** The latest entries about a subject of the tenant and its parts, e.g. an order and its lines. */
export const getSubjectActivity = forMembers.query(
	v.object({ type: v.picklist(loggedTypes), id: v.string() }),
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
