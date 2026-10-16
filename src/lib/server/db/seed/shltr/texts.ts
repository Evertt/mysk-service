/**
 * What SHLTR's orders say, in Dutch: per type of order and category of unit, the way its office
 * writes them down (the mockup's work orders and checklists, `docs/plans/shltr-domain.md` §2.7).
 */
import type { Faker } from "@faker-js/faker";

import type { OrderType } from "#lib/models.ts";

import type { ShltrUnit } from "./equipment.ts";

type Category = ShltrUnit["category"];

const faults: Record<Category, string[]> = {
	sectional_door: [
		"Deur blijft halverwege hangen, veerbreuk vastgesteld",
		"Sectionaaldeur opent niet, motor bromt",
		"Deur loopt scheef in de geleiders",
		"Kabel van de trommel gelopen, deur hangt scheef",
		"Fotocel geeft storing, deur sluit niet",
		"Deur keert bij het sluiten, sluitkantbeveiliging defect",
		"Deur gaat niet meer open met de handzender",
	],
	fire_door: [
		"Branddeur valt niet in het slot",
		"Kleefmagneet laat niet los bij brandalarm",
		"Deurdranger lekt olie, deur slaat dicht",
		"Branddeur sleept over de vloer",
	],
	automatic_door: [
		"Schuifdeur opent niet, display geeft foutcode",
		"Automatische deur blijft openstaan",
		"Draaideur stopt steeds bij drukte, sensor reageert te gevoelig",
		"Deur sluit met een klap",
		"Deur opent vanzelf, bewegingsmelder ontregeld",
	],
	high_speed_door: [
		"Snelroldeur blijft hangen, doek uit de geleiding",
		"Snelroldeur reageert niet op de radar",
		"Frequentieregelaar in storing, deur staat stil",
		"Deur sluit niet volledig, lichtscherm geeft fout",
	],
	dock_leveller: [
		"Dockleveller zakt weg onder belasting",
		"Lip klapt niet uit",
		"Hydrauliekolie lekt bij de cilinder",
		"Leveller komt niet omhoog, pomp slaat af",
	],
	salvo_dock: [
		"Wheel-Lok vergrendelt niet",
		"Stoplicht dock staat op rood en reageert niet",
		"SCP-paneel geeft storing op de sensor",
	],
	stairs: ["Trede los op de bordestrap", "Leuning zit los", "Kooiladder beschadigd"],
	hvac: [
		"Airco koelt niet, foutcode op de binnenunit",
		"Airco lekt water binnen",
		"Buitenunit slaat af op hoge druk",
		"Serverruimte te warm, airco in storing",
	],
	aerial_platform: [
		"Hoogwerker komt niet omhoog",
		"Accu laadt niet op",
		"Noodstop blijft actief, hoogwerker rijdt niet",
	],
	other: ["Storing, oorzaak onbekend", "Klant meldt storing, nader onderzoek nodig"],
};

const repairs: Record<Category, string[]> = {
	sectional_door: [
		"Torsieveren vervangen (veerpakket)",
		"Kabelset vervangen",
		"Rolscharnieren vervangen",
		"Bodemafdichting vervangen",
		"Openingsbeveiliging vervangen",
		"Looplift aandrijving vervangen",
	],
	fire_door: [
		"Deurdranger vervangen",
		"Kleefmagneet vervangen",
		"Scharnieren afstellen en sluitnaad herstellen",
		"Koppeling met de brandmeldcentrale herstellen",
	],
	automatic_door: [
		"Aandrijfriem vervangen",
		"Bewegingsmelder vervangen",
		"Besturingsprint vervangen",
		"Looprollen en geleiding vervangen",
	],
	high_speed_door: ["Doek vervangen", "Frequentieregelaar vervangen", "Lichtscherm vervangen"],
	dock_leveller: [
		"Hydraulische cilinder vervangen",
		"Lipscharnier vervangen",
		"Hydrauliekslangen vervangen",
		"Noodstopschakelaar vervangen",
	],
	salvo_dock: ["Wheel-Lok sensor vervangen", "Stoplicht dock vervangen"],
	stairs: ["Treden vervangen en verankering herstellen", "Leuning opnieuw verankeren"],
	hvac: [
		"Condensafvoer vrijgemaakt en pomp vervangen",
		"Lek gezocht en hersteld, koudemiddel bijgevuld",
		"Ventilatormotor binnenunit vervangen",
	],
	aerial_platform: ["Accu's vervangen", "Hydrauliekslang vervangen"],
	other: ["Onderdeel vervangen na eerdere storing"],
};

const maintenance: Record<Category, string> = {
	sectional_door: "Halfjaarlijks onderhoud sectionaaldeur",
	fire_door: "Jaarlijks onderhoud branddeur",
	automatic_door: "Onderhoud automatische deur volgens NEN-EN 16005",
	high_speed_door: "Halfjaarlijks onderhoud snelroldeur",
	dock_leveller: "Onderhoud dockleveller, olie en slangen controleren",
	salvo_dock: "Onderhoud Salvo dock, sensoren en vergrendeling testen",
	stairs: "Onderhoud bordes en trap",
	hvac: "Onderhoud airco, filters reinigen",
	aerial_platform: "Onderhoud hoogwerker",
	other: "Algeheel onderhoud deuren en trappen",
};

const inspections: Record<Category, string> = {
	sectional_door: "Keuring sectionaaldeur (NEN-EN 12604/12453)",
	fire_door: "Jaarlijkse inspectie branddeur",
	automatic_door: "Keuring automatische deur (NEN-EN 16005)",
	high_speed_door: "Keuring snelroldeur",
	dock_leveller: "Keuring dockleveller",
	salvo_dock: "Keuring Salvo dock",
	stairs: "Keuring bordes / trap (NEN-EN ISO 14122)",
	hvac: "F-gassen lekdichtheidscontrole",
	aerial_platform: "Periodieke keuring hoogwerker",
	other: "Algemene inspectie",
};

const installations: Partial<Record<Category, string>> = {
	sectional_door: "Nieuwe sectionaaldeur plaatsen en in bedrijf stellen",
	fire_door: "Nieuwe branddeur plaatsen",
	automatic_door: "Automatische schuifdeur plaatsen en afstellen",
	high_speed_door: "Snelroldeur plaatsen en aansluiten",
	dock_leveller: "Dockleveller plaatsen",
	salvo_dock: "Salvo dock safety installeren",
	stairs: "Bordestrap plaatsen en verankeren",
	hvac: "Airco plaatsen en in bedrijf stellen",
	aerial_platform: "Hoogwerker afleveren en instrueren",
};

const without: Partial<Record<OrderType, string[]>> = {
	installation: [
		"Nieuwe docks plaatsen: deur, leveller en dockshelter",
		"Automatische entree plaatsen",
		"Airco's plaatsen in het nieuwe kantoor",
	],
	survey: [
		"Offerte opname vervanging sectionaaldeuren",
		"Opname voor nieuwe snelroldeur",
		"Opname voor airco serverruimte",
		"Opname voor vervanging branddeuren",
	],
	project: [
		"Vervanging sectionaaldeuren expeditie, fase 1",
		"Renovatie docks 01-04",
		"Branddeuren vervangen tweede verdieping",
		"Docks uitbreiden met Salvo dock safety",
	],
	other: [
		"Advies op locatie",
		"Toelichting keuringsrapport aan de klant",
		"Deurcycli meten op verzoek van de klant",
	],
};

const damage: Partial<Record<Category, string>> = {
	sectional_door: "Aanrijdschade sectionaaldeur herstellen (heftruck)",
	dock_leveller: "Aanrijdschade dockleveller herstellen",
	high_speed_door: "Doek snelroldeur gescheurd na aanrijding",
	automatic_door: "Schade automatische deur herstellen na vandalisme",
	fire_door: "Schade aan branddeur herstellen",
};

const nouns: Record<Category, string> = {
	sectional_door: "sectionaaldeur",
	fire_door: "branddeur",
	automatic_door: "automatische deur",
	high_speed_door: "snelroldeur",
	dock_leveller: "dockleveller",
	salvo_dock: "Salvo dock",
	stairs: "bordestrap",
	hvac: "airco",
	aerial_platform: "hoogwerker",
	other: "installatie",
};

/** What an order of `type` on a unit of `category` says (`undefined`: an order without a unit). */
export function describeOrder(faker: Faker, type: OrderType, category?: Category): string {
	const pick = faker.helpers.arrayElement;
	if (!category) return pick(without[type] ?? without.other!);
	switch (type) {
		case "breakdown":
			return pick(faults[category]);
		case "repair":
			return pick(repairs[category]);
		case "maintenance":
			return maintenance[category];
		case "inspection":
			return inspections[category];
		case "installation":
			return installations[category] ?? pick(without.installation!);
		case "damage":
			return damage[category] ?? "Schade herstellen";
		case "survey":
			return `Offerte opname vervanging ${nouns[category]}`;
		case "project":
			return pick(without.project!);
		case "other":
			return pick(without.other!);
	}
}
