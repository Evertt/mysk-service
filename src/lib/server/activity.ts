/**
 * The activity log (`activity`): who changed which record, and how. Every mutation records itself
 * with `recordActivity()`, inside the `db.transaction` that makes the change, so a change that is
 * refused or rolled back logs nothing:
 *
 * ```ts
 * await db.transaction(async (tx) => {
 *   await tx.update(customer).set(input).where(and(eq(customer.id, id), inTenant(customer)));
 *   await recordActivity(tx, {
 *     action: "updated",
 *     subject: { type: "customer", id, label: existing.code },
 *     before: existing, // the row as loaded
 *     after: input, // what the update sets: only these fields are compared
 *   });
 * });
 * ```
 *
 * The tenant and the user come from the request (`requireMember()`). How entries read (the
 * subject's name and link, field labels and values) is `subjectTypes` in `#lib/activity.ts`.
 */
import { and, inArray } from "drizzle-orm";

import type { ActivityAction } from "#lib/models.js";
import { activity, type ActivityChanges, material } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import { roundQuantity, type Transaction } from "#lib/server/stock.js";

/** A record the log is about: its type (see `subjectTypes`), id, and how it reads now. */
export interface Subject {
	/** E.g. `order`. */
	type: string;
	id: string | number;
	/** What it's known by, e.g. its order number or customer code: kept as it is now. */
	label: string;
}

export interface ActivityRecord {
	action: ActivityAction;
	subject: Subject;
	/** The record the subject is part of, e.g. an order line's order: it shows on its card too. */
	parent?: Subject | null;
	/** For an update: the record before it, e.g. as loaded (extra fields don't matter). */
	before?: object | null;
	/** For an update: what it set. Only these fields are compared with `before`. */
	after?: object | null;
	/** Fields to leave out of the changes, besides `ignoredFields`. */
	ignore?: readonly string[];
	/** Anything else worth saying, e.g. the note with received stock. */
	note?: string | null;
}

/** Fields that are never worth listing: keys and timestamps the app keeps itself. */
export const ignoredFields = ["id", "organizationId", "createdAt", "updatedAt"];

/** `null`, `undefined` and the empty string all mean "nothing". */
const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

/** A value as it's stored in the log (JSON): dates as ISO strings, nothing as `null`. */
const normalize = (value: unknown) =>
	isEmpty(value) ? null : value instanceof Date ? value.toISOString() : value;

/**
 * The fields of `after` whose value differs from the same field of `before`, with both values:
 * `{ status: ["quote", "scheduled"] }`. Dates compare by time and are given as ISO strings;
 * arrays and objects compare by value; `null`, `undefined` and `""` are the same (nothing).
 * Fields in `ignore`, and fields that `after` leaves `undefined`, are skipped.
 */
export function diff(
	before: object,
	after: object,
	{ ignore = [] }: { ignore?: readonly string[] } = {},
): ActivityChanges {
	const old = before as Record<string, unknown>;
	const changes: ActivityChanges = {};
	for (const [field, value] of Object.entries(after)) {
		if (value === undefined || ignore.includes(field)) continue;
		const [was, is] = [normalize(old[field]), normalize(value)];
		if (JSON.stringify(was) !== JSON.stringify(is)) changes[field] = [was, is];
	}
	return changes;
}

/**
 * Logs a change to a record by the signed-in user, in the current tenant. Call it inside the
 * `db.transaction` that makes the change, after making it. With `before` and `after`, logs the
 * fields that changed, and nothing at all if none did (e.g. a form saved as it was).
 * Returns whether it logged anything.
 */
export async function recordActivity(tx: Transaction, record: ActivityRecord) {
	const { organizationId, user } = requireMember();
	const { action, subject, parent, before, after, note } = record;
	let changes: ActivityChanges | null = null;
	if (before && after) {
		changes = diff(before, after, { ignore: [...ignoredFields, ...(record.ignore ?? [])] });
		if (!Object.keys(changes).length) return false;
	}
	await tx.insert(activity).values({
		organizationId,
		userId: user.id,
		userName: user.name,
		action,
		subjectType: subject.type,
		subjectId: String(subject.id),
		subjectLabel: subject.label,
		parentType: parent?.type ?? null,
		parentId: parent ? String(parent.id) : null,
		parentLabel: parent?.label ?? null,
		changes,
		note: note || null,
	});
	return true;
}

// --- Order lines ---------------------------------------------------------------------------------

interface Line {
	materialId: number;
	quantity: number;
}

/**
 * Logs the changes to an order's lines, against the order: a material added (`created`), removed
 * (`deleted`) or its quantity changed (`updated`). Lines are replaced on every save, so they're
 * told apart by material (the subject's id), with their quantities added up, like their stock.
 */
export async function recordOrderLines(
	tx: Transaction,
	order: Subject,
	before: readonly Line[],
	after: readonly Line[],
) {
	const total = (lines: readonly Line[]) => {
		const totals = new Map<number, number>();
		for (const line of lines) {
			totals.set(
				line.materialId,
				roundQuantity((totals.get(line.materialId) ?? 0) + line.quantity),
			);
		}
		return totals;
	};
	const [was, is] = [total(before), total(after)];
	const changed = [...new Set([...was.keys(), ...is.keys()])].filter(
		(id) => was.get(id) !== is.get(id),
	);
	if (!changed.length) return;

	const names = new Map(
		(
			await tx
				.select({ id: material.id, name: material.name })
				.from(material)
				.where(and(inArray(material.id, changed), inTenant(material)))
		).map((row) => [row.id, row.name]),
	);
	for (const id of changed) {
		const [quantity, now] = [was.get(id), is.get(id)];
		await recordActivity(tx, {
			action: quantity === undefined ? "created" : now === undefined ? "deleted" : "updated",
			subject: { type: "order_line", id, label: names.get(id) ?? `#${id}` },
			parent: order,
			before: { quantity: quantity ?? null },
			after: { quantity: now ?? null },
		});
	}
}
