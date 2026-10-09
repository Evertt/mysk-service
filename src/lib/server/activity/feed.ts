/**
 * The activity log as the feed shows it: rows of `activity` made into entries, each with its
 * subject's noun, its changes with the names they refer to, and what its link is found by, in the
 * request's language. The queries that use it are in `#lib/components/activity/activity.remote.ts`.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";

import {
	type Change,
	describeChanges,
	type Names,
	referencedIds,
	type ReferenceType,
} from "#lib/activity/format.ts";
import { subjectNoun, type SubjectType, subjectTypes } from "#lib/activity/subjects.ts";
import { db } from "#lib/server/db/index.ts";
import { activity, customer, engineer, equipment, material } from "#lib/server/db/schema.ts";
import { inTenant, requireMember } from "#lib/server/session.ts";

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
	/** What they did, e.g. `updated` (see `actionVerbs` in `#lib/activity/subjects.ts`). */
	action: string;
	subject: SubjectLink;
	parent: SubjectLink | null;
	changes: Change[];
	note: string | null;
}

type Row = typeof activity.$inferSelect;

/** The names of the records that `ids` (by type) refer to, in the current tenant. */
export async function lookUpNames(ids: Map<ReferenceType, Set<string>>): Promise<Names> {
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
export async function subjectStates(keys: Map<string, Set<string>>) {
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
export async function present(rows: Row[]): Promise<ActivityEntry[]> {
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
