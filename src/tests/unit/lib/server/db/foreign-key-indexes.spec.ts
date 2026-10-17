import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../../../../..");

const streams = [
	["drizzle/", join(root, "drizzle")],
	["cloudflare/migrations/", join(root, "cloudflare/migrations")],
] as const;

const folder = mkdtempSync(join(tmpdir(), "foreign-key-indexes-spec-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The rows of `sql`, with the columns of SQLite's pragma (or query) that the caller names. */
async function rowsOf<Row>(client: Client, sql: string) {
	return (await client.execute(sql)).rows as unknown as Row[];
}

/**
 * The columns of each of `table`'s indexes, and of its primary key, in their order. A partial
 * index is left out: SQLite can't use it to find every row that refers to a parent.
 */
async function indexedColumns(client: Client, table: string) {
	const lists: string[][] = [];
	const indexes = await rowsOf<{ name: string; partial: number }>(
		client,
		`pragma index_list(${quote(table)})`,
	);
	for (const index of indexes) {
		if (index.partial) continue;
		const columns = await rowsOf<{ name: string }>(
			client,
			`pragma index_info(${quote(index.name)})`,
		);
		lists.push(columns.map((column) => column.name));
	}
	const primaryKey = (
		await rowsOf<{ name: string; pk: number }>(client, `pragma table_info(${quote(table)})`)
	)
		.filter((column) => column.pk > 0)
		.toSorted((a, b) => a.pk - b.pk)
		.map((column) => column.name);
	if (primaryKey.length) lists.push(primaryKey);
	return lists;
}

/** `table`'s foreign keys: the table each refers to, and its own columns. */
async function foreignKeys(client: Client, table: string) {
	const rows = await rowsOf<{ id: number; seq: number; table: string; from: string }>(
		client,
		`pragma foreign_key_list(${quote(table)})`,
	);
	const keys = new Map<number, { parent: string; columns: string[] }>();
	for (const row of rows) {
		const key = keys.get(row.id) ?? { parent: row.table, columns: [] };
		key.columns[row.seq] = row.from;
		keys.set(row.id, key);
	}
	return [...keys.values()];
}

// Deleting a parent row, or inserting one while deferred foreign keys are still violated (as an
// import does), makes SQLite look for the rows that refer to it: without an index on the child's
// columns, a scan of the whole table, for every parent row. Its lookup is an equality on each of the
// columns, so an index serves it when its first columns are the key's, in any order.
test.each(streams)(
	"every foreign key the migrations of %s make has an index on its columns",
	async (name, stream) => {
		const client = createClient({ url: `file:${join(folder, `${name.replace(/\W/g, "")}.db`)}` });
		await migrate(drizzle(client), { migrationsFolder: stream });
		const tables = await rowsOf<{ name: string }>(
			client,
			"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations' order by name",
		);
		const keys: string[] = [];
		const unindexed: string[] = [];
		for (const { name: table } of tables) {
			const indexes = await indexedColumns(client, table);
			for (const { parent, columns } of await foreignKeys(client, table)) {
				const described = `${table}(${columns.join(", ")}) -> ${parent}`;
				keys.push(described);
				const covered = indexes.some((index) => {
					const first = new Set(index.slice(0, columns.length));
					return first.size === columns.length && columns.every((column) => first.has(column));
				});
				if (!covered) unindexed.push(described);
			}
		}
		client.close();
		expect(keys.length).toBeGreaterThan(100);
		expect(
			unindexed,
			"Give each of these foreign keys an index (in the table's schema, then `pnpm db:generate`) whose first columns are the key's",
		).toEqual([]);
	},
);
