/**
 * The parts shop's forms: the portal's checkout (the cart's lines, as hidden fields), a product of
 * the office's catalogue, a category, and a step with an order. Isomorphic: the browser and the
 * server check them the same way.
 */
import * as v from "valibot";

import { id, optionalId, text } from "#lib/schema.ts";

import { maxQuantity, productUnits, shopOrderSteps } from "../model.ts";

/** A whole number from a hidden field. */
const whole = () => v.pipe(v.string(), v.transform(Number), v.integer());

/** A number of a shop order, from a hidden field. */
const orderNumber = v.pipe(v.string(), v.nonEmpty(), v.maxLength(32));

/** The cart at checkout: a product and how many, per line. */
export const checkoutSchema = v.object({
	lines: v.optional(
		v.pipe(
			v.array(
				v.object({
					productId: id(),
					quantity: v.pipe(whole(), v.minValue(1), v.maxValue(maxQuantity)),
				}),
			),
			v.maxLength(100),
		),
		[],
	),
});

/** One of the tenant's materials in the shop (`inShop`), or taken out of it. */
export const productSchema = v.pipe(
	v.object({
		materialId: id(),
		inShop: v.optional(v.boolean(), false),
		categoryId: optionalId(m.shop_category_required),
		description: v.pipe(v.string(), v.trim(), v.maxLength(500)),
		unit: v.picklist(productUnits, m.validation_choose_one),
		popular: v.optional(v.boolean(), false),
		creditEligible: v.optional(v.boolean(), false),
		onRequest: v.optional(v.boolean(), false),
		checkpointIds: v.optional(v.array(id()), []),
	}),
	v.forward(
		v.check(({ inShop, categoryId }) => !inShop || categoryId !== null, m.shop_category_required),
		["categoryId"],
	),
);

const categoryName = v.pipe(text(m.shop_category_name_required), v.maxLength(80));

/** A new category's name. */
export const newCategorySchema = v.object({ name: categoryName });

/** A category's new name. */
export const renameCategorySchema = v.object({ id: id(), name: categoryName });

/** A category to delete. */
export const categoryIdSchema = v.object({ id: id() });

/** A step the office takes with an order. */
export const stepSchema = v.object({ number: orderNumber, step: v.picklist(shopOrderSteps) });

/** A product suggested for a checklist's rejected point, to add to the order as a material line. */
export const suggestedPartSchema = v.object({ number: orderNumber, productId: id() });
