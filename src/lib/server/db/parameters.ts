/**
 * Statements within SQLite's limit on bound parameters. On Cloudflare the database is a Durable
 * Object's SQLite (`durable.ts`), which takes at most 100 per statement (libsql takes 32,766), so
 * the app never binds a list's values one by one:
 *
 * - `inList(column, values)` instead of drizzle's `inArray()`: the values go in one JSON
 *   parameter, `column IN (SELECT value FROM json_each(?))`, however many there are.
 * - `insertRows(tx, table, rows)` inserts many rows in statements that fit (`insertBatches()` for
 *   one with `.returning()`).
 *
 * Every statement is held to the limit on libsql too (`checkParameters()`, in `serialize.ts`), so
 * the tests catch one that wouldn't run on Cloudflare. `parameters.spec.ts` checks that nothing
 * imports `inArray` or `notInArray`.
 */
import { type Column, getTableColumns, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { SQLiteInsertValue, SQLiteTable } from "drizzle-orm/sqlite-core";

import type { Transaction } from "./index.ts";

/** The most bound parameters a statement may have (a Durable Object's SQLite's limit). */
export const maxParameters = 100;

/** A statement with more bound parameters than `maxParameters`. */
export class TooManyParameters extends Error {
	constructor(count: number, query: string) {
		super(
			`A statement has ${count} bound parameters; at most ${maxParameters} run on Cloudflare ` +
				`(use inList() or insertRows(), #lib/server/db/parameters.ts): ${query.slice(0, 200)}`,
		);
	}
}

/** Throws `TooManyParameters` for a statement over the limit. */
export function checkParameters(query: string, count: number) {
	if (count > maxParameters) throw new TooManyParameters(count, query);
}

/** `value` as the column stores it (an enum's text, a moment's seconds), as `inArray()` does. */
function driverValue(column: SQLWrapper, value: unknown): unknown {
	const mapped =
		"mapToDriverValue" in column && typeof column.mapToDriverValue === "function"
			? (column as Column).mapToDriverValue(value)
			: value;
	return typeof mapped === "bigint" ? Number(mapped) : mapped;
}

/**
 * `column` is one of `values` (none: false), with the values in one JSON parameter. Use it
 * instead of drizzle's `inArray()`, which binds each value.
 */
export function inList<T>(column: SQLWrapper, values: readonly T[]): SQL {
	if (!values.length) return sql`0`;
	const json = JSON.stringify(values.map((value) => driverValue(column, value)));
	return sql`${column} in (select value from json_each(${json}))`;
}

/** What `literal()` takes: text of letters, digits and `-_:. ` (an enum's value, a day). */
const plainText = /^[\w\-:. ]*$/;

/**
 * A constant of the code's own (an enum's value, a day, a threshold) written into the statement
 * rather than bound: for SQL that repeats an expression many times over in one statement (a unit's
 * status, made of correlated subqueries, in a list's select, sort and filter), which would bind it
 * each time and soon pass `maxParameters`. Never for input: it refuses anything but plain text,
 * finite numbers and booleans.
 */
export function literal(value: string | number | boolean): SQL {
	if (typeof value === "boolean") return sql.raw(value ? "1" : "0");
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`Not a literal: ${value}`);
		return sql.raw(String(value));
	}
	if (!plainText.test(value)) throw new Error(`Not a literal: ${JSON.stringify(value)}`);
	return sql.raw(`'${value}'`);
}

/** `expression` is one of the constants `values`, written in (see `literal()`). */
export function inLiterals(expression: SQLWrapper, values: readonly (string | number)[]): SQL {
	if (!values.length) return sql`0`;
	return sql`${expression} in (${sql.join(values.map(literal), sql`, `)})`;
}

/** `column` is none of `values` (none: true); see `inList()`. */
export function notInList<T>(column: SQLWrapper, values: readonly T[]): SQL {
	if (!values.length) return sql`1`;
	const json = JSON.stringify(values.map((value) => driverValue(column, value)));
	return sql`${column} not in (select value from json_each(${json}))`;
}

/**
 * `rows` in batches that a multi-row insert into `table` can take, which binds a value (or a
 * `null`) for each of the table's columns per row. For an insert with `.returning()`:
 *
 * ```ts
 * for (const batch of insertBatches(invoiceLine, lines)) {
 *   added.push(...(await tx.insert(invoiceLine).values(batch).returning(loggedLine)));
 * }
 * ```
 */
export function insertBatches<TTable extends SQLiteTable, TRow>(table: TTable, rows: TRow[]) {
	const columns = Object.keys(getTableColumns(table)).length;
	const perBatch = Math.max(1, Math.floor(maxParameters / columns));
	return Array.from({ length: Math.ceil(rows.length / perBatch) }, (_, i) =>
		rows.slice(i * perBatch, (i + 1) * perBatch),
	);
}

/** Inserts `rows` into `table` in as few statements as fit within the limit, in `tx`. */
export async function insertRows<TTable extends SQLiteTable>(
	tx: Transaction,
	table: TTable,
	rows: SQLiteInsertValue<TTable>[],
) {
	for (const batch of insertBatches(table, rows)) await tx.insert(table).values(batch);
}
