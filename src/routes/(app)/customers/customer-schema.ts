import * as v from "valibot";

import { customerSegments } from "#lib/models.js";
import { email, phone, text } from "#lib/schema.js";

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

/** The fields of the customer form, shared by creating and editing a customer. */
export const customerFields = {
	name: text("Enter the company name"),
	segment: v.picklist(customerSegments, "Choose a segment"),
	contactName: text("Enter a contact person"),
	email: email(),
	phone: phone(),
	city: text("Enter a city"),
	country: text("Choose a country"),
};
