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

const data: Record<string, { columns: string[]; rows: unknown[][] }> = {};
for (const name of tables.map((table) => table.name as string)) {
	const result = await client.execute(`select * from "${name}"`);
	data[name] = {
		columns: result.columns,
		rows: result.rows.map((row) => result.columns.map((column) => row[column])),
	};
}
process.stdout.write(JSON.stringify(data));
client.close();
