import { foreignKey, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { createdAt, organizationId } from "#lib/server/db/columns.ts";
import { customer } from "#lib/server/db/schema.ts";

/** A note about a customer. */
export const sampleNote = sqliteTable(
	"sample_note",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		customerId: integer("customer_id").notNull(),
		text: text("text").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
	],
);
