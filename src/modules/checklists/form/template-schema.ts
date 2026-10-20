/** The forms of the checklist templates: a template's details, its categories, and its points. */
import * as v from "valibot";

import { id, text, textMax, moveDirection } from "#lib/schema.ts";

import { textLimits, validityLimits } from "../model.ts";

const validityMessage = () => m.checklists_validity_range(validityLimits);

/** The fields of a template's details, shared by adding and editing one. */
const templateFields = {
	name: v.pipe(text(m.checklists_name_required), textMax(textLimits.name)),
	/** The norm it inspects by; none when left empty. */
	norm: v.pipe(
		v.optional(v.string(), ""),
		v.trim(),
		textMax(textLimits.norm),
		v.transform((value) => value || null),
	),
	validityMonths: v.pipe(
		v.number(validityMessage),
		v.integer(validityMessage),
		v.minValue(validityLimits.min, validityMessage),
		v.maxValue(validityLimits.max, validityMessage),
	),
};

export const newTemplateSchema = v.object(templateFields);

export const templateSchema = v.object({ id: id(), ...templateFields });

export type TemplateInput = v.InferOutput<typeof newTemplateSchema>;

/** The equipment categories a template is for: a checkbox each, so none checked is no field. */
export const templateCategoriesSchema = v.object({
	id: id(),
	categoryIds: v.optional(v.array(id()), []),
});

/** Just the template, e.g. to retire or restore it. */
export const templateIdSchema = v.object({ id: id() });

/** The fields of a point, shared by adding and editing one. */
const pointFields = {
	/** E.g. "Mechanisch"; none when left empty. */
	group: v.pipe(v.optional(v.string(), ""), v.trim(), textMax(textLimits.group)),
	text: v.pipe(text(m.checklists_point_required), textMax(textLimits.text)),
};

export const newPointSchema = v.object({ templateId: id(), ...pointFields });

export const pointSchema = v.object({ id: id(), ...pointFields });

export type PointInput = v.InferOutput<typeof newPointSchema>;

/** Moving a group of a template's points one place up or down, past the group next to it. */
export const moveGroupSchema = v.object({
	templateId: id(),
	group: v.pipe(v.optional(v.string(), ""), v.maxLength(textLimits.group)),
	direction: moveDirection(),
});

/** Just the point, e.g. to delete it. */
export const pointIdSchema = v.object({ id: id() });
