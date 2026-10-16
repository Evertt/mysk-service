/**
 * SHLTR's units: the ones the mockup names, at its customers' sites (`docs/plans/shltr-domain.md`,
 * §2.3, §2.6 and §2.10), and made-up ones for the other customers, by what their buildings hold:
 * docks with their doors and levellers at a distribution centre, fast doors and fire doors at a
 * factory, automatic doors and airco in an office building.
 */
import type { Faker } from "@faker-js/faker";

import type { EquipmentStatus } from "#lib/models.ts";

import type { SeedCategory } from "../categories.ts";
import { addDays, now } from "../clock.ts";
import type { CustomerKind, ShltrCustomer, ShltrSite } from "./customers.ts";

type Category = Extract<
	SeedCategory,
	| "fire_door"
	| "sectional_door"
	| "automatic_door"
	| "high_speed_door"
	| "dock_leveller"
	| "salvo_dock"
	| "stairs"
	| "hvac"
	| "aerial_platform"
	| "other"
>;

/** A unit the mockup names. */
interface FixedUnit {
	name: string;
	category: Category;
	manufacturer: string;
	model: string;
	location: string;
	/** As the Apparatuur page has it: `Goed`, `Aandacht`, `Kritiek`. */
	status?: EquipmentStatus;
	/**
	 * On the Apparatuur page, which counts the unit's open orders: the seed gives it those (see
	 * `fixedOrders`) and no others.
	 */
	counted?: boolean;
}

/** The units at Riedel B.V. in Ede: the 15 of the Apparatuur page first, then Connect's and the customer card's. */
const riedel: FixedUnit[] = [
	{ name: "algeheel onderhoud", category: "other", manufacturer: "", model: "", location: "" },
	{
		name: "Automatische deur kantine",
		category: "automatic_door",
		manufacturer: "Boon Edam",
		model: "",
		location: "kantine",
	},
	{
		name: "Automatische deur Laboratorium BESAM",
		category: "automatic_door",
		manufacturer: "Besam",
		model: "",
		location: "Laboratorium begane grond",
	},
	{
		name: "Automatische deur receptie (binnendeur) BES-3",
		category: "automatic_door",
		manufacturer: "Besam",
		model: "",
		location: "ingang kantoor",
	},
	{
		name: "Automatische draaideur hoofdentree BES-7",
		category: "automatic_door",
		manufacturer: "Boon Edam",
		model: "Draaideur obj 5267",
		location: "hoofdentree",
	},
	{
		name: "Automatische houten deur fietsenstalling BES-1",
		category: "automatic_door",
		manufacturer: "Besam",
		model: "",
		location: "fietsenstalling",
	},
	{
		name: "Automatische schuifdeur van gang naar productie BES-4",
		category: "automatic_door",
		manufacturer: "Besam",
		model: "Schuifdeur",
		location: "gang productie",
	},
	{
		name: "Boktrap",
		category: "stairs",
		manufacturer: "Boktrap",
		model: "",
		location: "Verpakkingmagazijn",
	},
	{
		name: "bordestrap 1x4 04366",
		category: "stairs",
		manufacturer: "",
		model: "",
		location: "kantine",
	},
	{
		name: "BRD Branddeur 1e verd. TD tbv wasgoed TDTE-13",
		category: "fire_door",
		manufacturer: "Gorter",
		model: "930069001",
		location: "802.02",
		status: "needs_service",
	},
	{
		name: "BRD-Branddeur Aromakluis achterzijde ING-19",
		category: "fire_door",
		manufacturer: "",
		model: "",
		location: "Begane Grond Aromakluis achter",
		status: "needs_service",
	},
	{
		name: "BRD-Branddeur Aromakluis voorzijde ING-16",
		category: "fire_door",
		manufacturer: "",
		model: "",
		location: "Begane Grond Aroma kluis",
		status: "needs_service",
	},
	{
		name: "BRD-Brandwerend deur Amoniak ruimte TDTE-01",
		category: "fire_door",
		manufacturer: "Gorter",
		model: "SR 60",
		location: "BG 803.11 Gang Tetra koelcentrale",
		status: "out_of_service",
	},
	{
		name: "Sectionaaldeur laaddok 07",
		category: "sectional_door",
		manufacturer: "Crawford",
		model: "SD 4000",
		location: "Expeditie dock 07",
	},
	{
		name: "Sectionaaldeur laaddok 08",
		category: "sectional_door",
		manufacturer: "Crawford",
		model: "SD 4000",
		location: "Expeditie dock 08",
		status: "needs_service",
	},
	// Connect's (its D-07 is the Apparatuur page's "Sectionaaldeur laaddok 07").
	{
		name: "Sectionaaldeur D-09",
		category: "sectional_door",
		manufacturer: "Crawford",
		model: "SD 4000",
		location: "Expeditie noord",
	},
	{
		name: "Sectionaaldeur D-11",
		category: "sectional_door",
		manufacturer: "Hörmann",
		model: "SPU F42",
		location: "Werkplaats",
	},
	{
		name: "Leveller L-03",
		category: "dock_leveller",
		manufacturer: "Crawford",
		model: "DL 6080",
		location: "Dock 03",
	},
	// The customer card's.
	{
		name: "SEC-Sectionaaldeur magazijn laaddok LD-04",
		category: "sectional_door",
		manufacturer: "Crawford",
		model: "OH1042P",
		location: "LD-04 Dok 2",
	},
	{
		name: "SEC-Sectionaaldeur 220045118 expeditie EXP-09",
		category: "sectional_door",
		manufacturer: "Crawford",
		model: "OH1042P",
		location: "EXP-09 Deur 1",
	},
	{
		name: "Snelroldeur achterzijde productiehal Noord",
		category: "high_speed_door",
		manufacturer: "Efaflex",
		model: "EFA-SRT",
		location: "Hal N",
	},
	{
		name: "Snelroldeur grondstoffen GS-02",
		category: "high_speed_door",
		manufacturer: "Efaflex",
		model: "EFA-SST",
		location: "Begane Grond grondstof",
	},
	{
		name: "Vriessnelroldeur naar diepvriescel groot",
		category: "high_speed_door",
		manufacturer: "Efaflex",
		model: "EFA-SRT ISO",
		location: "Hal N",
	},
	{
		name: "Hoogwerker Nano Tower",
		category: "aerial_platform",
		manufacturer: "Power Towers",
		model: "Nano",
		location: "Technische dienst",
	},
	{
		name: "Verticale masthoogwerker",
		category: "aerial_platform",
		manufacturer: "Genie",
		model: "AWP-30S",
		location: "Magazijn",
	},
];
for (const unit of riedel.slice(0, 15)) unit.counted = true;

/** The units the mockup names at its other customers, by customer. */
const named: Record<string, FixedUnit[]> = {
	"Riedel B.V.": riedel,
	"Bouwgroep De Vries": [
		{
			name: "Bordestrap T-A3",
			category: "stairs",
			manufacturer: "Günzburger",
			model: "Bordestrap 1x6",
			location: "Hal A",
		},
		{
			name: "Bordes B-12",
			category: "stairs",
			manufacturer: "Altrex",
			model: "Werkbordes",
			location: "Hal B",
		},
	],
	"Pakhuis 7": [
		{
			name: "Airco AC-02",
			category: "hvac",
			manufacturer: "Daikin",
			model: "FTXM35R",
			location: "Kantoor 1e",
		},
		{
			name: "Airco AC-05",
			category: "hvac",
			manufacturer: "Mitsubishi Electric",
			model: "PKA-M60KA",
			location: "Serverruimte",
		},
	],
	// Docks 01–08, each with door D-(16 + n), so Connect's D-21 is at dock 05 and D-24 at dock 08.
	"Weggemans Logistiek": Array.from({ length: 8 }, (_, i) => {
		const dock = String(i + 1).padStart(2, "0");
		const units: FixedUnit[] = [
			{
				name: `Sectionaaldeur D-${16 + i + 1}`,
				category: "sectional_door",
				manufacturer: "Hörmann",
				model: "SPU F42",
				location: `Dock ${dock}`,
			},
			{
				name: `Dockleveller L-${dock}`,
				category: "dock_leveller",
				manufacturer: "Hörmann",
				model: "HLS 2",
				location: `Dock ${dock}`,
			},
		];
		if (i >= 4) {
			units.push({
				name: `Salvo dock ${dock}`,
				category: "salvo_dock",
				manufacturer: "Salvo",
				model: "Wheel-Lok WL-2",
				location: `Dock ${dock}`,
			});
		}
		return units;
	}).flat(),
};

/** Brands and models common in Dutch buildings, per category. */
const makes: Record<Category, [manufacturer: string, models: string[]][]> = {
	sectional_door: [
		["Crawford", ["SD 4000", "OH1042P"]],
		["Hörmann", ["SPU F42", "ALR F42"]],
		["Novoferm", ["Thermo 40", "Iso 45"]],
		["Alpha Deuren", ["AL 40"]],
	],
	dock_leveller: [
		["Crawford", ["DL 6080", "DL 6020"]],
		["Hörmann", ["HLS 2", "HTL 2"]],
		["Stertil", ["RHL", "TL"]],
	],
	salvo_dock: [["Salvo", ["Wheel-Lok WL-2", "SCP-100"]]],
	fire_door: [
		["Gorter", ["SR 60", "SR 30"]],
		["Rf-Technologies", ["Rf-t 60"]],
		["Hörmann", ["H3 D", "H16"]],
	],
	high_speed_door: [
		["Efaflex", ["EFA-SRT", "EFA-SST"]],
		["Dynaco", ["D-311", "M2"]],
		["Hörmann", ["V 5030 SEL"]],
	],
	automatic_door: [
		["Boon Edam", ["Duotour", "Tourlock"]],
		["Besam", ["SL500", "UniSlide"]],
		["Record", ["STA 20"]],
		["Geze", ["Slimdrive SL"]],
	],
	stairs: [
		["Altrex", ["Werkbordes", "Kooiladder"]],
		["Günzburger", ["Bordestrap 1x4", "Bordestrap 1x6"]],
		["Hymer", ["Bordestrap 6030"]],
	],
	hvac: [
		["Daikin", ["FTXM35R", "FTXM50R"]],
		["Mitsubishi Electric", ["MSZ-LN35", "PKA-M60KA"]],
		["Toshiba", ["RAS-B13"]],
		["LG", ["S12ET"]],
	],
	aerial_platform: [
		["Genie", ["GS-1932", "AWP-30S"]],
		["JLG", ["Toucan 10E"]],
		["Haulotte", ["Optimum 8"]],
	],
	other: [["", [""]]],
};

/** Where in a building a unit is, by category, and what its name says it is. */
const places: Record<
	Exclude<Category, "sectional_door" | "dock_leveller" | "salvo_dock">,
	string[]
> = {
	fire_door: [
		"trappenhuis A",
		"trappenhuis B",
		"magazijn – kantoor",
		"technische ruimte",
		"productiehal",
		"kantine",
	],
	high_speed_door: ["productiehal", "koelcel", "expeditie", "grondstoffen", "verpakkingshal"],
	automatic_door: ["hoofdentree", "receptie", "kantine", "personeelsingang"],
	stairs: ["Hal A", "Hal B", "magazijn", "dak", "productiehal"],
	hvac: ["Kantoor 1e", "Serverruimte", "Kantine", "Vergaderruimte", "Receptie", "Kantoor 2e"],
	aerial_platform: ["Magazijn", "Technische dienst", "Productiehal"],
	other: [""],
};

/** How many units of each category a site of a kind of customer has, at most. */
const counts: Record<CustomerKind, Partial<Record<Category, [number, number]>>> = {
	logistics: {
		fire_door: [0, 2],
		high_speed_door: [0, 1],
		automatic_door: [0, 1],
		stairs: [0, 1],
		hvac: [0, 1],
		aerial_platform: [0, 1],
	},
	production: {
		sectional_door: [1, 3],
		dock_leveller: [0, 2],
		fire_door: [1, 2],
		high_speed_door: [1, 2],
		automatic_door: [0, 1],
		stairs: [0, 1],
		hvac: [1, 2],
	},
	building: {
		sectional_door: [0, 1],
		fire_door: [1, 3],
		automatic_door: [1, 2],
		stairs: [0, 1],
		hvac: [1, 2],
	},
};

/** A unit as the seed has them (like `generateEquipment`), with its site, place and name. */
export interface ShltrUnit {
	id: number;
	serialNumber: string;
	model: string;
	manufacturer: string;
	category: Category;
	status: EquipmentStatus;
	customerId: number;
	installedAt: Date;
	warrantyUntil: Date;
	name: string;
	siteId: number;
	location: string | null;
	/** One the Apparatuur page counts the open orders of, see `FixedUnit.counted`. */
	counted: boolean;
}

/**
 * The units of SHLTR's customers (ids from 1): the mockup's at their customers' first site, and
 * made-up ones at every site of the others (a logistics company's main site gets two to six docks,
 * each with its door and mostly a leveller).
 */
export function generateShltrEquipment(
	faker: Faker,
	customers: ShltrCustomer[],
	sites: ShltrSite[],
) {
	const units: ShltrUnit[] = [];
	const add = (
		owner: ShltrCustomer,
		siteId: number,
		unit: Omit<FixedUnit, "location"> & { location: string | null },
	) => {
		const installedAt = faker.date.between({ from: owner.createdAt, to: addDays(now, -90) });
		units.push({
			id: units.length + 1,
			serialNumber: faker.string.alphanumeric({ length: 10, casing: "upper" }),
			model: unit.model,
			manufacturer: unit.manufacturer,
			category: unit.category,
			status: unit.status ?? "operational",
			customerId: owner.id,
			installedAt,
			warrantyUntil: addDays(installedAt, faker.helpers.arrayElement([1, 2, 5]) * 365),
			name: unit.name,
			siteId,
			location: unit.location || null,
			counted: unit.counted ?? false,
		});
	};
	const make = (category: Category) => {
		const [manufacturer, models] = faker.helpers.arrayElement(makes[category]);
		return { manufacturer, model: faker.helpers.arrayElement(models) };
	};

	for (const owner of customers) {
		const own = sites.filter((site) => site.customerId === owner.id);
		const fixed = named[owner.name];
		if (fixed) for (const unit of fixed) add(owner, own[0].id, unit);
		// Riedel has only the units the mockup names; the others have more than it shows.
		if (owner.name === "Riedel B.V.") continue;
		for (const [index, site] of own.entries()) {
			const first = index === 0;
			const scale = first ? 1 : 0.5;
			if (owner.kind === "logistics" && owner.name !== "Weggemans Logistiek") {
				const docks = faker.number.int({ min: first ? 2 : 1, max: first ? 6 : 2 });
				const firstDoor = faker.number.int({ min: 1, max: 4 });
				const salvo = faker.datatype.boolean(0.25);
				for (let d = 0; d < docks; d++) {
					const dock = String(d + 1).padStart(2, "0");
					add(owner, site.id, {
						name: `Sectionaaldeur D-${String(firstDoor + d).padStart(2, "0")}`,
						category: "sectional_door",
						...make("sectional_door"),
						location: `Dock ${dock}`,
					});
					if (faker.datatype.boolean(0.75)) {
						add(owner, site.id, {
							name: `Dockleveller L-${dock}`,
							category: "dock_leveller",
							...make("dock_leveller"),
							location: `Dock ${dock}`,
						});
					}
					if (salvo) {
						add(owner, site.id, {
							name: `Salvo dock ${dock}`,
							category: "salvo_dock",
							...make("salvo_dock"),
							location: `Dock ${dock}`,
						});
					}
				}
			}
			const numbered: Partial<Record<Category, number>> = {};
			for (const [category, [min, max]] of Object.entries(counts[owner.kind]) as [
				Category,
				[number, number],
			][]) {
				const count = Math.round(faker.number.int({ min, max }) * scale);
				for (let n = 0; n < count; n++) {
					const at = (numbered[category] = (numbered[category] ?? 0) + 1);
					const tag = String(at).padStart(2, "0");
					if (category === "sectional_door") {
						add(owner, site.id, {
							name: `Sectionaaldeur D-${tag}`,
							category,
							...make(category),
							location: faker.helpers.arrayElement(["Werkplaats", "Expeditie", "Magazijn"]),
						});
					} else if (category === "dock_leveller") {
						add(owner, site.id, {
							name: `Dockleveller L-${tag}`,
							category,
							...make(category),
							location: `Dock ${tag}`,
						});
					} else if (category !== "salvo_dock") {
						const place = faker.helpers.arrayElement(places[category]);
						const name = {
							fire_door: `Branddeur ${place}`,
							high_speed_door: `Snelroldeur ${place}`,
							automatic_door: `Automatische schuifdeur ${place}`,
							stairs: `Bordestrap T-${tag}`,
							hvac: `Airco AC-${tag}`,
							aerial_platform: "Schaarhoogwerker",
							other: "Overig",
						}[category];
						add(owner, site.id, {
							name,
							category,
							...make(category),
							location:
								category === "stairs" || category === "hvac"
									? place
									: category === "fire_door"
										? faker.helpers.arrayElement(["Begane grond", "1e verdieping", "2e verdieping"])
										: null,
						});
					}
				}
			}
		}
	}
	return units;
}
