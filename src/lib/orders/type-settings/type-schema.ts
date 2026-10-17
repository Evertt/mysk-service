import * as v from "valibot";

import { orderTypes } from "#lib/models.ts";
import { type Locale, locales } from "#lib/paraglide/runtime.js";

import { orderTypeNameMax } from "../types.ts";

/** A type's own name in one language: empty for the standard label. */
const name = v.pipe(
	v.optional(v.string(), ""),
	v.trim(),
	v.maxLength(orderTypeNameMax, (issue) => m.orders_type_name_max({ max: issue.requirement })),
);

/** A manager's setting for one order type: its names in each language, and whether it's hidden. */
export const orderTypeSchema = v.object({
	type: v.picklist(orderTypes),
	names: v.object(
		Object.fromEntries(locales.map((locale) => [locale, name])) as Record<Locale, typeof name>,
	),
	hidden: v.optional(v.boolean(), false),
});
