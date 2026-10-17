/**
 * A unit's condition, for its card on the unit's page: its latest condition, its history and its
 * status, and recording a new one in the office.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { unitTitle } from "#lib/equipment/index.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { conditionSchema } from "./form/condition-schema.ts";
import { form, query } from "./remote-functions.ts";
import { conditionsOf, recordOfficeCondition } from "./server/conditions.ts";
import { thresholdsOf } from "./server/settings.ts";
import { conditionSql } from "./server/status-sql.ts";

/** A unit's condition (by serial number): its history, newest first, and its status now. */
export const getUnitCondition = query(v.string(), async (serialNumber) => {
	const unit = conditionSql();
	const [found] = await db
		.select({
			id: equipment.id,
			serialNumber: equipment.serialNumber,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
			status: unit.status,
			concern: unit.concern,
		})
		.from(equipment)
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!found) error(404, m.condition_unit_not_found({ serial: serialNumber }));
	const [history, thresholds] = await Promise.all([conditionsOf(found.id), thresholdsOf()]);
	return {
		unit: { id: found.id, serialNumber: found.serialNumber, title: unitTitle(found) },
		status: found.status,
		concern: found.concern,
		history,
		thresholds,
	};
});

/** Records a unit's condition in the office; refreshes its card. */
export const recordCondition = form(conditionSchema, async ({ serialNumber, ...input }) => {
	await recordOfficeCondition(serialNumber, input);
	void getUnitCondition(serialNumber).refresh();
});
