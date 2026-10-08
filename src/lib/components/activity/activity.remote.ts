/**
 * The activity log, as the feed at /activity, a record's "Activity" card and the dashboard show
 * it: entries newest first, each with its subject's noun, its changes and links ready to show, in
 * the request's language. `activity-list.svelte` puts them in the action's sentence.
 */
import { query } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, desc, eq, gte, inArray, isNotNull, lt, or, type SQL } from "drizzle-orm";
import * as v from "valibot";

import {
	type Change,
	describeChanges,
	type Names,
	referencedIds,
	type ReferenceType,
} from "#lib/activity-format.js";
import { subjectNoun, subjectTypeLabel, subjectTypes, type SubjectType } from "#lib/activity.js";
import { intlLocale } from "#lib/format.js";
import { modules as appModules } from "#lib/modules.js";
import { m } from "#lib/paraglide/messages.js";
import { db } from "#lib/server/db/index.js";
import { activity, customer, engineer, equipment, material } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";

const allModules = appModules.map((module) => module.id);

/** Entries per page of the feed. */
const PAGE = 50;
/** Entries on a record's card and on the dashboard. */
const RECENT = 8;

export interface SubjectLink {
	/** E.g. `order`. */
	type: string;
	/** E.g. "order". */
	noun: string;
	/** How it read at the time (or, for some types, how it reads now, e.g. a module's name). */
	label: string;
	/**
	 * What its page is found by (`subjectHref()` makes the link, in the browser: `resolve()` can't
	 * run in a query), or `null` if it has no page or no longer exists.
	 */
	target: { id: string; label: string } | null;
}

export interface ActivityEntry {
	id: number;
	at: Date;
	user: string;
	/** What they did, e.g. `updated` (see `actionVerbs` in `#lib/activity.ts`). */
	action: string;
	subject: SubjectLink;
	parent: SubjectLink | null;
	changes: Change[];
	note: string | null;
}

type Row = typeof activity.$inferSelect;

/** The names of the records that `ids` (by type) refer to, in the current tenant. */
async function lookUpNames(ids: Map<ReferenceType, Set<string>>): Promise<Names> {
	const numbers = (type: ReferenceType) =>
		[...(ids.get(type) ?? [])].map(Number).filter(Number.isSafeInteger);
	const lookups = {
		customer: (list: number[]) =>
			db
				.select({ id: customer.id, name: customer.name })
				.from(customer)
				.where(and(inArray(customer.id, list), inTenant(customer))),
		engineer: (list: number[]) =>
			db
				.select({ id: engineer.id, name: engineer.name })
				.from(engineer)
				.where(and(inArray(engineer.id, list), inTenant(engineer))),
		equipment: (list: number[]) =>
			db
				.select({ id: equipment.id, name: equipment.serialNumber })
				.from(equipment)
				.where(and(inArray(equipment.id, list), inTenant(equipment))),
		material: (list: number[]) =>
			db
				.select({ id: material.id, name: material.name })
				.from(material)
				.where(and(inArray(material.id, list), inTenant(material))),
	} satisfies Record<ReferenceType, (list: number[]) => Promise<{ id: number; name: string }[]>>;

	const names: Names = {};
	await Promise.all(
		(Object.keys(lookups) as ReferenceType[]).map(async (type) => {
			const list = numbers(type);
			if (!list.length) return;
			const found = await lookups[type](list);
			names[type] = Object.fromEntries(found.map((row) => [String(row.id), row.name]));
		}),
	);
	return names;
}

/**
 * The latest label of each of these subjects and whether it was deleted, from the log itself:
 * every change is logged, so a subject exists unless its deletion is, and its newest entry has
 * its current label (e.g. a unit's new serial number, which its page is found by).
 */
async function subjectStates(keys: Map<string, Set<string>>) {
	const states = new Map<string, { label: string; deleted: boolean }>();
	if (!keys.size) return states;
	const found = await db
		.select({
			type: activity.subjectType,
			id: activity.subjectId,
			label: activity.subjectLabel,
			action: activity.action,
		})
		.from(activity)
		.where(
			and(
				inTenant(activity),
				or(
					...[...keys].map(([type, ids]) =>
						and(eq(activity.subjectType, type), inArray(activity.subjectId, [...ids])),
					),
				),
			),
		)
		.orderBy(desc(activity.id));
	for (const row of found) {
		const key = `${row.type}:${row.id}`;
		const state = states.get(key) ?? { label: row.label, deleted: false };
		// A member who was removed is gone too.
		if (row.action === "deleted" || row.action === "removed") state.deleted = true;
		states.set(key, state);
	}
	return states;
}

/** Log rows as entries to show, with the names and links they need. */
async function present(rows: Row[]): Promise<ActivityEntry[]> {
	if (!rows.length) return [];
	const types = subjectTypes(requireMember().modules);

	const keys = new Map<string, Set<string>>();
	const add = (type: string, id: string) => keys.set(type, (keys.get(type) ?? new Set()).add(id));
	const refs = new Map<ReferenceType, Set<string>>();
	for (const row of rows) {
		add(row.subjectType, row.subjectId);
		if (row.parentType && row.parentId) add(row.parentType, row.parentId);
		referencedIds(row.changes, types[row.subjectType], refs);
	}
	const [states, names] = await Promise.all([subjectStates(keys), lookUpNames(refs)]);

	const link = (type: string, id: string, label: string): SubjectLink => {
		const known: SubjectType | undefined = types[type];
		const state = states.get(`${type}:${id}`);
		return {
			type,
			noun: subjectNoun(type, known),
			label: known?.label?.({ id, label }) ?? label,
			target: known?.href && !state?.deleted ? { id, label: state?.label ?? label } : null,
		};
	};
	return rows.map((row) => ({
		id: row.id,
		at: row.createdAt,
		user: row.userName,
		action: row.action,
		subject: link(row.subjectType, row.subjectId, row.subjectLabel),
		parent:
			row.parentType && row.parentId
				? link(row.parentType, row.parentId, row.parentLabel ?? row.parentId)
				: null,
		changes: describeChanges(row.changes, types[row.subjectType], names),
		note: row.note,
	}));
}

/** Entries about a subject, or about records that are part of it (e.g. an order's lines). */
const about = (type: string, id: string) =>
	or(
		and(eq(activity.subjectType, type), eq(activity.subjectId, id)),
		and(eq(activity.parentType, type), eq(activity.parentId, id)),
	);

/** A day of a date input (`yyyy-mm-dd`). */
const day = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));
const startOf = (value: string) => new Date(`${value}T00:00`);
const dayAfter = (value: string) => {
	const date = startOf(value);
	date.setDate(date.getDate() + 1);
	return date;
};

/**
 * One page of the tenant's activity, newest first, optionally of one subject `type` (with `id`:
 * of one subject and its parts), by one `user`, between `from` and `to` (days, inclusive), and
 * `before` an entry (the previous page's `older`).
 */
export const getActivity = query(
	v.object({
		type: v.optional(v.string()),
		id: v.optional(v.string()),
		user: v.optional(v.string()),
		from: v.optional(day),
		to: v.optional(day),
		before: v.optional(v.pipe(v.number(), v.integer())),
	}),
	async ({ type, id, user, from, to, before }) => {
		requireMember();
		const filters: (SQL | undefined)[] = [
			inTenant(activity),
			type && id ? about(type, id) : type ? eq(activity.subjectType, type) : undefined,
			user ? eq(activity.userId, user) : undefined,
			from ? gte(activity.createdAt, startOf(from)) : undefined,
			to ? lt(activity.createdAt, dayAfter(to)) : undefined,
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
export const getSubjectActivity = query(
	v.object({ type: v.string(), id: v.string() }),
	async ({ type, id }) => {
		const { modules } = requireMember();
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
export const getRecentActivity = query(async () => {
	requireMember();
	const rows = await db
		.select()
		.from(activity)
		.where(inTenant(activity))
		.orderBy(desc(activity.id))
		.limit(RECENT);
	return present(rows);
});

/** What the feed can be filtered by: the subject types and users in the tenant's log. */
export const getActivityFilters = query(async () => {
	const { modules } = requireMember();
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
