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

const migrationsFolder = join(import.meta.dirname, "../../../../../../drizzle");

const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8")) as {
	entries: { idx: number; tag: string }[];
};

test("every change to the schema is in a migration", async () => {
	const last = journal.entries.at(-1)!;
	const snapshot = JSON.parse(
		readFileSync(
			join(migrationsFolder, `meta/${String(last.idx).padStart(4, "0")}_snapshot.json`),
			"utf8",
		),
	);
	const current = await generateSQLiteDrizzleJson(schema);
	// If this fails, run `pnpm db:generate --name <what-changed>` and commit the migration.
	expect(await generateSQLiteMigration(snapshot, current)).toEqual([]);
});

const folder = mkdtempSync(join(tmpdir(), "migrations-spec-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

test("the migrations build the schema's tables from an empty database", async () => {
	const client = createClient({ url: `file:${join(folder, "test.db")}` });
	await migrate(drizzle(client), { migrationsFolder });
	const { rows } = await client.execute(
		"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations'",
	);
	const tables = Object.values(schema).flatMap((value) =>
		is(value, SQLiteTable) ? [getTableName(value)] : [],
	);
	expect(new Set(rows.map((row) => row.name))).toEqual(new Set(tables));
	client.close();
});

test("the schedule's migration switches the schedule on for every organization there is", async () => {
	// The migrations before it, in a copy of the folder whose journal stops there.
	const before = join(folder, "before-schedule");
	cpSync(migrationsFolder, before, { recursive: true });
	const index = journal.entries.findIndex((entry) => entry.tag === "0003_enable-schedule");
	expect(index).toBeGreaterThan(0);
	writeFileSync(
		join(before, "meta/_journal.json"),
		JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
	);
	const client = createClient({ url: `file:${join(folder, "schedule.db")}` });
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
	// On since the organization was made: its time in milliseconds, the row's in seconds.
	expect(
		rows
			.filter((row) => row.module_id === "schedule")
			.map((row) => [row.organization_id, row.created_at]),
	).toEqual([
		["a", 1791000000],
		["b", 1792000000],
	]);
	expect(rows.map((row) => [row.organization_id, row.module_id])).toEqual([
		["a", "schedule"],
		["b", "contracts"],
		["b", "schedule"],
	]);
	client.close();
});
