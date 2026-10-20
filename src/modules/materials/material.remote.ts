import { error, redirect } from "@sveltejs/kit";
import { and, desc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { getTimeZone } from "#lib/dates.ts";
import { isOpenOrder } from "#lib/models.ts";
import { id } from "#lib/schema.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, order, user } from "#lib/server/db/schema.ts";
import { nextNumber } from "#lib/server/numbering.ts";
import { nameTaken } from "#lib/server/records.ts";
import { type Problem, Refused } from "#lib/server/refused.ts";

import { materialFields, newMaterialFields } from "./form/material-schema.ts";
import { materialLabels } from "./labels.ts";
import { fitsUnit, type MaterialUnit, materialNumberFormat } from "./model.ts";
import { form, query } from "./remote-functions.ts";
import { lineTotalSql } from "./server/costs.ts";
import { findMaterial, ordersUsing, removeMaterial } from "./server/materials.ts";
import { material, orderLine, stockMovement } from "./server/schema.ts";
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
export const getMaterial = query(v.string(), async (sku) => {
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

	const yearAgo = Temporal.Now.zonedDateTimeISO(getTimeZone()).subtract({ years: 1 }).toInstant();
	const lastYear = usage.filter(
		(row) => Temporal.Instant.compare(row.createdAt, yearAgo) >= 0 && row.status !== "cancelled",
	);
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

/** The problem of a name another of the tenant's materials (than `except`) has, in any case. */
async function nameProblems(name: string, except?: number): Promise<Problem[]> {
	const taken = await nameTaken(db, material, name, { except });
	return taken ? [{ path: ["name"], message: m.materials_name_taken({ sku: taken.sku }) }] : [];
}

export const createMaterial = form(v.object(newMaterialFields), async (input) => {
	const { organizationId } = currentTenant();
	const problems = await nameProblems(input.name);
	if (!fitsUnit(input.stock, input.unit)) {
		problems.push({ path: ["stock"], message: m.materials_whole_pieces() });
	}
	Refused.check(problems);

	const { stock, ...fields } = input;
	const sku = await db.transaction(async (tx) => {
		const sku = await nextNumber(tx, {
			format: materialNumberFormat,
			table: material,
			column: material.sku,
		});
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

export const updateMaterial = form(v.object({ id: id(), ...materialFields }), async (data) => {
	const { id, ...input } = data;
	const existing = await findMaterial(id);
	if (!existing) error(404, m.materials_not_found());

	const problems = await nameProblems(input.name, id);
	// Order lines are counted in the material's unit, so changing it would change them too.
	if (input.unit !== existing.unit) {
		const orders = await ordersUsing(id);
		if (orders) {
			problems.push({
				path: ["unit"],
				message: m.materials_unit_in_use({
					count: orders,
					unit: materialLabels.label("materialUnitSymbol", existing.unit),
				}),
			});
		} else if (!(await historyFits(id, input.unit))) {
			// Its stock movements are counted in the new unit from now on.
			problems.push({ path: ["unit"], message: m.materials_unit_history_parts() });
		}
	}
	Refused.check(problems);

	await db.transaction(async (tx) => {
		await tx.update(material).set(input).where(idInTenant(material, id));
		const subject: Subject = { type: "material", id, label: existing.sku };
		await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
	});
	// Send the updated material along, so the page we redirect to doesn't show the old one first.
	void getMaterial(existing.sku).refresh();
	redirect(303, `/materials/${existing.sku}`);
});

export const deleteMaterial = form(v.object({ id: id() }), async ({ id }) => {
	await removeMaterial(id);
	redirect(303, "/materials");
});
