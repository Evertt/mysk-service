/**
 * The seed of an optional module (`src/modules/<id>/server/seed.ts`, default export).
 * `scripts/modules.ts` collects the seeders in `db/module-seeds.gen.ts`, and `index.ts` runs them
 * for the tenants that have the module, in two steps (and a module whose data the core's used to
 * make in the middle of its own, materials, also has steps `during` it):
 *
 * - `during`, steps the core's generation runs at fixed points (after the equipment, after the
 *   orders), with the tenant's faker there: so the faker is used in the same order as when the
 *   core made that data itself, and the demo data stays the same. What they make goes in the
 *   draft's `modules[<id>]`.
 * - `generate()`, per tenant as soon as the core's data for it is generated, with the tenant's
 *   faker where the core left it. That is the step for data that follows from the core's (a
 *   contract covers the customer's units) or adds to it (the call-outs a contract's response time
 *   is shown on): it can add to the draft, and the rest of the seed takes it from there. Keeping
 *   to this order keeps the demo data the same as it was before the module had a folder of its own.
 * - `run()`, once all the tenants and their core data are in, inserts what `generate()` made.
 *
 * What the module does at runtime through hooks (`#lib/server/extensions.ts`), it does at seed time
 * through collectors, which the seed of whoever consumes it asks without knowing the module:
 * `costs()` for `orders.costs`, `adjustPrices()` for `orders.adjustPrices`, `billableItems()` for
 * `invoices.billableItems`. They
 * answer from what the modules made in `generate()`, so a consumer asks in `run()` (a tenant's
 * `collect`), when every module's data is there, whatever the order the modules are in.
 *
 * Like the rest of the seed, it runs in plain Node: import with `.ts` extensions, and from `#lib`
 * only modules that don't need SvelteKit (types are free).
 */
import type { Faker } from "@faker-js/faker";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type { BillableItem, BillingPeriod } from "#lib/billing.ts";
import type { PriceAdjustment } from "#lib/orders/extensions.ts";

import type * as moduleSchema from "../modules.gen.ts";
import type * as schema from "../schema.ts";
import type { TenantData, TenantSteps } from "./tenant.ts";

/** A transaction on the seed's database: the core's tables and the modules'. */
export type SeedTransaction = Parameters<
	Parameters<LibSQLDatabase<typeof schema & typeof moduleSchema>["transaction"]>[0]
>[0];

/** One tenant's core data as `generateTenant()` made it: ids from 1, shifted when inserted. */
export type TenantDraft = TenantData & {
	/** The tenant's faker, where the core left it. */
	faker: Faker;
};

/** An order of a draft. */
export type SeedOrder = TenantData["orders"][number];

/** What an order costs besides labour, as a module adds it at seed time (like `OrderCost`). */
interface SeedCost {
	/** In Dutch, the demo's language. */
	label: string;
	amount: number;
}

/** An order's price before adjustments, at seed time: labour and the costs added up. */
interface SeedPrice {
	costs: number;
	labor: number;
}

/** What a module bills a customer for besides orders, at seed time. */
export type SeedBillableItem = BillableItem & { customerId: number };

/** A seeded tenant that has the module, with the ids of the rows the core seeded for it. */
export interface SeedTenant<Data = unknown> {
	id: string;
	slug: string;
	/** All the modules the tenant has. */
	modules: string[];
	/** The tenant's seed: `faker.seed(tenant.seed)` makes a module's data the same every time. */
	seed: number;
	/** The ids of the rows the core inserted: the draft's id `n` became `customerIds[n - 1]`. */
	customerIds: number[];
	equipmentIds: number[];
	orderIds: number[];
	/** What the module's `generate()` made for the tenant. */
	data: Data;
	/** What all of the tenant's modules say about prices and billing, see `SeedCollectors`. */
	collect: SeedCollectors;
}

interface SeedContext<Data = unknown> {
	tx: SeedTransaction;
	faker: Faker;
	/** Only the tenants that have the module. */
	tenants: SeedTenant<Data>[];
	/** Inserts in chunks to stay below SQLite's bound-parameter limit. */
	insertAll: <T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) => Promise<void>;
	/** Adds to the summary the seed prints at the end. */
	count: (table: string, rows: unknown[]) => void;
}

// `any`: a seed names the type of the data it generates, the registry holds seeds of all of them.
// oxlint-disable-next-line typescript/no-explicit-any
export interface ModuleSeed<Data = any> {
	/** Steps in the core's generation, for the tenants that have the module (see above). */
	during?: TenantSteps;
	/**
	 * Empties the module's tables (children before parents), before the core's data is replaced.
	 * Runs for every module, whether or not a tenant has it.
	 */
	clear?(tx: SeedTransaction): Promise<void>;
	/**
	 * Makes the module's data for a tenant that has it, once the core's is generated (see above).
	 * Ids are the tenant's own, from 1, like the draft's; `previous` is what this made for the
	 * tenants before, for the ones that must continue where those ended. May add to the draft.
	 */
	generate?(draft: TenantDraft, previous: Data[]): Data;
	/** Collector, like `orders.costs`: what an order costs besides labour. */
	costs?(data: Data, order: SeedOrder): SeedCost[];
	/** Collector, like `orders.adjustPrices`: changes to an order's price. */
	adjustPrices?(data: Data, order: SeedOrder, price: SeedPrice): PriceAdjustment[];
	/**
	 * Collector, like `invoices.billableItems`: what the tenant's customers are billed for besides
	 * orders in `period`. Ids in references are global, as in the database.
	 */
	billableItems?(data: Data, period: BillingPeriod): SeedBillableItem[];
	/** Inserts the module's demo data for the tenants that have it. */
	run(context: SeedContext<Data>): Promise<void>;
}

/** Declares a module's seed. */
export const defineSeed = <Data = undefined>(seed: ModuleSeed<Data>) => seed;

/** What a tenant's modules say about prices and billing, see `ModuleSeed`. */
export interface SeedCollectors {
	costs(order: SeedOrder): SeedCost[];
	adjustPrices(order: SeedOrder, price: SeedPrice): PriceAdjustment[];
	billableItems(period: BillingPeriod): SeedBillableItem[];
}

/**
 * The collectors of the `seeds` the tenant has, in the seeds' order, over `data` (what each made
 * for the tenant, by module id). The seed of invoicing bills what the others offer through these.
 */
export function seedCollectors(
	seeds: { id: string; seed: ModuleSeed }[],
	tenant: { modules: string[] },
	data: Record<string, unknown>,
): SeedCollectors {
	const own = seeds.filter(({ id }) => tenant.modules.includes(id));
	return {
		costs: (order) => own.flatMap(({ id, seed }) => seed.costs?.(data[id], order) ?? []),
		adjustPrices: (order, price) =>
			own.flatMap(({ id, seed }) => seed.adjustPrices?.(data[id], order, price) ?? []),
		billableItems: (period) =>
			own.flatMap(({ id, seed }) => seed.billableItems?.(data[id], period) ?? []),
	};
}
