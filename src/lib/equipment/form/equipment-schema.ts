import * as v from "valibot";

import { equipmentStatuses } from "#lib/models.ts";
import { date, id, text } from "#lib/schema.ts";

import { locationNameMax } from "../locations/location-schema.ts";

/** An optional, trimmed text of at most `max` characters; `null` if it's left empty. */
const optionalText = (max = 120) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(max, (issue) => m.equipment_text_max({ max: issue.requirement })),
		v.transform((value) => value || null),
	);

/** The location field's option for adding a location to the site. */
export const newLocationToken = "new";

/** The fields of the equipment form, shared by registering and editing a unit. */
export const equipmentFields = {
	serialNumber: v.pipe(
		text(m.equipment_serial_required),
		v.toUpperCase(),
		v.regex(/^[A-Z0-9-]+$/, m.equipment_serial_format),
		v.maxLength(40, (issue) => m.equipment_serial_max({ max: issue.requirement })),
	),
	manufacturer: text(m.equipment_manufacturer_required),
	model: text(m.equipment_model_required),
	/** One of the tenant's categories. */
	categoryId: id(m.equipment_category_required),
	status: v.picklist(equipmentStatuses, m.equipment_status_required),
	/** The customer's own name or tag for it, if any. */
	name: optionalText(),
	customerId: id(m.equipment_customer_required),
	/** One of the customer's sites. */
	siteId: id(m.equipment_site_required),
	/**
	 * Where it is at the site, if that needs saying: one of the site's locations, or `new`, a
	 * location the form adds to the site (named `newLocationName`).
	 */
	locationId: v.union(
		[
			v.pipe(
				v.literal(""),
				v.transform(() => null),
			),
			v.literal(newLocationToken),
			id(),
		],
		m.validation_choose_one,
	),
	/**
	 * The name of the location to add (with `locationId` `new`; the form has it only then), as long
	 * as the location form takes it.
	 */
	newLocationName: v.optional(optionalText(locationNameMax), ""),
	installedAt: date(m.equipment_installed_required),
	warrantyUntil: date(m.equipment_warranty_required),
};
