/**
 * The shop's orders (`shop_order`): placed by a partner's contact in the customer portal, paid with
 * its Parts Credit and their stock set aside, all in one transaction (the partner programme's
 * `spendCredit()` and the materials' `reserveStock()`, both checked inside it, so the balance never
 * goes below zero and the stock never runs out twice); then confirmed, shipped and delivered by the
 * office, or cancelled before they're shipped: their credit given back piece by piece
 * (`giveBackCredit()`) and their stock released. Every change is logged against the customer.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { formatCents, formatNumber } from "#lib/i18n/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	type CustomerAccess,
	currentTenant,
	idInTenant,
	idsInTenant,
	inTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { customer, user } from "#lib/server/db/schema.ts";
import { type NumberTarget, nextNumber } from "#lib/server/numbering.ts";
import { releaseStock, reserveStock, StockShortage } from "#modules/materials/api/stock.server.ts";
import {
	giveBackCredit,
	spendCredit,
	walletToday,
} from "#modules/partner-programme/api/wallet.server.ts";

import {
	type CartLine,
	cartTotal,
	type CheckoutProblem,
	checkoutProblems,
	creditOrderVat,
	mergeLines,
	type ShopOrderStep,
	shopOrderNumberFormat,
	statusAfter,
} from "../model.ts";
import { catalogue, type CatalogueRow } from "./catalogue.ts";
import { shopOrder, shopOrderLine, shopProduct } from "./schema.ts";

/** Where shop order numbers are kept, for `nextNumber()`. */
const shopOrderNumbers: NumberTarget = {
	format: shopOrderNumberFormat,
	table: shopOrder,
	column: shopOrder.number,
};

/** A checkout's problem as the customer reads it. */
function problemMessage(problem: CheckoutProblem, products: readonly CatalogueRow[]) {
	const name =
		"productId" in problem
			? (products.find((product) => product.id === problem.productId)?.name ?? "")
			: "";
	switch (problem.kind) {
		case "empty":
			return m.shop_checkout_empty();
		case "unknown":
			return m.shop_checkout_unknown();
		case "quantity":
			return m.shop_checkout_quantity({ name });
		case "on_request":
			return m.shop_checkout_on_request({ name });
		case "not_eligible":
			return m.shop_checkout_not_eligible({ name });
		case "stock":
			return m.shop_checkout_stock({ name, stock: formatNumber(problem.stock) });
		case "balance":
			return m.shop_checkout_balance({
				total: formatCents(problem.total),
				available: formatCents(problem.available),
			});
	}
}

/**
 * Places the contact's customer's order for `lines` in one transaction: checked against the
 * catalogue and the credit available (`checkoutProblems()`, refused with its problems), numbered,
 * paid with the credit (a spend of its total, excluding VAT) and its stock set aside; logged.
 * Answers its number.
 */
export async function placeShopOrder(access: CustomerAccess, cart: readonly CartLine[]) {
	const lines = mergeLines(cart);
	const holder = { id: access.customer.id, code: access.customer.code };
	return db.transaction(async (tx) => {
		const products = await catalogue(
			idsInTenant(
				shopProduct,
				lines.map((line) => line.productId),
			),
			tx,
		);
		const { available } = await walletToday(holder.id, tx);
		const problems = checkoutProblems(lines, products, available);
		if (problems.length) invalid(...problems.map((problem) => problemMessage(problem, products)));

		const number = await nextNumber(tx, shopOrderNumbers);
		const total = cartTotal(lines, products);
		const walletEntryId = await spendCredit(tx, holder, total, m.shop_spend_note({ number }));
		const { organizationId, user: placedBy } = currentTenant();
		const [placed] = await tx
			.insert(shopOrder)
			.values({
				organizationId,
				number,
				customerId: holder.id,
				placedBy: placedBy.id,
				total,
				vat: creditOrderVat(total),
				walletEntryId,
			})
			.returning({ id: shopOrder.id });
		const byId = new Map(products.map((product) => [product.id, product]));
		await insertRows(
			tx,
			shopOrderLine,
			lines.map((line) => {
				const product = byId.get(line.productId)!;
				return {
					organizationId,
					orderId: placed.id,
					materialId: product.materialId,
					sku: product.sku,
					name: product.name,
					quantity: line.quantity,
					unitPrice: product.price,
				};
			}),
		);
		for (const line of lines) {
			const product = byId.get(line.productId)!;
			try {
				await reserveStock(tx, product.materialId, line.quantity, number);
			} catch (shortage) {
				if (!(shortage instanceof StockShortage)) throw shortage;
				invalid(
					m.shop_checkout_stock({
						name: product.name,
						stock: formatNumber(shortage.material.stock),
					}),
				);
			}
		}
		await recordActivity(tx, {
			action: "placed",
			subject: { type: "shop_order", id: placed.id, label: number },
			parent: customerSubject(holder),
			before: {},
			after: { status: "placed", total },
		});
		return number;
	});
}

/** The tenant's shop orders that `where` picks, newest first, with their customers. */
export function shopOrderRows(where?: SQL) {
	return db
		.select({
			id: shopOrder.id,
			number: shopOrder.number,
			status: shopOrder.status,
			total: shopOrder.total,
			vat: shopOrder.vat,
			createdAt: shopOrder.createdAt,
			updatedAt: shopOrder.updatedAt,
			customer: { id: customer.id, code: customer.code, name: customer.name },
		})
		.from(shopOrder)
		.innerJoin(...tenantJoin(customer, shopOrder.customerId))
		.where(and(inTenant(shopOrder), where))
		.orderBy(desc(shopOrder.createdAt), desc(shopOrder.id));
}

/** The tenant's shop order that `where` picks, with its lines and who placed it; none if none. */
export async function shopOrderDetail(where: SQL) {
	const [found] = await db
		.select({
			id: shopOrder.id,
			number: shopOrder.number,
			status: shopOrder.status,
			payment: shopOrder.payment,
			total: shopOrder.total,
			vat: shopOrder.vat,
			createdAt: shopOrder.createdAt,
			updatedAt: shopOrder.updatedAt,
			placedBy: user.name,
			customer: { id: customer.id, code: customer.code, name: customer.name },
		})
		.from(shopOrder)
		.innerJoin(...tenantJoin(customer, shopOrder.customerId))
		.leftJoin(user, eq(user.id, shopOrder.placedBy))
		.where(and(inTenant(shopOrder), where));
	if (!found) return undefined;
	const lines = await db
		.select({
			id: shopOrderLine.id,
			sku: shopOrderLine.sku,
			name: shopOrderLine.name,
			quantity: shopOrderLine.quantity,
			unitPrice: shopOrderLine.unitPrice,
		})
		.from(shopOrderLine)
		.where(and(inTenant(shopOrderLine), eq(shopOrderLine.orderId, found.id)))
		.orderBy(asc(shopOrderLine.id));
	return { ...found, lines };
}

/**
 * Takes a step with the tenant's shop order `number` (confirm, ship, deliver or cancel) in one
 * transaction, logged. Cancelling gives its credit back (each piece of credit it took, with its own
 * date) and releases its stock. A 404 for another tenant's order; refused for a step its status
 * doesn't allow (also when someone took another meanwhile).
 */
export async function stepShopOrder(number: string, step: ShopOrderStep) {
	await db.transaction(async (tx) => {
		const [found] = await tx
			.select({
				order: shopOrder,
				customer: { id: customer.id, code: customer.code },
			})
			.from(shopOrder)
			.innerJoin(...tenantJoin(customer, shopOrder.customerId))
			.where(and(inTenant(shopOrder), eq(shopOrder.number, number)));
		if (!found) error(404, m.shop_order_not_found({ number }));
		const { order, customer: holder } = found;
		const status = statusAfter(order.status, step);
		if (!status) invalid(m.shop_step_refused({ number }));
		const changed = await tx
			.update(shopOrder)
			.set({ status, updatedAt: Temporal.Now.instant() })
			.where(and(idInTenant(shopOrder, order.id), eq(shopOrder.status, order.status)))
			.returning({ id: shopOrder.id });
		if (!changed.length) invalid(m.shop_step_refused({ number }));
		if (step === "cancel") await cancelParts(tx, order, holder);
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "shop_order", id: order.id, label: number },
			parent: customerSubject(holder),
			before: { status: order.status },
			after: { status },
		});
	});
}

/** A cancelled order's credit back into the wallet, and its stock back on the shelf. */
async function cancelParts(
	tx: Transaction,
	order: typeof shopOrder.$inferSelect,
	holder: { id: number; code: string },
) {
	if (order.walletEntryId !== null) {
		await giveBackCredit(
			tx,
			holder,
			order.walletEntryId,
			m.shop_reversal_note({ number: order.number }),
		);
	}
	const lines = await tx
		.select({ materialId: shopOrderLine.materialId, quantity: shopOrderLine.quantity })
		.from(shopOrderLine)
		.where(and(inTenant(shopOrderLine), eq(shopOrderLine.orderId, order.id)))
		.orderBy(asc(shopOrderLine.id));
	for (const line of lines) {
		await releaseStock(tx, line.materialId, line.quantity, order.number);
	}
}
