import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, countDistinct, desc, eq, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { isOpenOrder } from "#lib/models.js";
import { id } from "#lib/schema.js";
import { deleteOrRefuse } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { customer, material, order, orderLine } from "#lib/server/db/schema.js";
import { requireUser } from "#lib/server/session.js";

import { materialFields } from "./material-schema.js";

/** Orders that still need their materials. */

/** How many different orders use a material. */
const ordersUsing = async (materialId: number) => {
	const [row] = await db
		.select({ count: countDistinct(orderLine.orderId) })
		.from(orderLine)
		.where(eq(orderLine.materialId, materialId));
	return row.count;
};

/** All materials with the number of orders that use them, by name. */
export const getMaterials = query(async () => {
	requireUser();
	const usage = db
		.select({
			materialId: orderLine.materialId,
			orders: countDistinct(orderLine.orderId).as("order_count"),
		})
		.from(orderLine)
		.groupBy(orderLine.materialId)
		.as("usage");

	return db
		.select({
			id: material.id,
			sku: material.sku,
			name: material.name,
			unit: material.unit,
			unitPrice: material.unitPrice,
			stock: material.stock,
			orderCount: sql<number>`coalesce(${usage.orders}, 0)`,
		})
		.from(material)
		.leftJoin(usage, eq(usage.materialId, material.id))
		.orderBy(asc(material.name));
});

/** One material with the orders that use it (most recent first) and headline numbers. */
export const getMaterial = query(v.string(), async (sku) => {
	requireUser();
	const found = await db.query.material.findFirst({ where: eq(material.sku, sku) });
	if (!found) error(404, `Material ${sku} not found`);

	// One row per order, in case an order has several lines for the material.
	const usage = await db
		.select({
			orderId: order.id,
			number: order.number,
			status: order.status,
			createdAt: order.createdAt,
			customer: { code: customer.code, name: customer.name },
			quantity: sql<number>`sum(${orderLine.quantity})`.mapWith(Number),
			// Every line of a material on one order is quoted at the same price.
			unitPrice: sql<number>`max(${orderLine.unitPrice})`.mapWith(Number),
			amount: sql<number>`sum(${orderLine.quantity} * ${orderLine.unitPrice})`.mapWith(Number),
		})
		.from(orderLine)
		.innerJoin(order, eq(orderLine.orderId, order.id))
		.innerJoin(customer, eq(order.customerId, customer.id))
		.where(eq(orderLine.materialId, found.id))
		.groupBy(order.id)
		.orderBy(desc(order.createdAt), desc(order.id));

	const yearAgo = new Date();
	yearAgo.setFullYear(yearAgo.getFullYear() - 1);
	const lastYear = usage.filter((row) => row.createdAt >= yearAgo && row.status !== "cancelled");
	const open = usage.filter((row) => isOpenOrder(row.status));
	const total = (rows: typeof usage) => rows.reduce((sum, row) => sum + row.quantity, 0);

	return {
		material: found,
		usage,
		stats: {
			usedLastYear: total(lastYear),
			openOrders: open.length,
			neededForOpenOrders: total(open),
		},
	};
});

/** Another material with the same name (ignoring case), if any. */
const sameName = (name: string, exceptId?: number) =>
	db.query.material.findFirst({
		columns: { sku: true },
		where: and(
			sql`lower(${material.name}) = lower(${name})`,
			exceptId ? ne(material.id, exceptId) : undefined,
		),
	});

export const createMaterial = form(v.object(materialFields), async (input, issue) => {
	requireUser();
	const duplicate = await sameName(input.name);
	if (duplicate) invalid(issue.name(`${duplicate.sku} already has this name`));

	const sku = await db.transaction(async (tx) => {
		// The SKU is derived from the id, which we only know after inserting.
		const [inserted] = await tx
			.insert(material)
			.values({ ...input, sku: `pending-${crypto.randomUUID()}` })
			.returning({ id: material.id });
		const sku = `MAT-${String(inserted.id).padStart(4, "0")}`;
		await tx.update(material).set({ sku }).where(eq(material.id, inserted.id));
		return sku;
	});
	void getMaterials().refresh();
	redirect(303, `/materials/${sku}`);
});

export const updateMaterial = form(
	v.object({ id: id(), ...materialFields }),
	async (data, issue) => {
		requireUser();
		const { id, ...input } = data;
		const existing = await db.query.material.findFirst({ where: eq(material.id, id) });
		if (!existing) error(404, "Material not found");

		const problems = [];
		const duplicate = await sameName(input.name, id);
		if (duplicate) problems.push(issue.name(`${duplicate.sku} already has this name`));
		// Order lines are counted in the material's unit, so changing it would change them too.
		if (input.unit !== existing.unit) {
			const orders = await ordersUsing(id);
			if (orders) {
				problems.push(
					issue.unit(
						`Can't change the unit: ${orders === 1 ? "1 order counts" : `${orders} orders count`} this material in ${existing.unit}`,
					),
				);
			}
		}
		if (problems.length) invalid(...problems);

		await db.update(material).set(input).where(eq(material.id, id));
		// Send the updated material along, so the page we redirect to doesn't show the old one first.
		void getMaterials().refresh();
		void getMaterial(existing.sku).refresh();
		redirect(303, `/materials/${existing.sku}`);
	},
);

export const deleteMaterial = form(v.object({ id: id() }), async ({ id }) => {
	requireUser();
	const orders = await ordersUsing(id);
	if (orders) {
		invalid(
			`This material is used on ${orders === 1 ? "1 order" : `${orders} orders`}, so it can't be deleted. Remove it from ${orders === 1 ? "that order" : "those orders"} first.`,
		);
	}
	await deleteOrRefuse(
		() => db.delete(material).where(eq(material.id, id)),
		"Other records still refer to this material. Remove those first.",
	);
	void getMaterials().refresh();
	redirect(303, "/materials");
});
