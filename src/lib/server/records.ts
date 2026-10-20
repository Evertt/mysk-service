/**
 * The record toolkit: what every section does with its records the same way, so it's written once.
 *
 * - `orNotFound(row, message)`: a row, or a 404. A record looked up by its key from the URL has its
 *   own lookup (`lookupBy()`) in its domain's barrel, with core's message: `unitBySerial()`
 *   (`#lib/equipment/server/index.ts`), `customerByCode()` (`#lib/customers/server/index.ts`) and
 *   `orderByNumber()` (`#lib/orders/server/index.ts`).
 * - `deleteAndLog()` deletes a record and logs it; `defineRemoval()` makes a section's
 *   `removeX(id)`: find it or 404, refuse while something still needs it, delete and log.
 * - `nextPosition()`, `reorder()` and `nameTaken()` for the lists a tenant keeps in its own order
 *   with unique names (categories, locations, zones, components, …); `moveSchema`
 *   (`#lib/schema.ts`) is the form that moves one.
 *
 * Refusals are thrown as a `Refused` (`./refused.ts`).
 */
import { error } from "@sveltejs/kit";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";
import type { SelectedFields, SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import { moved } from "#lib/ordering.ts";
import type { MoveDirection } from "#lib/schema.ts";

import { type LoggedSubjects, recordActivity, type Subject } from "./activity/index.ts";
import { idInTenant, inTenant, type TenantTable } from "./auth/session.ts";
import { refuseIfReferenced } from "./db/errors.ts";
import { db, type Runner, type Transaction } from "./db/index.ts";
import { Refused } from "./refused.ts";

/** `row`, or a 404 with `message` when there's none: `orNotFound(await …, m.x_not_found())`. */
export function orNotFound<T>(row: T | null | undefined, message: string): T {
	if (row === null || row === undefined) error(404, message);
	return row;
}

/**
 * The ways to look up a record by its key; `lookupBy()` makes one. With `fields` (the default ones
 * otherwise) in `runner`, or, for a query that joins more to it, with `query`, which gets the
 * record's condition (`where`) and answers its rows.
 */
interface Lookup<Default extends SelectedFields> {
	(key: string): Promise<SelectResultFields<Default>>;
	<F extends SelectedFields>(
		key: string,
		fields: F,
		runner?: Runner,
	): Promise<SelectResultFields<F>>;
	<Row>(key: string, query: (where: SQL) => PromiseLike<Row[]>): Promise<Row>;
}

/**
 * A lookup of the tenant's records of `table` by `key`, the column of their page's URL (a unit's
 * serial number): it finds one or refuses with a 404 (`notFound`). The domains' barrels hold them,
 * so a module's card refuses with core's message too: `unitBySerial()`, `customerByCode()` and
 * `orderByNumber()`.
 *
 * ```ts
 * const { id } = await unitBySerial(serialNumber);
 * const unit = await unitBySerial(serialNumber, { id: equipment.id, name: equipment.name }, tx);
 * const unit = await unitBySerial(serialNumber, (where) =>
 * 	db.select({ …, category: equipmentCategory.name }).from(equipment).innerJoin(…).where(where));
 * ```
 */
export function lookupBy<Default extends SelectedFields>(
	table: SQLiteTable & { organizationId: SQLiteColumn },
	key: SQLiteColumn,
	defaults: Default,
	notFound: (key: string) => string,
): Lookup<Default> {
	return (async (
		value: string,
		shape: SelectedFields | ((where: SQL) => PromiseLike<unknown[]>) = defaults,
		runner: Runner = db,
	) => {
		const where = and(eq(key, value), inTenant(table))!;
		const [row] =
			typeof shape === "function"
				? await shape(where)
				: await runner.select(shape).from(table).where(where);
		return orNotFound(row, notFound(value));
	}) as Lookup<Default>;
}

/** A deletion: the record (`subject`, by its id) and how it's logged and refused. */
interface Deleting extends LoggedSubjects {
	/** The transaction it's part of; otherwise it makes its own. */
	tx?: Transaction;
	note?: string | null;
	/**
	 * The refusal when rows still refer to it (the database's foreign keys say so), also of optional
	 * modules the section doesn't know about. Without it, that's an error.
	 */
	referenced?: string;
}

/**
 * Deletes the tenant's record `subject.id` of `table` and logs it (`"deleted"`, against `parent`
 * too), in `tx` or a transaction of its own:
 * `await deleteAndLog(equipmentLocation, { tx, ...subjects(location, owner) })`. The checks before
 * it differ per section (counts of orders, a material in use), so they stay with the caller, or in
 * `defineRemoval()`'s `blockers`.
 *
 * Deleting is the one change that always looks the same. An update varies (`ignore`, a `note`, a
 * check in between) and spells out which fields are compared, so it's written out where it's made.
 */
export function deleteAndLog(
	table: SQLiteTable & TenantTable,
	{ tx, subject, parent, note, referenced }: Deleting,
): Promise<void> {
	const run = async (runner: Transaction) => {
		await runner.delete(table).where(idInTenant(table, subject.id));
		await recordActivity(runner, { action: "deleted", subject, parent, note });
	};
	const write = () => (tx ? run(tx) : db.transaction(run));
	return referenced === undefined ? write() : refuseIfReferenced(write, referenced);
}

/** A section's rule for removing its records; see `defineRemoval()`. */
interface Removal<Row extends { id: number }> {
	table: SQLiteTable & TenantTable;
	/** The tenant's record `id` with what the rest needs, or none (a 404 with `notFound`). */
	find: (tx: Transaction, id: number) => Promise<Row | undefined>;
	notFound: () => string;
	subject: (row: Row) => Subject;
	/**
	 * Why it can't go, if something still needs it (orders, units, …): the refusal's message, or
	 * none. Asked in the deletion's transaction.
	 */
	blockers?: (row: Row, tx: Transaction) => Promise<string | undefined>;
	/** What goes with it first, e.g. a contract's coverage. */
	before?: (row: Row, tx: Transaction) => Promise<void>;
	/**
	 * The refusal when other rows (also optional modules') still refer to it; none for a record
	 * nothing refers to.
	 */
	referenced?: () => string;
}

/**
 * A section's `removeX(id)`, which its page's delete and the list's bulk delete share: finds the
 * tenant's record (a 404 if there's none), refuses (`Refused`) while `blockers` name something that
 * still needs it, then deletes and logs it (`deleteAndLog()`), all in one transaction.
 *
 * ```ts
 * export const removeEngineer = defineRemoval({
 * 	table: engineer,
 * 	find: (tx, id) => tx.query.engineer.findFirst({ where: idInTenant(engineer, id) }),
 * 	notFound: m.engineers_not_found,
 * 	subject: (found) => ({ type: "engineer", id: found.id, label: found.name }),
 * 	blockers: async (found, tx) => …,
 * 	referenced: m.engineers_delete_referenced,
 * });
 * ```
 */
export function defineRemoval<Row extends { id: number }>(rule: Removal<Row>) {
	const remove = (id: number) =>
		db.transaction(async (tx) => {
			const row = orNotFound(await rule.find(tx, id), rule.notFound());
			const blocked = await rule.blockers?.(row, tx);
			if (blocked) throw new Refused(blocked);
			await rule.before?.(row, tx);
			await deleteAndLog(rule.table, { tx, subject: rule.subject(row) });
		});
	const { referenced } = rule;
	return (id: number): Promise<void> =>
		referenced ? refuseIfReferenced(() => remove(id), referenced()) : remove(id);
}

/** A table whose records the tenant keeps in an order of its own, by `position`. */
type Ordered = SQLiteTable & TenantTable & { position: SQLiteColumn };

/**
 * The position after the last of the tenant's records of `table` (those in `scope`, e.g. a site's
 * locations), 0 for the first: where a new one goes.
 */
export async function nextPosition(runner: Runner, table: Ordered, scope?: SQL): Promise<number> {
	const [{ last }] = await runner
		.select({ last: sql<number | null>`max(${table.position})` })
		.from(table)
		.where(and(inTenant(table), scope));
	return last === null ? 0 : last + 1;
}

/** A record whose place `reorder()` changed: where it was (`from`) and is now (`to`), from 0. */
export interface Moved {
	id: number;
	from: number;
	to: number;
}

/**
 * Moves the tenant's record `id` of `table` one place `direction` among those in `scope` (e.g. a
 * unit's components), past its neighbour, in `tx`. They're numbered afresh from 0, so places that
 * were equal or had gaps between them are in order. Returns the records whose place changed (none
 * for the first one up or the last one down), for the caller to log.
 */
export async function reorder(
	tx: Transaction,
	table: Ordered,
	id: number,
	direction: MoveDirection,
	scope?: SQL,
): Promise<Moved[]> {
	const rows = await tx
		.select({ id: table.id, position: table.position })
		.from(table)
		.where(and(inTenant(table), scope))
		.orderBy(table.position, table.id);
	const order = moved(
		rows,
		rows.findIndex((row) => row.id === id),
		direction,
	);
	if (order.every((row, i) => row === rows[i])) return [];
	const changed = order
		.map((row, to) => ({ id: row.id as number, from: row.position as number, to }))
		.filter((row) => row.from !== row.to);
	for (const row of changed) {
		await tx.update(table).set({ position: row.to }).where(idInTenant(table, row.id));
	}
	return changed;
}

/**
 * The tenant's record of `table` (in `scope`, e.g. a site's locations; but `except`, the one being
 * renamed) named `name` in any case, if there is one. Compared with SQLite's `lower()`, as the
 * unique indexes compare them: it lowers ASCII letters only.
 */
export async function nameTaken<T extends SQLiteTable & TenantTable & { name: SQLiteColumn }>(
	runner: Runner,
	table: T,
	name: string,
	{ scope, except }: { scope?: SQL; except?: number } = {},
): Promise<T["$inferSelect"] | undefined> {
	const [taken] = await runner
		.select()
		.from(table as SQLiteTable)
		.where(
			and(
				inTenant(table),
				scope,
				eq(sql`lower(${table.name})`, sql`lower(${name})`),
				except === undefined ? undefined : ne(table.id, except),
			),
		);
	return taken as T["$inferSelect"] | undefined;
}
