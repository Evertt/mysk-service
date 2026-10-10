import { error, redirect } from "@sveltejs/kit";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { label } from "#lib/i18n/index.ts";
import { fitsUnit, isOpenOrder, type MaterialUnit } from "#lib/models.ts";
import { lineTotalSql } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import {
	customer,
	material,
	order,
	orderLine,
	stockMovement,
	user,
} from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { nextNumber } from "#lib/server/numbering.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { materialFields, newMaterialFields } from "./form/material-schema.ts";
import { findMaterial, ordersUsing, removeMaterial } from "./server/materials.ts";
import { moveStock, withBalances } from "./server/stock.ts";

/** Whether every stock movement of a material can be counted in `unit` (e.g. whole pieces). */
const historyFits = async (materialId: number, unit: MaterialUnit) => {
	const movements = await db
		.select({ quantity: stockMovement.quantity })
		.from(stockMovement)
		.where(and(eq(stockMovement.materialId, materialId), inTenant(stockMovement)));
	return movements.every((movement) => fitsUnit(movement.quantity, unit));
};

/**
 * One material with the orders that use it (most recent first), its stock movements (newest first,
 * with the stock after each) and headline numbers.
 */
export const getMaterial = forMembers.query(v.string(), async (sku) => {
	const found = await db.query.material.findFirst({
		where: and(eq(material.sku, sku), inTenant(material)),
	});
	if (!found) error(404, m.materials_not_found_sku({ sku }));

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
			amount: sql<number>`sum(${lineTotalSql()})`.mapWith(Number),
		})
		.from(orderLine)
		.innerJoin(...tenantJoin(order, orderLine.orderId))
		.innerJoin(...tenantJoin(customer, order.customerId))
		.where(eq(orderLine.materialId, found.id))
		.groupBy(order.id)
		.orderBy(desc(order.createdAt), desc(order.id));

	const movements = await db
		.select({
			id: stockMovement.id,
			kind: stockMovement.kind,
			quantity: stockMovement.quantity,
			note: stockMovement.note,
			createdAt: stockMovement.createdAt,
			// The number stays when the order is deleted; `order` is only there while it exists.
			orderNumber: stockMovement.orderNumber,
			order: { number: order.number },
			user: { name: user.name },
		})
		.from(stockMovement)
		.leftJoin(...tenantJoin(order, stockMovement.orderId))
		.leftJoin(user, eq(stockMovement.userId, user.id))
		.where(and(eq(stockMovement.materialId, found.id), inTenant(stockMovement)))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id));

	const yearAgo = new Date();
	yearAgo.setFullYear(yearAgo.getFullYear() - 1);
	const lastYear = usage.filter((row) => row.createdAt >= yearAgo && row.status !== "cancelled");
	const open = usage.filter((row) => isOpenOrder(row.status));
	const total = (rows: typeof usage) => rows.reduce((sum, row) => sum + row.quantity, 0);

	return {
		material: found,
		usage,
		movements: withBalances(movements, found.stock),
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

export const createMaterial = forMembers.form(v.object(newMaterialFields), async (input, issue) => {
	const { organizationId } = currentTenant();
	const problems: Problem<"name" | "stock">[] = [];
	const duplicate = await sameName(input.name);
	if (duplicate) {
		problems.push({ field: "name", message: m.materials_name_taken({ sku: duplicate.sku }) });
	}
	if (!fitsUnit(input.stock, input.unit)) {
		problems.push({ field: "stock", message: m.materials_whole_pieces() });
	}
	refuse(issue, problems);

	const { stock, ...fields } = input;
	const sku = await db.transaction(async (tx) => {
		const sku = await nextNumber(tx, "material");
		const [created] = await tx
			.insert(material)
			.values({ ...fields, organizationId, sku, stock: 0 })
			.returning({ id: material.id });
		// The stock it starts with is its first movement.
		await moveStock(tx, { materialId: created.id, quantity: stock, kind: "opening_balance" });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "material", id: created.id, label: sku },
		});
		return sku;
	});
	redirect(303, `/materials/${sku}`);
});

export const updateMaterial = forMembers.form(
	v.object({ id: id(), ...materialFields }),
	async (data, issue) => {
		const { id, ...input } = data;
		const existing = await findMaterial(id);
		if (!existing) error(404, m.materials_not_found());

		const problems: Problem<"name" | "unit">[] = [];
		const duplicate = await sameName(input.name, id);
		if (duplicate) {
			problems.push({ field: "name", message: m.materials_name_taken({ sku: duplicate.sku }) });
		}
		// Order lines are counted in the material's unit, so changing it would change them too.
		if (input.unit !== existing.unit) {
			const orders = await ordersUsing(id);
			if (orders) {
				problems.push({
					field: "unit",
					message: m.materials_unit_in_use({
						count: orders,
						unit: label("materialUnitSymbol", existing.unit),
					}),
				});
			} else if (!(await historyFits(id, input.unit))) {
				// Its stock movements are counted in the new unit from now on.
				problems.push({ field: "unit", message: m.materials_unit_history_parts() });
			}
		}
		refuse(issue, problems);

		await db.transaction(async (tx) => {
			await tx.update(material).set(input).where(idInTenant(material, id));
			const subject = { type: "material", id, label: existing.sku };
			await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
		});
		// Send the updated material along, so the page we redirect to doesn't show the old one first.
		void getMaterial(existing.sku).refresh();
		redirect(303, `/materials/${existing.sku}`);
	},
);

export const deleteMaterial = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	await removeMaterial(id);
	redirect(303, "/materials");
});
