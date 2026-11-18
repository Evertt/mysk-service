import * as v from "valibot";

import { formatNumber } from "#lib/i18n/format.ts";
import { hiddenInt, id, optionalId, recordId, text } from "#lib/schema.ts";

import { ADVICE_MAX, DEFECT_TEXT_MAX, DEFECTS_MAX } from "../model.ts";
import { defectIntensities, defectSeverities } from "../nen2767.ts";
import { MAX_DEFECT_PHOTOS } from "../photos.ts";

/** The advice that goes with it; none when empty. */
export const advice = () =>
	v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.maxLength(ADVICE_MAX, (issue) => m.condition_advice_max({ max: issue.requirement })),
		),
		"",
	);

/** A defect's grade, as its selects and chips send it: its severity, extent class and intensity. */
const grade = {
	severity: v.picklist(defectSeverities, m.validation_choose_one),
	extent: hiddenInt({ min: 1, max: 5, message: m.validation_choose_one }),
	intensity: v.picklist(defectIntensities, m.validation_choose_one),
};

/** A defect's photos, at most `MAX_DEFECT_PHOTOS` (the server checks what they are). */
const photos = () =>
	v.optional(
		v.pipe(
			v.array(v.file()),
			v.maxLength(MAX_DEFECT_PHOTOS, () =>
				m.condition_photos_too_many({ max: formatNumber(MAX_DEFECT_PHOTOS) }),
			),
		),
		[],
	);

/**
 * A defect the office records: what's wrong, the element it's on (empty for the unit itself), its
 * grade and photos. Its score isn't sent: the server works it out.
 */
const defectSchema = v.object({
	componentId: v.optional(optionalId(), ""),
	description: v.pipe(
		text(m.condition_defect_description_required),
		v.maxLength(DEFECT_TEXT_MAX, (issue) =>
			m.condition_defect_description_max({ max: issue.requirement }),
		),
	),
	...grade,
	photos: photos(),
});

/**
 * A unit's condition recorded in the office, or one of its components' (`componentId`, empty for
 * the unit as a whole): the fields of its dialog, with the unit's serial number, its defects (none:
 * score 1) and the advice.
 */
export const conditionSchema = v.object({
	serialNumber: v.pipe(v.string(), v.nonEmpty()),
	componentId: v.optional(optionalId(), ""),
	defects: v.optional(
		v.pipe(
			v.array(defectSchema),
			v.maxLength(DEFECTS_MAX, (issue) => m.condition_defects_max({ max: issue.requirement })),
		),
		[],
	),
	advice: advice(),
});

/** Which rejected point of the engineer's checklist: the order, the unit and the point. */
const fieldPoint = {
	number: v.pipe(v.string(), v.nonEmpty()),
	equipmentId: id(),
	pointId: id(),
};

/** The defect an engineer gives a rejected point in the portal: its grade, and photos to add. */
export const pointDefectSchema = v.object({ ...fieldPoint, ...grade, photos: photos() });

/** A photo taken off a rejected point's defect, by a command (ids as numbers). */
export const pointPhotoSchema = v.object({
	number: v.pipe(v.string(), v.nonEmpty()),
	equipmentId: recordId(),
	pointId: recordId(),
	photoId: recordId(),
});
