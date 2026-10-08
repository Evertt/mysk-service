/**
 * The options of the filters on related records in the lists (see `RecordFilter`): the current
 * tenant's customers, engineers or units matching a search, the first so many, plus the names of
 * those ticked. Used by the orders and equipment lists, which filter on the server.
 */
import { query } from "$app/server";
import { and, asc, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import * as v from "valibot";

import type { RecordOptions } from "#lib/components/data-table/server-table.svelte.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment } from "#lib/server/db/schema.ts";
import { inTenant, requireMember } from "#lib/server/session.ts";
import { nocase, searchMatch } from "#lib/server/table-query.ts";

/** A unit as the lists show it: manufacturer and model. */
const unitName = sql<string>`${equipment.manufacturer} || ' ' || ${equipment.model}`;

/** How many matches a search returns. */
const limit = 20;

const optionsInput = v.object({
	search: v.pipe(v.string(), v.maxLength(100)),
	selected: v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(100)),
});

interface Found {
	value: string | number;
	label: string;
	detail?: string;
}

/** The first matches of a search and the ticked ones, from a select of options. */
async function options(
	select: (where: SQL | undefined) => { limit(count: number): Promise<Found[]> },
	searched: readonly SQLWrapper[],
	selected: { where: SQL; count: number },
	search: string,
): Promise<RecordOptions> {
	const [found, ticked] = await Promise.all([
		select(searchMatch(searched, search)).limit(limit + 1),
		selected.count ? select(selected.where).limit(selected.count) : [],
	]);
	const option = (row: Found) => ({ ...row, value: String(row.value) });
	return {
		options: found.slice(0, limit).map(option),
		selected: ticked.map(option),
		more: found.length > limit,
	};
}

/** Customers by name or code; their code is the filter's value (`?customer=CUST-0001`). */
export const getCustomerOptions = query(optionsInput, async ({ search, selected }) => {
	requireMember();
	return options(
		(where) =>
			db
				.select({ value: customer.code, label: customer.name, detail: customer.code })
				.from(customer)
				.where(and(inTenant(customer), where))
				.orderBy(nocase(customer.name), asc(customer.id)),
		[customer.name, customer.code],
		{ where: inArray(customer.code, selected), count: selected.length },
		search,
	);
});

/** Engineers by name; their id is the filter's value (`?engineer=12`). */
export const getEngineerOptions = query(optionsInput, async ({ search, selected }) => {
	requireMember();
	const ids = selected.map(Number).filter(Number.isSafeInteger);
	return options(
		(where) =>
			db
				.select({ value: engineer.id, label: engineer.name })
				.from(engineer)
				.where(and(inTenant(engineer), where))
				.orderBy(nocase(engineer.name), asc(engineer.id)),
		[engineer.name],
		{ where: inArray(engineer.id, ids), count: ids.length },
		search,
	);
});

/** Units by serial number, manufacturer or model; their serial number is the filter's value. */
export const getEquipmentOptions = query(optionsInput, async ({ search, selected }) => {
	requireMember();
	return options(
		(where) =>
			db
				.select({
					value: equipment.serialNumber,
					label: unitName,
					detail: equipment.serialNumber,
				})
				.from(equipment)
				.where(and(inTenant(equipment), where))
				.orderBy(nocase(equipment.manufacturer), nocase(equipment.model), asc(equipment.id)),
		[equipment.serialNumber, equipment.manufacturer, equipment.model],
		{ where: inArray(equipment.serialNumber, selected), count: selected.length },
		search,
	);
});
