/**
 * A unit's condition on the engineer portal's page of one of their orders: while its checklist is a
 * draft, the defect of each rejected point (its severity, extent and intensity, and photos,
 * `checklists.field.rejected`); once it's completed, the score the checklist gave the unit (the
 * worst of its rejected points' defects) and its components, and the engineer's advice on it while
 * the order is in progress. Only the engineer's own orders, their units and their checklists' points.
 */
import * as v from "valibot";

import { fieldActions } from "#lib/orders/index.ts";
import { id, recordId } from "#lib/schema.ts";
import { db } from "#lib/server/db/index.ts";

import { advice, pointDefectSchema, pointPhotoSchema } from "../form/condition-schema.ts";
import type { DefectExtent } from "../nen2767.ts";
import { forEngineers } from "../remote-functions.ts";
import {
	adviseFieldCondition,
	checklistComponentConditions,
	checklistCondition,
	defectsOf,
	findFieldUnit,
} from "../server/conditions.ts";
import {
	fieldPointDefect,
	removeFieldDefectPhoto,
	saveFieldPointDefect,
} from "../server/point-defects.ts";
import { thresholdsOf } from "../server/settings.ts";

const unitOnOrder = v.object({
	number: v.pipe(v.string(), v.nonEmpty()),
	equipmentId: recordId(),
});

/**
 * The condition the checklist of a unit on one of the engineer's orders gave it (none when none of
 * its points counted) with its defects, and its components', whether they can still give advice
 * (the order in progress), and the thresholds.
 */
export const getFieldCondition = forEngineers.query(unitOnOrder, async (input) => {
	const found = await findFieldUnit(db, input.number, input.equipmentId);
	const [recorded, components, thresholds] = await Promise.all([
		checklistCondition(db, found.unit.id, found.order.id),
		checklistComponentConditions(found.unit.id, found.order.id),
		thresholdsOf(),
	]);
	const defects = recorded ? ((await defectsOf([recorded.id])).get(recorded.id) ?? []) : [];
	return {
		recorded: recorded ? { ...recorded, defects } : null,
		// Each component's once, the latest.
		components: components.filter(
			(each, i) => components.findIndex((other) => other.number === each.number) === i,
		),
		canChange: fieldActions(found.order.status).work,
		thresholds,
	};
});

/**
 * Gives the condition a unit's checklist gave it the engineer's advice, while the order is in
 * progress; logged on the unit, which the card watches (`refreshOnRecordChange()`).
 */
export const adviseFieldConditionForm = forEngineers.form(
	v.object({
		number: v.pipe(v.string(), v.nonEmpty()),
		equipmentId: id(),
		advice: advice(),
	}),
	({ number, equipmentId, advice }) => adviseFieldCondition(number, equipmentId, advice),
);

/**
 * The defect the engineer gave a rejected point of their checklist (none yet), with its photos,
 * and whether they can still change it: a 404 for a point that isn't theirs.
 */
export const getFieldPointDefect = forEngineers.query(
	v.object({
		number: v.pipe(v.string(), v.nonEmpty()),
		equipmentId: recordId(),
		pointId: recordId(),
	}),
	(input) => fieldPointDefect(input),
);

/**
 * Gives a rejected point of the engineer's checklist its defect's grade and adds photos to it, while
 * the checklist is a draft and the order in progress. Refreshes the point's defect.
 */
export const saveFieldPointDefectForm = forEngineers.form(
	pointDefectSchema,
	async ({ number, equipmentId, pointId, photos, ...grade }) => {
		await saveFieldPointDefect(
			{ number, equipmentId, pointId },
			{ ...grade, extent: grade.extent as DefectExtent },
			photos,
		);
		void getFieldPointDefect({ number, equipmentId, pointId }).refresh();
	},
);

/** Takes a photo off a rejected point's defect, while the engineer can still change it. */
export const removeFieldPointPhoto = forEngineers.command(
	pointPhotoSchema,
	async ({ photoId, ...point }) => {
		await removeFieldDefectPhoto(point, photoId);
		void getFieldPointDefect(point).refresh();
	},
);
