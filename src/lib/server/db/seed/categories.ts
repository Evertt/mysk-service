import type { EngineerSpecialty } from "#lib/models.ts";

/**
 * The equipment categories every demo tenant has (`equipment_category`), in their order: named in
 * Dutch like the rest of the demo data, each with the specialty of the engineers who service it.
 * The generated equipment refers to them by `key`, which is the seed's own (the database has the
 * categories' ids); the modules' seeds pick units by it too, e.g. maintenance's plans for boilers.
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

/** A demo category by its key, e.g. `chiller`. */
export type SeedCategory = (typeof seedCategories)[number]["key"];

export const seedCategoryKeys = seedCategories.map((category) => category.key);

/** The specialty of the engineers who service a demo category. */
export const specialtyOf = (key: SeedCategory): EngineerSpecialty =>
	seedCategories.find((category) => category.key === key)!.specialty;
