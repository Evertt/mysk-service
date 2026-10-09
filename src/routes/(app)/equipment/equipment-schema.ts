import * as v from "valibot";

import { equipmentCategories, equipmentStatuses } from "#lib/models.ts";
import { date, id, text } from "#lib/schema.ts";

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
	customerId: id(m.equipment_customer_required),
	installedAt: date(m.equipment_installed_required),
	warrantyUntil: date(m.equipment_warranty_required),
};
