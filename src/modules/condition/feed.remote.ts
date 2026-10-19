/**
 * The service history ("Activiteitenlog") of the tenant's units, or of a customer's (by code): on
 * the Connect page, for the chosen customer, and on a customer's page.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { customerCode } from "#lib/schema.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";

import { query } from "./remote-functions.ts";
import { serviceHistory } from "./server/feed.ts";

export const getServiceHistory = query(
	v.object({
		customer: v.nullable(customerCode()),
		limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
	}),
	async (input) => {
		let customerId: number | null = null;
		let name: string | null = null;
		if (input.customer !== null) {
			const [found] = await db
				.select({ id: customer.id, name: customer.name })
				.from(customer)
				.where(and(eq(customer.code, input.customer), inTenant(customer)));
			if (!found) error(404, m.common_error_not_found());
			customerId = found.id;
			name = found.name;
		}
		return { customer: name, entries: await serviceHistory(customerId, input.limit) };
	},
);
