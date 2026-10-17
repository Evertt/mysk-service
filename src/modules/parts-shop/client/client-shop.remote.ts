/**
 * The parts shop as a customer's contact uses it in the customer portal (`/parts-shop/portal`):
 * the catalogue with each product's stock and checklist points, the credit their customer has to
 * spend, checking out with it, and their customer's shop orders. Gated by the module's set for
 * customers and scoped to their customer (`currentCustomer()`): another customer's order is a 404,
 * also by a tampered number, and a customer that isn't a partner has no credit to pay with.
 */
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { currentCustomer, ofCustomer } from "#lib/server/auth/index.ts";
import { isPartner, walletToday } from "#modules/partner-programme/api/wallet.server.ts";

import { checkoutSchema } from "../form/schemas.ts";
import { forCustomers } from "../remote-functions.ts";
import { catalogue, lowCount, withCheckpoints } from "../server/catalogue.ts";
import { placeShopOrder, shopOrderDetail, shopOrderRows } from "../server/orders.ts";
import { shopOrder } from "../server/schema.ts";

/**
 * The credit the contact's customer can spend today, and until when the first of it is valid: none
 * if it isn't a partner.
 */
async function creditOf(customerId: number) {
	if (!(await isPartner(customerId))) return { partner: false, available: 0, validUntil: null };
	const { available, validUntil } = await walletToday(customerId);
	return { partner: true, available, validUntil };
}

/**
 * The shop: its categories, its products (with their checklist points), how many run low, and the
 * credit the customer has to pay with.
 */
export const getClientShop = forCustomers.query(async () => {
	const { customer } = await currentCustomer();
	const [products, credit] = await Promise.all([
		catalogue().then(withCheckpoints),
		creditOf(customer.id),
	]);
	const categories = [
		...new Map(products.map((product) => [product.categoryId, product.category])),
	].map(([id, name]) => ({ id, name }));
	return {
		categories,
		products: products.map((product) => ({
			id: product.id,
			sku: product.sku,
			name: product.name,
			description: product.description,
			price: product.price,
			stock: product.stock,
			categoryId: product.categoryId,
			unit: product.unit,
			popular: product.popular,
			creditEligible: product.creditEligible,
			onRequest: product.onRequest,
			availability: product.availability,
			checkpoints: product.checkpoints.map((point) => point.text),
		})),
		low: lowCount(products),
		...credit,
	};
});

/**
 * Checks out the cart with the customer's Parts Credit (see `placeShopOrder()`), and opens the
 * order's page. Refused with what stands in the way: a customer that isn't a partner, an empty
 * cart, a product on request, too few in stock, or more than the credit available.
 */
export const placeClientShopOrder = forCustomers.form(checkoutSchema, async (input) => {
	const access = await currentCustomer();
	if (!(await isPartner(access.customer.id))) invalid(m.shop_checkout_not_partner());
	const number = await placeShopOrder(access, input.lines);
	void getClientShop().refresh();
	void getClientShopOrders().refresh();
	redirect(303, `/parts-shop/portal/orders/${number}?placed=1`);
});

/** The customer's shop orders, newest first. */
export const getClientShopOrders = forCustomers.query(async () => {
	const access = await currentCustomer();
	return (await shopOrderRows(ofCustomer(access, shopOrder))).map(
		({ customer: _customer, ...row }) => row,
	);
});

/** One of the customer's shop orders by its number, with its lines; a 404 for any other. */
export const getClientShopOrder = forCustomers.query(
	v.pipe(v.string(), v.maxLength(32)),
	async (number) => {
		const access = await currentCustomer();
		const found = await shopOrderDetail(
			and(eq(shopOrder.number, number), ofCustomer(access, shopOrder))!,
		);
		if (!found) error(404, m.shop_order_not_found({ number }));
		const { customer: _customer, ...order } = found;
		return order;
	},
);
