/**
 * Read access to the app under test's database, to check what the app stored (and `forgetTables`,
 * the one write).
 */
import { createClient, type InValue } from "@libsql/client";

import { lane } from "./lane.ts";

// The busy timeout: the app may be writing.
const client = createClient({ url: lane.databaseURL, timeout: 5000 });

/**
 * Runs a query against the app's database and returns its rows. Only for reading: tests change
 * data through the app, like a user would.
 */
export async function rows<T = Record<string, unknown>>(sql: string, args: InValue[] = []) {
	const result = await client.execute({ sql, args });
	return result.rows as unknown as T[];
}

/**
 * Forgets every user's tables (`table_memory`): the one thing a test file can't help leaving
 * behind, as every visit to a list remembers how it was left (see `table-memory.svelte.ts`), and
 * the next file on the worker would get it back. So each file starts without it (`useApp`).
 */
export async function forgetTables() {
	await client.execute("delete from table_memory");
}

/** The first column of the first row, e.g. of a `select count(*)`. */
export async function value<T = unknown>(sql: string, args: InValue[] = []) {
	const [row] = (await client.execute({ sql, args })).rows;
	return row?.[0] as T;
}

/** The number of rows in an organization's table. */
export async function countIn(table: string, organizationId: string) {
	return Number(
		await value(`select count(*) from "${table}" where organization_id = ?`, [organizationId]),
	);
}

/**
 * An organization's materials whose stock isn't the sum of their stock movements (to two
 * decimals), which should be none.
 */
export function unbalancedStock(organizationId: string) {
	return rows<{ sku: string; stock: number; movements: number }>(
		`select sku, stock, movements from (
			select m.sku, m.stock, round(coalesce(sum(s.quantity), 0), 2) as movements
			from material m left join stock_movement s on s.material_id = m.id
			where m.organization_id = ? group by m.id
		) where round(stock, 2) <> movements`,
		[organizationId],
	);
}

/** The next code in a sequence like `CUS-00061`: the highest number in use, plus one. */
export async function nextCode(table: string, column: string, organizationId: string) {
	const last = String(
		await value(
			`select "${column}" from "${table}" where organization_id = ?
			 order by cast(substr("${column}", length(rtrim("${column}", '0123456789')) + 1) as integer) desc
			 limit 1`,
			[organizationId],
		),
	);
	const [, prefix, digits] = /^(.*?)(\d+)$/.exec(last)!;
	return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
}

// --- Amounts ---------------------------------------------------------------------------------

/** An amount as shown, e.g. `-€1,234.50`, in cents. */
export const cents = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, "")) * 100);
