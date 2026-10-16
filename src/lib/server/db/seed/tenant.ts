import type { Faker } from "@faker-js/faker";

import type { SeedCategory } from "./categories.ts";
import { generateCustomers } from "./customers.ts";
import { generateEngineers } from "./engineers.ts";
import { generateEquipment, updateEquipmentStatus } from "./equipment.ts";
import { generateOrders } from "./orders.ts";

export interface TenantSize {
	customers: number;
	engineers: number;
	orders: number;
}

/**
 * Which demo company a tenant is: a Fieldworks installer (North and South) or SHLTR, which
 * installs and services doors, docks, stairs and airco (`docs/plans/shltr-domain.md`). A module's
 * seed with demo data of its own for SHLTR picks it by this, e.g. materials' parts.
 */
export type DemoProfile = "fieldworks" | "shltr";

/** A generated unit, in one of its tenant's categories (by key), with a name if it has one. */
export type SeedEquipment = Omit<ReturnType<typeof generateEquipment>[number], "category"> & {
	category: SeedCategory;
	name?: string;
};

/** One tenant's generated data, see `generateTenant` (and SHLTR's, `generateShltrTenant`). */
export interface TenantData {
	profile: DemoProfile;
	customers: ReturnType<typeof generateCustomers>;
	engineers: ReturnType<typeof generateEngineers>;
	equipments: SeedEquipment[];
	orders: ReturnType<typeof generateOrders>;
	/** What the modules' steps made, by module id: each module's own. */
	modules: Record<string, unknown>;
}

/** One tenant's core data so far, as a module's step in `generateTenant()` gets it. */
type TenantSoFar = Omit<TenantData, "orders"> & { faker: Faker };

/**
 * A module's steps in the core's generation, for a module whose demo data was once made in the
 * middle of it (materials): run at the same points, with the same faker, they keep the demo data
 * as it was. See `ModuleSeed.during`.
 */
export interface TenantSteps {
	/** Once the customers, engineers and equipment are made, before the orders. */
	afterEquipment?(draft: TenantSoFar): void;
	/** Once the orders are made, before the equipment's status follows them. */
	afterOrders?(draft: TenantSoFar & Pick<TenantData, "orders">): void;
}

/**
 * Generates one Fieldworks tenant's core data, with ids from 1 (they're shifted when inserted).
 * Orders only reference equipment owned by the same customer, get an engineer whose specialty fits
 * the equipment, have a status that matches their dates, and come after the customer joined and
 * the unit was installed. The order matters: it's the order the faker is used in, so changing it
 * changes the demo data. The tenant's modules' `steps` run at their points in it, in registry
 * order; the modules' seeds generate the rest of theirs after this, with the same faker (see
 * `module-seed.ts`).
 */
export function generateTenant(
	faker: Faker,
	size: TenantSize,
	steps: TenantSteps[] = [],
): TenantData {
	const profile = "fieldworks" as const;
	const modules: Record<string, unknown> = {};
	const customers = generateCustomers(faker, size.customers);
	const engineers = generateEngineers(faker, size.engineers);
	const equipments = generateEquipment(faker, customers);
	const draft = { faker, profile, customers, engineers, equipments, modules };
	for (const step of steps) step.afterEquipment?.(draft);
	const orders = generateOrders(faker, size.orders, { customers, equipments, engineers });
	for (const step of steps) step.afterOrders?.({ ...draft, orders });
	updateEquipmentStatus(faker, equipments, orders);

	return { profile, customers, engineers, equipments, orders, modules };
}
