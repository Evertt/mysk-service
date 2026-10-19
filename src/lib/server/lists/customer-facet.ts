/**
 * A list's customers: its customer filter's options (`customerRecords()`, for `facetOptions()`),
 * and its customer facet with the customers' names (`customerFacet()`).
 */
import { and, asc } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer } from "#lib/server/db/schema.ts";

import type { RecordSource } from "./facet-options.ts";
import { nocase } from "./plan.ts";

/**
 * The tenant's customers, for a list's customer filter (`facetOptions()`): by name, searched by
 * name or code; their code is the filter's value (`?customer=CUST-0001`). Call it per request.
 */
export const customerRecords = (): RecordSource => ({
	from: (fields) => db.select(fields).from(customer).$dynamic(),
	scope: () => inTenant(customer),
	value: customer.code,
	label: customer.name,
	search: [customer.name, customer.code],
	sort: [nocase(customer.name), asc(customer.id)],
});

/**
 * The tenant's customers whose codes `counts` has, with their names and counts, by name: for a list
 * whose filter picks customers by code, the counts `plan.facets({ customer: customer.code })` gives
 * (`{ [code]: count }`). The checklists' work orders page and the condition module's Connect page
 * show them as chips.
 */
export async function customerFacet(counts: Readonly<Record<string, number>>) {
	const codes = Object.keys(counts);
	if (!codes.length) return [];
	const found = await db
		.select({ code: customer.code, name: customer.name })
		.from(customer)
		.where(and(inList(customer.code, codes), inTenant(customer)));
	return found
		.map((each) => ({ ...each, count: counts[each.code] ?? 0 }))
		.toSorted((a, b) => a.name.localeCompare(b.name));
}
