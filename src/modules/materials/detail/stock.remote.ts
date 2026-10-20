import { invalid } from "@sveltejs/kit";
import * as v from "valibot";

import { getSubjectActivity } from "#lib/components/activity/activity.remote.ts";
import { id } from "#lib/schema.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { idInTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { orNotFound } from "#lib/server/records.ts";

import { countFields, receiveFields } from "../form/material-schema.ts";
import { getMaterial } from "../material.remote.ts";
import { fitsUnit, roundQuantity } from "../model.ts";
import { form } from "../remote-functions.ts";
import { findMaterial } from "../server/materials.ts";
import { material } from "../server/schema.ts";
import { moveStock } from "../server/stock.ts";

/** Adds received stock (e.g. a delivery) to a material. */
export const receiveStock = form(
	v.object({ id: id(), ...receiveFields }),
	async ({ id, quantity, note }, issue) => {
		const existing = orNotFound(await findMaterial(id), m.materials_not_found());
		if (!fitsUnit(quantity, existing.unit)) invalid(issue.quantity(m.materials_whole_pieces()));

		await db.transaction(async (tx) => {
			const { stock } = await moveStock(tx, { materialId: id, quantity, kind: "receipt", note });
			const subject: Subject = { type: "material", id, label: existing.sku };
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
		const existing = orNotFound(await findMaterial(id), m.materials_not_found());
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
			const subject: Subject = { type: "material", id, label: existing.sku };
			const [before, after] = [{ stock: current.stock }, { stock: counted }];
			await recordActivity(tx, { action: "stock_adjusted", subject, before, after, note });
		});
		void getMaterial(existing.sku).refresh();
		void getSubjectActivity({ type: "material", id: String(id) }).refresh();
	},
);
