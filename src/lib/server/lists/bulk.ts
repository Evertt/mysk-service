/**
 * The server side of bulk actions on a table's selected rows (see
 * `#lib/components/data-table/bulk-actions.ts`). A bulk command:
 *
 * 1. is gated like any remote function (`forMembers.command()`, or a module's `command()`),
 * 2. reads its target into ids (`targetIds`): the selected ones, or those matching the list's
 *    search and filters, with the list's own tenant-scoped query,
 * 3. loads those records with `inTenant()`, so another tenant's ids are simply not found,
 * 4. changes each with the same code as the single-record path (`forEachRecord`), which refuses
 *    with `invalid()` as it would there,
 * 5. refreshes the queries that show them, and returns what it did.
 *
 * `bulkChange()` does 2 to 4, and `refreshRequested()` is 5 for a server-side table, which asks
 * for its pages with `requested()` on the server. A table that loads all its rows in one query
 * (`getCustomers().refresh()`) refreshes that query instead. A server-side list's command takes a
 * `listTarget()` and passes `list` (its `ListSql`, built per request, to find the ids matching the
 * target's `where`); a client-side table's takes an `idsTarget`.
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

import { type BulkResult, MAX_BULK_RECORDS } from "#lib/components/data-table/bulk-actions.ts";
import type { ListWhere } from "#lib/components/data-table/list-definition.ts";
import { formatNumber } from "#lib/i18n/index.ts";
import { recordId } from "#lib/schema.ts";
import { idsInTenant, type TenantTable } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { type ListSql, planList } from "./plan.ts";

/** A bulk command's target in a client-side table (customers, invoices, …, module actions): ids only. */
export const idsTarget = v.object({
	ids: v.pipe(v.array(recordId()), v.minLength(1), v.maxLength(MAX_BULK_RECORDS)),
});

type IdsTarget = v.InferOutput<typeof idsTarget>;

/** The selected rows of a server-side list, or all those matching its search and filters. */
export type ListTarget<C> = IdsTarget | { matching: ListWhere<C> };

/**
 * A bulk command's target in a server-side list (`BulkTarget` in the client): ids, or the list's
 * `where`, e.g. `listTarget(ordersList.where)`. The command then passes the list's SQL (a function,
 * as it is built per request) to `targetIds()` or `bulkChange()`.
 */
export const listTarget = <C>(where: v.GenericSchema<ListWhere<C>>) =>
	v.union([idsTarget, v.object({ matching: where })]);

/**
 * The ids a bulk command acts on: the selected ones, or those of the rows matching the list's
 * search and filters (`matching`), found with `list`, the list's SQL, built for this request (see
 * `ListSql`). A table without a list only takes ids. Refuses more than `MAX_BULK_RECORDS`.
 */
export async function targetIds<C>(target: ListTarget<C>, list?: () => ListSql<C>) {
	if ("ids" in target) return [...new Set(target.ids)];
	if (!list) error(400, m.common_error_generic());
	const found = await planList(list(), target.matching).ids(MAX_BULK_RECORDS + 1);
	if (found.length > MAX_BULK_RECORDS) {
		error(400, m.common_bulk_too_many({ max: formatNumber(MAX_BULK_RECORDS) }));
	}
	return found;
}

/**
 * Changes each of `records` (the tenant's, of the `requested` ids) with `change`, the
 * single-record path's code, which makes its change in a transaction of its own. What it refuses
 * with `invalid()` is skipped, with the reason; a record it can't find (a 404, e.g. deleted
 * meanwhile) counts as missing, as do the ids that weren't found to begin with. Anything else is
 * a bug: it's logged, and the record is skipped with a generic reason, so the result still says
 * what was done to the others.
 */
async function forEachRecord<T>(
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
 * `{ status: equipment.status }`), and `list` the SQL of the server-side list whose rows the
 * target may match (see `targetIds`). Refresh the queries that show the records afterwards.
 */
export async function bulkChange<
	C extends Record<string, SQLiteColumn> = Record<never, never>,
	L = never,
>(
	target: ListTarget<L>,
	options: {
		table: SQLiteTable & TenantTable;
		label: SQLiteColumn;
		columns?: C;
		list?: () => ListSql<L>;
		change: (record: { id: number; label: string } & Loaded<C>) => Promise<unknown>;
	},
): Promise<BulkResult> {
	const { table, label, columns, list, change } = options;
	const ids = await targetIds(target, list);
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
