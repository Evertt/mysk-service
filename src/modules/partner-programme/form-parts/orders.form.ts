/**
 * The partner programme's part of the order form (`orders.form`): how the order's revenue counts,
 * its category and its eligibility, each empty for the default (by the order's type, and by the
 * category's rule), with the share that counts of a partial one. Submitted under the form's
 * `modules.partnerProgramme` (`formPartKey()`) and saved with the order (`saveClassification()`, through
 * `orders.saving`). Isomorphic.
 */
import * as v from "valibot";

import { wholeIn } from "#lib/schema.ts";

import { eligibilities, revenueCategories } from "../model.ts";

export default v.pipe(
	v.object({
		category: v.picklist(["", ...revenueCategories], m.validation_choose_one),
		eligibility: v.picklist(["", ...eligibilities], m.validation_choose_one),
		share: v.optional(wholeIn({ min: 1, max: 99, message: m.partners_share_range })),
	}),
	v.forward(
		v.check(
			({ eligibility, share }) => eligibility !== "partial" || share !== undefined,
			m.partners_share_required,
		),
		["share"],
	),
);
