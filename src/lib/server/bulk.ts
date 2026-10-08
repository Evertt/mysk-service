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
 * Each record changes in a transaction of its own (the single-record path's), not all or nothing:
 * the records of a bulk action don't depend on each other, so one that's refused (an invoiced
 * order, a customer with orders) shouldn't hold up the rest. The result lists every skipped record
 * with the reason, which the action bar shows.
 */
import { error, isHttpError, isValidationError } from "@sveltejs/kit";
import * as v from "valibot";

import { type BulkResult, MAX_BULK_RECORDS } from "#lib/components/data-table/bulk-actions.js";
import { formatNumber } from "#lib/format.js";
import { m } from "#lib/paraglide/messages.js";

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
