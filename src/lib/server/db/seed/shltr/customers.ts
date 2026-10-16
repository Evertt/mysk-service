/**
 * SHLTR's customers and their sites: the six the mockup names (`docs/plans/shltr-domain.md`, §1,
 * §2.3 and §2.10), with the contact details and preferences its Connect page shows, and a few dozen
 * made-up Dutch companies with logistics or production buildings around Gelderland and Overijssel.
 * The made-up ones get `.example` addresses: only the mockup's own contacts have real-looking ones.
 */
import type { Faker } from "@faker-js/faker";

import type { ContactChannel, CustomerSegment, SitePriority, Weekday } from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";

import { addDays, now } from "../clock.ts";
import { slug } from "../places.ts";

/** What a customer's buildings hold, which decides the units SHLTR services there. */
export type CustomerKind = "logistics" | "production" | "building";

/** The towns SHLTR works in, with their phone area code. */
const towns: Record<string, string> = {
	Ede: "0318",
	Barneveld: "0342",
	Apeldoorn: "055",
	Zwolle: "038",
	Arnhem: "026",
	Amersfoort: "033",
	Deventer: "0570",
	Veenendaal: "0318",
	Harderwijk: "0341",
	Nijmegen: "024",
	Wageningen: "0317",
	Doetinchem: "0314",
	Zutphen: "0575",
	Utrecht: "030",
	Hengelo: "074",
	Kampen: "038",
	Tiel: "0344",
	Nijkerk: "033",
	Lelystad: "0320",
	Culemborg: "0345",
};
const townNames = Object.keys(towns);

/** A landline in a town, written as the mockup does, e.g. `0318-445210`. */
const landline = (faker: Faker, town: string) => {
	const area = towns[town];
	return `${area}-${faker.string.numeric({ length: 10 - area.length, allowLeadingZeros: false })}`;
};

/** A site of one of the mockup's customers, as its Connect page has it. */
interface FixedSite {
	name: string;
	address: string;
	postalCode: string;
	city: string;
	contactName?: string;
	contactPhone?: string;
	contactEmail?: string;
	contactChannel?: ContactChannel;
	preferredDay?: Weekday;
	slot?: [string, string];
	priority?: SitePriority;
	accessNotes?: string;
}

/** One of the customers the mockup names. */
interface FixedCustomer {
	name: string;
	segment: CustomerSegment;
	kind: CustomerKind;
	contactName: string;
	email: string;
	phone: string;
	/** How long ago they became a customer. */
	yearsAgo: number;
	/** How much of SHLTR's work is theirs, against a made-up customer's of about 1 per 4 units. */
	share: number;
	sites: FixedSite[];
}

const fixedCustomers: FixedCustomer[] = [
	{
		name: "Riedel B.V.",
		segment: "enterprise",
		kind: "production",
		contactName: "M. Verhoeven",
		email: "techniek@riedel.nl",
		phone: "0318-445210",
		yearsAgo: 6,
		share: 14,
		sites: [
			{
				name: "Ede",
				address: "Frankeneng 12",
				postalCode: "6717 AG",
				city: "Ede",
				contactName: "M. Verhoeven",
				contactPhone: "0318-445210",
				contactEmail: "techniek@riedel.nl",
				contactChannel: "email",
				preferredDay: "tuesday",
				slot: ["07:00", "15:00"],
				priority: "high",
				accessNotes: "Werk buiten productietijden; melden bij receptie expeditie noord.",
			},
		],
	},
	{
		name: "Bouwgroep De Vries",
		segment: "mid_market",
		kind: "building",
		contactName: "J. de Vries",
		email: "beheer@bouwgroepdevries.nl",
		phone: "055-3321094",
		yearsAgo: 4,
		share: 4,
		sites: [
			{
				name: "Apeldoorn",
				address: "Ecofactorij 21",
				postalCode: "7325 WC",
				city: "Apeldoorn",
				contactName: "J. de Vries",
				contactPhone: "055-3321094",
				contactEmail: "beheer@bouwgroepdevries.nl",
				contactChannel: "phone",
				preferredDay: "thursday",
				slot: ["08:00", "16:00"],
				priority: "normal",
				accessNotes: "Keuringsrapporten altijd digitaal aanleveren.",
			},
		],
	},
	{
		name: "Pakhuis 7",
		segment: "mid_market",
		kind: "building",
		contactName: "A. Bakker",
		email: "facilitair@pakhuis7.nl",
		phone: "038-2211780",
		yearsAgo: 3,
		share: 4,
		sites: [
			{
				name: "Zwolle",
				address: "Hanzeweg 7",
				postalCode: "8013 NV",
				city: "Zwolle",
				contactName: "A. Bakker",
				contactPhone: "038-2211780",
				contactEmail: "facilitair@pakhuis7.nl",
				contactChannel: "portal",
				preferredDay: "wednesday",
				slot: ["09:00", "17:00"],
				priority: "normal",
				accessNotes: "Serverruimte alleen betreden met begeleiding.",
			},
		],
	},
	{
		name: "Weggemans Logistiek",
		segment: "enterprise",
		kind: "logistics",
		contactName: "R. Weggemans",
		email: "planning@weggemans.nl",
		phone: "0342-556611",
		yearsAgo: 5,
		share: 8,
		sites: [
			{
				name: "Barneveld",
				address: "Harselaarseweg 41",
				postalCode: "3771 MA",
				city: "Barneveld",
				contactName: "R. Weggemans",
				contactPhone: "0342-556611",
				contactEmail: "planning@weggemans.nl",
				contactChannel: "whatsapp",
				preferredDay: "monday",
				slot: ["06:00", "14:00"],
				priority: "high",
				accessNotes: "Docks 05-08 niet blokkeren tussen 10:00 en 13:00.",
			},
		],
	},
	{
		name: "Vermeer Logistiek",
		segment: "mid_market",
		kind: "logistics",
		contactName: "S. Mulder",
		email: "s.mulder@vermeerlogistiek.example",
		phone: "055-5781230",
		yearsAgo: 4,
		share: 6,
		sites: [
			{
				name: "Apeldoorn",
				address: "Stadhoudersmolen 18",
				postalCode: "7317 AW",
				city: "Apeldoorn",
				contactChannel: "phone",
				slot: ["07:00", "16:00"],
				accessNotes: "Melden bij de portier; veiligheidsschoenen en hesje verplicht.",
			},
			{
				name: "Distributiecentrum Deventer",
				address: "Handelskade 4",
				postalCode: "7417 DE",
				city: "Deventer",
				contactName: "K. Smit",
				contactPhone: "06 41827730",
				contactChannel: "phone",
				preferredDay: "friday",
			},
		],
	},
	{
		name: "Van Dijk Koeltechniek",
		segment: "mid_market",
		kind: "production",
		contactName: "P. van Dijk",
		email: "service@vandijkkoeltechniek.example",
		phone: "038-4537711",
		yearsAgo: 3,
		share: 4,
		sites: [
			{
				name: "Zwolle",
				address: "Ceintuurbaan 94",
				postalCode: "8024 AA",
				city: "Zwolle",
				contactChannel: "email",
				preferredDay: "wednesday",
				slot: ["08:00", "16:30"],
				accessNotes: "Vriescel: maximaal 20 minuten werken, daarna opwarmen.",
			},
		],
	},
];

/** Name parts for the made-up customers, by what their buildings hold. */
const trades: Record<CustomerKind, string[]> = {
	logistics: ["Logistiek", "Distributie", "Transport", "Opslag", "Expeditie", "Groothandel"],
	production: [
		"Foods",
		"Zuivel",
		"Metaal",
		"Verpakkingen",
		"Kunststoffen",
		"Bakkerijen",
		"Industrie",
	],
	building: ["Vastgoed", "Groep", "Bouw", "Bedrijfshuisvesting"],
};
/** Made-up customers named after their town, by what their buildings hold. */
const institutions: Record<CustomerKind, string[]> = {
	logistics: ["Distributiecentrum", "Koelhuis", "Overslag"],
	production: ["Bakkerij", "Slachterij", "Veevoederfabriek"],
	building: ["Zorgcentrum", "Sportcentrum", "Bedrijfsverzamelgebouw", "Gemeentewerf"],
};

/** Street names on the business parks of SHLTR's towns. */
const streets = [
	"Industrieweg",
	"Transportweg",
	"Nijverheidsweg",
	"Edisonstraat",
	"Celsiusstraat",
	"Energieweg",
	"Handelsweg",
	"Ambachtsweg",
	"Marconistraat",
	"Galvanistraat",
	"Kanaalweg",
	"Havenweg",
	"Logistiekweg",
	"Expeditieweg",
];

/** What a second or third site is called, if not after its town. */
const siteNames = ["Distributiecentrum", "Magazijn", "Productielocatie", "Expeditie"];

/** Access notes the office writes down for the engineers (the mockup's three are its customers'). */
const accessNotes = [
	"Melden bij de portier; veiligheidsschoenen en hesje verplicht.",
	"Laadperron vrijhouden tijdens de venstertijden, 07:00–09:00.",
	"Sleutel van de technische ruimte ophalen bij de receptie.",
	"Werk aan branddeuren vooraf melden bij de BHV-coördinator.",
	"Bel 15 minuten voor aankomst, dan staat het hek open.",
	"Geen werk aan de docks tussen 14:00 en 16:00, piek op de expeditie.",
	"Toegangspas aanvragen bij facilitair; legitimatie meenemen.",
	"Hoogwerker op locatie; sleutel bij de magazijnchef.",
];

const slots = [
	["07:00", "15:00"],
	["06:00", "14:00"],
	["07:30", "16:00"],
	["08:00", "17:00"],
	["09:00", "17:00"],
] as const;

/** A Dutch postal code, e.g. `3825 AL`. */
const postalCode = (faker: Faker) =>
	`${faker.number.int({ min: 1000, max: 9999 })} ${faker.string.alpha({
		length: 2,
		casing: "upper",
		exclude: ["F", "I", "O", "Q", "U", "Y"],
	})}`;

/** A customer the way the seed has them (like `generateCustomers`), with what its buildings hold. */
export interface ShltrCustomer {
	id: number;
	code: string;
	name: string;
	contactName: string;
	email: string;
	phone: string;
	city: string;
	country: "Netherlands";
	segment: CustomerSegment;
	createdAt: Date;
	kind: CustomerKind;
	/** How much of the work is theirs, if fixed: else it follows from their units. */
	share?: number;
}

/** A site the way the seed has them (like `generateSites`). */
const makeSite = (id: number, customerId: number, createdAt: Date, fields: FixedSite) => ({
	id,
	customerId,
	name: fields.name,
	address: fields.address,
	postalCode: fields.postalCode,
	city: fields.city,
	country: "Netherlands",
	contactName: fields.contactName ?? null,
	contactPhone: fields.contactPhone ?? null,
	contactEmail: fields.contactEmail ?? null,
	contactChannel: fields.contactChannel ?? null,
	preferredDay: fields.preferredDay ?? null,
	slotStart: fields.slot?.[0] ?? null,
	slotEnd: fields.slot?.[1] ?? null,
	priority: fields.priority ?? ("normal" as SitePriority),
	accessNotes: fields.accessNotes ?? null,
	createdAt,
});
export type ShltrSite = ReturnType<typeof makeSite>;

/**
 * SHLTR's customers (ids from 1, the mockup's first) and their sites (ids from 1): the made-up ones
 * mostly logistics and production companies, with one to three sites each.
 */
export function generateShltrCustomers(faker: Faker, count: number) {
	const customers: ShltrCustomer[] = [];
	const sites: ShltrSite[] = [];
	const site = (customerId: number, createdAt: Date, fields: FixedSite) =>
		makeSite(sites.length + 1, customerId, createdAt, fields);

	for (const fixed of fixedCustomers) {
		const id = customers.length + 1;
		const createdAt = addDays(now, -Math.round(fixed.yearsAgo * 365));
		customers.push({
			id,
			code: formatCode("customer", id),
			name: fixed.name,
			contactName: fixed.contactName,
			email: fixed.email,
			phone: fixed.phone,
			city: fixed.sites[0].city,
			country: "Netherlands",
			segment: fixed.segment,
			createdAt,
			kind: fixed.kind,
			share: fixed.share,
		});
		for (const fields of fixed.sites) sites.push(site(id, createdAt, fields));
	}

	const taken = new Set(customers.map((c) => c.name));
	while (customers.length < fixedCustomers.length + count) {
		const kind = faker.helpers.weightedArrayElement<CustomerKind>([
			{ value: "logistics", weight: 5 },
			{ value: "production", weight: 4 },
			{ value: "building", weight: 2 },
		]);
		const segment = faker.helpers.weightedArrayElement<CustomerSegment>([
			{ value: "enterprise", weight: 2 },
			{ value: "mid_market", weight: 6 },
			{ value: "small_business", weight: 2 },
		]);
		const city = faker.helpers.arrayElement(townNames);
		const family = faker.person.lastName();
		const surname = family.charAt(0).toUpperCase() + family.slice(1);
		const name = faker.datatype.boolean(0.2)
			? `${faker.helpers.arrayElement(institutions[kind])} ${city}`
			: `${surname} ${faker.helpers.arrayElement(trades[kind])}${segment === "small_business" ? "" : " B.V."}`;
		if (taken.has(name)) continue;
		taken.add(name);

		const id = customers.length + 1;
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		const domain = `${slug(name.replace(/ B\.V\.$/, ""), "")}.example`;
		const createdAt = faker.date.between({ from: addDays(now, -6 * 365), to: addDays(now, -400) });
		customers.push({
			id,
			code: formatCode("customer", id),
			name,
			contactName: `${firstName} ${lastName}`,
			email: `${faker.helpers.arrayElement(["info", "facilitair", "technischedienst", slug(firstName)])}@${domain}`,
			phone: landline(faker, city),
			city,
			country: "Netherlands",
			segment,
			createdAt,
			kind,
		});

		const siteCount = faker.helpers.weightedArrayElement([
			{ value: 1, weight: 6 },
			{ value: 2, weight: 3 },
			{ value: 3, weight: 1 },
		]);
		const others = faker.helpers.shuffle(townNames.filter((town) => town !== city));
		for (let i = 0; i < siteCount; i++) {
			const town = i === 0 ? city : others[i - 1];
			const hasContact = faker.datatype.boolean(i === 0 ? 0.3 : 0.6);
			sites.push(
				site(id, createdAt, {
					name:
						i === 0 || faker.datatype.boolean(0.4)
							? town
							: `${faker.helpers.arrayElement(siteNames)} ${town}`,
					address: `${faker.helpers.arrayElement(streets)} ${faker.number.int({ min: 1, max: 140 })}`,
					postalCode: postalCode(faker),
					city: town,
					contactName: hasContact ? faker.person.fullName() : undefined,
					contactPhone: hasContact ? `06 ${faker.string.numeric(8)}` : undefined,
					contactChannel: faker.datatype.boolean(0.7)
						? faker.helpers.weightedArrayElement<ContactChannel>([
								{ value: "email", weight: 4 },
								{ value: "phone", weight: 3 },
								{ value: "whatsapp", weight: 2 },
								{ value: "portal", weight: 1 },
							])
						: undefined,
					preferredDay: faker.datatype.boolean(0.4)
						? faker.helpers.arrayElement<Weekday>([
								"monday",
								"tuesday",
								"wednesday",
								"thursday",
								"friday",
							])
						: undefined,
					slot: faker.datatype.boolean(0.5) ? [...faker.helpers.arrayElement(slots)] : undefined,
					priority: faker.datatype.boolean(0.15) ? "high" : "normal",
					accessNotes: faker.datatype.boolean(0.45)
						? faker.helpers.arrayElement(accessNotes)
						: undefined,
				}),
			);
		}
	}
	return { customers, sites };
}
