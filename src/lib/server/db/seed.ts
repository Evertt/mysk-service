/**
 * Fills the database with fake, internally consistent data: orders only reference equipment
 * owned by the same customer, get an engineer whose specialty fits the equipment, have a status
 * that matches their dates, and come after the customer joined and the unit was installed. Equipment status reflects the open repair orders on it.
 *
 * The demo is a Dutch field-service company's, so its texts are in Dutch: names, descriptions,
 * notes and the invoice lines' texts (stored text is in the language of whoever wrote it). Stored
 * enum values (statuses, units, regions, countries' English names, …) are translated when shown.
 *
 * Also (re)creates the demo users you can sign in with, see "Demo login" in README.md.
 *
 * Run with `pnpm db:seed` (after `pnpm db:push`). Replaces all existing business data.
 */
import { de, en, Faker, type LocaleDefinition, nl, nl_BE } from "@faker-js/faker";
import { createClient } from "@libsql/client";
import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import {
	type ContractMonth,
	contractMonths,
	monthlyFee,
} from "#lib/components/contracts/billing.ts";
import {
	dueDate,
	itemLine,
	type LineDraft,
	orderLines,
} from "#lib/components/invoicing/invoice.ts";
import {
	type ContractLevel,
	customerSegments,
	defaultResponseHours,
	engineerSpecialties,
	equipmentCategories,
	type EquipmentCategory,
	type EquipmentStatus,
	holdsStock,
	type MaterialUnit,
	type OrderPriority,
	type OrderStatus,
	type OrderType,
	specialtyForCategory,
} from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";

import { DEMO_PASSWORD, demoOrganizations, demoUsers } from "./demo.ts";
import type { Transaction } from "./index.ts";
import * as schema from "./schema.ts";

const { account, customer, engineer, equipment, material, order, orderLine, session, user } =
	schema;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const db = drizzle(createClient({ url: DATABASE_URL }), { schema });

/** The generator's randomness, in Dutch; seeded per tenant, so the data is the same every time. */
const faker = new Faker({ locale: [nl, en] });

const now = new Date();
const DAY = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

/** Inserts in chunks to stay below SQLite's bound-parameter limit. */
async function insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
	for (let i = 0; i < rows.length; i += 100) await insert(rows.slice(i, i + 100));
}

interface TenantSize {
	customers: number;
	engineers: number;
	orders: number;
	/** Whether the tenant has the service contracts module, and so contracts. */
	contracts: boolean;
}

/**
 * Real towns where the demo's customers are, by country (stored by its English name), with their
 * phone area code.
 */
const towns: Record<string, Record<string, string>> = {
	Netherlands: {
		Amsterdam: "020",
		Rotterdam: "010",
		"Den Haag": "070",
		Utrecht: "030",
		Eindhoven: "040",
		Groningen: "050",
		Tilburg: "013",
		Almere: "036",
		Breda: "076",
		Nijmegen: "024",
		Apeldoorn: "055",
		Arnhem: "026",
		Haarlem: "023",
		Enschede: "053",
		Amersfoort: "033",
		Zaandam: "075",
		"Den Bosch": "073",
		Zwolle: "038",
		Leeuwarden: "058",
		Leiden: "071",
		Maastricht: "043",
		Dordrecht: "078",
		Zoetermeer: "079",
		Deventer: "0570",
		Delft: "015",
		Venlo: "077",
		Alkmaar: "072",
		Hengelo: "074",
		Roosendaal: "0165",
		Helmond: "0492",
		Oss: "0412",
		Gouda: "0182",
		Hilversum: "035",
		Emmen: "0591",
		Assen: "0592",
		Veenendaal: "0318",
		Harderwijk: "0341",
		"Bergen op Zoom": "0164",
		Middelburg: "0118",
		Heerlen: "045",
		Sittard: "046",
		Weert: "0495",
		Doetinchem: "0314",
		Lelystad: "0320",
	},
	Belgium: {
		Antwerpen: "3",
		Gent: "9",
		Brugge: "50",
		Hasselt: "11",
		Leuven: "16",
		Mechelen: "15",
		Genk: "89",
		Turnhout: "14",
	},
	Germany: {
		Aachen: "241",
		Kleve: "2821",
		Düsseldorf: "211",
		Duisburg: "203",
		Münster: "251",
		Krefeld: "2151",
		Nordhorn: "5921",
	},
};

/** A landline number in a town, e.g. `030 123 4567`, `+32 9 123 45 67` or `+49 241 1234567`. */
function landline(country: string, town: string) {
	const area = towns[country][town];
	const digits = (count: number) =>
		faker.string.numeric({ length: count, allowLeadingZeros: false });
	if (country === "Netherlands")
		return area.length === 3
			? `${area} ${digits(3)} ${faker.string.numeric(4)}`
			: `${area} ${digits(3)} ${faker.string.numeric(3)}`;
	if (country === "Belgium")
		return `+32 ${area} ${digits(area.length === 1 ? 3 : 2)} ${faker.string.numeric(2)} ${faker.string.numeric(2)}`;
	return `+49 ${area} ${digits(10 - area.length)}`;
}

/** A mobile number, e.g. `06 12345678`, `+32 470 12 34 56` or `+49 151 12345678`. */
function mobile(country: string) {
	if (country === "Netherlands") return `06 ${faker.string.numeric(8)}`;
	if (country === "Belgium")
		return `+32 4${faker.helpers.arrayElement(["7", "8", "9"])}${faker.string.numeric(1)} ${faker.string.numeric(2)} ${faker.string.numeric(2)} ${faker.string.numeric(2)}`;
	return `+49 1${faker.helpers.arrayElement(["51", "52", "60", "70", "76"])} ${faker.string.numeric(8)}`;
}

/** Name parts for the customers' company names: trades by segment, in Dutch and in German. */
const trades = {
	enterprise: [
		"Groep",
		"Logistiek",
		"Foods",
		"Vastgoed",
		"Industrie",
		"Distributie",
		"Zuivel",
		"Chemie",
	],
	mid_market: [
		"Installatietechniek",
		"Metaalbewerking",
		"Kunststoffen",
		"Transport",
		"Bouw",
		"Verpakkingen",
		"Drukkerij",
		"Koeltechniek",
		"Bloemen",
		"Bakkerijen",
	],
	small_business: [
		"Bakkerij",
		"Autobedrijf",
		"Slagerij",
		"Tandartspraktijk",
		"Hoveniersbedrijf",
		"Wasserette",
		"Café",
		"Fysiotherapie",
		"Drukkerij",
		"Garage",
	],
};
const germanTrades = {
	enterprise: ["Gruppe", "Logistik", "Lebensmittel", "Chemie"],
	mid_market: ["Metallbau", "Kunststofftechnik", "Spedition", "Haustechnik"],
	small_business: ["Bäckerei", "Autohaus", "Metzgerei", "Gärtnerei"],
};
/** Dutch institutions, named after their town. */
const institutions = {
	enterprise: ["Ziekenhuis", "Woonstichting", "Hogeschool", "Zorggroep"],
	mid_market: ["Hotel", "Zorgcentrum", "Sportcentrum", "Scholengemeenschap", "Zwembad"],
};

/** A slug for a domain or email address, e.g. `van der Meer` → `vandermeer`. */
const slug = (text: string, separator = "") =>
	text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/&/g, " en ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replaceAll(" ", separator);

/** Generates one tenant's data, with ids from 1 (they're shifted when inserted). */
function generateTenant(size: TenantSize) {
	// --- Customers -------------------------------------------------------------------------------

	// Names of Belgian and German people, from fakers of their own.
	const fakerIn = (locale: LocaleDefinition[]) => {
		const local = new Faker({ locale });
		local.seed(faker.number.int());
		return local;
	};
	const abroad: Record<string, Faker> = {
		Belgium: fakerIn([nl_BE, nl, en]),
		Germany: fakerIn([de, en]),
	};
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

	/** A company name fitting the segment, e.g. `Bakkerij Jansen` or `Hotel Zwolle`. */
	function companyName(segment: (typeof customerSegments)[number], country: string, town: string) {
		const people = abroad[country] ?? faker;
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

	const customers = Array.from({ length: size.customers }, (_, i) => {
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
		const name = companyName(segment, country, city);
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
			phone: faker.datatype.boolean(0.6) ? landline(country, city) : mobile(country),
			city,
			country,
			segment,
			createdAt: faker.date.past({ years: 5, refDate: addDays(now, -400) }),
		};
	});

	// --- Engineers -------------------------------------------------------------------------------

	const regions = ["North", "East", "South", "West", "Central"];
	const engineerEmails = new Set<string>();
	const engineers = Array.from({ length: size.engineers }, (_, i) => {
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		let email = `${slug(firstName)}.${slug(lastName)}@fieldworks.example`;
		for (let n = 2; engineerEmails.has(email); n++)
			email = `${slug(firstName)}.${slug(lastName)}${n}@fieldworks.example`;
		engineerEmails.add(email);
		return {
			id: i + 1,
			name: `${firstName} ${lastName}`,
			email,
			phone: mobile("Netherlands"),
			// Every specialty is covered at least three times.
			specialty: engineerSpecialties[i % engineerSpecialties.length],
			region: faker.helpers.arrayElement(regions),
			hourlyRate: faker.number.int({ min: 55, max: 110 }) * 100,
			// The last two have left.
			active: i < size.engineers - 2,
			hiredAt: faker.date.past({ years: 12, refDate: addDays(now, -30) }),
		};
	});

	// --- Equipment -------------------------------------------------------------------------------

	// Brands common in Dutch installations.
	const manufacturers: Record<EquipmentCategory, string[]> = {
		generator: ["Bredenoord", "Kohler SDMO", "Cummins"],
		chiller: ["Daikin", "Carrier", "Trane"],
		boiler: ["Remeha", "Intergas", "Nefit Bosch", "Vaillant"],
		compressor: ["Atlas Copco", "Kaeser", "Ingersoll Rand"],
		pump: ["Grundfos", "Wilo", "KSB"],
		elevator: ["Kone", "Otis", "Schindler"],
		air_handler: ["Systemair", "Swegon", "Hoval"],
	};

	const equipments = customers
		.flatMap((owner) =>
			Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => {
				const category = faker.helpers.arrayElement(equipmentCategories);
				const installedAt = faker.date.between({ from: owner.createdAt, to: addDays(now, -60) });
				return {
					serialNumber: faker.string.alphanumeric({ length: 10, casing: "upper" }),
					model: `${faker.string.alpha({ length: 2, casing: "upper" })}-${faker.number.int({ min: 100, max: 990 })}`,
					manufacturer: faker.helpers.arrayElement(manufacturers[category]),
					category,
					status: "operational" as EquipmentStatus,
					customerId: owner.id,
					installedAt,
					warrantyUntil: addDays(installedAt, faker.helpers.arrayElement([2, 3, 5]) * 365),
				};
			}),
		)
		.map((item, i) => ({ id: i + 1, ...item }));

	// --- Materials -------------------------------------------------------------------------------

	const catalog: [name: string, unit: MaterialUnit, minPrice: number, maxPrice: number][] = [
		["Koperbuis 15 mm", "m", 6, 12],
		["Koperbuis 22 mm", "m", 9, 18],
		["Buisisolatie 22 mm", "m", 2, 5],
		["Kogelkraan DN25", "pcs", 18, 45],
		["Terugslagklep DN40", "pcs", 40, 95],
		["Manometer 0–10 bar", "pcs", 15, 35],
		["Expansievat 25 l", "pcs", 60, 140],
		["Motorblok circulatiepomp", "pcs", 180, 420],
		["Mechanische asafdichting", "pcs", 70, 160],
		["Groefkogellager 6204", "pcs", 8, 22],
		["Groefkogellager 6308", "pcs", 25, 60],
		["V-snaar SPZ 1250", "pcs", 12, 28],
		["Koppelingsrubber", "pcs", 15, 40],
		["Hydraulische olie ISO 46", "l", 4, 9],
		["Compressorolie", "l", 9, 22],
		["Vetpatroon", "pcs", 6, 14],
		["Koudemiddel R32", "kg", 25, 60],
		["Koudemiddel R410A", "kg", 30, 75],
		["Filterdroger", "pcs", 20, 55],
		["Paneelfilter G4 592×592", "pcs", 8, 18],
		["Zakkenfilter F7 592×592", "pcs", 25, 55],
		["Magneetschakelaar 3P 40 A", "pcs", 35, 90],
		["Thermisch overstroomrelais", "pcs", 30, 70],
		["Installatieautomaat C16", "pcs", 9, 25],
		["Voedingskabel 5×2,5 mm²", "m", 3, 7],
		["Stuurstroomkabel 12×0,75 mm²", "m", 2, 6],
		["Temperatuurvoeler PT1000", "pcs", 25, 65],
		["Druktransmitter", "pcs", 120, 280],
		["PLC-I/O-module", "pcs", 220, 520],
		["Frequentieregelaar 7,5 kW", "pcs", 650, 1400],
		["Aandrijfriem liftdeur", "pcs", 45, 110],
		["Geleideschoen lift", "pcs", 30, 75],
		["Brandstoffilter", "pcs", 15, 40],
		["Startaccu 12 V 100 Ah", "pcs", 140, 260],
		["Koelvloeistof concentraat", "l", 5, 12],
		["Brandersproeier", "pcs", 12, 30],
		["Ontstekingselektrode", "pcs", 18, 45],
		["Pakkingset", "pcs", 20, 60],
		["Bevestigingsset rvs", "pcs", 10, 25],
		["Tiewraps (100 st.)", "pcs", 3, 8],
	];

	const materials = catalog.map(([name, unit, min, max], i) => ({
		id: i + 1,
		sku: formatCode("material", i + 1),
		name,
		unit,
		unitPrice: faker.number.int({ min: min * 100, max: max * 100, multipleOf: 5 }),
		stock:
			unit === "pcs"
				? faker.number.int({ min: 0, max: 250 })
				: faker.number.float({ min: 0, max: 900, fractionDigits: 1 }),
	}));

	// --- Orders ----------------------------------------------------------------------------------

	const repairs: Record<EquipmentCategory, string[]> = {
		generator: [
			"Aggregaat start niet bij proefdraaien",
			"Aggregaat neemt niet over bij stroomuitval",
			"Olielekkage aan de motor",
		],
		chiller: [
			"Koelmachine valt uit op hoge druk",
			"Te weinig koelvermogen bij warm weer",
			"Vermoedelijk lek in het koudemiddelcircuit",
		],
		boiler: [
			"Storing cv-ketel, geen warm water",
			"Ketel gaat in storing, ontsteking faalt",
			"Waterdruk loopt steeds terug",
		],
		compressor: [
			"Compressor slaat af op temperatuur",
			"Luchtlek, druk loopt terug",
			"Veel condensaat in de perslucht",
		],
		pump: [
			"Pomp maakt herrie en trilt",
			"Lekkage bij de asafdichting",
			"Pomp draait maar bouwt geen druk op",
		],
		elevator: [
			"Lift staat stil tussen twee verdiepingen",
			"Liftdeur sluit niet goed",
			"Lift stopt niet gelijk met de vloer",
		],
		air_handler: [
			"Luchtbehandelingskast in storing",
			"Ventilator maakt afwijkend geluid",
			"Te weinig luchtopbrengst",
		],
	};

	const describe: Record<OrderType, (category?: EquipmentCategory) => string> = {
		installation: () =>
			`Nieuwe installatie plaatsen en in bedrijf stellen${faker.helpers.maybe(() => ", incl. regeling aansluiten") ?? ""}`,
		maintenance: () =>
			faker.helpers.arrayElement([
				"Periodiek preventief onderhoud",
				"Jaarlijkse onderhoudsbeurt en veiligheidscontrole",
				"Filters en slijtdelen vervangen",
				"Smeren en V-snaren spannen",
			]),
		repair: (category) =>
			faker.helpers.arrayElement(
				category
					? repairs[category]
					: ["Storing, installatie buiten bedrijf", "Storingscode op de regeling"],
			),
		inspection: () =>
			faker.helpers.arrayElement([
				"Wettelijke periodieke keuring",
				"Keuring voor de verzekeraar",
				"Inspectie voor het einde van de garantie",
			]),
	};

	const laborRange: Record<OrderType, [number, number]> = {
		installation: [8, 40],
		maintenance: [2, 6],
		repair: [1, 12],
		inspection: [1, 3],
	};

	const linesRange: Record<OrderType, [number, number]> = {
		installation: [3, 8],
		maintenance: [1, 4],
		repair: [1, 4],
		inspection: [0, 1],
	};

	const engineersBySpecialty = Object.groupBy(engineers, (e) => e.specialty);

	function pickEngineer(category: EquipmentCategory | undefined, active: boolean) {
		const pool = (category && engineersBySpecialty[specialtyForCategory[category]]) || engineers;
		const candidates = active ? pool.filter((e) => e.active) : pool;
		return faker.helpers.arrayElement(candidates.length ? candidates : engineers);
	}

	/** Derives a status (and matching dates) from when the order was created. */
	function lifecycle(createdAt: Date): {
		status: OrderStatus;
		scheduledFor: Date | null;
		completedAt: Date | null;
	} {
		const scheduledFor = addDays(createdAt, faker.number.int({ min: 1, max: 30 }));
		if (faker.datatype.boolean(0.05))
			return { status: "cancelled", scheduledFor, completedAt: null };
		if (scheduledFor > now) {
			return faker.datatype.boolean(0.35)
				? { status: "quote", scheduledFor: null, completedAt: null }
				: { status: "scheduled", scheduledFor, completedAt: null };
		}
		if (now.getTime() - scheduledFor.getTime() < 3 * DAY) {
			return { status: "in_progress", scheduledFor, completedAt: null };
		}
		const completedAt = addDays(scheduledFor, faker.number.float({ min: 0.1, max: 3 }));
		const invoiced =
			now.getTime() - completedAt.getTime() > 14 * DAY && faker.datatype.boolean(0.85);
		return { status: invoiced ? "invoiced" : "completed", scheduledFor, completedAt };
	}

	const orders = Array.from({ length: size.orders }, () => {
		const owner = faker.helpers.arrayElement(customers);
		const owned = equipments.filter((e) => e.customerId === owner.id);
		const type = faker.helpers.weightedArrayElement<OrderType>([
			{ value: "maintenance", weight: 5 },
			{ value: "repair", weight: 4 },
			{ value: "inspection", weight: 2 },
			{ value: "installation", weight: 1 },
		]);
		const target =
			type === "installation" && faker.datatype.boolean(0.3)
				? undefined
				: faker.helpers.arrayElement(owned);
		// Weighted towards recent weeks so there's a healthy amount of open work. Not before the
		// customer joined, nor before the unit was installed (which is at least 60 days ago), so its
		// service history starts with its installation; the dates that follow come after it.
		const window = addDays(now, faker.datatype.boolean(0.25) ? -40 : -540);
		const createdAt = faker.date.between({
			from: Math.max(
				window.getTime(),
				owner.createdAt.getTime(),
				target?.installedAt.getTime() ?? 0,
			),
			to: now,
		});
		const { status, scheduledFor, completedAt } = lifecycle(createdAt);
		const priority: OrderPriority =
			type === "repair"
				? faker.helpers.arrayElement(["normal", "high", "high", "urgent"])
				: faker.helpers.arrayElement(["low", "normal", "normal", "normal", "high"]);
		const [minHours, maxHours] = laborRange[type];
		return {
			customerId: owner.id,
			equipmentId: target?.id ?? null,
			engineerId:
				status === "quote"
					? null
					: pickEngineer(target?.category, scheduledFor! > addDays(now, -90)).id,
			type,
			status,
			priority,
			description: describe[type](target?.category),
			scheduledFor,
			completedAt,
			laborHours: faker.number.float({ min: minHours, max: maxHours, multipleOf: 0.25 }),
			createdAt,
		};
	})
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		.map((o, i) => ({
			id: i + 1,
			number: formatCode("order", i + 1, o.createdAt.getFullYear()),
			...o,
		}));

	const orderLines = orders.flatMap((o) => {
		const [min, max] = linesRange[o.type];
		const picked = faker.helpers.arrayElements(materials, faker.number.int({ min, max }));
		// Older orders were priced a little lower than today's list price.
		const ageInYears = (now.getTime() - o.createdAt.getTime()) / (365 * DAY);
		return picked.map((m) => ({
			orderId: o.id,
			materialId: m.id,
			quantity:
				m.unit === "pcs"
					? faker.number.int({ min: 1, max: 6 })
					: faker.number.float({ min: 0.5, max: 25, fractionDigits: 2 }),
			unitPrice: Math.round(m.unitPrice * (1 - 0.04 * ageInYears)),
		}));
	});

	// Equipment with an open repair is out of service (urgent) or needs service.
	for (const o of orders) {
		if (o.type !== "repair" || !o.equipmentId) continue;
		if (!["quote", "scheduled", "in_progress"].includes(o.status)) continue;
		const item = equipments[o.equipmentId - 1];
		if (o.priority === "urgent") item.status = "out_of_service";
		else if (item.status === "operational") item.status = "needs_service";
	}
	for (const item of equipments) {
		if (item.status === "operational" && faker.datatype.boolean(0.04))
			item.status = "decommissioned";
	}

	// --- Service contracts (optional module) -----------------------------------------------------

	/** Monthly fee per covered unit in euros, by level. */
	const feePerUnit: Record<ContractLevel, [number, number]> = {
		basic: [35, 55],
		standard: [70, 110],
		premium: [140, 220],
	};

	/** Shorter or longer response times than the level's default, agreed now and then. */
	const customResponseHours: Record<ContractLevel, number[]> = {
		basic: [48, 96],
		standard: [12, 48],
		premium: [2, 8],
	};

	const contractNotes = [
		"Inclusief de jaarlijkse wettelijke keuring.",
		"Onderdelen inbegrepen tot € 2.000 per jaar.",
		"Storingen buiten kantooruren worden apart gefactureerd.",
		"Toegang via de receptie; bezoek 24 uur van tevoren aanmelden.",
		"Tarief wordt jaarlijks geïndexeerd (CBS-index + 1%).",
		"Alleen de hoofdlocatie; nevenlocaties op aanvraag.",
	];

	const levelsBySegment: Record<(typeof customerSegments)[number], ContractLevel[]> = {
		enterprise: ["premium", "premium", "standard"],
		mid_market: ["standard", "standard", "basic", "premium"],
		small_business: ["basic", "basic", "standard"],
	};

	/** Moves a date by whole years, keeping the day of the month. */
	const addYears = (date: Date, years: number) =>
		new Date(date.getFullYear() + years, date.getMonth(), date.getDate());

	// Mostly larger customers have a contract. Each has a run of consecutive terms (renewals, often
	// upgraded over time): the latest is active or starts soon, unless the customer let it lapse.
	// Only for tenants with the contracts module.
	const contractTerms = (size.contracts ? customers : [])
		.filter((owner) =>
			faker.datatype.boolean(
				{ enterprise: 1, mid_market: 0.85, small_business: 0.1 }[owner.segment],
			),
		)
		.flatMap((owner) => {
			const owned = equipments.filter((e) => e.customerId === owner.id);
			const lapsed = faker.datatype.boolean(0.15);
			let level = faker.helpers.arrayElement(levelsBySegment[owner.segment]);
			let years = faker.helpers.arrayElement([1, 1, 2, 3]);
			const latestStart = lapsed
				? faker.date.between({
						from: addDays(now, -years * 365 - 500),
						to: addDays(now, -years * 365 - 30),
					})
				: faker.date.between({ from: addDays(now, -years * 365 + 30), to: addDays(now, 60) });
			// Contracts start on the first of a month.
			let startsOn = new Date(latestStart.getFullYear(), latestStart.getMonth(), 1);

			const terms = [];
			const termCount = faker.helpers.arrayElement([1, 2, 2, 3]);
			// Newest first, back to when the customer joined.
			for (let i = 0; i < termCount && startsOn > owner.createdAt; i++) {
				const endsOn = addDays(addYears(startsOn, years), -1);
				const eligible = owned.filter(
					(e) => e.installedAt < endsOn && (endsOn < now || e.status !== "decommissioned"),
				);
				if (eligible.length) {
					const covered = faker.helpers.arrayElements(
						eligible,
						faker.number.int({ min: 1, max: eligible.length }),
					);
					const [min, max] = feePerUnit[level];
					// A volume discount from four units.
					const fee =
						covered.length * faker.number.int({ min, max }) * (covered.length >= 4 ? 0.9 : 1);
					terms.push({
						customerId: owner.id,
						level,
						startsOn,
						endsOn,
						monthlyFee: Math.round(fee / 5) * 500,
						responseHours: faker.datatype.boolean(0.15)
							? faker.helpers.arrayElement(customResponseHours[level])
							: defaultResponseHours[level],
						notes: faker.helpers.maybe(() => faker.helpers.arrayElement(contractNotes), {
							probability: 0.3,
						}),
						createdAt: new Date(
							Math.min(
								addDays(startsOn, -faker.number.int({ min: 7, max: 45 })).getTime(),
								addDays(now, -1).getTime(),
							),
						),
						equipmentIds: covered.map((e) => e.id),
					});
				}
				// The term before this one; customers tend to upgrade, so it may be a level lower.
				years = faker.helpers.arrayElement([1, 1, 2]);
				startsOn = addYears(startsOn, -years);
				if (level !== "basic" && faker.datatype.boolean(0.3)) {
					level = level === "premium" ? "standard" : "basic";
				}
			}
			return terms;
		})
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		.map((c, i) => ({
			id: i + 1,
			number: formatCode("contract", i + 1, c.createdAt.getFullYear()),
			...c,
		}));

	// A running contract that ends soon and isn't renewed, for the module's "Contracts ending soon"
	// on the dashboard: if no customer's latest term ends in the next 60 days, the one that ends
	// first after that ends in 30 days instead. Fixed rather than random, like the call-outs below.
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const latestTerms = [...Map.groupBy(contractTerms, (c) => c.customerId).values()]
		.map((terms) => terms.reduce((a, b) => (b.startsOn > a.startsOn ? b : a)))
		.filter((c) => c.startsOn <= now && c.endsOn >= today)
		.sort((a, b) => a.endsOn.getTime() - b.endsOn.getTime() || a.id - b.id);
	if (latestTerms.length && latestTerms[0].endsOn >= addDays(today, 60)) {
		latestTerms[0].endsOn = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
	}

	const contracts = contractTerms.map(({ equipmentIds: _equipmentIds, ...c }) => c);
	const contractCoverage = contractTerms.flatMap((c) =>
		c.equipmentIds.map((equipmentId) => ({
			customerId: c.customerId,
			contractId: c.id,
			equipmentId,
		})),
	);

	// --- Call-outs waiting for a response (service contracts) ----------------------------------

	// Repairs on covered units that aren't scheduled yet, so the module's response times (see
	// `#lib/components/contracts/coverage.ts`) have something to show: one overdue, one at risk
	// (on the slowest contract, so it stays at risk for a while), one on track. Fixed rather than
	// random, and made last, so the rest of the data stays the same.
	const running = contractTerms
		.filter((c) => c.startsOn <= now && now < addDays(c.endsOn, 1))
		.sort((a, b) => a.responseHours - b.responseHours || a.id - b.id);
	const waiting =
		running.length >= 3
			? [
					{
						term: running[0],
						hoursAgo: running[0].responseHours + 2,
						description: "Installatie uitgevallen na stroomstoring; klant heeft twee keer gebeld",
					},
					{
						term: running[running.length - 1],
						hoursAgo: running[running.length - 1].responseHours * 0.85,
						description: "Storing komt en gaat, alarm op de regeling",
					},
					{
						term: running[Math.floor(running.length / 2)],
						hoursAgo: 0.5,
						description: "Sinds vanochtend afwijkend geluid",
					},
				]
			: [];
	const callOuts = waiting.map(({ term, hoursAgo, description }, i) => {
		const id = orders.length + i + 1;
		const createdAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
		const unit = equipments[term.equipmentIds[0] - 1];
		unit.status = "needs_service";
		return {
			id,
			number: formatCode("order", id, createdAt.getFullYear()),
			customerId: term.customerId,
			equipmentId: unit.id,
			engineerId: null,
			type: "repair" as const,
			status: "quote" as const,
			priority: "high" as const,
			description,
			scheduledFor: null,
			completedAt: null,
			laborHours: 2,
			createdAt,
		};
	});
	const callOutLines = callOuts.map((o) => ({
		orderId: o.id,
		materialId: materials[3].id,
		quantity: 2,
		unitPrice: materials[3].unitPrice,
	}));

	return {
		customers,
		engineers,
		equipments,
		materials,
		orders: [...orders, ...callOuts],
		orderLines: [...orderLines, ...callOutLines],
		contracts,
		contractCoverage,
	};
}

// --- Stock movements -------------------------------------------------------------------------

/**
 * The stock ledger that adds up to each generated material's stock: an opening balance before
 * the first order, consumption by the lines of every order that holds stock, and a few recent
 * deliveries (no larger than
 * the stock now, so the stock was never below zero). With a faker of its own, so the rest of the
 * data is the same with or without it.
 */
function generateStockMovements(data: ReturnType<typeof generateTenant>, seed: number) {
	const random = new Faker({ locale: [nl, en] });
	random.seed(seed);
	const round = (quantity: number) => Math.round(quantity * 100) / 100;
	const orders = new Map(data.orders.map((o) => [o.id, o]));

	// Only orders that hold stock took it: not quotes, nor cancelled orders (see `holdsStock`).
	const consumption = data.orderLines.flatMap((line) => {
		const o = orders.get(line.orderId)!;
		if (!holdsStock(o.status)) return [];
		return {
			materialId: line.materialId,
			quantity: -line.quantity,
			kind: "consumption" as const,
			orderId: o.id,
			orderNumber: o.number,
			note: null as string | null,
			createdAt: o.createdAt,
		};
	});

	const receipts = random.helpers
		.arrayElements(data.materials, Math.ceil(data.materials.length / 3))
		.filter((m) => m.stock >= 1)
		.map((m) => ({
			materialId: m.id,
			quantity:
				m.unit === "pcs"
					? random.number.int({ min: 1, max: m.stock })
					: random.number.float({ min: 1, max: m.stock, fractionDigits: 1 }),
			kind: "receipt" as const,
			orderId: null,
			orderNumber: null,
			note: `Pakbon ${random.string.numeric(6)}`,
			createdAt: random.date.between({ from: addDays(now, -120), to: addDays(now, -1) }),
		}));

	const opening = data.materials
		.map((m) => {
			const change = [...consumption, ...receipts]
				.filter((movement) => movement.materialId === m.id)
				.reduce((sum, movement) => sum + movement.quantity, 0);
			return {
				materialId: m.id,
				quantity: round(m.stock - change),
				kind: "opening_balance" as const,
				orderId: null,
				orderNumber: null,
				note: null,
				createdAt: addDays(now, -560),
			};
		})
		.filter((movement) => movement.quantity !== 0);

	return [...opening, ...consumption, ...receipts].toSorted(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);
}

// --- Invoices (invoicing module) -------------------------------------------------------------

/** From when the demo tenants bill contract fees through the app (see the invoicing settings). */
const billFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);

/** A contract level's name in Dutch, as `label("contractLevel", level)` shows it. */
const levelLabel = (level: ContractLevel) =>
	({ basic: "Basis", standard: "Standaard", premium: "Premium" })[level];

// Like `formatDate` in `#lib/format.ts` in Dutch, which the seed script can't import.
const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

/** A contract's month on an invoice, worded like the app does in Dutch (the demo's language). */
const monthlyFeeText = (
	contract: { number: string; level: ContractLevel },
	month: ContractMonth,
) => ({
	description: `Servicecontract ${contract.number} (${levelLabel(contract.level)})`,
	detail: `Maandbedrag, ${day.format(month.startsOn)} – ${day.format(month.endsOn)}`,
});

/**
 * Invoices for the orders the generator marked invoiced: one per customer for each month's work,
 * issued early the next month, with that month's contract fees from `billFrom` on (so only this
 * month's are still to bill). Older ones are paid; of the last two months', some are still open,
 * and past their due date overdue. A few were voided and issued again, and two customers have a
 * draft for their completed orders. Priced like `priceOrders()` does, which the seed can't call.
 * With a faker of its own, so the rest of the data is the same with or without it. Contract ids
 * in the fees' references are shifted by `contractOffset`, like the contracts when inserted.
 */
function generateInvoices(
	data: ReturnType<typeof generateTenant>,
	seed: number,
	contractOffset: number,
) {
	const random = new Faker({ locale: [nl, en] });
	random.seed(seed);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const engineers = new Map(data.engineers.map((e) => [e.id, e]));
	const linesOf = Map.groupBy(data.orderLines, (line) => line.orderId);
	const contracts = new Map(data.contracts.map((c) => [c.id, c]));
	const coverage = Map.groupBy(data.contractCoverage, (c) => c.equipmentId);
	type Order = (typeof data.orders)[number];

	/** The contract that covered an order, as in `#lib/components/contracts/coverage.ts`. */
	const coveredBy = (o: Order) =>
		o.type === "installation" || !o.equipmentId
			? undefined
			: (coverage.get(o.equipmentId) ?? [])
					.map((c) => contracts.get(c.contractId)!)
					.filter((c) => {
						const end = new Date(
							c.endsOn.getFullYear(),
							c.endsOn.getMonth(),
							c.endsOn.getDate() + 1,
						);
						return c.startsOn <= o.createdAt && o.createdAt < end;
					})
					.sort((a, b) => a.responseHours - b.responseHours)[0];

	/** An order's price, as `priceOrders()` makes it with the contracts module. */
	function price(o: Order) {
		const materials = (linesOf.get(o.id) ?? []).reduce(
			(sum, line) => sum + Math.round(line.quantity * line.unitPrice),
			0,
		);
		const rate = o.engineerId ? engineers.get(o.engineerId)!.hourlyRate : 8500;
		const labor = Math.round(o.laborHours * rate);
		const contract = coveredBy(o);
		const level = contract?.level;
		const included = level === "premium" ? labor + materials : level === "standard" ? labor : 0;
		const adjustments =
			contract && included
				? [
						{
							label: `Gedekt door ${contract.number} (${levelLabel(contract.level)})`,
							detail: `${level === "premium" ? "Arbeid en materialen" : "Arbeid"} inbegrepen`,
							amount: -included,
						},
					]
				: [];
		return { materials, labor, adjustments, total: materials + labor - included };
	}

	// The seed's texts are in Dutch.
	const billedDetail = "Materialen en arbeid";
	// One invoice per customer and month of work (or of fees).
	const groups = new Map<string, { customerId: number; month: Date; lines: LineDraft[] }>();
	const groupOf = (customerId: number, date: Date) => {
		const month = new Date(date.getFullYear(), date.getMonth(), 1);
		const key = `${month.getTime()}:${customerId}`;
		if (!groups.has(key)) groups.set(key, { customerId, month, lines: [] });
		return groups.get(key)!;
	};
	const invoiced = data.orders
		.filter((o) => o.status === "invoiced")
		.sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());
	for (const o of invoiced)
		groupOf(o.customerId, o.completedAt!).lines.push(...orderLines(o, price(o), billedDetail));
	const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
	for (const c of data.contracts) {
		for (const month of contractMonths(c, billFrom, lastMonthEnd)) {
			groupOf(c.customerId, month.startsOn).lines.push(
				itemLine(monthlyFee({ ...c, id: c.id + contractOffset }, month, monthlyFeeText(c, month))),
			);
		}
	}

	const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);
	const atNine = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9);
	const issued = [...groups.values()]
		.sort((a, b) => a.month.getTime() - b.month.getTime() || a.customerId - b.customerId)
		.flatMap(({ customerId, month, lines }) => {
			const third = new Date(month.getFullYear(), month.getMonth() + 1, 3);
			const issuedOn = third < today ? third : today;
			const age = days(issuedOn, today);
			const paid =
				age > 75 ||
				(age > 30 && random.datatype.boolean(0.7)) ||
				(age >= 2 && random.datatype.boolean(0.35));
			const paidAfter = random.number.int({ min: Math.min(3, age), max: Math.min(age, 45) });
			const invoice = {
				customerId,
				issuedOn,
				dueOn: dueDate(issuedOn, 30),
				status: paid ? ("paid" as const) : ("sent" as const),
				paidOn: paid ? dueDate(issuedOn, paidAfter) : null,
				voidedAt: null as Date | null,
				createdAt: atNine(issuedOn),
				lines,
			};
			// Now and then one went out wrong, was voided and issued again.
			if (!random.datatype.boolean(0.04)) return [invoice];
			const voided = {
				...invoice,
				status: "void" as const,
				paidOn: null,
				voidedAt: new Date(invoice.createdAt.getTime() + 2 * 60 * 60 * 1000),
			};
			return [voided, invoice];
		});

	// Drafts for two customers' completed orders.
	const completed = data.orders.filter(
		(o) => o.status === "completed" && o.completedAt! < addDays(now, -3),
	);
	const drafted = random.helpers.arrayElements(
		[...new Set(completed.map((o) => o.customerId))],
		Math.min(2, completed.length),
	);
	const drafts = drafted.map((customerId) => ({
		customerId,
		issuedOn: null,
		dueOn: null,
		status: "draft" as const,
		paidOn: null,
		voidedAt: null,
		createdAt: addDays(now, -1),
		lines: completed
			.filter((o) => o.customerId === customerId)
			.flatMap((o) => orderLines(o, price(o), billedDetail)),
	}));

	return [...issued, ...drafts].map((invoice, i) => ({
		...invoice,
		id: i + 1,
		number: formatCode("invoice", i + 1, (invoice.issuedOn ?? invoice.createdAt).getFullYear()),
		paymentTermDays: 30,
		vatRate: 21,
	}));
}

// --- Tenants ---------------------------------------------------------------------------------

/**
 * The demo organizations. North has the service contracts and invoicing modules; South only
 * invoicing.
 */
const tenants = [
	{
		...demoOrganizations.north,
		slug: "north",
		modules: ["contracts", "invoicing"],
		seed: 20261005,
		size: { customers: 60, engineers: 18, orders: 750, contracts: true },
	},
	{
		...demoOrganizations.south,
		slug: "south",
		modules: ["invoicing"],
		seed: 20261006,
		size: { customers: 30, engineers: 10, orders: 320, contracts: false },
	},
];

// --- Write -----------------------------------------------------------------------------------

/** Rows per table, for the summary. */
const totals: Record<string, number> = {};
const count = (table: string, rows: unknown[]) =>
	(totals[table] = (totals[table] ?? 0) + rows.length);

await db.transaction(async (tx) => {
	for (const table of [
		schema.activity,
		schema.savedView,
		schema.invoiceLine,
		schema.invoice,
		schema.invoicingSettings,
		schema.contractEquipment,
		schema.contract,
		schema.orderSignoff,
		schema.orderNote,
		schema.stockMovement,
		orderLine,
		order,
		equipment,
		material,
		engineer,
		customer,
		schema.organizationModule,
		schema.invitation,
		schema.member,
		schema.organization,
	]) {
		await tx.delete(table);
	}

	// Ids are global, so each tenant's ids continue where the previous tenant's ended.
	const offset = {
		customer: 0,
		engineer: 0,
		equipment: 0,
		material: 0,
		order: 0,
		contract: 0,
		invoice: 0,
	};
	for (const tenant of tenants) {
		await tx.insert(schema.organization).values({
			id: tenant.id,
			name: tenant.name,
			slug: tenant.slug,
			createdAt: addDays(now, -800),
		});
		if (tenant.modules.length) {
			await tx
				.insert(schema.organizationModule)
				.values(tenant.modules.map((moduleId) => ({ organizationId: tenant.id, moduleId })));
		}

		faker.seed(tenant.seed);
		const data = generateTenant(tenant.size);
		const organizationId = tenant.id;
		const o = { ...offset };
		const rows = {
			customers: data.customers.map((c) => ({ ...c, organizationId, id: c.id + o.customer })),
			engineers: data.engineers.map((e) => ({ ...e, organizationId, id: e.id + o.engineer })),
			equipments: data.equipments.map((e) => ({
				...e,
				organizationId,
				id: e.id + o.equipment,
				customerId: e.customerId + o.customer,
			})),
			materials: data.materials.map((m) => ({ ...m, organizationId, id: m.id + o.material })),
			orders: data.orders.map((r) => ({
				...r,
				organizationId,
				id: r.id + o.order,
				customerId: r.customerId + o.customer,
				equipmentId: r.equipmentId && r.equipmentId + o.equipment,
				engineerId: r.engineerId && r.engineerId + o.engineer,
			})),
			orderLines: data.orderLines.map((l) => ({
				...l,
				organizationId,
				orderId: l.orderId + o.order,
				materialId: l.materialId + o.material,
			})),
			contracts: data.contracts.map((c) => ({
				...c,
				organizationId,
				id: c.id + o.contract,
				customerId: c.customerId + o.customer,
			})),
			coverage: data.contractCoverage.map((c) => ({
				customerId: c.customerId + o.customer,
				contractId: c.contractId + o.contract,
				equipmentId: c.equipmentId + o.equipment,
			})),
			stockMovements: generateStockMovements(data, tenant.seed).map((m) => ({
				...m,
				organizationId,
				materialId: m.materialId + o.material,
				orderId: m.orderId && m.orderId + o.order,
			})),
		};
		const invoices = tenant.modules.includes("invoicing")
			? generateInvoices(data, tenant.seed, o.contract)
			: [];
		const invoicing = {
			invoices: invoices.map(({ lines: _lines, ...i }) => ({
				...i,
				organizationId,
				id: i.id + o.invoice,
				customerId: i.customerId + o.customer,
			})),
			invoiceLines: invoices.flatMap((i) =>
				i.lines.map((line) => ({
					...line,
					organizationId,
					invoiceId: i.id + o.invoice,
					orderId: line.orderId && line.orderId + o.order,
				})),
			),
			invoicingSettings: tenant.modules.includes("invoicing")
				? [{ organizationId, vatRate: 21, paymentTermDays: 30, billFrom }]
				: [],
		};

		await insertAll(rows.customers, (chunk) => tx.insert(customer).values(chunk));
		await insertAll(rows.engineers, (chunk) => tx.insert(engineer).values(chunk));
		await insertAll(rows.equipments, (chunk) => tx.insert(equipment).values(chunk));
		await insertAll(rows.materials, (chunk) => tx.insert(material).values(chunk));
		await insertAll(rows.orders, (chunk) => tx.insert(order).values(chunk));
		await insertAll(rows.orderLines, (chunk) => tx.insert(orderLine).values(chunk));
		await insertAll(rows.contracts, (chunk) => tx.insert(schema.contract).values(chunk));
		await insertAll(rows.coverage, (chunk) => tx.insert(schema.contractEquipment).values(chunk));
		await insertAll(rows.stockMovements, (chunk) => tx.insert(schema.stockMovement).values(chunk));
		await insertAll(invoicing.invoices, (chunk) => tx.insert(schema.invoice).values(chunk));
		await insertAll(invoicing.invoiceLines, (chunk) => tx.insert(schema.invoiceLine).values(chunk));
		await insertAll(invoicing.invoicingSettings, (chunk) =>
			tx.insert(schema.invoicingSettings).values(chunk),
		);
		// Who created the latest orders, so the activity log starts with some history: the office
		// staff, not the field engineers.
		const members = demoUsers.filter((u) =>
			u.memberships.some((m) => m.organizationId === tenant.id && m.role !== "engineer"),
		);
		const created = rows.orders
			.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
			.slice(-8)
			.map((row, i) => ({
				organizationId,
				userName: members[i % members.length].name,
				action: "created" as const,
				subjectType: "order",
				subjectId: String(row.id),
				subjectLabel: row.number,
				createdAt: row.createdAt,
			}));
		await tx.insert(schema.activity).values(created);
		count("activity", created);

		offset.customer += rows.customers.length;
		offset.engineer += rows.engineers.length;
		offset.equipment += rows.equipments.length;
		offset.material += rows.materials.length;
		offset.order += rows.orders.length;
		offset.contract += rows.contracts.length;
		offset.invoice += invoicing.invoices.length;
		for (const [table, list] of Object.entries({ ...rows, ...invoicing })) count(table, list);
	}
});

/**
 * Links a demo field engineer's account to their organization's first engineer, and plans some of
 * the organization's scheduled work (of engineers with the same specialty) for them: a job under
 * way and another one today, then a few on the next days, so the engineer portal has work to show.
 */
async function linkDemoEngineer(tx: Transaction, userId: string, organizationId: string) {
	const [first] = await tx
		.select({ id: engineer.id, specialty: engineer.specialty })
		.from(engineer)
		.where(and(eq(engineer.organizationId, organizationId), eq(engineer.active, true)))
		.orderBy(asc(engineer.id))
		.limit(1);
	await tx.update(engineer).set({ userId }).where(eq(engineer.id, first.id));

	const work = await tx
		.select({ id: order.id })
		.from(order)
		.innerJoin(engineer, eq(order.engineerId, engineer.id))
		.where(
			and(
				eq(order.organizationId, organizationId),
				eq(order.status, "scheduled"),
				eq(engineer.specialty, first.specialty),
			),
		)
		.orderBy(asc(order.id))
		.limit(4);
	const plan = [
		{ days: 0, hours: 8, minutes: 0, status: "in_progress" },
		{ days: 0, hours: 13, minutes: 30, status: "scheduled" },
		{ days: 1, hours: 9, minutes: 0, status: "scheduled" },
		{ days: 3, hours: 10, minutes: 30, status: "scheduled" },
	] as const;
	for (const [i, { id }] of work.entries()) {
		const { days, hours, minutes, status } = plan[i];
		const scheduledFor = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + days,
			hours,
			minutes,
		);
		await tx
			.update(order)
			.set({ engineerId: first.id, scheduledFor, status })
			.where(eq(order.id, id));
	}
}

// Demo users are recreated (with their password account, as better-auth's email sign-up would),
// so a changed name or password always takes effect. Their sessions go with them.
await db.transaction(async (tx) => {
	const existing = await tx
		.select({ id: user.id })
		.from(user)
		.where(
			inArray(
				user.email,
				demoUsers.map((u) => u.email),
			),
		);
	const ids = existing.map((u) => u.id);
	await tx.delete(session).where(inArray(session.userId, ids));
	await tx.delete(account).where(inArray(account.userId, ids));
	await tx.delete(user).where(inArray(user.id, ids));

	for (const { memberships, engineerIn, ...demo } of demoUsers) {
		const id = crypto.randomUUID();
		await tx.insert(user).values({ id, ...demo, emailVerified: true });
		await tx.insert(schema.member).values(
			// In order: the first is where they start when signing in.
			memberships.map((membership, i) => ({
				id: crypto.randomUUID(),
				userId: id,
				...membership,
				createdAt: new Date(now.getTime() - (memberships.length - i) * 1000),
			})),
		);
		await tx.insert(account).values({
			id: crypto.randomUUID(),
			accountId: id,
			providerId: "credential",
			userId: id,
			password: await hashPassword(DEMO_PASSWORD),
		});
		if (engineerIn) await linkDemoEngineer(tx, id, engineerIn);
	}
});

console.log(
	`Seeded ${tenants.length} organizations (${tenants.map((t) => t.name).join(", ")}) with ` +
		Object.entries(totals)
			.map(([table, n]) => `${n} ${table}`)
			.join(", ") +
		`, and ${demoUsers.length} demo users.`,
);
