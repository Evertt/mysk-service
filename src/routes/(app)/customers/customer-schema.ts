import * as v from "valibot";

import { customerSegments } from "#lib/models.ts";
import { m } from "#lib/paraglide/messages.js";
import { email, phone, text } from "#lib/schema.ts";

/** The fields of the customer form, shared by creating and editing a customer. */
export const customerFields = {
	name: text(m.customers_name_required),
	segment: v.picklist(customerSegments, m.customers_segment_required),
	contactName: text(m.customers_contact_required),
	email: email(),
	phone: phone(),
	city: text(m.customers_city_required),
	country: text(m.customers_country_required),
};
