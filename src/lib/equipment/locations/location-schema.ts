import * as v from "valibot";

import { id, optionalText, text, textMax } from "#lib/schema.ts";

/** The longest a location's name may be, here and where the equipment form adds a location. */
export const locationNameMax = 80;

/** The fields of the location form, shared by adding and editing a location. */
const locationFields = {
	name: v.pipe(text(m.equipment_location_name_required), textMax(locationNameMax)),
	/** What helps to find it, if anything. */
	description: optionalText(200),
};

/** The location form for adding a location to the site `siteId`. */
export const newLocationSchema = v.object({ siteId: id(), ...locationFields });

/** The location form for editing the location `id`. */
export const locationSchema = v.object({ id: id(), ...locationFields });

export type LocationInput = v.InferOutput<v.ObjectSchema<typeof locationFields, undefined>>;
