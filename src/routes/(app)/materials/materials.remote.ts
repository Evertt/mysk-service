import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, countDistinct, desc, eq, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { fitsUnit, isOpenOrder } from "#lib/models.js";
import { id } from "#lib/schema.js";
import { refuseIfReferenced } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { customer, material, order, orderLine } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";

import { materialFields } from "./material-schema.js";

/** How many different orders of the current tenant use a material. */
const ordersUsing = async (materialId: number) => {
	const [row] = await db
		.select({ count: countDistinct(orderLine.orderId) })
		.from(orderLine)
		.where(and(eq(orderLine.materialId, materialId), inTenant(orderLine)));
	return row.count;
};

/** A material of the current tenant, by id (ids come from the client, so check the tenant). */
const findMaterial = (id: number) =>
	db.query.material.findFirst({ where: and(eq(material.id, id), inTenant(material)) });

/** All materials with the number of orders that use them, by name. */
export const getMaterials = query(async () => {
	requireMember();
	const usage = db
		.select({
			materialId: orderLine.materialId,
			orders: countDistinct(orderLine.orderId).as("order_count"),
		})
		.from(orderLine)
		.where(inTenant(orderLine))
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
		.where(inTenant(material))
		.orderBy(asc(material.name));
});

/** One material with the orders that use it (most recent first) and headline numbers. */
export const getMaterial = query(v.string(), async (sku) => {
	requireMember();
	const found = await db.query.material.findFirst({
		where: and(eq(material.sku, sku), inTenant(material)),
	});
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
			amount: sql<number>`sum(round(${orderLine.quantity} * ${orderLine.unitPrice}))`.mapWith(
				Number,
			),
		})
		.from(orderLine)
		.innerJoin(order, eq(orderLine.orderId, order.id))
		.innerJoin(customer, eq(order.customerId, customer.id))
		.where(and(eq(orderLine.materialId, found.id), inTenant(order), inTenant(customer)))
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

/** Another material of the current tenant with the same name (ignoring case), if any. */
const sameName = (name: string, exceptId?: number) =>
	db.query.material.findFirst({
		columns: { sku: true },
		where: and(
			inTenant(material),
			sql`lower(${material.name}) = lower(${name})`,
			exceptId ? ne(material.id, exceptId) : undefined,
		),
	});

export const createMaterial = form(v.object(materialFields), async (input, issue) => {
	const { organizationId } = requireMember();
	const problems = [];
	const duplicate = await sameName(input.name);
	if (duplicate) problems.push(issue.name(`${duplicate.sku} already has this name`));
	if (!fitsUnit(input.stock, input.unit)) problems.push(issue.stock("Whole pieces only"));
	if (problems.length) invalid(...problems);

	const sku = await db.transaction(async (tx) => {
		// SKUs are sequential per tenant: one more than the tenant's highest (MAT-0001 for the first).
		const [{ last }] = await tx
			.select({ last: sql<number | null>`max(cast(substr(${material.sku}, 5) as integer))` })
			.from(material)
			.where(inTenant(material));
		const sku = `MAT-${String((last ?? 0) + 1).padStart(4, "0")}`;
		await tx.insert(material).values({ ...input, organizationId, sku });
		return sku;
	});
	void getMaterials().refresh();
	redirect(303, `/materials/${sku}`);
});

export const updateMaterial = form(
	v.object({ id: id(), ...materialFields }),
	async (data, issue) => {
		requireMember();
		const { id, ...input } = data;
		const existing = await findMaterial(id);
		if (!existing) error(404, "Material not found");

		const problems = [];
		const duplicate = await sameName(input.name, id);
		if (duplicate) problems.push(issue.name(`${duplicate.sku} already has this name`));
		if (!fitsUnit(input.stock, input.unit)) problems.push(issue.stock("Whole pieces only"));
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

		await db
			.update(material)
			.set(input)
			.where(and(eq(material.id, id), inTenant(material)));
		// Send the updated material along, so the page we redirect to doesn't show the old one first.
		void getMaterials().refresh();
		void getMaterial(existing.sku).refresh();
		redirect(303, `/materials/${existing.sku}`);
	},
);

export const deleteMaterial = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	if (!(await findMaterial(id))) error(404, "Material not found");
	const orders = await ordersUsing(id);
	if (orders) {
		invalid(
			`This material is used on ${orders === 1 ? "1 order" : `${orders} orders`}, so it can't be deleted. Remove it from ${orders === 1 ? "that order" : "those orders"} first.`,
		);
	}
	await refuseIfReferenced(
		() => db.delete(material).where(and(eq(material.id, id), inTenant(material))),
		"Other records still refer to this material. Remove those first.",
	);
	void getMaterials().refresh();
	redirect(303, "/materials");
});
