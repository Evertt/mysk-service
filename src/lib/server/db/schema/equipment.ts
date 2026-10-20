import { sql } from "drizzle-orm";
import { foreignKey, index, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { engineerSpecialties, equipmentStatuses } from "#lib/models.ts";

import { createdAt, day, tenantRef, tenantTable } from "../columns.ts";
import { customer, customerSite } from "./customers.ts";

/**
 * One of the tenant's own kinds of equipment, e.g. "Sectionaaldeur" or "Koelmachine": managers
 * name them, put them in order and say which engineer specialty services each (see
 * `#lib/equipment/categories/`). A category that units have can't be deleted.
 */
export const equipmentCategory = tenantTable(
	"equipment_category",
	{
		name: text("name").notNull(),
		/** The specialty of the engineers who service it; none when no specialty fits. */
		specialty: text("specialty", { enum: engineerSpecialties }),
		/** Where it comes in the tenant's categories (the form's select, the list's sort), from 0. */
		position: integer("position").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant, whatever the case: "Lift" and "lift" are the same category.
		uniqueIndex("equipment_category_organization_name").on(
			table.organizationId,
			sql`lower(${table.name})`,
		),
		index("equipment_category_organization_position").on(table.organizationId, table.position),
	],
	{ referenced: true },
);

/**
 * A random, unguessable token for a QR code (`/q/<token>`, see `#lib/equipment/server/qr.ts`):
 * 24 hex digits (96 bits), unique across tenants. The app makes them itself (`newQrToken()`); the
 * default is for rows made in SQL (migrations, test fixtures).
 */
const qrToken = () =>
	text("qr_token")
		.notNull()
		.default(sql`(lower(hex(randomblob(12))))`);

/**
 * A named place at a customer's site, e.g. "Expeditie noord", "Dock 03" or "Kantoor 1e": where the
 * site's units are, with a QR code of its own (on the door, say) that opens it. The site's units
 * can be at one; a location with units can't be deleted. Its name is unique at its site, whatever
 * the case.
 */
export const equipmentLocation = tenantTable(
	"equipment_location",
	{
		/** The customer's site it's at (and so the customer's). */
		siteId: integer("site_id").notNull(),
		name: text("name").notNull(),
		/** What helps to find it, e.g. "Achter de kantine, tweede deur links". */
		description: text("description"),
		/** Where it comes among the site's locations, from 0. */
		position: integer("position").notNull(),
		qrToken: qrToken(),
		createdAt: createdAt(),
	},
	(table) => [
		// For equipment, which must be at a location of its own site.
		uniqueIndex("equipment_location_site_id").on(table.siteId, table.id),
		uniqueIndex("equipment_location_site_name").on(table.siteId, sql`lower(${table.name})`),
		uniqueIndex("equipment_location_qr_token").on(table.qrToken),
		index("equipment_location_organization_site").on(
			table.organizationId,
			table.siteId,
			table.position,
		),
		// The tenant's site; deleting the site (which has no units then) deletes its locations.
		tenantRef(table, table.siteId, customerSite, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

/** A machine installed at a customer site. */
export const equipment = tenantTable(
	"equipment",
	{
		serialNumber: text("serial_number").notNull(),
		model: text("model").notNull(),
		manufacturer: text("manufacturer").notNull(),
		/** One of the tenant's categories. */
		categoryId: integer("category_id").notNull(),
		status: text("status", { enum: equipmentStatuses }).notNull(),
		customerId: integer("customer_id").notNull(),
		/** The customer's site it's at. */
		siteId: integer("site_id").notNull(),
		/** The customer's own name or tag for it, e.g. "Automatische deur kantine BES-3". */
		name: text("name"),
		/** Where it is at the site, if that needs saying: one of the site's locations. */
		locationId: integer("location_id"),
		installedAt: day("installed_at").notNull(),
		warrantyUntil: day("warranty_until").notNull(),
		/** Its QR code's (on the unit's label). */
		qrToken: qrToken(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same serialNumber.
		uniqueIndex("equipment_organization_serial_number").on(
			table.organizationId,
			table.serialNumber,
		),
		// For orders and contract coverage, which must refer to a unit of their own customer.
		uniqueIndex("equipment_customer_id").on(table.customerId, table.id),
		// For the equipment list, which filters by customer and sorts by unit.
		index("equipment_organization_customer").on(table.organizationId, table.customerId),
		index("equipment_organization_unit").on(table.organizationId, table.manufacturer, table.model),
		// A site's units; with the customer, also the key to the site.
		index("equipment_site").on(table.siteId, table.customerId),
		// Whether a category is in use, and the list's filter by it.
		index("equipment_organization_category").on(table.organizationId, table.categoryId),
		// A location's units (and whether it has any); with the site, also the key to the location.
		index("equipment_by_location").on(table.locationId, table.siteId),
		uniqueIndex("equipment_qr_token").on(table.qrToken),
		tenantRef(table, table.customerId, customer),
		tenantRef(table, table.categoryId, equipmentCategory),
		// A site of the unit's own customer (and so of the tenant).
		foreignKey({
			columns: [table.customerId, table.siteId],
			foreignColumns: [customerSite.customerId, customerSite.id],
		}),
		// A location at the unit's own site; one with units can't be deleted.
		foreignKey({
			columns: [table.siteId, table.locationId],
			foreignColumns: [equipmentLocation.siteId, equipmentLocation.id],
		}),
	],
	{ referenced: true },
);
