/**
 * Customers' countries. A customer's country is stored as its English name (e.g. `Netherlands`),
 * and shown in the current language with `countryName()` (`Nederland` in Dutch).
 */
import { intlLocale } from "#lib/format.ts";
import type { Locale } from "#lib/paraglide/runtime.js";

/** The countries offered in the customer form (besides those already in use), by ISO 3166 code. */
const countryCodes: Record<string, string> = {
	Austria: "AT",
	Belgium: "BE",
	Bulgaria: "BG",
	Croatia: "HR",
	Cyprus: "CY",
	Czechia: "CZ",
	Denmark: "DK",
	Estonia: "EE",
	Finland: "FI",
	France: "FR",
	Germany: "DE",
	Greece: "GR",
	Hungary: "HU",
	Iceland: "IS",
	Ireland: "IE",
	Italy: "IT",
	Latvia: "LV",
	Liechtenstein: "LI",
	Lithuania: "LT",
	Luxembourg: "LU",
	Malta: "MT",
	Netherlands: "NL",
	Norway: "NO",
	Poland: "PL",
	Portugal: "PT",
	Romania: "RO",
	Slovakia: "SK",
	Slovenia: "SI",
	Spain: "ES",
	Sweden: "SE",
	Switzerland: "CH",
	"United Kingdom": "GB",
};

/** The European countries the customer form offers, as stored (their English names). */
export const europeanCountries = Object.keys(countryCodes);

const regionNames = new Map<string, Intl.DisplayNames>();

/**
 * A stored country's name in the current language (or `locale`), e.g. `Netherlands` → `Nederland`
 * in Dutch. A country outside the list (e.g. one an older version stored) is shown as stored.
 */
export function countryName(country: string, locale?: Locale) {
	if (!Object.hasOwn(countryCodes, country)) return country;
	const intl = intlLocale(locale);
	let names = regionNames.get(intl);
	if (!names) regionNames.set(intl, (names = new Intl.DisplayNames(intl, { type: "region" })));
	return names.of(countryCodes[country]) ?? country;
}

/** Options for a select or filter of these countries, by their names in the current language. */
export const countryOptions = (countries: Iterable<string>) =>
	[...new Set(countries)]
		.map((value) => ({ value, label: countryName(value) }))
		.sort((a, b) => a.label.localeCompare(b.label, intlLocale()));
