import * as v from "valibot";

import { fitsUnit, materialUnits } from "#lib/models.js";
import { cents, text } from "#lib/schema.js";

/** The fields of the material form, shared by creating and editing a material. */
export const materialFields = {
	name: text("Name the material"),
	unit: v.picklist(materialUnits, "Choose a unit"),
	unitPrice: cents("Enter a price"),
	// Pieces are only counted whole; the form checks that against the chosen unit.
	stock: v.pipe(
		v.number("Enter the stock"),
		v.minValue(0, "Can't be negative"),
		v.check((stock) => fitsUnit(stock, "m"), "At most two decimals"),
	),
};
