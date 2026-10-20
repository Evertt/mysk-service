import { customer } from "#lib/server/db/schema.ts";
import { lookupBy } from "#lib/server/records.ts";

/**
 * The tenant's customer `code` (its page's URL key), with the fields asked for (its id and code by
 * default); or a 404 with core's message, wherever it's looked up (a module's card too). See
 * `lookupBy()`.
 */
export const customerByCode = lookupBy(
	customer,
	customer.code,
	{ id: customer.id, code: customer.code },
	(code) => m.customers_code_not_found({ code }),
);
