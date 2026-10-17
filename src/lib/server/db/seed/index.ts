/**
 * Fills the database with fake, internally consistent data (see `generateTenant`): orders only
 * reference equipment owned by the same customer, get an engineer whose specialty fits the
 * equipment, have a status that matches their dates, and come after the customer joined and the
 * unit was installed. Equipment status reflects the open breakdowns and repairs on it.
 *
 * The demo is a Dutch field-service company's, so its texts are in Dutch: names, descriptions,
 * notes and the invoice lines' texts (stored text is in the language of whoever wrote it). Stored
 * enum values (statuses, units, regions, countries' English names, …) are translated when shown.
 *
 * Also (re)creates the demo users you can sign in with, see "Demo login" in README.md.
 *
 * Run with `pnpm db:seed` (after `pnpm db:migrate`). Replaces all existing business data. It runs
 * in plain Node (not through Vite), so the files in this folder import each other with `.ts`
 * extensions, and from `#lib` only modules that don't need SvelteKit.
 */
// First: the zone the demo data is made in, before anything reads it.
import "./time-zone.ts";
import "temporal-polyfill/global";
import { en, Faker, nl } from "@faker-js/faker";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { moduleIds } from "#lib/modules/ids.ts";

import { demoOrganizations, demoUsers } from "../demo.ts";
import { moduleSeeds } from "../module-seeds.gen.ts";
import * as moduleSchema from "../modules.gen.ts";
import * as schema from "../schema.ts";
import { seedCategories, shltrCategories } from "./categories.ts";
import { addDays, now } from "./clock.ts";
import { generateLocations, seedQrToken } from "./locations.ts";
import { type SeedTenant, seedCollectors } from "./module-seed.ts";
import { generateShltrTenant, shltrSignoffs } from "./shltr/index.ts";
import { generateSites } from "./sites.ts";
import { toDay, toMoment, toMomentOrNull } from "./temporal.ts";
import { generateTenant, type TenantSize, type TenantSteps } from "./tenant.ts";
import { createDemoUsers } from "./users.ts";

const { customer, engineer, equipment, order } = schema;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const db = drizzle(
	createClient({ url: DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }),
	{ schema: { ...schema, ...moduleSchema } },
);

/** The generator's randomness, in Dutch; seeded per tenant, so the data is the same every time. */
const faker = new Faker({ locale: [nl, en] });

/** Inserts in chunks to stay below SQLite's bound-parameter limit. */
async function insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
	for (let i = 0; i < rows.length; i += 100) await insert(rows.slice(i, i + 100));
}

// --- Tenants ---------------------------------------------------------------------------------

/**
 * A Fieldworks tenant's core data (`generateTenant`), and its customers' sites, which come from a
 * faker of their own, so the rest stays as it was before them.
 */
const fieldworksTenant =
	(size: TenantSize, seed: number) => (faker: Faker, steps: TenantSteps[]) => {
		const data = generateTenant(faker, size, steps);
		const siteFaker = new Faker({ locale: [nl, en] });
		siteFaker.seed(seed + 1000);
		return { data, placed: generateSites(siteFaker, data.customers, data.equipments) };
	};

/**
 * The modules only SHLTR has: what its business needs and a field-service company's doesn't
 * (Salvo's dock time management, the energy module's meters and doors), so North and South are the
 * tenants without them.
 */
const shltrOnly: readonly string[] = ["docks", "energy"];

/**
 * The demo organizations. North has all the modules (also the ones added later in
 * `src/modules`) but SHLTR's own (`shltrOnly`); South only invoicing and materials, so the other
 * modules' tests (contracts, the schedule) have a tenant without them. Materials were core until
 * they became a module, and both kept them; their tests switch them off for South to see a tenant
 * without them. SHLTR, the client's business (`shltr/`), has them all, and equipment categories of
 * its own; it comes last, so the Fieldworks tenants' ids (and the tests that know them) stay as
 * they were. SHLTR's done work is signed off (`signoffs`), so its work orders show signed in the
 * demo.
 */
const tenants = [
	{
		...demoOrganizations.north,
		slug: "north",
		modules: moduleIds.filter((id) => !shltrOnly.includes(id)) as string[],
		seed: 20261005,
		categories: seedCategories,
		generate: fieldworksTenant({ customers: 60, engineers: 18, orders: 750 }, 20261005),
	},
	{
		...demoOrganizations.south,
		slug: "south",
		modules: ["invoices", "materials"] as string[],
		seed: 20261006,
		categories: seedCategories,
		generate: fieldworksTenant({ customers: 30, engineers: 10, orders: 320 }, 20261006),
	},
	{
		...demoOrganizations.shltr,
		slug: "shltr",
		modules: [...moduleIds] as string[],
		seed: 20261016,
		categories: shltrCategories,
		generate: generateShltrTenant,
		signoffs: shltrSignoffs,
		// Breakdowns are SHLTR's "storingen", as standard. As a demo of the settings: surveys go by
		// SHLTR's own Dutch name, and damage, which SHLTR doesn't book as such, is hidden.
		orderTypes: [
			{ type: "survey", names: { nl: "Offerte-opname" }, hidden: false },
			{ type: "damage", names: {}, hidden: true },
		] as const,
	},
];

// --- Write -----------------------------------------------------------------------------------

/** Rows per table, for the summary. */
const totals: Record<string, number> = {};
const count = (table: string, rows: unknown[]) =>
	(totals[table] = (totals[table] ?? 0) + rows.length);

await db.transaction(async (tx) => {
	// The modules' tables first: they reference the core's.
	for (const { seed } of moduleSeeds.toReversed()) await seed.clear?.(tx);
	for (const table of [
		schema.activity,
		schema.savedView,
		schema.orderSignoff,
		schema.orderRequest,
		schema.orderNote,
		schema.portalContactSite,
		schema.portalContact,
		schema.orderUnit,
		order,
		equipment,
		schema.equipmentLocation,
		schema.equipmentCategory,
		schema.customerSite,
		engineer,
		customer,
		schema.organizationModule,
		schema.orderTypeSetting,
		schema.invitation,
		schema.member,
		schema.organization,
	]) {
		await tx.delete(table);
	}

	// Ids are global, so each tenant's ids continue where the previous tenant's ended.
	const offset = {
		category: 0,
		customer: 0,
		site: 0,
		location: 0,
		engineer: 0,
		equipment: 0,
		order: 0,
	};
	const seeded: SeedTenant<Record<string, unknown>>[] = [];
	// What each module's `generate()` made, by module id: for all the tenants so far (a module
	// continues where the tenants before left off), and for the tenant at hand.
	const generatedBefore: Record<string, unknown[]> = {};
	for (const tenant of tenants) {
		await tx.insert(schema.organization).values({
			id: tenant.id,
			name: tenant.name,
			slug: tenant.slug,
			createdAt: addDays(now, -800),
		});
		if (tenant.modules.length) {
			await tx
				.insert(schema.organizationModule)
				.values(tenant.modules.map((moduleId) => ({ organizationId: tenant.id, moduleId })));
		}
		// The order types the tenant renamed or hid; the others are as standard.
		if ("orderTypes" in tenant) {
			const settings = tenant.orderTypes.map((setting) => ({
				...setting,
				organizationId: tenant.id,
			}));
			await tx.insert(schema.orderTypeSetting).values(settings);
			count("orderTypeSettings", settings);
		}

		faker.seed(tenant.seed);
		// The steps of the tenant's modules in the core's generation (see `ModuleSeed.during`).
		const steps = moduleSeeds.flatMap(({ id, seed }) =>
			tenant.modules.includes(id) && seed.during ? [seed.during] : [],
		);
		const { data, placed } = tenant.generate(faker, steps);
		// The modules' data follows from the core's, with the same faker, and may add to it.
		const generated: Record<string, unknown> = {};
		for (const { id, seed } of moduleSeeds) {
			if (!tenant.modules.includes(id) || !seed.generate) continue;
			const before = (generatedBefore[id] ??= []);
			generated[id] = seed.generate({ ...data, faker }, before);
			before.push(generated[id]);
		}
		const organizationId = tenant.id;
		const o = { ...offset };
		// The places of the units at their sites, as locations.
		const { locations, locationOf } = generateLocations(placed.units);
		// The tenant's categories, in their order, and their ids by key.
		const categoryId = (key: string) =>
			tenant.categories.findIndex((category) => category.key === key) + 1 + o.category;
		const rows = {
			categories: tenant.categories.map(({ name, specialty }, position) => ({
				id: position + 1 + o.category,
				organizationId,
				name,
				specialty,
				position,
			})),
			customers: data.customers.map((c) => ({
				...c,
				organizationId,
				id: c.id + o.customer,
				createdAt: toMoment(c.createdAt),
			})),
			sites: placed.sites.map((s) => ({
				...s,
				organizationId,
				id: s.id + o.site,
				customerId: s.customerId + o.customer,
				createdAt: toMoment(s.createdAt),
			})),
			locations: locations.map((l) => ({
				...l,
				organizationId,
				id: l.id + o.location,
				siteId: l.siteId + o.site,
				qrToken: seedQrToken(tenant.slug, "location", l.id),
			})),
			engineers: data.engineers.map((e) => ({
				...e,
				organizationId,
				id: e.id + o.engineer,
				hiredAt: toDay(e.hiredAt),
			})),
			equipments: data.equipments.map(({ category, ...e }) => ({
				...e,
				organizationId,
				categoryId: categoryId(category),
				installedAt: toDay(e.installedAt),
				warrantyUntil: toDay(e.warrantyUntil),
				id: e.id + o.equipment,
				customerId: e.customerId + o.customer,
				siteId: placed.units.get(e.id)!.siteId + o.site,
				locationId: locationOf.has(e.id) ? locationOf.get(e.id)! + o.location : null,
				qrToken: seedQrToken(tenant.slug, "unit", e.serialNumber),
			})),
			orders: data.orders.map(({ equipmentIds: _units, ...r }) => ({
				...r,
				organizationId,
				createdAt: toMoment(r.createdAt),
				scheduledFor: toMomentOrNull(r.scheduledFor),
				completedAt: toMomentOrNull(r.completedAt),
				id: r.id + o.order,
				customerId: r.customerId + o.customer,
				engineerId: r.engineerId && r.engineerId + o.engineer,
			})),
			// Each order's units, in their order.
			orderUnits: data.orders.flatMap((r) =>
				r.equipmentIds.map((unit, position) => ({
					organizationId,
					orderId: r.id + o.order,
					customerId: r.customerId + o.customer,
					equipmentId: unit + o.equipment,
					position,
				})),
			),
			// The work orders' sign-offs, once the modules have added their orders.
			signoffs: ("signoffs" in tenant ? tenant.signoffs(data) : []).map((s) => ({
				...s,
				organizationId,
				orderId: s.orderId + o.order,
				signedAt: toMoment(s.signedAt),
			})),
		};

		await tx.insert(schema.equipmentCategory).values(rows.categories);
		await insertAll(rows.customers, (chunk) => tx.insert(customer).values(chunk));
		await insertAll(rows.sites, (chunk) => tx.insert(schema.customerSite).values(chunk));
		await insertAll(rows.locations, (chunk) => tx.insert(schema.equipmentLocation).values(chunk));
		await insertAll(rows.engineers, (chunk) => tx.insert(engineer).values(chunk));
		await insertAll(rows.equipments, (chunk) => tx.insert(equipment).values(chunk));
		await insertAll(rows.orders, (chunk) => tx.insert(order).values(chunk));
		await insertAll(rows.orderUnits, (chunk) => tx.insert(schema.orderUnit).values(chunk));
		await insertAll(rows.signoffs, (chunk) => tx.insert(schema.orderSignoff).values(chunk));
		// Who created the latest orders, so the activity log starts with some history: the office
		// staff, not the field engineers.
		const members = demoUsers.filter((u) =>
			u.memberships.some(
				(m) => m.organizationId === tenant.id && m.role !== "engineer" && m.role !== "customer",
			),
		);
		const created = rows.orders
			.toSorted((a, b) => Temporal.Instant.compare(a.createdAt, b.createdAt))
			.slice(-8)
			.map((row, i) => ({
				organizationId,
				userName: members[i % members.length].name,
				action: "created" as const,
				subjectType: "order",
				subjectId: String(row.id),
				subjectLabel: row.number,
				createdAt: row.createdAt,
			}));
		await tx.insert(schema.activity).values(created);
		count("activity", created);

		seeded.push({
			id: tenant.id,
			slug: tenant.slug,
			modules: tenant.modules,
			seed: tenant.seed,
			customerIds: rows.customers.map((row) => row.id),
			equipmentIds: rows.equipments.map((row) => row.id),
			orderIds: rows.orders.map((row) => row.id),
			data: generated,
			collect: seedCollectors(moduleSeeds, tenant, generated),
		});
		offset.category += rows.categories.length;
		offset.customer += rows.customers.length;
		offset.site += rows.sites.length;
		offset.location += rows.locations.length;
		offset.engineer += rows.engineers.length;
		offset.equipment += rows.equipments.length;
		offset.order += rows.orders.length;
		for (const [table, list] of Object.entries(rows)) count(table, list);
	}

	for (const { id, seed } of moduleSeeds) {
		const having = seeded
			.filter((tenant) => tenant.modules.includes(id))
			.map((tenant) => ({ ...tenant, data: tenant.data[id] }));
		await seed.run({ tx, faker, tenants: having, insertAll, count });
	}
});

await db.transaction(createDemoUsers);

console.log(
	`Seeded ${tenants.length} organizations (${tenants.map((t) => t.name).join(", ")}) with ` +
		Object.entries(totals)
			.map(([table, n]) => `${n} ${table}`)
			.join(", ") +
		`, and ${demoUsers.length} demo users.`,
);
