import { index, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { contactChannels, customerSegments, sitePriorities, weekdays } from "#lib/models.ts";

import { createdAt, tenantRef, tenantTable } from "../columns.ts";

/** A company that owns equipment and places orders. */
export const customer = tenantTable(
	"customer",
	{
		code: text("code").notNull(),
		name: text("name").notNull(),
		contactName: text("contact_name").notNull(),
		email: text("email").notNull(),
		phone: text("phone").notNull(),
		city: text("city").notNull(),
		country: text("country").notNull(),
		segment: text("segment", { enum: customerSegments }).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same code.
		uniqueIndex("customer_organization_code").on(table.organizationId, table.code),
		// The lists' filters search and sort customers by name.
		index("customer_organization_name").on(table.organizationId, table.name),
	],
	{ referenced: true },
);

/**
 * One of a customer's sites (`vestiging`), e.g. their warehouse in Ede: where their equipment is
 * and the engineers go. How the site likes to be contacted and visited, and how to get in, are the
 * site's, not the customer's. A customer has at least one.
 */
export const customerSite = tenantTable(
	"customer_site",
	{
		customerId: integer("customer_id").notNull(),
		/** E.g. "Ede" or "Hoofdvestiging". */
		name: text("name").notNull(),
		/** Street and number; empty for the sites made from a customer's city alone. */
		address: text("address").notNull().default(""),
		postalCode: text("postal_code").notNull().default(""),
		city: text("city").notNull(),
		country: text("country").notNull(),
		/** Who to ask for on site, if not the customer's contact. */
		contactName: text("contact_name"),
		contactPhone: text("contact_phone"),
		contactEmail: text("contact_email"),
		contactChannel: text("contact_channel", { enum: contactChannels }),
		preferredDay: text("preferred_day", { enum: weekdays }),
		/** When visits suit the site, as times of day (`07:00`, `15:00`): both or neither. */
		slotStart: text("slot_start"),
		slotEnd: text("slot_end"),
		priority: text("priority", { enum: sitePriorities }).notNull().default("normal"),
		/** How to get in and what to mind, e.g. "Melden bij receptie expeditie noord." */
		accessNotes: text("access_notes"),
		createdAt: createdAt(),
	},
	(table) => [
		// For equipment, which must be at a site of its own customer.
		uniqueIndex("customer_site_customer_id").on(table.customerId, table.id),
		index("customer_site_organization_customer").on(table.organizationId, table.customerId),
		tenantRef(table, table.customerId, customer, { onDelete: "cascade" }),
	],
	{ referenced: true },
);
