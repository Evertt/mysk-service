/**
 * The shop's orders as the office handles them: the list (`/parts-shop`, the open ones or all), an
 * order's page with the steps it can take (confirm, ship, deliver, cancel), and the dashboard's
 * count of the open ones.
 */
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { inList } from "#lib/server/db/parameters.ts";
import { orNotFound } from "#lib/server/records.ts";

import { stepSchema } from "./form/schemas.ts";
import { openShopOrderStatuses } from "./model.ts";
import { form, query } from "./remote-functions.ts";
import { shopOrderDetail, shopOrderRows, stepShopOrder } from "./server/orders.ts";
import { shopOrder } from "./server/schema.ts";

/** The tenant's shop orders, newest first: the open ones (still to handle), or all of them. */
export const getShopOrders = query(v.picklist(["open", "all"]), async (view) =>
	shopOrderRows(view === "open" ? inList(shopOrder.status, [...openShopOrderStatuses]) : undefined),
);

/** One of the tenant's shop orders by its number, with its lines; a 404 for any other. */
export const getShopOrder = query(v.pipe(v.string(), v.maxLength(32)), async (number) => {
	return orNotFound(
		await shopOrderDetail(eq(shopOrder.number, number)),
		m.shop_order_not_found({ number }),
	);
});

/** How many of the tenant's shop orders are open, and how many of those wait to be confirmed. */
export const getShopOrderCounts = query(async () => {
	const open = await shopOrderRows(inList(shopOrder.status, [...openShopOrderStatuses]));
	return {
		open: open.length,
		placed: open.filter((row) => row.status === "placed").length,
	};
});

/** Takes a step with an order: confirm, ship, deliver or cancel (its credit and stock back). */
export const takeShopOrderStep = form(stepSchema, async (input) => {
	await stepShopOrder(input.number, input.step);
	void getShopOrder(input.number).refresh();
	void getShopOrders("open").refresh();
	void getShopOrders("all").refresh();
});
