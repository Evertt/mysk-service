/**
 * A unit's condition on the engineer portal's page of one of their orders, asked for below the
 * unit's checklist once it's completed: what they recorded on this order, and recording it (again)
 * while the order is in progress. Only the engineer's own orders and their units.
 */
import * as v from "valibot";

import { fieldActions } from "#lib/orders/index.ts";
import { id } from "#lib/schema.ts";
import { currentEngineer } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { advice, score } from "../form/condition-schema.ts";
import { forEngineers } from "../remote-functions.ts";
import { conditionsOf, findFieldUnit, recordFieldCondition } from "../server/conditions.ts";
import { thresholdsOf } from "../server/settings.ts";

const unitOnOrder = v.object({
	number: v.pipe(v.string(), v.nonEmpty()),
	equipmentId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

/**
 * The condition the engineer recorded of a unit on one of their orders (the latest, if any),
 * whether they can record it (the order in progress), and the thresholds that colour it.
 */
export const getFieldCondition = forEngineers.query(unitOnOrder, async (input) => {
	const engineer = await currentEngineer();
	const found = await findFieldUnit(db, engineer.id, input.number, input.equipmentId);
	const [recorded, thresholds] = await Promise.all([
		conditionsOf(found.unit.id, { orderId: found.order.id }),
		thresholdsOf(),
	]);
	return {
		latest: recorded[0] ?? null,
		canChange: fieldActions(found.order.status).work,
		thresholds,
	};
});

/** Records the condition of a unit on one of the engineer's orders that's in progress. */
export const recordFieldConditionForm = forEngineers.form(
	v.object({
		number: v.pipe(v.string(), v.nonEmpty()),
		equipmentId: id(),
		score: score(),
		advice: advice(),
	}),
	async ({ number, equipmentId, ...input }) => {
		const engineer = await currentEngineer();
		await recordFieldCondition(engineer.id, number, equipmentId, input);
		void getFieldCondition({ number, equipmentId }).refresh();
	},
);
