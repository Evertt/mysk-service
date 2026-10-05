import * as v from "valibot";

import { equipmentCategories, equipmentStatuses } from "#lib/models.js";
import { date, id, text } from "#lib/schema.js";

/** The fields of the equipment form, shared by registering and editing a unit. */
export const equipmentFields = {
	serialNumber: v.pipe(
		text("Enter the serial number"),
		v.toUpperCase(),
		v.regex(/^[A-Z0-9-]+$/, "Use only letters, digits and dashes"),
		v.maxLength(40, "At most 40 characters"),
	),
	manufacturer: text("Enter the manufacturer"),
	model: text("Enter the model"),
	category: v.picklist(equipmentCategories, "Choose a category"),
	status: v.picklist(equipmentStatuses, "Choose a status"),
	customerId: id("Choose a customer"),
	installedAt: date("Enter the installation date"),
	warrantyUntil: date("Enter the end of the warranty"),
};
