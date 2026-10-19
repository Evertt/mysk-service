/**
 * The options of a server-side list's filter on related records (`RecordFilter`): the tenant's
 * records (customers, engineers, …) matching the filter's search, each with how many of the list's
 * rows have it, most first. The rows counted are those matching the list's search and other filters,
 * not the filter's own, as the other filters' counts (`plan.facets()`). So the customer with the most
 * orders comes first, also among those a search finds, and a customer without any comes last, with
 * 0.
 *
 * Each list's remote file makes the options query of each of its record filters with
 * `facetOptions()` (`getOrderCustomerOptions`, …), rather than one query for all lists that takes a
 * list's name: that way each keeps its list's gate (a module's list its `moduleRemote()`), and the
 * list's SQL (`ListSql`, built in the list's own files) is never chosen by the client.
 */
import {
	and,
	count as countRows,
	desc,
	eq,
	isNull,
	sql,
	type SQL,
	type SQLWrapper,
	type Subquery,
} from "drizzle-orm";
import type { SelectedFields, SQLiteSelect } from "drizzle-orm/sqlite-core";
import * as v from "valibot";

import type { FilterId, List } from "#lib/components/data-table/list-definition.ts";
import type {
	RecordOption,
	RecordOptions,
} from "#lib/components/data-table/server-table.svelte.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";

import { type ListSql, planList, searchMatch } from "./plan.ts";

/** How many options a search returns. */
const OPTIONS_LIMIT = 20;

/**
 * A record filter's options query's argument: the list's search and filters (`whereOf()` of its
 * query; the filter's own are left out of the counts), the filter's search, and its ticked values.
 */
export const facetOptionsInput = <C>(list: List<C>) =>
	v.object({
		where: list.where,
		search: v.pipe(v.string(), v.maxLength(100)),
		selected: v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(100)),
	});

export type FacetOptionsInput<C> = v.InferOutput<ReturnType<typeof facetOptionsInput<C>>>;

/** The records a list's filter offers, e.g. the tenant's customers (`customerRecords()`). */
export interface RecordSource {
	/**
	 * `fields` from the records' table, with the joins its label or search need, each scoped to the
	 * tenant: `(fields) => db.select(fields).from(customer).$dynamic()`.
	 */
	from: (fields: SelectedFields) => SQLiteSelect;
	/** The records the user may see, e.g. `inTenant(customer)`. */
	scope: () => SQL;
	/** The filter's value, as the list counts by it (`by`): a customer's code, an engineer's id. */
	value: SQLWrapper;
	label: SQLWrapper;
	/** What the option says under its label, e.g. a unit's serial number. */
	detail?: SQLWrapper;
	/** What the filter's search box searches. */
	search: readonly SQLWrapper[];
	/** The order of options with the same count: by name. */
	sort: readonly SQL[];
	/**
	 * The ticked values, text as the URL has them, as `value` is: ids as numbers. Those that can't be
	 * are left out.
	 */
	parse?: (values: readonly string[]) => unknown[];
}

/** Ids from the URL as numbers, for a `RecordSource` whose value is an id. */
export const parseIds = (values: readonly string[]) =>
	values.map(Number).filter(Number.isSafeInteger);

/**
 * How a list counts its rows by the filter's records: by a value of its query (`by`, e.g.
 * `customer.code`), or with a query of its own (`count`, for a row counted under several records,
 * e.g. an order under each of its units), which selects `value` and `count` (both `.as()` those
 * names) from the rows matching `where`, grouped by value. With `none`, the rows without a value
 * are counted too, for the filter's "none" option.
 */
export type FacetCount = (
	| { by: SQLWrapper; count?: never }
	| { count: (where: SQL | undefined) => SQLiteSelect; by?: never }
) & { none?: boolean };

/** A subquery of how many rows have each value. */
type Counted = Subquery & { value: SQLWrapper; count: SQLWrapper };

/**
 * The options of a list's filter on related records (`facet`, the column's id), for its search and
 * ticked values, each with how many of the list's rows (those matching `where` but for the
 * filter's own values) have it: the first `OPTIONS_LIMIT` matches, most rows first, then by name
 * (those no row has last, with 0), the ticked ones (with their counts) and, with `counted.none`,
 * how many rows have none.
 *
 * The records are the tenant's (`records.scope`), and the rows the list's (`planList()`), so
 * another tenant's records are neither offered nor counted, whatever the query names.
 */
export async function facetOptions<C>(
	listSql: ListSql<C>,
	input: FacetOptionsInput<C>,
	facet: FilterId<C>,
	records: RecordSource,
	counted: FacetCount,
): Promise<RecordOptions> {
	const where = await planList(listSql, input.where).where(facet);
	/** A new one for each statement that joins it. */
	const counts = () =>
		(counted.by
			? listSql
					.from({ value: sql`${counted.by}`.as("value"), count: countRows().as("count") })
					.where(where)
					.groupBy(sql`${counted.by}`)
			: counted.count!(where)
		).as("counted") as unknown as Counted;

	const select = (condition: SQL | undefined) => {
		const rows = counts();
		const count = sql<number>`coalesce(${rows.count}, 0)`;
		return records
			.from({
				value: sql<string | number>`${records.value}`,
				label: sql<string>`${records.label}`,
				...(records.detail ? { detail: sql<string>`${records.detail}` } : {}),
				count,
			})
			.leftJoin(rows, eq(rows.value, records.value))
			.where(and(records.scope(), condition))
			.orderBy(desc(count), ...records.sort) as unknown as {
			limit(limit: number): Promise<(Omit<RecordOption, "value"> & { value: string | number })[]>;
		};
	};

	const ticked = records.parse?.(input.selected) ?? input.selected;
	const [found, selected, none] = await Promise.all([
		select(searchMatch(records.search, input.search)).limit(OPTIONS_LIMIT + 1),
		ticked.length ? select(inList(records.value, ticked)).limit(ticked.length) : [],
		counted.none ? countNone(counts()) : undefined,
	]);
	const option = ({ value, label, detail, count }: (typeof found)[number]): RecordOption => ({
		value: String(value),
		label,
		...(detail ? { detail } : {}),
		count: Number(count),
	});
	return {
		options: found.slice(0, OPTIONS_LIMIT).map(option),
		selected: selected.map(option),
		more: found.length > OPTIONS_LIMIT,
		...(none === undefined ? {} : { none }),
	};
}

/** How many rows have no value. */
async function countNone(rows: Counted) {
	const [row] = await db
		.select({ count: sql<number>`coalesce(sum(${rows.count}), 0)` })
		.from(rows)
		.where(isNull(rows.value));
	return Number(row?.count ?? 0);
}
