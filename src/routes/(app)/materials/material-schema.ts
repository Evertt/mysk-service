import * as v from "valibot";

import { fitsUnit, materialUnits } from "#lib/models.js";
import { cents, text } from "#lib/schema.js";

/**
 * Quantities of a material have at most two decimals. Pieces are only counted whole; the server
 * checks that against the material's unit.
 */
const twoDecimals = () =>
	v.check((quantity: number) => fitsUnit(quantity, "m"), "At most two decimals");

/** The fields of the material form, shared by creating and editing a material. */
export const materialFields = {
	name: text("Name the material"),
	unit: v.picklist(materialUnits, "Choose a unit"),
	unitPrice: cents("Enter a price"),
};

/**
 * A new material also takes the stock it starts with, recorded as its opening balance. After
 * that the stock changes through receipts, counts and orders, never by editing the material.
 */
export const newMaterialFields = {
	...materialFields,
	stock: v.pipe(v.number("Enter the stock"), v.minValue(0, "Can't be negative"), twoDecimals()),
};

/** An optional note; empty is none. */
const note = () =>
	v.pipe(
		v.optional(v.string(), ""),
		v.trim(),
		v.transform((note) => note || null),
	);

/** Stock received, e.g. a delivery. */
export const receiveFields = {
	quantity: v.pipe(v.number("Enter the quantity"), v.gtValue(0, "More than 0"), twoDecimals()),
	note: note(),
};

/** The stock as counted; the difference with the recorded stock is the adjustment. */
export const countFields = {
	counted: v.pipe(
		v.number("Enter the counted stock"),
		v.minValue(0, "Can't be negative"),
		twoDecimals(),
	),
	note: text("Say why the stock differs"),
};
