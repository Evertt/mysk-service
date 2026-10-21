/**
 * The activity log, as the feed at /activity, a record's "Activity" card and the dashboard show
 * it: entries newest first, each with its subject's noun, its changes and links ready to show, in
 * the request's language. `activity-list.svelte` puts them in the action's sentence.
 */
import { and, count, desc, eq, gt, isNotNull, lt, max, or } from "drizzle-orm";
import * as v from "valibot";

import {
	everyLoggedType,
	subjectTypeLabel,
	subjectTypes,
	type TenantChange,
} from "#lib/activity/index.ts";
import { isDay } from "#lib/dates.ts";
import { intlLocale } from "#lib/i18n/index.ts";
import { recordId } from "#lib/schema.ts";
import { keyOf, readable, readableTypes, readOrNotFound } from "#lib/server/access/index.ts";
import { present } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { recordChangedAt } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { activity } from "#lib/server/db/schema.ts";
import { inDays } from "#lib/server/lists/index.ts";
import { liveFeed } from "#lib/server/live.ts";
import { forAnyRole, forMembers } from "#lib/server/remote-functions.ts";

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

/**
 * The tenant's entries the viewer may see: those of a subject type they read at all (not a module
 * that's off, nor the managers' types for another member; the entries stay in the database, and
 * show again when the module is on). The office reads its types whole, so the entry of a deleted
 * record stays.
 */
const ofReadableTypes = async () => [
	inTenant(activity),
	inList(activity.subjectType, await readableTypes()),
];

/** The conditions of the feed's `filters`, in the tenant. */
const matching = async ({ type, id, user, from, to }: v.InferOutput<typeof feedFilters>) => [
	...(await ofReadableTypes()),
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
	v.object({ ...feedFilters.entries, before: v.optional(recordId()) }),
	async ({ before, ...filters }) => {
		const conditions = await matching(filters);
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
	v.object({ ...feedFilters.entries, after: v.nullable(recordId()) }),
	async ({ after, ...filters }) => {
		const [found] = await db
			.select({ count: count() })
			.from(activity)
			.where(
				and(...(await matching(filters)), after === null ? undefined : gt(activity.id, after)),
			);
		return found.count;
	},
);

/** Every subject type the log may name (see `everyLoggedType()`). */
const loggedTypes = everyLoggedType();

/** A record of the tenant, as the log names it: its subject type and id. */
const subjectSchema = v.object({
	type: v.picklist(loggedTypes),
	id: v.union([v.string(), v.number()]),
});

/** The latest entries about a subject of the tenant and its parts, e.g. an order and its lines. */
export const getSubjectActivity = forMembers.query(
	v.object({ type: v.picklist(loggedTypes), id: v.string() }),
	async ({ type, id }) => {
		// A record the viewer may not read, or of a module the tenant lacks, is a 404.
		await readOrNotFound({ type, id });
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
		.where(and(...(await ofReadableTypes())))
		.orderBy(desc(activity.id))
		.limit(RECENT);
	return present(rows);
});

/** What the feed can be filtered by: the subject types and users in the tenant's log. */
export const getActivityFilters = forMembers.query(async () => {
	const { modules } = currentTenant();
	const types = subjectTypes(modules);
	const [subjects, users] = await Promise.all([
		db
			.selectDistinct({ type: activity.subjectType })
			.from(activity)
			.where(and(...(await ofReadableTypes()))),
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
 * Every change to the tenant's records, for the one live query an office tab shares
 * (`provideChangeFeed()`, `change-feed.svelte.ts`), which tells the components that watch a record
 * (`onRecordChange()`): one stream, whose key never changes, however many records the page shows
 * and however often it navigates. See `liveFeed()` for its answers.
 */
export const watchTenantChanges = forMembers.query.live(() => {
	const { user } = currentTenant();
	return liveFeed(loggedTypes, (changes) =>
		changes.map((change): TenantChange => ({
			type: change.type,
			id: change.id ?? null,
			action: change.action ?? "updated",
			name: change.user?.name ?? "",
			mine: change.user?.id === user.id,
			at: change.at,
		})),
	);
});

/**
 * When a record of the tenant last changed (epoch ms, 0 if not since the server started), for a
 * component that read it before the tab's feed was watching (`onRecordChange()`): on the page's
 * first load, and after the feed reconnected. For any role (the engineer portal's feed too): it
 * says only when, and the queries it has the component refresh are gated again.
 */
export const getRecordChangedAt = forAnyRole.query.batch(subjectSchema, async (subjects) => {
	const { organizationId } = currentTenant();
	// A record the asker may not read (or that is of a module that's off) answers 0, like one that
	// never changed, and the batch goes on. `readable()` trusts a rule that reads the tenant whole,
	// so the answer is the tenant's own: another tenant's id has no time here.
	const ok = await readable(subjects);
	return ({ type, id }) =>
		ok.has(keyOf({ type, id })) ? recordChangedAt(organizationId, { type, id: String(id) }) : 0;
});
