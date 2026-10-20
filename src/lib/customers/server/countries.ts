import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, customerSite } from "#lib/server/db/schema.ts";
import { Refused } from "#lib/server/refused.ts";

import { europeanCountries } from "../countries.ts";

/**
 * The countries the customer and site forms offer: those the tenant's customers and sites are in,
 * plus the rest of Europe, alphabetically.
 */
export async function knownCountries() {
	const [customers, sites] = await Promise.all([
		db.selectDistinct({ country: customer.country }).from(customer).where(inTenant(customer)),
		db
			.selectDistinct({ country: customerSite.country })
			.from(customerSite)
			.where(inTenant(customerSite)),
	]);
	const used = [...customers, ...sites].map((row) => row.country);
	return [...new Set([...europeanCountries, ...used])].sort((a, b) => a.localeCompare(b));
}

/** Refuses a country that isn't one of the known ones, on the form's `country` field. */
export async function refuseUnknownCountry(country: string) {
	if ((await knownCountries()).includes(country)) return;
	throw new Refused({ path: ["country"], message: m.customers_country_unknown() });
}
