/**
 * The service history ("Activiteitenlog") of the tenant's units, or of a customer's (by code): on
 * the Connect page, for the chosen customer, and on a customer's page.
 */
import * as v from "valibot";

import { customerByCode } from "#lib/customers/server/index.ts";
import { customerCode, wholeIn } from "#lib/schema.ts";
import { customer } from "#lib/server/db/schema.ts";

import { query } from "./remote-functions.ts";
import { serviceHistory } from "./server/feed.ts";

export const getServiceHistory = query(
	v.object({
		customer: v.nullable(customerCode()),
		limit: wholeIn({ min: 1, max: 50 }),
	}),
	async (input) => {
		let customerId: number | null = null;
		let name: string | null = null;
		if (input.customer !== null) {
			const found = await customerByCode(input.customer, {
				id: customer.id,
				name: customer.name,
			});
			customerId = found.id;
			name = found.name;
		}
		return { customer: name, entries: await serviceHistory(customerId, input.limit) };
	},
);
