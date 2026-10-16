import * as v from "valibot";

import { equipmentCategories, equipmentStatuses } from "#lib/models.ts";
import { date, id, text } from "#lib/schema.ts";

/** An optional, trimmed text; `null` if it's left empty. */
const optionalText = () =>
	v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(120, (issue) => m.equipment_text_max({ max: issue.requirement })),
		v.transform((value) => value || null),
	);

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
	category: v.picklist(equipmentCategories, m.equipment_category_required),
	status: v.picklist(equipmentStatuses, m.equipment_status_required),
	/** The customer's own name or tag for it, if any. */
	name: optionalText(),
	customerId: id(m.equipment_customer_required),
	/** One of the customer's sites. */
	siteId: id(m.equipment_site_required),
	/** Where it is at the site, if that needs saying. */
	location: optionalText(),
	installedAt: date(m.equipment_installed_required),
	warrantyUntil: date(m.equipment_warranty_required),
};
