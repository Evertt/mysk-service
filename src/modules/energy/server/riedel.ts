/**
 * SHLTR's demo site, "Riedel Ede — Productielocatie" (`docs/plans/shltr-domain.md` §2.5): its
 * contract, eight zones, eleven consumers and four doors, with how the simulation runs them (a
 * zone's typical working day: its peak and consumption, the mockup's `piekKw` and `kwhVandaag`).
 * The seed makes the site from it, and the simulator posts its readings. Plain data, plain Node.
 */
import type { DoorKind, ZoneTone } from "../model.ts";
import type { SimulatedDoor, SimulatedZone } from "../simulation.ts";

/**
 * The integration token the seed gives SHLTR's energy module, which the simulator posts with. It's
 * in the code, so it's for the demo data only: a real tenant's tokens are made on the module's
 * settings page.
 */
export const DEMO_ENERGY_TOKEN = "fwi_shltr-energy-simulator-demo-token-do-not-use";

/** The seed's and the simulator's seed: the same readings for the same day. */
export const SIMULATION_SEED = 20261017;

export const riedelSite = {
	customer: "Riedel B.V.",
	site: "Ede",
	name: "Riedel Ede — Productielocatie",
	meterName: "Hoofdaansluiting",
	contractedPeakKw: 320,
	contractedKwhPerYear: 1_000_000,
	pvCapacityKw: 18.2,
	tariff: 0.28,
	co2Factor: 0.375,
	timeZone: "Europe/Amsterdam",
};

/** A zone with its typical day and how it typically runs (which sets its default thresholds). */
interface RiedelZone extends SimulatedZone {
	name: string;
	floor: string | null;
	areaM2: number;
	tone: ZoneTone;
}

export const riedelZones: RiedelZone[] = [
	{
		code: "Z-R61",
		name: "Vul- en inpakafdeling",
		floor: "Begane grond",
		areaM2: 1240,
		peakKw: 212,
		kwhPerDay: 1482,
		tone: "peak",
	},
	{
		code: "Z-R62",
		name: "Verpakkingshal",
		floor: "Begane grond",
		areaM2: 880,
		peakKw: 118,
		kwhPerDay: 742,
		tone: "elevated",
	},
	{
		code: "Z-TECH",
		name: "Technische Dienst",
		floor: "Begane grond",
		areaM2: 420,
		peakKw: 44,
		kwhPerDay: 312,
		tone: "nominal",
	},
	{
		code: "Z-LAB",
		name: "Laboratorium",
		floor: "1e verdieping",
		areaM2: 360,
		peakKw: 31,
		kwhPerDay: 198,
		tone: "nominal",
	},
	{
		code: "Z-KV",
		name: "Kantoorvoorzieningen",
		floor: "1e verdieping",
		areaM2: 540,
		peakKw: 24,
		kwhPerDay: 156,
		tone: "nominal",
	},
	{
		code: "Z-DOCK",
		name: "Expeditie & Docks",
		floor: "Begane grond",
		areaM2: 690,
		peakKw: 62,
		kwhPerDay: 408,
		tone: "elevated",
	},
	{
		code: "Z-IT",
		name: "Serverruimte",
		floor: "Kelder",
		areaM2: 110,
		peakKw: 45,
		kwhPerDay: 512,
		tone: "elevated",
	},
	{
		code: "Z-EXP",
		name: "Externe unit",
		floor: null,
		areaM2: 0,
		peakKw: 0,
		kwhPerDay: 0,
		tone: "offline",
		offline: true,
	},
];

/** The consumers ("installaties"), by zone; `unit` names one of Riedel's units, if it's one. */
export const riedelConsumers: { zone: string; name: string; ratedKw: number; unit?: string }[] = [
	{ zone: "Z-R61", name: "Vulautomaat R61", ratedKw: 78 },
	{ zone: "Z-R61", name: "Inpakrobot R61", ratedKw: 42.5 },
	{ zone: "Z-R62", name: "Etiketteermachine PL1", ratedKw: 18.5 },
	{ zone: "Z-R62", name: "Lopend transport", ratedKw: 22 },
	{ zone: "Z-R62", name: "Halverlichting LED", ratedKw: 9.6 },
	{ zone: "Z-TECH", name: "CO₂-compressor 1", ratedKw: 24.6 },
	{ zone: "Z-TECH", name: "HVAC-centrale", ratedKw: 18.2 },
	{ zone: "Z-LAB", name: "Klimaatkast laboratorium", ratedKw: 8.4 },
	{ zone: "Z-KV", name: "Werkplek & cafetaria", ratedKw: 14.2 },
	{ zone: "Z-DOCK", name: "Dock-lift & deuren", ratedKw: 16.8, unit: "Leveller L-03" },
	{ zone: "Z-IT", name: "Serverrack A/B", ratedKw: 38.5 },
];

/** A door with its sensor's simulation; `unit` names one of Riedel's units, if it's one. */
interface RiedelDoor extends SimulatedDoor {
	zone: string;
	name: string;
	kind: DoorKind;
	lossKw: number;
	thresholdMinutes: number;
	insideC: number;
	outsideC: number;
	unit?: string;
}

/**
 * The four monitored doors. D-05 is Salvo's DOCK 05 (§2.5): the docks module can show the dock's
 * state next to it later; Riedel's units don't include docks 05 and 06, so those two have none.
 */
export const riedelDoors: RiedelDoor[] = [
	{
		code: "D-05",
		name: "Sectionaaldeur Dock 05",
		zone: "Z-DOCK",
		kind: "sectional",
		lossKw: 11.4,
		thresholdMinutes: 10,
		insideC: 18,
		outsideC: 9,
		cycleMinutes: 40,
		openMinutes: 6,
		offsetMinutes: 0,
		fromHour: 6,
		toHour: 22,
		overrunChance: 0.1,
		overrunMinutes: 10,
	},
	{
		code: "D-06",
		name: "Sectionaaldeur Dock 06",
		zone: "Z-DOCK",
		kind: "sectional",
		lossKw: 10.2,
		thresholdMinutes: 10,
		insideC: 18,
		outsideC: 9,
		cycleMinutes: 55,
		openMinutes: 5,
		offsetMinutes: 20,
		fromHour: 6,
		toHour: 22,
		overrunChance: 0.08,
		overrunMinutes: 9,
	},
	{
		code: "D-VR1",
		name: "Vriescel A",
		zone: "Z-R62",
		kind: "freezer",
		lossKw: 18.6,
		thresholdMinutes: 4,
		insideC: -22,
		outsideC: 16,
		cycleMinutes: 30,
		openMinutes: 2,
		offsetMinutes: 10,
		fromHour: 6,
		toHour: 20,
		overrunChance: 0.06,
		overrunMinutes: 4,
		unit: "Vriessnelroldeur naar diepvriescel groot",
	},
	{
		code: "D-KO1",
		name: "Koelcel B",
		zone: "Z-R62",
		kind: "cold",
		lossKw: 7.8,
		thresholdMinutes: 6,
		insideC: 2,
		outsideC: 16,
		cycleMinutes: 40,
		openMinutes: 3,
		offsetMinutes: 25,
		fromHour: 6,
		toHour: 20,
		overrunChance: 0.06,
		overrunMinutes: 5,
	},
];
