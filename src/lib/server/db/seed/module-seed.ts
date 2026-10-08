/**
 * The seed of an optional module (`src/modules/<id>/server/seed.ts`, default export), which runs
 * after the core's data is in. `scripts/modules.ts` collects the seeders in
 * `db/module-seeds.gen.ts`, and `index.ts` runs them. Like the rest of the seed, it runs in plain
 * Node: import with `.ts` extensions, and from `#lib` only modules that don't need SvelteKit.
 */
import type { Faker } from "@faker-js/faker";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type { ModuleId } from "#lib/module-ids.ts";

import type * as moduleSchema from "../modules.gen.ts";
import type * as schema from "../schema.ts";

/** A transaction on the seed's database: the core's tables and the modules'. */
export type SeedTransaction = Parameters<
	Parameters<LibSQLDatabase<typeof schema & typeof moduleSchema>["transaction"]>[0]
>[0];

/** A seeded tenant that has the module, with the ids of the rows the core seeded for it. */
export interface SeedTenant {
	id: string;
	slug: string;
	/** All the modules the tenant has. */
	modules: string[];
	/** The tenant's seed: `faker.seed(tenant.seed)` makes a module's data the same every time. */
	seed: number;
	customerIds: number[];
	equipmentIds: number[];
	orderIds: number[];
}

export interface SeedContext {
	tx: SeedTransaction;
	faker: Faker;
	/** Only the tenants that have the module. */
	tenants: SeedTenant[];
	/** Inserts in chunks to stay below SQLite's bound-parameter limit. */
	insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void>;
	/** Adds to the summary the seed prints at the end. */
	count(table: string, rows: unknown[]): void;
}

export interface ModuleSeed {
	/** Modules whose seeds run before this one's, when it builds on their data. */
	after?: ModuleId[];
	/**
	 * Empties the module's tables (children before parents), before the core's data is replaced.
	 * Runs for every module, whether or not a tenant has it.
	 */
	clear?(tx: SeedTransaction): Promise<void>;
	/** Inserts the module's demo data for the tenants that have it. */
	run(context: SeedContext): Promise<void>;
}

/** Declares a module's seed. */
export const defineSeed = <const Seed extends ModuleSeed>(seed: Seed) => seed;

/** The seeds so every one runs after the ones it names in `after`, otherwise in the order given. */
export function orderSeeds<Seed extends { id: string; seed: ModuleSeed }>(seeds: Seed[]): Seed[] {
	const ordered: Seed[] = [];
	const visiting = new Set<string>();
	const visit = (entry: Seed) => {
		if (ordered.includes(entry)) return;
		if (visiting.has(entry.id)) throw new Error(`The seeds of ${entry.id} wait for each other.`);
		visiting.add(entry.id);
		for (const id of entry.seed.after ?? []) {
			const before = seeds.find((candidate) => candidate.id === id);
			if (before) visit(before);
		}
		visiting.delete(entry.id);
		ordered.push(entry);
	};
	seeds.forEach(visit);
	return ordered;
}
