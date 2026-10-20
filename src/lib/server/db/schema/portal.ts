// Customers' contacts who sign in to the customer portal (`src/routes/(customer)/portal`), and the
// orders they report there (`order_request`, see `#lib/server/auth/customer.ts`).
import { foreignKey, index, integer, primaryKey, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "../auth.schema.ts";
import { createdAt, tenantRef, tenantTable } from "../columns.ts";
import { customer, customerSite } from "./customers.ts";

/**
 * A customer's contact with access to the customer portal: a member of the tenant with the role
 * `customer`, linked to one of its customers. Made when the office invites them (by email, from
 * the customer's page), linked to their account when they accept (`userId`); revoking access
 * removes it with their membership. They see that customer's orders, units and sites: all its
 * sites, or only those in `portal_contact_site` when `allSites` is off.
 */
export const portalContact = tenantTable(
	"portal_contact",
	{
		customerId: integer("customer_id").notNull(),
		/** The address they were invited at, lower case. */
		email: text("email").notNull(),
		/** Their account, once they've accepted the invitation. */
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		/** The invitation they were sent, while it's pending (better-auth's, not a foreign key). */
		invitationId: text("invitation_id"),
		/** Whether they see all of the customer's sites (also those added later), or only some. */
		allSites: integer("all_sites", { mode: "boolean" }).notNull().default(true),
		createdAt: createdAt(),
	},
	(table) => [
		// For their sites, which must be their own customer's.
		uniqueIndex("portal_contact_customer_id").on(table.customerId, table.id),
		// A user is at most one customer's contact per tenant (the user first: also the key to
		// `user`), and an address is invited once.
		uniqueIndex("portal_contact_user_organization").on(table.userId, table.organizationId),
		uniqueIndex("portal_contact_organization_email").on(table.organizationId, table.email),
		index("portal_contact_organization_customer").on(table.organizationId, table.customerId),
		tenantRef(table, table.customerId, customer, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

/** The sites a portal contact without `allSites` sees: their customer's own. */
export const portalContactSite = tenantTable(
	"portal_contact_site",
	{
		contactId: integer("contact_id").notNull(),
		/** The contact's customer, whose site it must be. */
		customerId: integer("customer_id").notNull(),
		siteId: integer("site_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.contactId, table.siteId] }),
		// A site's contacts; with the customer, also the key to the site.
		index("portal_contact_site_site").on(table.siteId, table.customerId),
		index("portal_contact_site_organization_contact").on(table.organizationId, table.contactId),
		index("portal_contact_site_customer_contact").on(table.customerId, table.contactId),
		tenantRef(table, table.contactId, portalContact, { onDelete: "cascade" }),
		foreignKey({
			columns: [table.customerId, table.contactId],
			foreignColumns: [portalContact.customerId, portalContact.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customerId, table.siteId],
			foreignColumns: [customerSite.customerId, customerSite.id],
		}).onDelete("cascade"),
	],
	{ key: "own" },
);
