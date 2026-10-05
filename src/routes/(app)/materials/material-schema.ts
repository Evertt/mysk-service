import * as v from "valibot";

import { materialUnits } from "#lib/models.js";
import { cents, text } from "#lib/schema.js";

/** The fields of the material form, shared by creating and editing a material. */
export const materialFields = {
	name: text("Name the material"),
	unit: v.picklist(materialUnits, "Choose a unit"),
	// An empty number input arrives as undefined; say so rather than "expected number".
	unitPrice: v.pipe(v.number("Enter a price"), cents()),
	stock: v.pipe(
		v.number("Enter the stock"),
		v.integer("Whole units only"),
		v.minValue(0, "Can't be negative"),
	),
};
