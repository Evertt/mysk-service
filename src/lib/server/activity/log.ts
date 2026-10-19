/**
 * The activity log (`activity`): who changed which record, and how. Every mutation records itself
 * with `recordActivity()`, inside the `db.transaction` that makes the change, so a change that is
 * refused or rolled back logs nothing:
 *
 * ```ts
 * await db.transaction(async (tx) => {
 *   await tx.update(customer).set(input).where(idInTenant(customer, id));
 *   await recordActivity(tx, {
 *     action: "updated",
 *     subject: customerSubject(existing),
 *     before: existing, // the row as loaded
 *     after: input, // what the update sets: only these fields are compared
 *   });
 * });
 * ```
 *
 * The tenant and the user come from the request (`requireTenant()`, so the engineer portal's
 * changes are logged too), unless given as `by` (e.g. accepting an invitation, which is done in
 * the invitation's organization rather than the current one). A change the system made by itself
 * (`asSystem()`, e.g. the daily jobs) is logged without a user and an empty `userName`, which the
 * log shows as the system's (`m.activity_system_user()`). How entries read (the
 * subject's name and link, field labels and values) is `subjectTypes` in `#lib/activity/subjects.ts`.
 */
import type { LoggedType } from "#lib/activity/index.ts";
import type { ActivityAction } from "#lib/models.ts";
import { isSystemUser, requireTenant } from "#lib/server/auth/index.ts";
import { announceChange } from "#lib/server/changes.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { activity, type ActivityChanges } from "#lib/server/db/schema.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";

/** A record the log is about: its type (see `subjectTypes`), id, and how it reads now. */
export interface Subject {
	/** E.g. `order`. */
	type: LoggedType;
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

/** How an entry names its record and, if it has one, the record it is part of. */
export type LoggedSubjects = Pick<ActivityRecord, "subject" | "parent">;

/** Fields that are never worth listing: keys and timestamps the app keeps itself. */
export const ignoredFields = ["id", "organizationId", "createdAt", "updatedAt"];

/** `null`, `undefined` and the empty string all mean "nothing". */
const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

/**
 * A value as it's stored in the log (JSON): days as `yyyy-mm-dd`, moments as ISO strings
 * (`2026-10-12T07:30:00Z`), nothing as `null`.
 */
function normalize(value: unknown) {
	if (isEmpty(value)) return null;
	if (value instanceof Temporal.PlainDate || value instanceof Temporal.Instant)
		return value.toString();
	return value instanceof Date ? value.toISOString() : value;
}

/**
 * The fields of `after` whose value differs from the same field of `before`, with both values:
 * `{ status: ["quote", "scheduled"] }`. Days and moments compare as their ISO strings;
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

/** Who made a change, and in which organization. */
export interface Actor {
	organizationId: string;
	user: { id: string; name: string };
}

/**
 * Logs a change to a record by the signed-in user, in the current tenant (or by `by`). Call it
 * inside the `db.transaction` that makes the change, after making it. With `before` and `after`,
 * logs the fields that changed, and nothing at all if none did (e.g. a form saved as it was).
 * Returns whether it logged anything.
 */
export async function recordActivity(
	tx: Transaction,
	record: ActivityRecord,
	by: Actor = requireTenant(),
) {
	const { organizationId, user } = by;
	// The system is no row of the user table: it's logged as no user, and shown as itself.
	const system = isSystemUser(user);
	const { action, subject, parent, before, after, note } = record;
	let changes: ActivityChanges | null = null;
	if (before && after) {
		changes = diff(before, after, { ignore: [...ignoredFields, ...(record.ignore ?? [])] });
		if (!Object.keys(changes).length) return false;
	}
	await tx.insert(activity).values({
		organizationId,
		userId: system ? null : user.id,
		userName: system ? "" : user.name,
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
	// Live queries showing records of this type (or its parent's), or this record (or its parent),
	// look again once it's committed.
	const name = system ? m.activity_system_user() : user.name;
	const made = { action, user: { id: user.id, name } };
	afterCommit(() => {
		announceChange(organizationId, subject.type, { ...made, id: String(subject.id) });
		if (parent) announceChange(organizationId, parent.type, { ...made, id: String(parent.id) });
	});
	return true;
}

/**
 * Logs a change that was made outside a transaction of the app's, e.g. by better-auth's
 * organization endpoints (members, invitations): call it once the change has succeeded.
 */
export const recordActivityAfter = (record: ActivityRecord, by?: Actor) =>
	db.transaction((tx) => recordActivity(tx, record, by));
