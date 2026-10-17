/** An order's classification for the programme, for its part of the order form. */
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { idInTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";

import { defaultCategories } from "./model.ts";
import { query } from "./remote-functions.ts";
import { classificationOf } from "./server/classification.ts";

/**
 * The tenant's order's classification (`null`s for the defaults) and the category its type gives
 * it by default.
 */
export const getOrderClassification = query(
	v.pipe(v.number(), v.integer(), v.minValue(1)),
	async (orderId) => {
		const [found] = await db
			.select({ type: order.type })
			.from(order)
			.where(idInTenant(order, orderId));
		if (!found) error(404, m.partners_order_not_found());
		return {
			...(await classificationOf(orderId)),
			defaultCategory: defaultCategories[found.type],
		};
	},
);
