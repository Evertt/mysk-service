/**
 * The SHLTR demo tenant's core data: a company that installs, services and inspects doors, docks,
 * stairs and airco for businesses with logistics and production buildings
 * (`docs/plans/shltr-domain.md`). Its customers, sites, units and orders are the client's mockup's
 * where it names them (Riedel B.V. in Ede and its units, the Connect page's customers and their
 * preferences, the planning's appointments), and made up around them where it doesn't, so the lists
 * and charts look like a real year's work. Like the Fieldworks tenants' (`../tenant.ts`), it's
 * deterministic for a seeded `faker`, relative to when the seed runs, and runs the tenant's modules'
 * steps (`TenantSteps`) at the same points.
 */
import type { Faker } from "@faker-js/faker";

import type { DemoProfile, SeedEquipment, TenantData, TenantSteps } from "../tenant.ts";
import { generateShltrCustomers } from "./customers.ts";
import { generateShltrEngineers } from "./engineers.ts";
import { generateShltrEquipment } from "./equipment.ts";
import { generateShltrOrders, updateShltrEquipmentStatus } from "./orders.ts";

/** How many customers SHLTR has besides the six the mockup names. */
const MADE_UP_CUSTOMERS = 36;

/**
 * SHLTR's core data, ids from 1, and where its units are: its customers' sites, and each unit's
 * site and place there (as `generateSites` has them).
 */
export function generateShltrTenant(faker: Faker, steps: TenantSteps[] = []) {
	const profile: DemoProfile = "shltr";
	const modules: Record<string, unknown> = {};
	const { customers: shltrCustomers, sites } = generateShltrCustomers(faker, MADE_UP_CUSTOMERS);
	const engineers = generateShltrEngineers(faker);
	const units = generateShltrEquipment(faker, shltrCustomers, sites);

	const customers = shltrCustomers.map(({ kind: _kind, share: _share, ...customer }) => customer);
	const equipments: SeedEquipment[] = units.map(
		({ siteId: _siteId, location: _location, counted: _counted, ...unit }) => unit,
	);
	const draft = { faker, profile, customers, engineers, equipments, modules };
	for (const step of steps) step.afterEquipment?.(draft);
	const orders = generateShltrOrders(faker, {
		customers: shltrCustomers,
		sites,
		units,
		engineers,
	});
	for (const step of steps) step.afterOrders?.({ ...draft, orders });
	const fixedStatus = new Map(
		units.filter((unit) => unit.counted).map((unit) => [unit.id, unit.status]),
	);
	updateShltrEquipmentStatus(faker, equipments, fixedStatus, orders);

	const data: TenantData = { profile, customers, engineers, equipments, orders, modules };
	const placed = {
		sites,
		units: new Map(
			units.map((unit) => [unit.id, { siteId: unit.siteId, location: unit.location }]),
		),
	};
	return { data, placed };
}
