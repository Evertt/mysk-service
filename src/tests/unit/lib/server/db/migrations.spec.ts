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
	await migrate(drizzle(client), { migrationsFolder });
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
