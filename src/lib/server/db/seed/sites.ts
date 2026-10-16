import type { Faker } from "@faker-js/faker";

import type { ContactChannel, SitePriority, Weekday } from "#lib/models.ts";

import { mobile, towns } from "./places.ts";

/** Street names common in the demo's countries, for the sites' addresses. */
const streets: Record<string, string[]> = {
	Netherlands: [
		"Industrieweg",
		"Havenstraat",
		"Kanaalweg",
		"Edisonstraat",
		"Nijverheidsweg",
		"Transportweg",
		"Marconistraat",
		"Energieweg",
		"Celsiusstraat",
		"Ambachtsweg",
		"Stationsweg",
		"Handelsweg",
		"Zuiderzeestraat",
		"Galvanistraat",
		"Laan van Westenenk",
	],
	Belgium: [
		"Industriepark",
		"Nijverheidsstraat",
		"Kanaalstraat",
		"Ambachtenlaan",
		"Steenweg op Antwerpen",
		"Haven",
		"Stationsstraat",
	],
	Germany: [
		"Industriestraße",
		"Hafenstraße",
		"Gewerbering",
		"Robert-Bosch-Straße",
		"Siemensstraße",
		"Am Kanal",
	],
};

/** What a site besides the first is called, if not after its town. */
const siteNames = ["Distributiecentrum", "Magazijn", "Productielocatie", "Servicepunt"];

/** Access notes the office writes down for the engineers. */
const accessNotes = [
	"Werk buiten productietijden; melden bij receptie expeditie noord.",
	"Serverruimte alleen betreden met begeleiding.",
	"Docks 05-08 niet blokkeren tussen 10:00 en 13:00.",
	"Parkeren op het bezoekersterrein, sleutel ophalen bij de portier.",
	"Veiligheidsschoenen en hesje verplicht op het hele terrein.",
	"Bel 15 minuten voor aankomst, dan staat het hek open.",
	"Toegangspas aanvragen bij facilitair; legitimatie meenemen.",
	"Technische ruimte op het dak, via trappenhuis B.",
];

/** Time slots that suit a site, e.g. a working day's. */
const slots = [
	["07:00", "15:00"],
	["06:00", "14:00"],
	["09:00", "17:00"],
	["08:00", "12:00"],
	["13:00", "17:00"],
] as const;

/** Where a unit is at its site. */
const locations = [
	"Technische ruimte",
	"Kelder",
	"Dak",
	"Ketelhuis",
	"Expeditie dock 07",
	"Hal 2",
	"Begane grond, oostzijde",
	"Productiehal",
	"Magazijn achter",
	"Stookruimte",
];

/** A postal code as the country writes them, e.g. `3825 AL`, `9000` or `52062`. */
function postalCode(faker: Faker, country: string) {
	if (country === "Netherlands") {
		const letters = faker.string.alpha({
			length: 2,
			casing: "upper",
			exclude: ["F", "I", "O", "Q", "U", "Y"],
		});
		return `${faker.number.int({ min: 1000, max: 9999 })} ${letters}`;
	}
	if (country === "Belgium") return String(faker.number.int({ min: 1000, max: 9999 }));
	return String(faker.number.int({ min: 10000, max: 99999 }));
}

/**
 * One to three sites for each customer (most have one), ids from 1: the first in their own town
 * and named after it, the others in another town of their country. Some have a contact of their
 * own, preferences for visits and access notes. Each unit is put at one of its customer's sites,
 * some with their place there (`units`, by the unit's id).
 *
 * It has a faker of its own, so the rest of the demo data stays as it was before there were sites.
 */
export function generateSites(
	faker: Faker,
	customers: { id: number; city: string; country: string; createdAt: Date }[],
	equipments: { id: number; customerId: number }[],
) {
	const sites = customers.flatMap((owner) => {
		const count = faker.helpers.weightedArrayElement([
			{ value: 1, weight: 6 },
			{ value: 2, weight: 3 },
			{ value: 3, weight: 1 },
		]);
		const others = faker.helpers.shuffle(
			Object.keys(towns[owner.country]).filter((town) => town !== owner.city),
		);
		return Array.from({ length: count }, (_, i) => {
			const city = i === 0 ? owner.city : others[i - 1];
			const named = i === 0 || faker.datatype.boolean(0.5);
			const hasSlot = faker.datatype.boolean(0.5);
			const [slotStart, slotEnd] = hasSlot ? faker.helpers.arrayElement(slots) : [null, null];
			const hasContact = faker.datatype.boolean(i === 0 ? 0.2 : 0.6);
			return {
				customerId: owner.id,
				name: named ? city : `${faker.helpers.arrayElement(siteNames)} ${city}`,
				address: `${faker.helpers.arrayElement(streets[owner.country])} ${faker.number.int({ min: 1, max: 180 })}`,
				postalCode: postalCode(faker, owner.country),
				city,
				country: owner.country,
				contactName: hasContact ? faker.person.fullName() : null,
				contactPhone: hasContact ? mobile(faker, owner.country) : null,
				contactEmail: null,
				contactChannel: faker.datatype.boolean(0.6)
					? faker.helpers.weightedArrayElement<ContactChannel>([
							{ value: "email", weight: 4 },
							{ value: "phone", weight: 3 },
							{ value: "whatsapp", weight: 2 },
							{ value: "portal", weight: 1 },
						])
					: null,
				preferredDay: faker.datatype.boolean(0.35)
					? faker.helpers.arrayElement<Weekday>([
							"monday",
							"tuesday",
							"wednesday",
							"thursday",
							"friday",
						])
					: null,
				slotStart,
				slotEnd,
				priority: (faker.datatype.boolean(0.15) ? "high" : "normal") as SitePriority,
				accessNotes: faker.datatype.boolean(0.4) ? faker.helpers.arrayElement(accessNotes) : null,
				createdAt: owner.createdAt,
			};
		});
	});
	const withIds = sites.map((site, i) => ({ id: i + 1, ...site }));

	const sitesOf = Map.groupBy(withIds, (site) => site.customerId);
	const units = new Map(
		equipments.map((unit) => [
			unit.id,
			{
				siteId: faker.helpers.arrayElement(sitesOf.get(unit.customerId)!).id,
				location: faker.datatype.boolean(0.4) ? faker.helpers.arrayElement(locations) : null,
			},
		]),
	);
	return { sites: withIds, units };
}
