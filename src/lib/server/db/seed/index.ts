/**
 * Fills the database with fake, internally consistent data (see `generateTenant`): orders only
 * reference equipment owned by the same customer, get an engineer whose specialty fits the
 * equipment, have a status that matches their dates, and come after the customer joined and the
 * unit was installed. Equipment status reflects the open repair orders on it.
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
import { en, Faker, nl } from "@faker-js/faker";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { moduleIds } from "#lib/modules/ids.ts";

import { demoOrganizations, demoUsers } from "../demo.ts";
import { moduleSeeds } from "../module-seeds.gen.ts";
import * as moduleSchema from "../modules.gen.ts";
import * as schema from "../schema.ts";
import { addDays, now } from "./clock.ts";
import { type SeedTenant, seedCollectors } from "./module-seed.ts";
import { generateStockMovements } from "./stock.ts";
import { generateTenant } from "./tenant.ts";
import { createDemoUsers } from "./users.ts";

const { customer, engineer, equipment, material, order, orderLine } = schema;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const db = drizzle(createClient({ url: DATABASE_URL }), { schema: { ...schema, ...moduleSchema } });

/** The generator's randomness, in Dutch; seeded per tenant, so the data is the same every time. */
const faker = new Faker({ locale: [nl, en] });

/** Inserts in chunks to stay below SQLite's bound-parameter limit. */
async function insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
	for (let i = 0; i < rows.length; i += 100) await insert(rows.slice(i, i + 100));
}

// --- Tenants ---------------------------------------------------------------------------------

/**
 * The demo organizations. North has all the modules (also the ones added later in
 * `src/modules`); South only invoicing, so the other modules' tests (contracts, the schedule) have
 * a tenant without them.
 */
const tenants = [
	{
		...demoOrganizations.north,
		slug: "north",
		modules: [...moduleIds] as string[],
		seed: 20261005,
		size: { customers: 60, engineers: 18, orders: 750 },
	},
	{
		...demoOrganizations.south,
		slug: "south",
		modules: ["invoicing"] as string[],
		seed: 20261006,
		size: { customers: 30, engineers: 10, orders: 320 },
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
		schema.orderNote,
		schema.stockMovement,
		orderLine,
		order,
		equipment,
		material,
		engineer,
		customer,
		schema.organizationModule,
		schema.invitation,
		schema.member,
		schema.organization,
	]) {
		await tx.delete(table);
	}

	// Ids are global, so each tenant's ids continue where the previous tenant's ended.
	const offset = {
		customer: 0,
		engineer: 0,
		equipment: 0,
		material: 0,
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

		faker.seed(tenant.seed);
		const data = generateTenant(faker, tenant.size);
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
		const rows = {
			customers: data.customers.map((c) => ({ ...c, organizationId, id: c.id + o.customer })),
			engineers: data.engineers.map((e) => ({ ...e, organizationId, id: e.id + o.engineer })),
			equipments: data.equipments.map((e) => ({
				...e,
				organizationId,
				id: e.id + o.equipment,
				customerId: e.customerId + o.customer,
			})),
			materials: data.materials.map((m) => ({ ...m, organizationId, id: m.id + o.material })),
			orders: data.orders.map((r) => ({
				...r,
				organizationId,
				id: r.id + o.order,
				customerId: r.customerId + o.customer,
				equipmentId: r.equipmentId && r.equipmentId + o.equipment,
				engineerId: r.engineerId && r.engineerId + o.engineer,
			})),
			orderLines: data.orderLines.map((l) => ({
				...l,
				organizationId,
				orderId: l.orderId + o.order,
				materialId: l.materialId + o.material,
			})),
			stockMovements: generateStockMovements(data, tenant.seed).map((m) => ({
				...m,
				organizationId,
				materialId: m.materialId + o.material,
				orderId: m.orderId && m.orderId + o.order,
			})),
		};

		await insertAll(rows.customers, (chunk) => tx.insert(customer).values(chunk));
		await insertAll(rows.engineers, (chunk) => tx.insert(engineer).values(chunk));
		await insertAll(rows.equipments, (chunk) => tx.insert(equipment).values(chunk));
		await insertAll(rows.materials, (chunk) => tx.insert(material).values(chunk));
		await insertAll(rows.orders, (chunk) => tx.insert(order).values(chunk));
		await insertAll(rows.orderLines, (chunk) => tx.insert(orderLine).values(chunk));
		await insertAll(rows.stockMovements, (chunk) => tx.insert(schema.stockMovement).values(chunk));
		// Who created the latest orders, so the activity log starts with some history: the office
		// staff, not the field engineers.
		const members = demoUsers.filter((u) =>
			u.memberships.some((m) => m.organizationId === tenant.id && m.role !== "engineer"),
		);
		const created = rows.orders
			.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
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
		offset.customer += rows.customers.length;
		offset.engineer += rows.engineers.length;
		offset.equipment += rows.equipments.length;
		offset.material += rows.materials.length;
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
