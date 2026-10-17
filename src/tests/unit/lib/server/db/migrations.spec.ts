import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { getTableName, is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, expect, test } from "vite-plus/test";

import * as moduleSchema from "#lib/server/db/modules.gen.ts";
import * as coreSchema from "#lib/server/db/schema.ts";

/** The core's tables and the modules'. */
const schema = { ...coreSchema, ...moduleSchema };

const root = join(import.meta.dirname, "../../../../../..");

/** libsql's migrations (a file, Turso). */
const migrationsFolder = join(root, "drizzle");

/** The Durable Object's (Cloudflare), plain SQLite; see `cloudflare/drizzle.config.ts`. */
const durableFolder = join(root, "cloudflare/migrations");

type Journal = { entries: { idx: number; tag: string }[] };

const readJournal = (folder: string): Journal =>
	JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8")) as Journal;

const journal = readJournal(migrationsFolder);

const streams = [
	["drizzle/", migrationsFolder],
	["cloudflare/migrations/", durableFolder],
] as const;

test.each(streams)("every change to the schema is in a migration of %s", async (_, stream) => {
	const last = readJournal(stream).entries.at(-1)!;
	const snapshot = JSON.parse(
		readFileSync(join(stream, `meta/${String(last.idx).padStart(4, "0")}_snapshot.json`), "utf8"),
	);
	const current = await generateSQLiteDrizzleJson(schema);
	// If this fails, run `pnpm db:generate --name <what-changed>` and commit the migrations.
	expect(await generateSQLiteMigration(snapshot, current)).toEqual([]);
});

const folder = mkdtempSync(join(tmpdir(), "migrations-spec-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

test.each(streams)(
	"the migrations of %s build the schema's tables from an empty database",
	async (name, stream) => {
		const client = createClient({ url: `file:${join(folder, `${name.replace(/\W/g, "")}.db`)}` });
		await migrate(drizzle(client), { migrationsFolder: stream });
		const { rows } = await client.execute(
			"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations'",
		);
		const tables = Object.values(schema).flatMap((value) =>
			is(value, SQLiteTable) ? [getTableName(value)] : [],
		);
		expect(new Set(rows.map((row) => row.name))).toEqual(new Set(tables));
		client.close();
	},
);

test("the Durable Object's migrations are plain SQLite, all bundled", () => {
	const { entries } = readJournal(durableFolder);
	const bundle = readFileSync(join(durableFolder, "migrations.js"), "utf8");
	for (const { idx, tag } of entries) {
		const sql = readFileSync(join(durableFolder, `${tag}.sql`), "utf8");
		// libsql's own `ALTER COLUMN`, which SQLite (and so a Durable Object) doesn't have.
		expect(sql, tag).not.toMatch(/alter\s+column/i);
		// SQLite in a Durable Object refuses these: its storage API makes the transactions, and its
		// foreign keys stay on. Deferring their checks to the commit is all it allows (see 0002).
		expect(sql, tag).not.toMatch(
			/^\s*(begin|commit|savepoint|pragma(?!\s+defer_foreign_keys\s*=\s*on\b))\b/im,
		);
		expect(bundle).toContain(`m${String(idx).padStart(4, "0")}`);
	}
});

test.each([
	["0003_enable-schedule", "schedule"],
	["0005_enable-materials", "materials"],
])("%s switches %s on for every organization there is", async (tag, moduleId) => {
	// The migrations before it, in a copy of the folder whose journal stops there.
	const before = join(folder, `before-${moduleId}`);
	cpSync(migrationsFolder, before, { recursive: true });
	const index = journal.entries.findIndex((entry) => entry.tag === tag);
	expect(index).toBeGreaterThan(0);
	writeFileSync(
		join(before, "meta/_journal.json"),
		JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
	);
	const client = createClient({ url: `file:${join(folder, `${moduleId}.db`)}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at)
		values ('a', 'A', 'a', 1791000000123), ('b', 'B', 'b', 1792000000999);
		insert into organization_module (organization_id, module_id) values ('b', 'contracts');
	`);
	await migrate(drizzle(client), { migrationsFolder });
	const { rows } = await client.execute(
		"select organization_id, module_id, created_at from organization_module order by 1, 2",
	);
	const own = rows.filter((row) => row.module_id === moduleId);
	// On since the organization was made: its time in milliseconds, the row's in seconds.
	expect(own.map((row) => [row.organization_id, row.created_at])).toEqual([
		["a", 1791000000],
		["b", 1792000000],
	]);
	// The other rows are left as they were.
	expect(
		rows
			.filter((row) => row.organization_id === "b" && row.module_id === "contracts")
			.map((row) => row.created_at),
	).toHaveLength(1);
	client.close();
});

/** A copy of a stream's folder whose journal stops before `tag`. */
function streamBefore(stream: string, tag: string, name: string) {
	const before = join(folder, name);
	cpSync(stream, before, { recursive: true });
	const own = readJournal(stream);
	const index = own.entries.findIndex((entry) => entry.tag === tag);
	expect(index).toBeGreaterThan(0);
	writeFileSync(
		join(before, "meta/_journal.json"),
		JSON.stringify({ ...own, entries: own.entries.slice(0, index) }),
	);
	return before;
}

/**
 * Two tenants' customers with equipment, and the records that refer to the units (an order, a
 * contract's coverage, a maintenance plan), as they were before customers had sites.
 */
const beforeSites = `
	insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 1), ('b', 'B', 'b', 2);
	insert into customer (id, organization_id, code, name, contact_name, email, phone, city, country, segment, created_at)
	values (1, 'a', 'C-1', 'Riedel', 'Jan', 'jan@riedel.nl', '0318 123456', 'Ede', 'Netherlands', 'enterprise', 100),
		(2, 'a', 'C-2', 'Vermeer', 'Els', 'els@vermeer.nl', '055 123456', 'Apeldoorn', 'Netherlands', 'mid_market', 200),
		(3, 'b', 'C-1', 'Pakhuis', 'Piet', 'piet@pakhuis.be', '+32 9 123 45 67', 'Gent', 'Belgium', 'small_business', 300);
	insert into equipment (id, organization_id, serial_number, model, manufacturer, category, status, customer_id, installed_at, warranty_until)
	values (10, 'a', 'S-10', 'ST 50', 'Hörmann', 'elevator', 'operational', 1, '2024-01-01', '2027-01-01'),
		(11, 'a', 'S-11', 'SR 60', 'Gorter', 'pump', 'operational', 1, '2024-01-01', '2027-01-01'),
		(30, 'b', 'S-30', 'C15', 'Daikin', 'chiller', 'operational', 3, '2024-01-01', '2027-01-01');
	insert into "order" (id, organization_id, number, customer_id, equipment_id, type, status, priority, description)
	values (100, 'a', 'O-1', 1, 10, 'repair', 'scheduled', 'normal', 'Deur hapert');
	insert into contract (id, organization_id, number, customer_id, level, starts_on, ends_on, monthly_fee, response_hours)
	values (200, 'a', 'K-1', 1, 'basic', '2026-01-01', '2026-12-31', 10000, 24);
	insert into contract_equipment (customer_id, contract_id, equipment_id) values (1, 200, 10);
	insert into maintenance_plan (id, organization_id, equipment_id, order_type, description, interval_months, next_due_on, anchor_day)
	values (300, 'a', 11, 'maintenance', 'Jaarlijks', 12, '2026-11-01', 1);
`;

/** What became of `beforeSites`: the sites, where the units are, and what refers to them. */
async function afterSites(client: ReturnType<typeof createClient>) {
	const all = async (sql: string) => (await client.execute(sql)).rows.map((row) => ({ ...row }));
	return {
		sites: await all(
			"select organization_id, customer_id, name, address, postal_code, city, country, priority from customer_site order by customer_id",
		),
		units: await all(
			"select e.id, s.name as site, e.name, e.location from equipment e join customer_site s on s.id = e.site_id and s.customer_id = e.customer_id order by e.id",
		),
		orders: await all('select id, equipment_id from "order"'),
		coverage: await all("select contract_id, equipment_id from contract_equipment"),
		plans: await all("select id, equipment_id from maintenance_plan"),
		keys: await all("pragma foreign_key_check"),
	};
}

const sitesMade = {
	sites: [
		{
			organization_id: "a",
			customer_id: 1,
			name: "Ede",
			address: "",
			postal_code: "",
			city: "Ede",
			country: "Netherlands",
			priority: "normal",
		},
		{
			organization_id: "a",
			customer_id: 2,
			name: "Apeldoorn",
			address: "",
			postal_code: "",
			city: "Apeldoorn",
			country: "Netherlands",
			priority: "normal",
		},
		{
			organization_id: "b",
			customer_id: 3,
			name: "Gent",
			address: "",
			postal_code: "",
			city: "Gent",
			country: "Belgium",
			priority: "normal",
		},
	],
	units: [
		{ id: 10, site: "Ede", name: null, location: null },
		{ id: 11, site: "Ede", name: null, location: null },
		{ id: 30, site: "Gent", name: null, location: null },
	],
	orders: [{ id: 100, equipment_id: 10 }],
	coverage: [{ contract_id: 200, equipment_id: 10 }],
	plans: [{ id: 300, equipment_id: 11 }],
	keys: [],
};

test("0010_add-customer-sites gives every customer a site of their own town, with their equipment", async () => {
	const before = streamBefore(migrationsFolder, "0010_add-customer-sites", "before-sites");
	const client = createClient({ url: `file:${join(folder, "sites.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeSites);
	// Up to the orders' units, which took their unit's column away.
	await migrate(drizzle(client), {
		migrationsFolder: streamBefore(migrationsFolder, "0012_order-units", "sites-until-units"),
	});
	expect(await afterSites(client)).toEqual(sitesMade);
	client.close();
});

test("the Durable Object's 0002_add-customer-sites does the same with its foreign keys on", async () => {
	const before = streamBefore(durableFolder, "0002_add-customer-sites", "before-sites-durable");
	const client = createClient({ url: `file:${join(folder, "sites-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeSites);
	// As the Durable Object runs it: in one transaction, its foreign keys enforced (libsql's
	// migrator switches them off; a batch keeps them on).
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	const statements = readFileSync(join(durableFolder, "0002_add-customer-sites.sql"), "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);
	await client.batch(statements, "write");
	expect(await afterSites(client)).toEqual(sitesMade);
	client.close();
});

/**
 * Two tenants' units of the fixed categories there were, with sites, and the records that refer to
 * the units (an order, a contract's coverage, a maintenance plan).
 */
const beforeCategories = `
	insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 1), ('b', 'B', 'b', 2);
	insert into customer (id, organization_id, code, name, contact_name, email, phone, city, country, segment, created_at)
	values (1, 'a', 'C-1', 'Riedel', 'Jan', 'jan@riedel.nl', '0318 123456', 'Ede', 'Netherlands', 'enterprise', 100),
		(3, 'b', 'C-1', 'Pakhuis', 'Piet', 'piet@pakhuis.be', '+32 9 123 45 67', 'Gent', 'Belgium', 'small_business', 300);
	insert into customer_site (id, organization_id, customer_id, name, city, country)
	values (5, 'a', 1, 'Ede', 'Ede', 'Netherlands'), (6, 'b', 3, 'Gent', 'Gent', 'Belgium');
	insert into equipment (id, organization_id, serial_number, model, manufacturer, category, status, customer_id, site_id, name, location, installed_at, warranty_until)
	values (10, 'a', 'S-10', 'ST 50', 'Kone', 'elevator', 'operational', 1, 5, 'Lift kantoor', 'Hal', '2024-01-01', '2027-01-01'),
		(11, 'a', 'S-11', 'SR 60', 'Grundfos', 'pump', 'needs_service', 1, 5, null, null, '2024-01-01', '2027-01-01'),
		(12, 'a', 'S-12', 'SR 70', 'Wilo', 'pump', 'operational', 1, 5, null, null, '2024-02-01', '2027-02-01'),
		(30, 'b', 'S-30', 'C15', 'Daikin', 'chiller', 'operational', 3, 6, null, null, '2024-01-01', '2027-01-01');
	insert into "order" (id, organization_id, number, customer_id, equipment_id, type, status, priority, description)
	values (100, 'a', 'O-1', 1, 10, 'repair', 'scheduled', 'normal', 'Deur hapert');
	insert into contract (id, organization_id, number, customer_id, level, starts_on, ends_on, monthly_fee, response_hours)
	values (200, 'a', 'K-1', 1, 'basic', '2026-01-01', '2026-12-31', 10000, 24);
	insert into contract_equipment (customer_id, contract_id, equipment_id) values (1, 200, 10);
	insert into maintenance_plan (id, organization_id, equipment_id, order_type, description, interval_months, next_due_on, anchor_day)
	values (300, 'a', 11, 'maintenance', 'Jaarlijks', 12, '2026-11-01', 1);
`;

/** What became of `beforeCategories`: the tenants' categories, their units, and what refers to them. */
async function afterCategories(client: ReturnType<typeof createClient>) {
	const all = async (sql: string) => (await client.execute(sql)).rows.map((row) => ({ ...row }));
	return {
		categories: await all(
			"select organization_id, name, specialty, position from equipment_category order by organization_id, position",
		),
		units: await all(
			"select e.id, e.organization_id, c.name as category, e.serial_number, e.status, e.site_id, e.name, e.location from equipment e join equipment_category c on c.id = e.category_id and c.organization_id = e.organization_id order by e.id",
		),
		orders: await all('select id, equipment_id from "order"'),
		coverage: await all("select contract_id, equipment_id from contract_equipment"),
		plans: await all("select id, equipment_id from maintenance_plan"),
		leftovers: await all("select name from sqlite_master where name like '__old_%'"),
		keys: await all("pragma foreign_key_check"),
	};
}

const categoriesMade = {
	// Only the categories each tenant's units had, by their Dutch names, in the old list's order.
	categories: [
		{ organization_id: "a", name: "Pomp", specialty: "plumbing", position: 4 },
		{ organization_id: "a", name: "Lift", specialty: "controls", position: 5 },
		{ organization_id: "b", name: "Koelmachine", specialty: "hvac", position: 1 },
	],
	units: [
		{
			id: 10,
			organization_id: "a",
			category: "Lift",
			serial_number: "S-10",
			status: "operational",
			site_id: 5,
			name: "Lift kantoor",
			location: "Hal",
		},
		{
			id: 11,
			organization_id: "a",
			category: "Pomp",
			serial_number: "S-11",
			status: "needs_service",
			site_id: 5,
			name: null,
			location: null,
		},
		{
			id: 12,
			organization_id: "a",
			category: "Pomp",
			serial_number: "S-12",
			status: "operational",
			site_id: 5,
			name: null,
			location: null,
		},
		{
			id: 30,
			organization_id: "b",
			category: "Koelmachine",
			serial_number: "S-30",
			status: "operational",
			site_id: 6,
			name: null,
			location: null,
		},
	],
	orders: [{ id: 100, equipment_id: 10 }],
	coverage: [{ contract_id: 200, equipment_id: 10 }],
	plans: [{ id: 300, equipment_id: 11 }],
	leftovers: [],
	keys: [],
};

test("0011_equipment-categories gives each tenant the categories its units had, and the units theirs", async () => {
	const before = streamBefore(migrationsFolder, "0011_equipment-categories", "before-categories");
	const client = createClient({ url: `file:${join(folder, "categories.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeCategories);
	await migrate(drizzle(client), {
		migrationsFolder: streamBefore(migrationsFolder, "0012_order-units", "categories-until-units"),
	});
	expect(await afterCategories(client)).toEqual(categoriesMade);
	client.close();
});

test("the Durable Object's 0003_equipment-categories does the same with its foreign keys on", async () => {
	const before = streamBefore(
		durableFolder,
		"0003_equipment-categories",
		"before-categories-durable",
	);
	const client = createClient({ url: `file:${join(folder, "categories-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeCategories);
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	const statements = readFileSync(join(durableFolder, "0003_equipment-categories.sql"), "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);
	await client.batch(statements, "write");
	expect(await afterCategories(client)).toEqual(categoriesMade);
	client.close();
});

/**
 * Two tenants' orders, with a unit and without, and every record that refers to an order: its
 * notes, sign-off, material lines and stock movements, an invoice line, and a maintenance plan's
 * last order, as they were while an order had one unit at most (`equipment_id`).
 */
const beforeUnits = `
	insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 1), ('b', 'B', 'b', 2);
	insert into customer (id, organization_id, code, name, contact_name, email, phone, city, country, segment, created_at)
	values (1, 'a', 'C-1', 'Riedel', 'Jan', 'jan@riedel.nl', '0318 123456', 'Ede', 'Netherlands', 'enterprise', 100),
		(2, 'a', 'C-2', 'Vermeer', 'Els', 'els@vermeer.nl', '055 123456', 'Apeldoorn', 'Netherlands', 'mid_market', 200),
		(3, 'b', 'C-1', 'Pakhuis', 'Piet', 'piet@pakhuis.be', '+32 9 123 45 67', 'Gent', 'Belgium', 'small_business', 300);
	insert into customer_site (id, organization_id, customer_id, name, city, country)
	values (5, 'a', 1, 'Ede', 'Ede', 'Netherlands'), (6, 'a', 2, 'Apeldoorn', 'Apeldoorn', 'Netherlands'),
		(7, 'b', 3, 'Gent', 'Gent', 'Belgium');
	insert into equipment_category (id, organization_id, name, specialty, position)
	values (1, 'a', 'Deur', 'mechanical', 0), (2, 'b', 'Koelmachine', 'hvac', 0);
	insert into equipment (id, organization_id, serial_number, model, manufacturer, category_id, status, customer_id, site_id, installed_at, warranty_until)
	values (10, 'a', 'S-10', 'ST 50', 'Hörmann', 1, 'operational', 1, 5, '2024-01-01', '2027-01-01'),
		(11, 'a', 'S-11', 'SR 60', 'Gorter', 1, 'operational', 1, 5, '2024-01-01', '2027-01-01'),
		(12, 'a', 'S-12', 'SR 70', 'Gorter', 1, 'operational', 2, 6, '2024-01-01', '2027-01-01'),
		(30, 'b', 'S-30', 'C15', 'Daikin', 2, 'operational', 3, 7, '2024-01-01', '2027-01-01');
	insert into engineer (id, organization_id, name, email, phone, specialty, region, hourly_rate, hired_at)
	values (40, 'a', 'Lev', 'lev@example.com', '06 1234 5678', 'mechanical', 'Gelderland', 6500, '2020-01-01');
	insert into "order" (id, organization_id, number, customer_id, equipment_id, engineer_id, type, status, priority, description, scheduled_for, completed_at, labor_hours, created_at)
	values (100, 'a', 'O-1', 1, 10, 40, 'repair', 'completed', 'high', 'Deur hapert', 1790000000, 1790003600, 2.5, 1789990000),
		(101, 'a', 'O-2', 1, null, null, 'installation', 'quote', 'normal', 'Nieuwe deur', null, null, 0, 1789990001),
		(102, 'a', 'O-3', 2, 12, 40, 'maintenance', 'invoiced', 'low', 'Onderhoud', 1790100000, 1790103600, 1, 1789990002),
		(103, 'b', 'O-1', 3, 30, null, 'inspection', 'scheduled', 'normal', 'Keuring', 1790200000, null, 0, 1789990003);
	insert into order_note (id, organization_id, order_id, text, created_at) values (110, 'a', 100, 'Veer vervangen', 1790001000);
	insert into order_signoff (order_id, organization_id, signer_name, signature, signed_at)
	values (100, 'a', 'Jan', 'data:image/png;base64,AAAA', 1790003600);
	insert into material (id, organization_id, sku, name, unit, unit_price, stock) values (120, 'a', 'VEER-1', 'Veer', 'piece', 2500, 9);
	insert into order_line (id, organization_id, order_id, material_id, quantity, unit_price) values (130, 'a', 100, 120, 1, 2500);
	insert into stock_movement (id, organization_id, material_id, quantity, kind, order_id, order_number, created_at)
	values (140, 'a', 120, -1, 'consumed', 100, 'O-1', 1790003600);
	insert into invoice (id, organization_id, number, customer_id, status, payment_term_days, vat_rate, issued_on)
	values (150, 'a', 'F-1', 2, 'sent', 30, 0.21, '2026-10-01');
	insert into invoice_line (id, organization_id, invoice_id, description, quantity, unit_price, amount, order_id, source)
	values (160, 'a', 150, 'Onderhoud O-3', 1, 6500, 6500, 102, 'order');
	insert into maintenance_plan (id, organization_id, equipment_id, order_type, description, interval_months, next_due_on, anchor_day, last_order_id, last_order_organization_id)
	values (170, 'a', 11, 'maintenance', 'Jaarlijks', 12, '2027-10-01', 1, 101, 'a'),
		(171, 'a', 10, 'inspection', 'Keuring', 12, '2027-10-01', 1, null, null);
`;

/** What became of `beforeUnits`: the orders, their units, and everything that refers to them. */
async function afterUnits(client: ReturnType<typeof createClient>) {
	const all = async (sql: string) => (await client.execute(sql)).rows.map((row) => ({ ...row }));
	return {
		columns: (await all("pragma table_info('order')")).map((column) => column.name),
		orders: await all('select * from "order" order by id'),
		units: await all("select * from order_unit order by order_id, position"),
		notes: await all("select id, order_id, text from order_note"),
		signoffs: await all("select order_id, signer_name from order_signoff"),
		lines: await all("select id, order_id, material_id, quantity from order_line"),
		movements: await all("select id, order_id, quantity from stock_movement"),
		invoiceLines: await all("select id, order_id, amount from invoice_line"),
		plans: await all(
			"select id, last_order_id, last_order_organization_id from maintenance_plan order by id",
		),
		leftovers: await all(
			"select name from sqlite_master where name like '\\_\\_%' escape '\\' and name != '__drizzle_migrations'",
		),
		keys: await all("pragma foreign_key_check"),
	};
}

/** One of `beforeUnits`'s orders as it is after the migration: all its columns but the unit's. */
const migratedOrder = (id: number, fields: Record<string, unknown>) => ({
	id,
	organization_id: "a",
	engineer_id: null,
	scheduled_for: null,
	completed_at: null,
	labor_hours: 0,
	...fields,
});

const unitsMade = {
	columns: [
		"id",
		"organization_id",
		"number",
		"customer_id",
		"engineer_id",
		"type",
		"status",
		"priority",
		"description",
		"scheduled_for",
		"completed_at",
		"labor_hours",
		"created_at",
	],
	orders: [
		migratedOrder(100, {
			number: "O-1",
			customer_id: 1,
			engineer_id: 40,
			type: "repair",
			status: "completed",
			priority: "high",
			description: "Deur hapert",
			scheduled_for: 1790000000,
			completed_at: 1790003600,
			labor_hours: 2.5,
			created_at: 1789990000,
		}),
		migratedOrder(101, {
			number: "O-2",
			customer_id: 1,
			type: "installation",
			status: "quote",
			priority: "normal",
			description: "Nieuwe deur",
			created_at: 1789990001,
		}),
		migratedOrder(102, {
			number: "O-3",
			customer_id: 2,
			engineer_id: 40,
			type: "maintenance",
			status: "invoiced",
			priority: "low",
			description: "Onderhoud",
			scheduled_for: 1790100000,
			completed_at: 1790103600,
			labor_hours: 1,
			created_at: 1789990002,
		}),
		migratedOrder(103, {
			organization_id: "b",
			number: "O-1",
			customer_id: 3,
			type: "inspection",
			status: "scheduled",
			priority: "normal",
			description: "Keuring",
			scheduled_for: 1790200000,
			created_at: 1789990003,
		}),
	],
	// Each order's unit, if it had one, as the first of its units; none for the installation.
	units: [
		{ organization_id: "a", order_id: 100, customer_id: 1, equipment_id: 10, position: 0 },
		{ organization_id: "a", order_id: 102, customer_id: 2, equipment_id: 12, position: 0 },
		{ organization_id: "b", order_id: 103, customer_id: 3, equipment_id: 30, position: 0 },
	],
	notes: [{ id: 110, order_id: 100, text: "Veer vervangen" }],
	signoffs: [{ order_id: 100, signer_name: "Jan" }],
	lines: [{ id: 130, order_id: 100, material_id: 120, quantity: 1 }],
	movements: [{ id: 140, order_id: 100, quantity: -1 }],
	invoiceLines: [{ id: 160, order_id: 102, amount: 6500 }],
	plans: [
		{ id: 170, last_order_id: 101, last_order_organization_id: "a" },
		{ id: 171, last_order_id: null, last_order_organization_id: null },
	],
	leftovers: [],
	keys: [],
};

test("0012_order-units makes each order's unit its first, keeping all that refers to orders", async () => {
	const before = streamBefore(migrationsFolder, "0012_order-units", "before-units");
	const client = createClient({ url: `file:${join(folder, "units.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeUnits);
	await migrate(drizzle(client), { migrationsFolder });
	expect(await afterUnits(client)).toEqual(unitsMade);
	client.close();
});

test("the Durable Object's 0004_order-units does the same with its foreign keys on", async () => {
	const before = streamBefore(durableFolder, "0004_order-units", "before-units-durable");
	const client = createClient({ url: `file:${join(folder, "units-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeUnits);
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	const statements = readFileSync(join(durableFolder, "0004_order-units.sql"), "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);
	await client.batch(statements, "write");
	expect(await afterUnits(client)).toEqual(unitsMade);
	client.close();
});

/**
 * `beforeSites`, and then the newest order and unit (the highest ids yet) made and deleted: the
 * tables' sequences are above their highest ids now.
 */
const beforeSequences = `${beforeSites}
	insert into equipment (id, organization_id, serial_number, model, manufacturer, category, status, customer_id, installed_at, warranty_until)
	values (40, 'a', 'S-40', 'SR 70', 'Wilo', 'pump', 'operational', 1, '2024-01-01', '2027-01-01');
	insert into "order" (id, organization_id, number, customer_id, equipment_id, type, status, priority, description)
	values (101, 'a', 'O-2', 1, 40, 'repair', 'quote', 'normal', 'Lekt');
	delete from "order" where id = 101;
	delete from equipment where id = 40;
`;

/** The ids a new unit and a new order get, once the migrations made the tables anew. */
async function nextIds(client: ReturnType<typeof createClient>) {
	await client.executeMultiple(`
		insert into equipment (organization_id, serial_number, model, manufacturer, category_id, status, customer_id, site_id, installed_at, warranty_until)
		select 'a', 'S-NEW', 'X', 'Y', (select min(id) from equipment_category where organization_id = 'a'),
			'operational', 1, (select min(id) from customer_site where customer_id = 1), '2026-01-01', '2028-01-01';
		insert into "order" (organization_id, number, customer_id, type, status, priority, description)
		values ('a', 'O-NEW', 1, 'repair', 'quote', 'normal', 'Nieuw');
	`);
	const id = async (sql: string) => (await client.execute(sql)).rows[0].id;
	return {
		unit: await id("select id from equipment where serial_number = 'S-NEW'"),
		order: await id(`select id from "order" where number = 'O-NEW'`),
		leftovers: (
			await client.execute(
				"select name from sqlite_master where name like '\\_\\_old%sequence' escape '\\'",
			)
		).rows.map((row) => row.name),
	};
}

test("the rebuilds of equipment and orders keep their sequences: deleted ids aren't given again", async () => {
	const before = streamBefore(migrationsFolder, "0010_add-customer-sites", "before-sequences");
	const client = createClient({ url: `file:${join(folder, "sequences.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeSequences);
	await migrate(drizzle(client), { migrationsFolder });
	expect(await nextIds(client)).toEqual({ unit: 41, order: 102, leftovers: [] });
	client.close();
});

test("the Durable Object's rebuilds keep them too, with their foreign keys on", async () => {
	const before = streamBefore(durableFolder, "0002_add-customer-sites", "before-sequences-durable");
	const client = createClient({ url: `file:${join(folder, "sequences-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeSequences);
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	for (const tag of [
		"0002_add-customer-sites",
		"0003_equipment-categories",
		"0004_order-units",
		"0005_add-checklist-templates",
		"0006_add-checklists",
		"0007_equipment-locations",
	]) {
		const statements = readFileSync(join(durableFolder, `${tag}.sql`), "utf8")
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter(Boolean);
		await client.batch(statements, "write");
	}
	expect(await nextIds(client)).toEqual({ unit: 41, order: 102, leftovers: [] });
	client.close();
});

/**
 * A unit with its conditions before they could be a component's, the newest (the highest id yet)
 * deleted: the rebuild of `unit_condition` that gives it `component_id` keeps the rest, each the
 * unit's as a whole, and its sequence.
 */
const beforeComponents = `
	insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 1);
	insert into customer (id, organization_id, code, name, contact_name, email, phone, city, country, segment)
	values (1, 'a', 'C-1', 'Riedel', 'Ann', 'ann@riedel.test', '1', 'Ede', 'NL', 'enterprise');
	insert into customer_site (id, organization_id, customer_id, name, city, country)
	values (1, 'a', 1, 'Ede', 'Ede', 'NL');
	insert into equipment_category (id, organization_id, name, specialty, position)
	values (1, 'a', 'Sectionaaldeuren', null, 0);
	insert into equipment (id, organization_id, serial_number, name, model, manufacturer, category_id, status, customer_id, site_id, installed_at, warranty_until)
	values (10, 'a', 'SN-10', 'Deur 10', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01');
	insert into unit_condition (id, organization_id, equipment_id, score, advice, source, recorded_at)
	values (5, 'a', 10, 71, null, 'office', 100), (6, 'a', 10, 22, 'Veerpakket vervangen', 'office', 200),
		(7, 'a', 10, 30, null, 'office', 300);
	delete from unit_condition where id = 7;
`;

/** The conditions after the rebuild, and the id a new one gets. */
async function afterComponents(client: ReturnType<typeof createClient>) {
	await client.execute(
		"insert into unit_condition (organization_id, equipment_id, score, source, recorded_at) values ('a', 10, 50, 'office', 400)",
	);
	const found = await client.execute(
		"select id, equipment_id, component_id, score, advice from unit_condition order by id",
	);
	return found.rows.map((row) => ({ ...row }));
}

const componentsMade = [
	{ id: 5, equipment_id: 10, component_id: null, score: 71, advice: null },
	{ id: 6, equipment_id: 10, component_id: null, score: 22, advice: "Veerpakket vervangen" },
	{ id: 8, equipment_id: 10, component_id: null, score: 50, advice: null },
];

test("0026_add-components keeps the conditions and their sequence", async () => {
	const before = streamBefore(migrationsFolder, "0026_add-components", "before-components");
	const client = createClient({ url: `file:${join(folder, "components.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeComponents);
	await migrate(drizzle(client), { migrationsFolder });
	expect(await afterComponents(client)).toEqual(componentsMade);
	client.close();
});

test("the Durable Object's 0018_add-components does the same with its foreign keys on", async () => {
	const before = streamBefore(durableFolder, "0018_add-components", "before-components-durable");
	const client = createClient({ url: `file:${join(folder, "components-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeComponents);
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	const statements = readFileSync(join(durableFolder, "0018_add-components.sql"), "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);
	await client.batch(statements, "write");
	expect(await afterComponents(client)).toEqual(componentsMade);
	client.close();
});

/**
 * Two tenants' units at their sites, with the places they had as text (some the same but for case
 * and spaces, some empty), and the records that refer to the units: an order's unit, a contract's
 * coverage and a maintenance plan.
 */
const beforeLocations = `
	insert into organization (id, name, slug, created_at) values ('a', 'A', 'a', 1), ('b', 'B', 'b', 2);
	insert into customer (id, organization_id, code, name, contact_name, email, phone, city, country, segment, created_at)
	values (1, 'a', 'C-1', 'Riedel', 'Jan', 'jan@riedel.nl', '0318 123456', 'Ede', 'Netherlands', 'enterprise', 100),
		(3, 'b', 'C-1', 'Pakhuis', 'Piet', 'piet@pakhuis.be', '+32 9 123 45 67', 'Gent', 'Belgium', 'small_business', 300);
	insert into customer_site (id, organization_id, customer_id, name, city, country)
	values (5, 'a', 1, 'Ede', 'Ede', 'Netherlands'), (6, 'a', 1, 'Arnhem', 'Arnhem', 'Netherlands'),
		(7, 'b', 3, 'Gent', 'Gent', 'Belgium');
	insert into equipment_category (id, organization_id, name, specialty, position)
	values (1, 'a', 'Deur', 'mechanical', 0), (2, 'b', 'Koelmachine', 'hvac', 0);
	insert into equipment (id, organization_id, serial_number, model, manufacturer, category_id, status, customer_id, site_id, name, location, installed_at, warranty_until)
	values (10, 'a', 'S-10', 'SPU F42', 'Hörmann', 1, 'operational', 1, 5, 'Deur D-17', 'Dock 03', '2024-01-01', '2027-01-01'),
		(11, 'a', 'S-11', 'HLS 2', 'Hörmann', 1, 'operational', 1, 5, null, ' dock 03 ', '2024-01-01', '2027-01-01'),
		(12, 'a', 'S-12', 'SR 60', 'Gorter', 1, 'needs_service', 1, 5, null, 'Expeditie noord', '2024-01-01', '2027-01-01'),
		(13, 'a', 'S-13', 'SR 30', 'Gorter', 1, 'operational', 1, 5, null, null, '2024-01-01', '2027-01-01'),
		(14, 'a', 'S-14', 'SR 30', 'Gorter', 1, 'operational', 1, 5, null, '  ', '2024-01-01', '2027-01-01'),
		(15, 'a', 'S-15', 'SPU F42', 'Hörmann', 1, 'operational', 1, 6, null, 'Dock 03', '2024-01-01', '2027-01-01'),
		(30, 'b', 'S-30', 'C15', 'Daikin', 2, 'operational', 3, 7, null, 'Kantine', '2024-01-01', '2027-01-01'),
		(31, 'b', 'S-31', 'C16', 'Daikin', 2, 'operational', 3, 7, null, 'kantine', '2024-01-01', '2027-01-01');
	insert into "order" (id, organization_id, number, customer_id, type, status, priority, description)
	values (100, 'a', 'O-1', 1, 'repair', 'scheduled', 'normal', 'Deur hapert');
	insert into order_unit (organization_id, order_id, customer_id, equipment_id, position)
	values ('a', 100, 1, 10, 0), ('a', 100, 1, 11, 1);
	insert into contract (id, organization_id, number, customer_id, level, starts_on, ends_on, monthly_fee, response_hours)
	values (200, 'a', 'K-1', 1, 'basic', '2026-01-01', '2026-12-31', 10000, 24);
	insert into contract_equipment (customer_id, contract_id, equipment_id) values (1, 200, 12);
	insert into maintenance_plan (id, organization_id, equipment_id, order_type, description, interval_months, next_due_on, anchor_day)
	values (300, 'a', 13, 'maintenance', 'Jaarlijks', 12, '2026-11-01', 1);
`;

/** What became of `beforeLocations`: the locations, the units at them, and what refers to them. */
async function afterLocations(client: ReturnType<typeof createClient>) {
	const all = async (sql: string) => (await client.execute(sql)).rows.map((row) => ({ ...row }));
	const tokens = await all(
		"select qr_token as token from equipment union all select qr_token from equipment_location",
	);
	return {
		columns: (await all("pragma table_info('equipment')")).map((column) => column.name),
		locations: await all(
			"select organization_id, site_id, name, description, position from equipment_location order by id",
		),
		units: await all(
			"select e.id, e.status, e.site_id, l.name as location from equipment e left join equipment_location l on l.id = e.location_id and l.site_id = e.site_id order by e.id",
		),
		// Every unit and location has a token of its own, as the app makes them.
		tokens: {
			count: tokens.length,
			distinct: new Set(tokens.map((row) => row.token)).size,
			wellFormed: tokens.every(
				(row) => typeof row.token === "string" && /^[0-9a-f]{24}$/.test(row.token),
			),
		},
		orderUnits: await all(
			"select order_id, equipment_id, position from order_unit order by position",
		),
		coverage: await all("select contract_id, equipment_id from contract_equipment"),
		plans: await all("select id, equipment_id from maintenance_plan"),
		leftovers: await all(
			"select name from sqlite_master where name like '\\_\\_%' escape '\\' and name != '__drizzle_migrations'",
		),
		keys: await all("pragma foreign_key_check"),
	};
}

const locationsMade = {
	columns: [
		"id",
		"organization_id",
		"serial_number",
		"model",
		"manufacturer",
		"category_id",
		"status",
		"customer_id",
		"site_id",
		"name",
		"location_id",
		"installed_at",
		"warranty_until",
		"qr_token",
	],
	// One per place at a site, whatever its case and spaces, in alphabetical order.
	locations: [
		{ organization_id: "a", site_id: 5, name: "Dock 03", description: null, position: 0 },
		{ organization_id: "a", site_id: 5, name: "Expeditie noord", description: null, position: 1 },
		{ organization_id: "a", site_id: 6, name: "Dock 03", description: null, position: 0 },
		{ organization_id: "b", site_id: 7, name: "Kantine", description: null, position: 0 },
	],
	units: [
		{ id: 10, status: "operational", site_id: 5, location: "Dock 03" },
		{ id: 11, status: "operational", site_id: 5, location: "Dock 03" },
		{ id: 12, status: "needs_service", site_id: 5, location: "Expeditie noord" },
		{ id: 13, status: "operational", site_id: 5, location: null },
		{ id: 14, status: "operational", site_id: 5, location: null },
		{ id: 15, status: "operational", site_id: 6, location: "Dock 03" },
		{ id: 30, status: "operational", site_id: 7, location: "Kantine" },
		{ id: 31, status: "operational", site_id: 7, location: "Kantine" },
	],
	tokens: { count: 12, distinct: 12, wellFormed: true },
	orderUnits: [
		{ order_id: 100, equipment_id: 10, position: 0 },
		{ order_id: 100, equipment_id: 11, position: 1 },
	],
	coverage: [{ contract_id: 200, equipment_id: 12 }],
	plans: [{ id: 300, equipment_id: 13 }],
	leftovers: [],
	keys: [],
};

test("0015_equipment-locations makes the units' places locations, keeping all that refers to units", async () => {
	const before = streamBefore(migrationsFolder, "0015_equipment-locations", "before-locations");
	const client = createClient({ url: `file:${join(folder, "locations.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeLocations);
	await migrate(drizzle(client), { migrationsFolder });
	expect(await afterLocations(client)).toEqual(locationsMade);
	client.close();
});

test("the Durable Object's 0007_equipment-locations does the same with its foreign keys on", async () => {
	const before = streamBefore(
		durableFolder,
		"0007_equipment-locations",
		"before-locations-durable",
	);
	const client = createClient({ url: `file:${join(folder, "locations-durable.db")}` });
	await migrate(drizzle(client), { migrationsFolder: before });
	await client.executeMultiple(beforeLocations);
	expect((await client.execute("pragma foreign_keys")).rows[0].foreign_keys).toBe(1);
	const statements = readFileSync(join(durableFolder, "0007_equipment-locations.sql"), "utf8")
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);
	await client.batch(statements, "write");
	expect(await afterLocations(client)).toEqual(locationsMade);
	client.close();
});
