import * as v from "valibot";

import { customerSegments } from "#lib/models.js";
import { text } from "#lib/schema.js";

/** Countries offered in the customer form, besides those already in use. */
export const europeanCountries = [
	"Austria",
	"Belgium",
	"Bulgaria",
	"Croatia",
	"Cyprus",
	"Czechia",
	"Denmark",
	"Estonia",
	"Finland",
	"France",
	"Germany",
	"Greece",
	"Hungary",
	"Iceland",
	"Ireland",
	"Italy",
	"Latvia",
	"Liechtenstein",
	"Lithuania",
	"Luxembourg",
	"Malta",
	"Netherlands",
	"Norway",
	"Poland",
	"Portugal",
	"Romania",
	"Slovakia",
	"Slovenia",
	"Spain",
	"Sweden",
	"Switzerland",
	"United Kingdom",
];

/**
 * A required, trimmed text in a given format. The format is only checked once there's a value,
 * so an empty field gets just the "required" message.
 */
const formatted = (required: string, pattern: RegExp, message: string) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(required),
		v.check((value) => value === "" || pattern.test(value), message),
	);

/** The fields of the customer form, shared by creating and editing a customer. */
export const customerFields = {
	name: text("Enter the company name"),
	segment: v.picklist(customerSegments, "Choose a segment"),
	contactName: text("Enter a contact person"),
	email: formatted("Enter an email address", v.EMAIL_REGEX, "Enter a valid email address"),
	phone: formatted("Enter a phone number", /^\+?[\d\s().-]{6,20}$/, "Enter a valid phone number"),
	city: text("Enter a city"),
	country: text("Choose a country"),
};
