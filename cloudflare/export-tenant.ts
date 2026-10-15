/**
 * SPIKE: writes one organization's rows of a seeded libsql database as JSON, for the Durable
 * Object import (`POST /__spike/import`, see `entry.ts`). Its users and their accounts come along,
 * so a user of two organizations is copied into both objects.
 *
 *     node cloudflare/export-tenant.ts file:seed.db north > north.json
 */
import { createClient } from "@libsql/client";

const [url, slug] = process.argv.slice(2);
const client = createClient({ url });

const { rows: orgs } = await client.execute({
	sql: "SELECT id FROM organization WHERE slug = ?",
	args: [slug],
});
const orgId = orgs[0]?.id;
if (!orgId) throw new Error(`No organization ${slug}`);

const { rows: tables } = await client.execute(
	"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\'",
);

/** Each table's WHERE clause for the organization's rows; tables without one are left out. */
async function scope(table: string): Promise<string | undefined> {
	const { rows } = await client.execute(`SELECT name FROM pragma_table_info('${table}')`);
	if (rows.some((row) => row.name === "organization_id")) return "organization_id = :org";
	switch (table) {
		case "organization":
			return "id = :org";
		case "user":
			return "id IN (SELECT user_id FROM member WHERE organization_id = :org)";
		case "account":
			return "user_id IN (SELECT user_id FROM member WHERE organization_id = :org)";
		case "contract_equipment":
			return "contract_id IN (SELECT id FROM contract WHERE organization_id = :org)";
		default:
			return undefined; // session, verification: start empty
	}
}

const out: Record<string, { columns: string[]; rows: unknown[][] }> = {};
for (const { name } of tables) {
	const table = String(name);
	const where = await scope(table);
	if (!where) continue;
	const result = await client.execute({
		sql: `SELECT * FROM "${table}" WHERE ${where}`,
		args: { org: orgId },
	});
	out[table] = {
		columns: result.columns,
		rows: result.rows.map((row) => result.columns.map((column) => row[column])),
	};
}
process.stdout.write(JSON.stringify(out));
