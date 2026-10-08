/**
 * The server side of bulk actions on a table's selected rows (see
 * `#lib/components/data-table/bulk-actions.ts`). A bulk command:
 *
 * 1. starts with `requireMember()` (or `requireModule()`),
 * 2. reads its target into ids (`targetIds`): the selected ones, or those matching the list's
 *    search and filters, with the list's own tenant-scoped query,
 * 3. loads those records with `inTenant()`, so another tenant's ids are simply not found,
 * 4. changes each with the same code as the single-record path (`forEachRecord`), which refuses
 *    with `invalid()` as it would there,
 * 5. refreshes the queries that show them, and returns what it did.
 *
 * `bulkChange()` does 2 to 4, and `refreshRequested()` is 5 for a server-side table, which asks
 * for its pages with `requested()` on the server. A table that loads all its rows in one query
 * (`getCustomers().refresh()`) refreshes that query instead. A server-side table's command passes
 * `matching` (its list's query for the ids matching its URL); a client-side table's only takes ids.
 *
 * Each record changes in a transaction of its own (the single-record path's), not all or nothing:
 * the records of a bulk action don't depend on each other, so one that's refused (an invoiced
 * order, a customer with orders) shouldn't hold up the rest. The result lists every skipped record
 * with the reason, which the action bar shows.
 */
import { requested, type RemoteQueryFunction } from "$app/server";
import { error, isHttpError, isValidationError } from "@sveltejs/kit";
import type { GetColumnData } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as v from "valibot";

import { type BulkResult, MAX_BULK_RECORDS } from "#lib/components/data-table/bulk-actions.js";
import { formatNumber } from "#lib/format.js";
import { m } from "#lib/paraglide/messages.js";

import { db } from "./db/index.ts";
import { idsInTenant, type TenantTable } from "./session.ts";
import { tableParams } from "./table-query.ts";

/** A bulk command's target (`BulkTarget`): ids, or a server-side list's URL parameters. */
export const bulkTarget = v.union([
	v.object({
		ids: v.pipe(
			v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			v.minLength(1),
			v.maxLength(MAX_BULK_RECORDS),
		),
	}),
	v.object({ matching: tableParams }),
]);

export type BulkTargetInput = v.InferOutput<typeof bulkTarget>;

/**
 * Finds the ids of a server-side list's rows that match its URL parameters (`planTable(…).where()`,
 * which is scoped to the tenant), at most `limit` of them.
 */
export type MatchingIds = (params: string, limit: number) => Promise<number[]>;

/**
 * The ids a bulk command acts on: the selected ones, or those of the rows matching the list's
 * search and filters (`matching`; a table without it only takes ids). Refuses more than
 * `MAX_BULK_RECORDS`.
 */
export async function targetIds(target: BulkTargetInput, matching?: MatchingIds) {
	if ("ids" in target) return [...new Set(target.ids)];
	if (!matching) error(400, m.common_error_generic());
	const ids = await matching(target.matching, MAX_BULK_RECORDS + 1);
	if (ids.length > MAX_BULK_RECORDS) {
		error(400, m.common_bulk_too_many({ max: formatNumber(MAX_BULK_RECORDS) }));
	}
	return ids;
}

/**
 * Changes each of `records` (the tenant's, of the `requested` ids) with `change`, the
 * single-record path's code, which makes its change in a transaction of its own. What it refuses
 * with `invalid()` is skipped, with the reason; a record it can't find (a 404, e.g. deleted
 * meanwhile) counts as missing, as do the ids that weren't found to begin with. Anything else is
 * a bug: it's logged, and the record is skipped with a generic reason, so the result still says
 * what was done to the others.
 */
export async function forEachRecord<T>(
	records: T[],
	requested: number,
	label: (record: T) => string,
	change: (record: T) => Promise<unknown>,
): Promise<BulkResult> {
	const result: BulkResult = { done: 0, skipped: [], missing: requested - records.length };
	for (const record of records) {
		try {
			await change(record);
			result.done++;
		} catch (thrown) {
			if (isValidationError(thrown)) {
				const reason = thrown.issues.map((issue) => issue.message).join("; ");
				result.skipped.push({ label: label(record), reason });
			} else if (isHttpError(thrown) && thrown.status === 404) {
				result.missing++;
			} else {
				console.error(thrown);
				result.skipped.push({ label: label(record), reason: m.common_error_generic() });
			}
		}
	}
	return result;
}

/** The fields of `columns` as loaded: a record's `status` column is its status. */
type Loaded<C extends Record<string, SQLiteColumn>> = {
	[K in keyof C]: GetColumnData<C[K], "query">;
};

/**
 * Changes each of the tenant's records in a bulk command's `target`, in order of their `label`,
 * with `change`. It's `targetIds`, the load and `forEachRecord` in one, and what the three do
 * (see above) applies. `table` is the records' table, `label` its column that names a record in the
 * result and orders the work (e.g. `order.number`), `columns` more fields `change` needs (e.g.
 * `{ status: equipment.status }`), and `matching` the list's query for the ids matching its URL
 * (see `MatchingIds`). Refresh the queries that show the records afterwards.
 */
export async function bulkChange<C extends Record<string, SQLiteColumn> = Record<never, never>>(
	target: BulkTargetInput,
	options: {
		table: SQLiteTable & TenantTable;
		label: SQLiteColumn;
		columns?: C;
		matching?: MatchingIds;
		change: (record: { id: number; label: string } & Loaded<C>) => Promise<unknown>;
	},
): Promise<BulkResult> {
	const { table, label, columns, matching, change } = options;
	const ids = await targetIds(target, matching);
	const found = (await db
		.select({ ...columns, id: table.id, label })
		.from(table)
		.where(idsInTenant(table, ids))
		.orderBy(label)) as ({ id: number; label: string } & Loaded<C>)[];
	return forEachRecord(found, ids.length, (record) => record.label, change);
}

/** How many pages of a server-side list the client may ask a command to refresh. */
export const REQUESTED_PAGES = 4;

/**
 * Refreshes the pages of these server-side lists' queries that the client asked for (see
 * `requested()`), e.g. a list's rows and its filters' counts after a bulk action or a schedule
 * change. Call it in a command or form.
 */
export async function refreshRequested(...queries: RemoteQueryFunction<any, any, any>[]) {
	for (const query of queries) await requested(query, REQUESTED_PAGES).refreshAll();
}
