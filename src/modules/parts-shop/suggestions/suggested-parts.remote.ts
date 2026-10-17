/**
 * The parts a checklist's rejected points need (§2.8: a product's "Checkpoint-punten"), on an
 * order's checklists card: in the office, with a way to add one to the order as a material line;
 * in the customer portal, with the way to order it in the shop for a partner with credit. The
 * points come from the slot's props (checklists' own tables aren't the shop's), and only the
 * tenant's products linked to them are answered.
 */
import { error } from "@sveltejs/kit";
import { and, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { isAwaitingAcceptance, isEditableOrder } from "#lib/models.ts";
import { currentCustomer, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { order } from "#lib/server/db/schema.ts";
import { addOrderLine } from "#modules/materials/api/lines.server.ts";
import { isPartner, walletToday } from "#modules/partner-programme/api/wallet.server.ts";

import { suggestedPartSchema } from "../form/schemas.ts";
import { isOrderable } from "../model.ts";
import { forCustomers, form, query } from "../remote-functions.ts";
import { catalogue } from "../server/catalogue.ts";
import { shopProduct, shopProductCheckpoint } from "../server/schema.ts";

const pointIds = v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), v.maxLength(200));

/** The tenant's products that fix any of the points `ids`, with the points each fixes. */
async function partsFor(ids: readonly number[]) {
	if (!ids.length) return [];
	const linked = sql`exists (select 1 from ${shopProductCheckpoint} where ${and(
		sql`${shopProductCheckpoint.productId} = ${shopProduct.id}`,
		inTenant(shopProductCheckpoint),
		inList(shopProductCheckpoint.templateItemId, [...ids]),
	)})`;
	const products = await catalogue(linked);
	return products.map((product) => ({
		id: product.id,
		sku: product.sku,
		name: product.name,
		price: product.price,
		stock: product.stock,
		availability: product.availability,
		orderable: isOrderable(product),
		/** Which of the points asked about it fixes. */
		points: product.checkpointIds.filter((id) => ids.includes(id)),
	}));
}

/**
 * The parts the points `ids` of the tenant's order `number` need, for the office's checklists card,
 * and whether the order can still take them: not invoiced, cancelled or waiting for acceptance.
 */
export const getSuggestedParts = query(
	v.object({ number: v.pipe(v.string(), v.maxLength(32)), ids: pointIds }),
	async ({ number, ids }) => {
		const [found] = await db
			.select({ status: order.status })
			.from(order)
			.where(and(eq(order.number, number), inTenant(order)));
		if (!found) error(404, m.shop_order_not_found({ number }));
		const canAdd =
			isEditableOrder(found.status) &&
			found.status !== "cancelled" &&
			!isAwaitingAcceptance(found.status);
		return { parts: await partsFor(ids), canAdd };
	},
);

/**
 * Adds one of a suggested product's material to the tenant's order (a material line, through the
 * materials module's `addOrderLine()`), as the order form would: a 404 for another tenant's order
 * or product.
 */
export const addSuggestedPart = form(suggestedPartSchema, async (input) => {
	const [found] = await db
		.select({ materialId: shopProduct.materialId })
		.from(shopProduct)
		.where(idInTenant(shopProduct, input.productId));
	if (!found) error(404, m.shop_product_not_found());
	await db.transaction((tx) => addOrderLine(tx, input.number, found.materialId, 1));
});

/**
 * The parts the points `ids` need, for the customer portal's checklist results, and whether the
 * contact's customer can order them with credit: a partner with some to spend.
 */
export const getClientSuggestedParts = forCustomers.query(pointIds, async (ids) => {
	const { customer } = await currentCustomer();
	const credit = (await isPartner(customer.id)) ? (await walletToday(customer.id)).available : 0;
	return { parts: await partsFor(ids), credit };
});
