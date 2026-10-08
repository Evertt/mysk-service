import { sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import {
	formatCode,
	type NumberFormat,
	type NumberKind,
	numberFormats,
	sequenceStart,
} from "#lib/numbering.ts";

import type { Transaction } from "./db/index.ts";
import { customer, material, order } from "./db/schema.ts";
import { inTenant, type TenantTable } from "./session.ts";

/** What numbers a kind of record: its format, and the tenant table and column that hold them. */
export interface NumberTarget {
	format: NumberFormat;
	table: SQLiteTable & TenantTable;
	column: SQLiteColumn;
}

/**
 * The core's kinds (see `numberFormats`). A module passes a `NumberTarget` of its own, with its
 * table, to `nextNumber()` instead.
 */
const coreTargets: Record<NumberKind, NumberTarget> = {
	customer: { format: numberFormats.customer, table: customer, column: customer.code },
	material: { format: numberFormats.material, table: material, column: material.sku },
	order: { format: numberFormats.order, table: order, column: order.number },
};

/**
 * The current tenant's next code or number of `kind` (see `numberFormats`, or a module's own
 * `NumberTarget`): one more than the highest sequence it has, so a deleted record's number isn't
 * reused unless it was the last. Call it in the transaction that inserts the record, which is what
 * stops two requests from picking the same one (transactions take turns, see `serialize.ts`).
 */
export async function nextNumber(tx: Transaction, kind: NumberKind | NumberTarget) {
	const { format, table, column } = typeof kind === "string" ? coreTargets[kind] : kind;
	const [row] = await tx
		.select({
			last: sql<number | null>`max(cast(substr(${column}, ${sequenceStart(format)}) as integer))`,
		})
		.from(table)
		.where(inTenant(table));
	return formatCode(format, (row?.last ?? 0) + 1);
}
