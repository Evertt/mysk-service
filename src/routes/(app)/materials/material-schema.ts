import * as v from "valibot";

import { materialUnits } from "#lib/models.js";
import { cents, text } from "#lib/schema.js";

/** The fields of the material form, shared by creating and editing a material. */
export const materialFields = {
	name: text("Name the material"),
	unit: v.picklist(materialUnits, "Choose a unit"),
	unitPrice: cents("Enter a price"),
	stock: v.pipe(
		v.number("Enter the stock"),
		v.integer("Whole units only"),
		v.minValue(0, "Can't be negative"),
	),
};
