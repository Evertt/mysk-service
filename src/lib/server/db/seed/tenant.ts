import type { Faker } from "@faker-js/faker";

import { generateCustomers } from "./customers.ts";
import { generateEngineers } from "./engineers.ts";
import { generateEquipment, updateEquipmentStatus } from "./equipment.ts";
import { generateOrders } from "./orders.ts";

export interface TenantSize {
	customers: number;
	engineers: number;
	orders: number;
}

/** One tenant's core data so far, as a module's step in `generateTenant()` gets it. */
interface TenantSoFar {
	faker: Faker;
	customers: ReturnType<typeof generateCustomers>;
	engineers: ReturnType<typeof generateEngineers>;
	equipments: ReturnType<typeof generateEquipment>;
	/** What the modules' steps made, by module id: each module's own. */
	modules: Record<string, unknown>;
}

/**
 * A module's steps in the core's generation, for a module whose demo data was once made in the
 * middle of it (materials): run at the same points, with the same faker, they keep the demo data
 * as it was. See `ModuleSeed.during`.
 */
export interface TenantSteps {
	/** Once the customers, engineers and equipment are made, before the orders. */
	afterEquipment?(draft: TenantSoFar): void;
	/** Once the orders are made, before the equipment's status follows them. */
	afterOrders?(draft: TenantSoFar & { orders: ReturnType<typeof generateOrders> }): void;
}

/**
 * Generates one tenant's core data, with ids from 1 (they're shifted when inserted). Orders only
 * reference equipment owned by the same customer, get an engineer whose specialty fits the
 * equipment, have a status that matches their dates, and come after the customer joined and the
 * unit was installed. The order matters: it's the order the faker is used in, so changing it
 * changes the demo data. The tenant's modules' `steps` run at their points in it, in registry
 * order; the modules' seeds generate the rest of theirs after this, with the same faker (see
 * `module-seed.ts`).
 */
export function generateTenant(faker: Faker, size: TenantSize, steps: TenantSteps[] = []) {
	const modules: Record<string, unknown> = {};
	const customers = generateCustomers(faker, size.customers);
	const engineers = generateEngineers(faker, size.engineers);
	const equipments = generateEquipment(faker, customers);
	const draft = { faker, customers, engineers, equipments, modules };
	for (const step of steps) step.afterEquipment?.(draft);
	const orders = generateOrders(faker, size.orders, { customers, equipments, engineers });
	for (const step of steps) step.afterOrders?.({ ...draft, orders });
	updateEquipmentStatus(faker, equipments, orders);

	return { customers, engineers, equipments, orders, modules };
}

/** One tenant's generated data, see `generateTenant`. */
export type TenantData = ReturnType<typeof generateTenant>;
