/**
 * A list's customer facet with the customers' names: for a list whose filter picks customers by
 * code, the counts `plan.facets({ customer: customer.code })` gives (`{ [code]: count }`), as the
 * tenant's customers it names, by name. The checklists' work orders page and the condition module's
 * Connect page show them as chips.
 */
import { and } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer } from "#lib/server/db/schema.ts";

/** The tenant's customers whose codes `counts` has, with their names and counts, by name. */
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
