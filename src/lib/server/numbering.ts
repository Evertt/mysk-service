import { sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import { formatCode, type NumberKind, sequenceStart } from "#lib/numbering.js";

import type { Transaction } from "./db/index.ts";
import { contract, customer, invoice, material, order } from "./db/schema.ts";
import { inTenant, type TenantTable } from "./session.ts";

/** The table and column that hold each kind's code or number. */
const storedIn: Record<NumberKind, { table: SQLiteTable & TenantTable; column: SQLiteColumn }> = {
	customer: { table: customer, column: customer.code },
	material: { table: material, column: material.sku },
	order: { table: order, column: order.number },
	contract: { table: contract, column: contract.number },
	invoice: { table: invoice, column: invoice.number },
};

/**
 * The current tenant's next code or number of `kind` (see `numberFormats`): one more than the
 * highest sequence it has, so a deleted record's number isn't reused unless it was the last. Call
 * it in the transaction that inserts the record, which is what stops two requests from picking
 * the same one (transactions take turns, see `serialize.ts`).
 */
export async function nextNumber(tx: Transaction, kind: NumberKind) {
	const { table, column } = storedIn[kind];
	const [row] = await tx
		.select({
			last: sql<number | null>`max(cast(substr(${column}, ${sequenceStart(kind)}) as integer))`,
		})
		.from(table)
		.where(inTenant(table));
	return formatCode(kind, (row?.last ?? 0) + 1);
}
