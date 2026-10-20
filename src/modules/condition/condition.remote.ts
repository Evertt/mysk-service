/**
 * A unit's condition, for its card on the unit's page: its latest condition as a whole, its history
 * and its status (with its components'), and recording a new one in the office.
 */
import * as v from "valibot";

import { unitTitle } from "#lib/equipment/index.ts";
import { unitBySerial } from "#lib/equipment/server/index.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { conditionSchema } from "./form/condition-schema.ts";
import { form, query } from "./remote-functions.ts";
import { conditionsOf, recordOfficeCondition } from "./server/conditions.ts";
import { thresholdsOf } from "./server/settings.ts";
import { conditionSql } from "./server/status-sql.ts";

/** A unit's condition (by serial number): its history, newest first, and its status now. */
export const getUnitCondition = query(v.string(), async (serialNumber) => {
	const unit = conditionSql();
	const found = await unitBySerial(serialNumber, {
		id: equipment.id,
		serialNumber: equipment.serialNumber,
		name: equipment.name,
		manufacturer: equipment.manufacturer,
		model: equipment.model,
		status: unit.status,
		concern: unit.concern,
	});
	const [history, thresholds] = await Promise.all([conditionsOf(found.id), thresholdsOf()]);
	return {
		unit: { id: found.id, serialNumber: found.serialNumber, title: unitTitle(found) },
		status: found.status,
		concern: found.concern,
		history,
		thresholds,
	};
});

/**
 * Records a unit's condition in the office, or one of its components' (`componentId`), logged on
 * the unit, which its cards watch (`watchRecord`).
 */
export const recordCondition = form(conditionSchema, ({ serialNumber, componentId, ...input }) =>
	recordOfficeCondition(serialNumber, input, componentId ?? null),
);
