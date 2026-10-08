import type { Faker } from "@faker-js/faker";

/**
 * Real towns where the demo's customers are, by country (stored by its English name), with their
 * phone area code.
 */
export const towns: Record<string, Record<string, string>> = {
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
export function landline(faker: Faker, country: string, town: string) {
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
export function mobile(faker: Faker, country: string) {
	if (country === "Netherlands") return `06 ${faker.string.numeric(8)}`;
	if (country === "Belgium")
		return `+32 4${faker.helpers.arrayElement(["7", "8", "9"])}${faker.string.numeric(1)} ${faker.string.numeric(2)} ${faker.string.numeric(2)} ${faker.string.numeric(2)}`;
	return `+49 1${faker.helpers.arrayElement(["51", "52", "60", "70", "76"])} ${faker.string.numeric(8)}`;
}

/** Name parts for the customers' company names: trades by segment, in Dutch and in German. */
export const trades = {
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
export const germanTrades = {
	enterprise: ["Gruppe", "Logistik", "Lebensmittel", "Chemie"],
	mid_market: ["Metallbau", "Kunststofftechnik", "Spedition", "Haustechnik"],
	small_business: ["Bäckerei", "Autohaus", "Metzgerei", "Gärtnerei"],
};
/** Dutch institutions, named after their town. */
export const institutions = {
	enterprise: ["Ziekenhuis", "Woonstichting", "Hogeschool", "Zorggroep"],
	mid_market: ["Hotel", "Zorgcentrum", "Sportcentrum", "Scholengemeenschap", "Zwembad"],
};

/** A slug for a domain or email address, e.g. `van der Meer` → `vandermeer`. */
export const slug = (text: string, separator = "") =>
	text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/&/g, " en ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replaceAll(" ", separator);
