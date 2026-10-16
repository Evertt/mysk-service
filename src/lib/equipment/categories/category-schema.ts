import * as v from "valibot";

import { engineerSpecialties } from "#lib/models.ts";
import { id, text } from "#lib/schema.ts";

/** The most a category's name may have. */
const categoryNameMax = 60;

/** The fields of the category form, shared by adding and editing a category. */
const categoryFields = {
	name: v.pipe(
		text(m.equipment_category_name_required),
		v.maxLength(categoryNameMax, (issue) =>
			m.equipment_category_name_max({ max: issue.requirement }),
		),
	),
	/** The specialty of the engineers who service it, or `null` (the empty option) for none. */
	specialty: v.union(
		[
			v.pipe(
				v.literal(""),
				v.transform(() => null),
			),
			v.picklist(engineerSpecialties, m.validation_choose_one),
		],
		m.validation_choose_one,
	),
};

export const newCategorySchema = v.object(categoryFields);

export const categorySchema = v.object({ id: id(), ...categoryFields });

export type CategoryInput = v.InferOutput<typeof newCategorySchema>;

/** Moving a category one place up or down the tenant's list. */
export const moveCategorySchema = v.object({ id: id(), direction: v.picklist(["up", "down"]) });

export type MoveDirection = v.InferOutput<typeof moveCategorySchema>["direction"];
