import { index, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { engineerSpecialties } from "#lib/models.ts";

import { user } from "../auth.schema.ts";
import { day, tenantTable } from "../columns.ts";

/** A field engineer who carries out orders. */
export const engineer = tenantTable(
	"engineer",
	{
		name: text("name").notNull(),
		email: text("email").notNull(),
		phone: text("phone").notNull(),
		specialty: text("specialty", { enum: engineerSpecialties }).notNull(),
		region: text("region").notNull(),
		/** In cents. */
		hourlyRate: integer("hourly_rate").notNull(),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		hiredAt: day("hired_at").notNull(),
		/** The user account they sign in to the engineer portal with, if any. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same email.
		uniqueIndex("engineer_organization_email").on(table.organizationId, table.email),
		// A user is at most one engineer per tenant. The user first: also the key to `user`.
		uniqueIndex("engineer_user_organization").on(table.userId, table.organizationId),
		index("engineer_organization_name").on(table.organizationId, table.name),
	],
	{ referenced: true },
);
