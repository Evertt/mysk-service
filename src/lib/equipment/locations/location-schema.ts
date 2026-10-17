import * as v from "valibot";

import { id, text } from "#lib/schema.ts";

/** An optional, trimmed text; `null` if it's left empty. */
const optionalText = (max: number) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(max, (issue) => m.equipment_text_max({ max: issue.requirement })),
		v.transform((value) => value || null),
	);

/** The fields of the location form, shared by adding and editing a location. */
const locationFields = {
	name: v.pipe(
		text(m.equipment_location_name_required),
		v.maxLength(80, (issue) => m.equipment_text_max({ max: issue.requirement })),
	),
	/** What helps to find it, if anything. */
	description: optionalText(200),
};

/** The location form for adding a location to the site `siteId`. */
export const newLocationSchema = v.object({ siteId: id(), ...locationFields });

/** The location form for editing the location `id`. */
export const locationSchema = v.object({ id: id(), ...locationFields });

export type LocationInput = v.InferOutput<v.ObjectSchema<typeof locationFields, undefined>>;
