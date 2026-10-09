import { form } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import * as v from "valibot";

import { getSubjectActivity } from "#lib/components/activity/activity.remote.ts";
import { findMaterial } from "#lib/materials/server/materials.ts";
import { moveStock } from "#lib/materials/server/stock.ts";
import { fitsUnit, roundQuantity } from "#lib/models.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity";
import { idInTenant, requireMember } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { material } from "#lib/server/db/schema.ts";

import { countFields, receiveFields } from "../material-schema.ts";
import { getMaterial } from "../material.remote.ts";

/** Adds received stock (e.g. a delivery) to a material. */
export const receiveStock = form(
	v.object({ id: id(), ...receiveFields }),
	async ({ id, quantity, note }, issue) => {
		requireMember();
		const existing = await findMaterial(id);
		if (!existing) error(404, m.materials_not_found());
		if (!fitsUnit(quantity, existing.unit)) invalid(issue.quantity(m.materials_whole_pieces()));

		await db.transaction(async (tx) => {
			const { stock } = await moveStock(tx, { materialId: id, quantity, kind: "receipt", note });
			const subject = { type: "material", id, label: existing.sku };
			const before = { stock: roundQuantity(stock - quantity) };
			await recordActivity(tx, {
				action: "stock_received",
				subject,
				before,
				after: { stock },
				note,
			});
		});
		void getMaterial(existing.sku).refresh();
		void getSubjectActivity({ type: "material", id: String(id) }).refresh();
	},
);

/** Sets a material's stock to what was counted, recording the difference as an adjustment. */
export const countStock = form(
	v.object({ id: id(), ...countFields }),
	async ({ id, counted, note }, issue) => {
		requireMember();
		const existing = await findMaterial(id);
		if (!existing) error(404, m.materials_not_found());
		if (!fitsUnit(counted, existing.unit)) invalid(issue.counted(m.materials_whole_pieces()));

		await db.transaction(async (tx) => {
			// The difference with the stock as it is now, inside the transaction, so that the stock
			// ends up as counted even if it changed since the form was opened.
			const [current] = await tx
				.select({ stock: material.stock })
				.from(material)
				.where(idInTenant(material, id));
			const difference = roundQuantity(counted - current.stock);
			if (!difference) invalid(issue.counted(m.materials_count_unchanged()));
			await moveStock(tx, { materialId: id, quantity: difference, kind: "adjustment", note });
			const subject = { type: "material", id, label: existing.sku };
			const [before, after] = [{ stock: current.stock }, { stock: counted }];
			await recordActivity(tx, { action: "stock_adjusted", subject, before, after, note });
		});
		void getMaterial(existing.sku).refresh();
		void getSubjectActivity({ type: "material", id: String(id) }).refresh();
	},
);
