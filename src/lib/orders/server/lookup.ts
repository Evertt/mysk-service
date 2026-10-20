import { order } from "#lib/server/db/schema.ts";
import { lookupBy } from "#lib/server/records.ts";

/**
 * The tenant's order `number` (its page's URL key), with the fields asked for (its id by default);
 * or a 404 with core's message, wherever it's looked up (a module's card too). See `lookupBy()`. The
 * engineer portal reaches orders through `engineerOrder()` instead, and the customer portal through
 * `customerOrders()`.
 */
export const orderByNumber = lookupBy(order, order.number, { id: order.id }, (number) =>
	m.orders_not_found({ number }),
);
