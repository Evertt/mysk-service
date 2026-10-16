import * as v from "valibot";

import { contactChannels, sitePriorities, weekdays } from "#lib/models.ts";
import { id, optionalTime, text } from "#lib/schema.ts";

/** An optional, trimmed text; `null` if it's left empty. */
const optionalText = () =>
	v.pipe(
		v.string(),
		v.trim(),
		v.transform((value) => value || null),
	);

/** An optional text in a format (checked once there's a value); `null` if it's left empty. */
const optionalFormatted = (pattern: RegExp, message: () => string) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.check((value) => value === "" || pattern.test(value), message),
		v.transform((value) => value || null),
	);

/** One of `values`, or `null` for the empty option. */
const optionalChoice = <T extends string>(values: readonly [T, ...T[]]) =>
	v.union(
		[
			v.pipe(
				v.literal(""),
				v.transform(() => null),
			),
			v.picklist(values, m.validation_choose_one),
		],
		m.validation_choose_one,
	);

/**
 * The street address of a site, which the customer form asks for too: a new customer's first site
 * is made from it (with the customer's city and country).
 */
export const siteAddressFields = {
	address: text(m.customers_site_address_required),
	postalCode: text(m.customers_site_postal_code_required),
};

/** The fields of the site form, shared by adding and editing a site. */
const siteFields = {
	name: text(m.customers_site_name_required),
	...siteAddressFields,
	city: text(m.customers_city_required),
	country: text(m.customers_country_required),
	contactName: optionalText(),
	contactPhone: optionalFormatted(/^\+?[\d\s().-]{6,20}$/, m.validation_phone_invalid),
	contactEmail: v.pipe(
		optionalFormatted(v.EMAIL_REGEX, m.validation_email_invalid),
		v.transform((value) => value?.toLowerCase() ?? null),
	),
	contactChannel: optionalChoice(contactChannels),
	preferredDay: optionalChoice(weekdays),
	slotStart: optionalTime(),
	slotEnd: optionalTime(),
	priority: v.picklist(sitePriorities, m.validation_choose_one),
	accessNotes: optionalText(),
};

interface Slot {
	slotStart: string | null;
	slotEnd: string | null;
}

/** What's wrong with a time slot, if anything: it's both a start and a later end, or neither. */
export function slotProblem({ slotStart, slotEnd }: Slot) {
	if ((slotStart === null) !== (slotEnd === null)) return m.customers_site_slot_incomplete();
	// `HH:MM` compares as text.
	if (slotStart !== null && slotEnd !== null && slotEnd <= slotStart) {
		return m.customers_site_slot_order();
	}
	return null;
}

/** The site form for adding a site to the customer `customerId`. */
export const newSiteSchema = v.pipe(
	v.object({ customerId: id(), ...siteFields }),
	v.forward(
		v.partialCheck(
			[["slotStart"], ["slotEnd"]],
			(input) => !slotProblem(input),
			(issue) => slotProblem(issue.input as Slot) ?? "",
		),
		["slotEnd"],
	),
);

/** The site form for editing the site `id`. */
export const siteSchema = v.pipe(
	v.object({ id: id(), ...siteFields }),
	v.forward(
		v.partialCheck(
			[["slotStart"], ["slotEnd"]],
			(input) => !slotProblem(input),
			(issue) => slotProblem(issue.input as Slot) ?? "",
		),
		["slotEnd"],
	),
);

export type SiteInput = v.InferOutput<v.ObjectSchema<typeof siteFields, undefined>>;
