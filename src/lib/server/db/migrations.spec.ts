import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { getTableName, is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, expect, test } from "vite-plus/test";

import * as moduleSchema from "./modules.gen.ts";
import * as coreSchema from "./schema.ts";

/** The core's tables and the modules'. */
const schema = { ...coreSchema, ...moduleSchema };

const migrationsFolder = join(import.meta.dirname, "../../../../drizzle");

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
