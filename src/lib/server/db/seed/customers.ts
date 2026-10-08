import { de, en, Faker, type LocaleDefinition, nl, nl_BE } from "@faker-js/faker";

import { customerSegments } from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";

import { addDays, now } from "./clock.ts";
import { germanTrades, institutions, landline, mobile, slug, towns, trades } from "./places.ts";

type Segment = (typeof customerSegments)[number];

const legalForm: Record<string, { large: string; small: string }> = {
	Netherlands: { large: "B.V.", small: "V.O.F." },
	Belgium: { large: "NV", small: "BV" },
	Germany: { large: "GmbH", small: "GmbH" },
};
const topLevelDomain: Record<string, string> = {
	Netherlands: "nl",
	Belgium: "be",
	Germany: "de",
};

/** Names of Belgian and German people, from fakers of their own (seeded from `faker`). */
function fakersAbroad(faker: Faker): Record<string, Faker> {
	const fakerIn = (locale: LocaleDefinition[]) => {
		const local = new Faker({ locale });
		local.seed(faker.number.int());
		return local;
	};
	return {
		Belgium: fakerIn([nl_BE, nl, en]),
		Germany: fakerIn([de, en]),
	};
}

/**
 * A company name fitting the segment, e.g. `Bakkerij Jansen` or `Hotel Zwolle`. `people` makes up
 * the family names: the faker of the country.
 */
function companyName(faker: Faker, people: Faker, segment: Segment, country: string, town: string) {
	const family = people.person.lastName();
	// Family names with a prefix are capitalized in a company name, e.g. `Van der Meer B.V.`.
	const surname = family.charAt(0).toUpperCase() + family.slice(1);
	const { large, small } = legalForm[country];
	const trade = faker.helpers.arrayElement(
		(country === "Germany" ? germanTrades : trades)[segment],
	);
	if (segment === "small_business") {
		return faker.helpers.arrayElement([
			`${trade} ${surname}`,
			`${surname} ${small}`,
			`${surname} & ${people.person.lastName()} ${small}`,
		]);
	}
	if (country === "Netherlands" && faker.datatype.boolean(0.25))
		return `${faker.helpers.arrayElement(institutions[segment])} ${town}`;
	return `${surname} ${trade} ${segment === "enterprise" && country === "Netherlands" ? "N.V." : large}`;
}

/** One tenant's customers, with ids from 1. */
export function generateCustomers(faker: Faker, count: number) {
	const abroad = fakersAbroad(faker);
	return Array.from({ length: count }, (_, i) => {
		const segment = faker.helpers.weightedArrayElement([
			{ value: customerSegments[0], weight: 2 },
			{ value: customerSegments[1], weight: 5 },
			{ value: customerSegments[2], weight: 8 },
		]);
		const country = faker.helpers.weightedArrayElement([
			{ value: "Netherlands", weight: 16 },
			{ value: "Belgium", weight: 3 },
			{ value: "Germany", weight: 1 },
		]);
		const people = abroad[country] ?? faker;
		const city = faker.helpers.arrayElement(Object.keys(towns[country]));
		const name = companyName(faker, people, segment, country, city);
		const firstName = people.person.firstName();
		const lastName = people.person.lastName();
		const domain = `${slug(name.replace(/ (B\.V\.|N\.V\.|V\.O\.F\.|NV|BV|GmbH)$/, ""), "-")}.${topLevelDomain[country]}`;
		const mailbox = faker.helpers.arrayElement([
			`${slug(firstName)}.${slug(lastName)}`,
			`${slug(firstName).charAt(0)}.${slug(lastName)}`,
			"info",
			"service",
		]);
		return {
			id: i + 1,
			code: formatCode("customer", i + 1),
			name,
			contactName: `${firstName} ${lastName}`,
			email: `${mailbox}@${domain}`,
			phone: faker.datatype.boolean(0.6) ? landline(faker, country, city) : mobile(faker, country),
			city,
			country,
			segment,
			createdAt: faker.date.past({ years: 5, refDate: addDays(now, -400) }),
		};
	});
}
