import * as v from "valibot";

import { cents, numberIn, text } from "#lib/schema.ts";

import { fitsUnit, materialUnits } from "../model.ts";

/**
 * Quantities of a material have at most two decimals. Pieces are only counted whole; the server
 * checks that against the material's unit.
 */
const twoDecimals = () =>
	v.check((quantity: number) => fitsUnit(quantity, "m"), m.validation_two_decimals);

/** The fields of the material form, shared by creating and editing a material. */
export const materialFields = {
	name: text(m.materials_name_required),
	unit: v.picklist(materialUnits, m.materials_unit_required),
	unitPrice: cents(m.materials_price_required),
};

/**
 * A new material also takes the stock it starts with, recorded as its opening balance. After
 * that the stock changes through receipts, counts and orders, never by editing the material.
 */
export const newMaterialFields = {
	...materialFields,
	stock: v.pipe(
		numberIn({ message: m.materials_stock_required, tooLow: m.validation_not_negative }),
		twoDecimals(),
	),
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
	quantity: v.pipe(
		numberIn({
			above: true,
			message: m.materials_quantity_required,
			tooLow: m.validation_more_than_zero,
		}),
		twoDecimals(),
	),
	note: note(),
};

/** The stock as counted; the difference with the recorded stock is the adjustment. */
export const countFields = {
	counted: v.pipe(
		numberIn({ message: m.materials_counted_required, tooLow: m.validation_not_negative }),
		twoDecimals(),
	),
	note: text(m.materials_reason_required),
};
