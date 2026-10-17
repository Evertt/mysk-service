/**
 * A unit's condition on the engineer portal's page of one of their orders, below the unit's
 * checklist once it's completed: the score the checklist gave it (worked out from its points when
 * it was completed), and the engineer's advice on it while the order is in progress. Only the
 * engineer's own orders and their units.
 */
import * as v from "valibot";

import { fieldActions } from "#lib/orders/index.ts";
import { id } from "#lib/schema.ts";
import { currentEngineer } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { advice } from "../form/condition-schema.ts";
import { forEngineers } from "../remote-functions.ts";
import { adviseFieldCondition, checklistCondition, findFieldUnit } from "../server/conditions.ts";
import { thresholdsOf } from "../server/settings.ts";

const unitOnOrder = v.object({
	number: v.pipe(v.string(), v.nonEmpty()),
	equipmentId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

/**
 * The condition the checklist of a unit on one of the engineer's orders gave it (none when none of
 * its points counted), whether they can still give advice (the order in progress), and the
 * thresholds that colour it.
 */
export const getFieldCondition = forEngineers.query(unitOnOrder, async (input) => {
	const engineer = await currentEngineer();
	const found = await findFieldUnit(db, engineer.id, input.number, input.equipmentId);
	const [recorded, thresholds] = await Promise.all([
		checklistCondition(db, found.unit.id, found.order.id),
		thresholdsOf(),
	]);
	return {
		recorded: recorded ?? null,
		canChange: fieldActions(found.order.status).work,
		thresholds,
	};
});

/** Gives the condition a unit's checklist gave it the engineer's advice, while the order is in progress. */
export const adviseFieldConditionForm = forEngineers.form(
	v.object({
		number: v.pipe(v.string(), v.nonEmpty()),
		equipmentId: id(),
		advice: advice(),
	}),
	async ({ number, equipmentId, advice }) => {
		const engineer = await currentEngineer();
		await adviseFieldCondition(engineer.id, number, equipmentId, advice);
		void getFieldCondition({ number, equipmentId }).refresh();
	},
);
