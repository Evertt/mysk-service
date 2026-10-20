/**
 * The parts a checklist's rejected points need (§2.8: a product's "Checkpoint-punten"), on an
 * order's checklists card: in the office, with a way to add one to the order as a material line;
 * in the customer portal, with the way to order it in the shop for a partner with credit. The
 * points come from the slot's props (checklists' own tables aren't the shop's), with the articles
 * they check (a component's of the unit, `checklists.pointArticles`): the tenant's products of those
 * articles come first, then those linked to the points.
 */
import { requested } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, or, sql } from "drizzle-orm";
import * as v from "valibot";

import { getOrder } from "#lib/orders/remotes.ts";
import { orderByNumber } from "#lib/orders/server/index.ts";
import { recordId } from "#lib/schema.ts";
import { currentCustomer, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { order } from "#lib/server/db/schema.ts";
import { addOrderLine, canTakeLines } from "#modules/materials/api/lines.server.ts";
import { isPartner, walletToday } from "#modules/partner-programme/api/wallet.server.ts";

import { suggestedPartSchema } from "../form/schemas.ts";
import { isOrderable } from "../model.ts";
import { forCustomers, form, query } from "../remote-functions.ts";
import { catalogue } from "../server/catalogue.ts";
import { shopProduct, shopProductCheckpoint } from "../server/schema.ts";

const idList = v.pipe(v.array(recordId()), v.maxLength(200));

/** The rejected points' template point ids, and the articles (materials) they check, if any. */
const rejectedPoints = v.object({ ids: idList, articles: v.optional(idList, []) });

/**
 * The tenant's products of the `articles` the points check, first, and those that fix any of the
 * points `ids`, with the points each fixes.
 */
async function partsFor(ids: readonly number[], articles: readonly number[]) {
	if (!ids.length && !articles.length) return [];
	const linked = sql`exists (select 1 from ${shopProductCheckpoint} where ${and(
		sql`${shopProductCheckpoint.productId} = ${shopProduct.id}`,
		inTenant(shopProductCheckpoint),
		ids.length ? inList(shopProductCheckpoint.templateItemId, [...ids]) : sql`0`,
	)})`;
	const products = await catalogue(
		articles.length ? or(inList(shopProduct.materialId, [...articles]), linked) : linked,
	);
	const isArticle = (product: { materialId: number }) => articles.includes(product.materialId);
	return [...products.filter(isArticle), ...products.filter((product) => !isArticle(product))].map(
		(product) => ({
			id: product.id,
			materialId: product.materialId,
			sku: product.sku,
			name: product.name,
			price: product.price,
			stock: product.stock,
			availability: product.availability,
			orderable: isOrderable(product),
			/** Whether a rejected point checks it: the article of the component it checks. */
			article: isArticle(product),
			/** Which of the points asked about it fixes. */
			points: product.checkpointIds.filter((id) => ids.includes(id)),
		}),
	);
}

/**
 * The parts the points `ids` of the tenant's order `number` need, for the office's checklists card,
 * and whether the order can still take them: not invoiced, cancelled or waiting for acceptance.
 */
export const getSuggestedParts = query(
	v.object({ number: v.pipe(v.string(), v.maxLength(32)), ...rejectedPoints.entries }),
	async ({ number, ids, articles }) => {
		const found = await orderByNumber(number, { status: order.status });
		return { parts: await partsFor(ids, articles), canAdd: canTakeLines(found.status) };
	},
);

/**
 * Adds one of a suggested product's material to the tenant's order (a material line, through the
 * materials module's `addOrderLine()`), as the order form would: a 404 for another tenant's order
 * or product. The order's page and the modules' cards on it refresh, as after the form's save; the
 * card that sent it asks for its own query too (`getSuggestedParts`, for the stock it shows), which
 * is refreshed as asked (`requested()`).
 */
export const addSuggestedPart = form(suggestedPartSchema, async (input) => {
	const [found] = await db
		.select({ materialId: shopProduct.materialId })
		.from(shopProduct)
		.where(idInTenant(shopProduct, input.productId));
	if (!found) error(404, m.shop_product_not_found());
	await db.transaction((tx) => addOrderLine(tx, input.number, found.materialId, 1));
	void getOrder(input.number).refresh();
	await requested(getSuggestedParts, 5).refreshAll();
});

/**
 * The parts the points `ids` need, for the customer portal's checklist results, and whether the
 * contact's customer can order them with credit: a partner with some to spend.
 */
export const getClientSuggestedParts = forCustomers.query(
	rejectedPoints,
	async ({ ids, articles }) => {
		const { customer } = await currentCustomer();
		const credit = (await isPartner(customer.id)) ? (await walletToday(customer.id)).available : 0;
		return { parts: await partsFor(ids, articles), credit };
	},
);
