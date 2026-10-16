import type { EngineerSpecialty } from "#lib/models.ts";

/**
 * The equipment categories of the Fieldworks demo tenants (`equipment_category`), in their order:
 * named in Dutch like the rest of the demo data, each with the specialty of the engineers who
 * service it. The generated equipment refers to them by `key`, which is the seed's own (the
 * database has the categories' ids); the modules' seeds pick units by it too, e.g. maintenance's
 * plans for boilers.
 */
export const seedCategories = [
	{ key: "generator", name: "Aggregaat", specialty: "electrical" },
	{ key: "chiller", name: "Koelmachine", specialty: "hvac" },
	{ key: "boiler", name: "Ketel", specialty: "plumbing" },
	{ key: "compressor", name: "Compressor", specialty: "mechanical" },
	{ key: "pump", name: "Pomp", specialty: "plumbing" },
	{ key: "elevator", name: "Lift", specialty: "controls" },
	{ key: "air_handler", name: "Luchtbehandelingskast", specialty: "hvac" },
] as const satisfies readonly { key: string; name: string; specialty: EngineerSpecialty }[];

/**
 * SHLTR's own categories, as its Apparatuur page groups the units (`docs/plans/shltr-domain.md`,
 * §2.6) and its other pages add to them: doors, docks, stairs, airco and aerial platforms.
 * Mechanics service the doors, docks and stairs; the automatic and high-speed doors, whose drives
 * and safety sensors are the work, the controls engineers.
 */
export const shltrCategories = [
	{ key: "fire_door", name: "Branddeuren", specialty: "mechanical" },
	{ key: "sectional_door", name: "Sectionaaldeuren", specialty: "mechanical" },
	{ key: "automatic_door", name: "Automatische deuren", specialty: "controls" },
	{ key: "high_speed_door", name: "Snelroldeuren", specialty: "controls" },
	{ key: "dock_leveller", name: "Docklevellers", specialty: "mechanical" },
	{ key: "salvo_dock", name: "Salvo docks", specialty: "electrical" },
	{ key: "stairs", name: "Klim- & trapmateriaal", specialty: "mechanical" },
	{ key: "hvac", name: "Airco / koeltechniek", specialty: "hvac" },
	{ key: "aerial_platform", name: "Hoogwerkers", specialty: "electrical" },
	{ key: "other", name: "Overig", specialty: "mechanical" },
] as const satisfies readonly { key: string; name: string; specialty: EngineerSpecialty }[];

/** A Fieldworks demo category by its key, e.g. `chiller`. */
export type FieldworksCategory = (typeof seedCategories)[number]["key"];

/** A demo category by its key, e.g. `chiller` or SHLTR's `sectional_door`. */
export type SeedCategory = FieldworksCategory | (typeof shltrCategories)[number]["key"];

export const seedCategoryKeys = seedCategories.map((category) => category.key);

/** The specialty of the engineers who service a demo category. */
export const specialtyOf = (key: SeedCategory): EngineerSpecialty =>
	[...seedCategories, ...shltrCategories].find((category) => category.key === key)!.specialty;
