import * as v from "valibot";

import { equipmentCategories, equipmentStatuses } from "#lib/models.js";
import { id, text } from "#lib/schema.js";

/** A required date from `<input type="date">`, as a local date at the start of the day. */
const date = (message: string) =>
	v.pipe(
		v.string(),
		v.nonEmpty(message),
		v.transform((value) => new Date(`${value}T00:00`)),
		v.check((value) => !Number.isNaN(value.getTime()), "Enter a valid date"),
	);

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
