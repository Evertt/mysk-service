/**
 * An order's material lines, as the order form's part (`form-parts/orders.form.ts`) and the engineer
 * portal submit them: a material and a quantity each. Isomorphic: the browser and the server check
 * them the same way.
 */
import * as v from "valibot";

import { id, numberIn } from "#lib/schema.ts";

import { fitsUnit } from "../model.ts";

/**
 * An order's material lines, for the order form and the engineer portal: a material and a
 * quantity each. Pieces are only counted whole; saving checks that against the material's unit.
 */
export const orderLines = () =>
	v.optional(
		v.array(
			v.object({
				materialId: id(m.materials_line_material_required),
				quantity: v.pipe(
					numberIn({
						above: true,
						message: m.validation_quantity_required,
						tooLow: m.validation_more_than_zero,
					}),
					v.check((quantity) => fitsUnit(quantity, "m"), m.validation_two_decimals),
				),
			}),
		),
		[],
	);
