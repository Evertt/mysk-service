import { invalid } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { fieldActions } from "#lib/orders/index.ts";
import { findEngineerOrder } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { orderLines } from "../form/order-lines-schema.ts";
import { forEngineers } from "../remote-functions.ts";
import { checkLines, saveLines } from "../server/lines.ts";
import { material, orderLine } from "../server/schema.ts";
import { OrderStockShortage } from "../server/stock.ts";

/**
 * The materials used on one of the engineer's orders (by its number), and whether they can change
 * them (while it's in progress); a 404 for anyone else's.
 */
export const getFieldMaterials = forEngineers.query(v.string(), async (number) => {
	const found = await findEngineerOrder(db, { number });
	const lines = await db
		.select({
			id: orderLine.id,
			materialId: orderLine.materialId,
			quantity: orderLine.quantity,
			name: material.name,
			unit: material.unit,
		})
		.from(orderLine)
		.innerJoin(...tenantJoin(material, orderLine.materialId))
		.where(and(eq(orderLine.orderId, found.id), inTenant(orderLine)))
		.orderBy(asc(orderLine.id));
	return { orderId: found.id, canChange: fieldActions(found.status).work, lines };
});

/** The materials an engineer can use on a job, by name. */
export const getUsableMaterials = forEngineers.query(async () => {
	return db
		.select({ id: material.id, sku: material.sku, name: material.name, unit: material.unit })
		.from(material)
		.where(inTenant(material))
		.orderBy(asc(material.name));
});

/**
 * Replaces the materials used on a job under way, through the same code as the office's order
 * form: they take or return stock, and more than there is in stock is refused on the line.
 */
export const saveFieldMaterials = forEngineers.form(
	v.object({ id: id(), lines: orderLines() }),
	async (input, issue) => {
		const problems = await checkLines(input.lines);
		if (problems.length) {
			invalid(...problems.map((p) => issue.lines[p.line][p.field](p.message)));
		}
		const number = await db
			.transaction(async (tx) => {
				const found = await findEngineerOrder(tx, { id: input.id }, "work");
				await saveLines(tx, found, found.status, input.lines);
				return found.number;
			})
			.catch((error) => {
				if (!(error instanceof OrderStockShortage)) throw error;
				const line = input.lines.findLastIndex((line) => line.materialId === error.materialId);
				invalid(issue.lines[line].quantity(error.message));
			});
		void getFieldMaterials(number).refresh();
	},
);
