/**
 * Writes the data of a libsql database (a file, or Turso) as JSON, for the Durable Object's import
 * (`POST /_ops/import`, see `entry.ts`), which replaces the data of the tables it holds:
 *
 *     node cloudflare/export-database.ts file:local.db > export.json
 *     curl -X POST https://<worker>/_ops/import -H "Authorization: Bearer $OPS_TOKEN" --data-binary @export.json
 *
 * For Turso, `DATABASE_AUTH_TOKEN` is read from the environment. Both databases must be at the same
 * schema (both fully migrated). The import is one request, so a database of tens of megabytes is
 * fine, much larger ones not (Workers take at most 100 MB per request).
 *
 * The tables come parents first (`parentsFirst()`), which the import keeps: it inserts in this order
 * and deletes in the reverse.
 */
import { createClient } from "@libsql/client";

const [url] = process.argv.slice(2);
if (!url) {
	console.error("Usage: node cloudflare/export-database.ts <libsql url>");
	process.exit(1);
}
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });

const { rows: tables } = await client.execute(
	// Not SQLite's own tables, nor the migrations' log: the Durable Object keeps its own.
	"select name from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\' and name != '__drizzle_migrations'",
);

/**
 * `names` with every table after the tables its foreign keys reference (a cycle's tables, which no
 * order satisfies, last, by name). The import defers the keys, but SQLite looks for a parent's
 * children when it inserts the parent while any key is unsatisfied: a full scan of each child table
 * per parent row where the key has no index. In this order no key is unsatisfied, and each check is
 * one lookup of the parent.
 */
async function parentsFirst(names: string[]) {
	const parents = new Map<string, Set<string>>();
	for (const name of names) {
		const { rows } = await client.execute({
			sql: 'select distinct "table" from pragma_foreign_key_list(?)',
			args: [name],
		});
		const references = rows.map((row) => row.table as string);
		parents.set(
			name,
			new Set(references.filter((table) => table !== name && names.includes(table))),
		);
	}
	const ordered: string[] = [];
	let ready = names.filter((name) => !parents.get(name)!.size);
	while (ready.length) {
		ordered.push(...ready);
		for (const name of ready) parents.delete(name);
		for (const references of parents.values()) for (const name of ready) references.delete(name);
		ready = [...parents.keys()].filter((name) => !parents.get(name)!.size);
	}
	return [...ordered, ...[...parents.keys()].sort()];
}

const data: Record<string, { columns: string[]; rows: unknown[][] }> = {};
for (const name of await parentsFirst(tables.map((table) => table.name as string))) {
	const result = await client.execute(`select * from "${name}"`);
	data[name] = {
		columns: result.columns,
		rows: result.rows.map((row) => result.columns.map((column) => row[column])),
	};
}
process.stdout.write(JSON.stringify(data));
client.close();
