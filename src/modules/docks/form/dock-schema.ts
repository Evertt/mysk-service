/** The dock form's fields (the customer page's card): a dock at one of the customer's sites. */
import * as v from "valibot";

import { customerCode, id, omittableText, optionalId, textMax } from "#lib/schema.ts";

import { dockCodePattern } from "../model.ts";

const dockFields = {
	siteId: id(m.docks_unknown_site),
	code: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(m.docks_code_required),
		v.regex(dockCodePattern, m.docks_code_format),
	),
	position: v.pipe(v.optional(v.string(), ""), v.trim(), textMax(80)),
	locationId: v.optional(optionalId(), ""),
	doorId: v.optional(optionalId(), ""),
	levellerId: v.optional(optionalId(), ""),
	scpCode: omittableText(32),
	keyId: omittableText(32),
	keyStorageUnit: omittableText(32),
};

/** A dock as the form submits it, for the customer `customer` (its code); with `dockId` when edited. */
export const dockSchema = v.object({
	customer: customerCode(),
	// The dock edited; none for a new one. (Not `id`: a remote form's `.for()` key takes that name.)
	dockId: v.optional(optionalId(), ""),
	...dockFields,
});

/** A dock's fields, parsed. */
export type DockInput = Omit<v.InferOutput<typeof dockSchema>, "customer" | "dockId">;
