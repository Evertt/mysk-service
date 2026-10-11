/**
 * The materials' part of the order form, and the lines the engineer portal submits: a material and
 * a quantity each. Isomorphic: the form's part and the server check them the same way.
 */
import * as v from "valibot";

import { fitsUnit } from "#lib/models.ts";
import { id } from "#lib/schema.ts";

/**
 * An order's material lines, for the order form and the engineer portal: a material and a
 * quantity each. Pieces are only counted whole; saving checks that against the material's unit.
 */
export const orderLines = () =>
	v.optional(
		v.array(
			v.object({
				materialId: id(m.validation_material_required),
				quantity: v.pipe(
					v.number(m.validation_quantity_required),
					v.gtValue(0, m.validation_more_than_zero),
					v.check((quantity) => fitsUnit(quantity, "m"), m.validation_two_decimals),
				),
			}),
		),
		[],
	);

/**
 * What the materials' part of the order form submits (under `modules.materials`, see `orders.form`):
 * its lines, none when it has none.
 */
export const materialsPart = v.object({ lines: orderLines() });
