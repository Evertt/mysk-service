import { relations, sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
	type ActivityAction,
	contactChannels,
	customerSegments,
	engineerSpecialties,
	equipmentStatuses,
	orderPriorities,
	orderStatuses,
	orderTypes,
	sitePriorities,
	weekdays,
} from "#lib/models.ts";
import { simulationSpeeds } from "#lib/simulation/extensions.ts";

import { user } from "./auth.schema.ts";
import { createdAt, day, moment, organizationId } from "./columns.ts";

/** A company that owns equipment and places orders. */
export const customer = sqliteTable(
	"customer",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
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
		uniqueIndex("customer_organization_id").on(table.organizationId, table.id),
		// The lists' filters search and sort customers by name.
		index("customer_organization_name").on(table.organizationId, table.name),
	],
);

/**
 * One of a customer's sites (`vestiging`), e.g. their warehouse in Ede: where their equipment is
 * and the engineers go. How the site likes to be contacted and visited, and how to get in, are the
 * site's, not the customer's. A customer has at least one.
 */
export const customerSite = sqliteTable(
	"customer_site",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
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
		uniqueIndex("customer_site_organization_id").on(table.organizationId, table.id),
		// For equipment, which must be at a site of its own customer.
		uniqueIndex("customer_site_customer_id").on(table.customerId, table.id),
		index("customer_site_organization_customer").on(table.organizationId, table.customerId),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}).onDelete("cascade"),
	],
);

/** A field engineer who carries out orders. */
export const engineer = sqliteTable(
	"engineer",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
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
		uniqueIndex("engineer_organization_id").on(table.organizationId, table.id),
		// A user is at most one engineer per tenant. The user first: also the key to `user`.
		uniqueIndex("engineer_user_organization").on(table.userId, table.organizationId),
		index("engineer_organization_name").on(table.organizationId, table.name),
	],
);

/**
 * One of the tenant's own kinds of equipment, e.g. "Sectionaaldeur" or "Koelmachine": managers
 * name them, put them in order and say which engineer specialty services each (see
 * `#lib/equipment/categories/`). A category that units have can't be deleted.
 */
export const equipmentCategory = sqliteTable(
	"equipment_category",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		name: text("name").notNull(),
		/** The specialty of the engineers who service it; none when no specialty fits. */
		specialty: text("specialty", { enum: engineerSpecialties }),
		/** Where it comes in the tenant's categories (the form's select, the list's sort), from 0. */
		position: integer("position").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("equipment_category_organization_id").on(table.organizationId, table.id),
		// Unique within a tenant, whatever the case: "Lift" and "lift" are the same category.
		uniqueIndex("equipment_category_organization_name").on(
			table.organizationId,
			sql`lower(${table.name})`,
		),
		index("equipment_category_organization_position").on(table.organizationId, table.position),
	],
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
export const equipmentLocation = sqliteTable(
	"equipment_location",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
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
		uniqueIndex("equipment_location_organization_id").on(table.organizationId, table.id),
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
		foreignKey({
			columns: [table.organizationId, table.siteId],
			foreignColumns: [customerSite.organizationId, customerSite.id],
		}).onDelete("cascade"),
	],
);

/** A machine installed at a customer site. */
export const equipment = sqliteTable(
	"equipment",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
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
		uniqueIndex("equipment_organization_id").on(table.organizationId, table.id),
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
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
		foreignKey({
			columns: [table.organizationId, table.categoryId],
			foreignColumns: [equipmentCategory.organizationId, equipmentCategory.id],
		}),
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
);

/** A work order for a customer, usually on one or more of their units (`orderUnit`). */
export const order = sqliteTable(
	"order",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		number: text("number").notNull(),
		customerId: integer("customer_id").notNull(),
		/** Unassigned while the order is a quote. */
		engineerId: integer("engineer_id"),
		type: text("type", { enum: orderTypes }).notNull(),
		status: text("status", { enum: orderStatuses }).notNull(),
		priority: text("priority", { enum: orderPriorities }).notNull(),
		description: text("description").notNull(),
		scheduledFor: moment("scheduled_for"),
		completedAt: moment("completed_at"),
		laborHours: real("labor_hours").notNull().default(0),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same number.
		uniqueIndex("order_organization_number").on(table.organizationId, table.number),
		uniqueIndex("order_organization_id").on(table.organizationId, table.id),
		// For the order's units, which must be its own customer's.
		uniqueIndex("order_customer_id").on(table.customerId, table.id),
		// For the orders list, which is newest first by default and filters by these.
		index("order_organization_created").on(table.organizationId, table.createdAt),
		index("order_organization_status").on(table.organizationId, table.status),
		index("order_organization_customer").on(table.organizationId, table.customerId),
		index("order_organization_engineer").on(table.organizationId, table.engineerId),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
		foreignKey({
			columns: [table.organizationId, table.engineerId],
			foreignColumns: [engineer.organizationId, engineer.id],
		}),
	],
);

/**
 * One of the units an order is about, e.g. one of the fifteen doors of a yearly inspection. An
 * order has none (a new installation, a survey) or several, in the order they're worked on
 * (`position`, from 0); a unit is on an order at most once. The unit is the order's customer's, so
 * a unit on orders can't move to another customer, and an order keeps no units of a customer it no
 * longer has.
 */
export const orderUnit = sqliteTable(
	"order_unit",
	{
		organizationId: organizationId(),
		orderId: integer("order_id").notNull(),
		/** The order's customer, whose unit it must be. */
		customerId: integer("customer_id").notNull(),
		equipmentId: integer("equipment_id").notNull(),
		/** Where it comes among the order's units, from 0. */
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.orderId, table.equipmentId] }),
		// What the modules' rows about an order's unit refer to, with the tenant (e.g. a checklist).
		uniqueIndex("order_unit_organization_order_equipment").on(
			table.organizationId,
			table.orderId,
			table.equipmentId,
		),
		uniqueIndex("order_unit_order_position").on(table.orderId, table.position),
		// A unit's orders: its service history, its open orders in the equipment list. With the
		// customer (the unit's only one while it's on orders), also the key to the unit.
		index("order_unit_equipment").on(table.equipmentId, table.customerId, table.orderId),
		index("order_unit_customer_order").on(table.customerId, table.orderId),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
		// The order's own customer…
		foreignKey({
			columns: [table.customerId, table.orderId],
			foreignColumns: [order.customerId, order.id],
		}).onDelete("cascade"),
		// …and that customer's unit; a unit with orders can't be deleted.
		foreignKey({
			columns: [table.customerId, table.equipmentId],
			foreignColumns: [equipment.customerId, equipment.id],
		}),
	],
);

export const customerRelations = relations(customer, ({ many }) => ({
	sites: many(customerSite),
	equipment: many(equipment),
	orders: many(order),
}));

export const customerSiteRelations = relations(customerSite, ({ one, many }) => ({
	customer: one(customer, {
		fields: [customerSite.organizationId, customerSite.customerId],
		references: [customer.organizationId, customer.id],
	}),
	equipment: many(equipment),
	/** Load them in their order: `orderBy: asc(equipmentLocation.position)`. */
	locations: many(equipmentLocation),
}));

export const equipmentLocationRelations = relations(equipmentLocation, ({ one, many }) => ({
	site: one(customerSite, {
		fields: [equipmentLocation.organizationId, equipmentLocation.siteId],
		references: [customerSite.organizationId, customerSite.id],
	}),
	equipment: many(equipment),
}));

export const engineerRelations = relations(engineer, ({ many }) => ({
	orders: many(order),
}));

export const equipmentCategoryRelations = relations(equipmentCategory, ({ many }) => ({
	equipment: many(equipment),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
	customer: one(customer, {
		fields: [equipment.organizationId, equipment.customerId],
		references: [customer.organizationId, customer.id],
	}),
	category: one(equipmentCategory, {
		fields: [equipment.organizationId, equipment.categoryId],
		references: [equipmentCategory.organizationId, equipmentCategory.id],
	}),
	site: one(customerSite, {
		fields: [equipment.customerId, equipment.siteId],
		references: [customerSite.customerId, customerSite.id],
	}),
	location: one(equipmentLocation, {
		fields: [equipment.siteId, equipment.locationId],
		references: [equipmentLocation.siteId, equipmentLocation.id],
	}),
	orderUnits: many(orderUnit),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
	customer: one(customer, {
		fields: [order.organizationId, order.customerId],
		references: [customer.organizationId, customer.id],
	}),
	/** Load them in their order: `orderBy: asc(orderUnit.position)`. */
	units: many(orderUnit),
	engineer: one(engineer, {
		fields: [order.organizationId, order.engineerId],
		references: [engineer.organizationId, engineer.id],
	}),
}));

export const orderUnitRelations = relations(orderUnit, ({ one }) => ({
	order: one(order, {
		fields: [orderUnit.organizationId, orderUnit.orderId],
		references: [order.organizationId, order.id],
	}),
	equipment: one(equipment, {
		fields: [orderUnit.customerId, orderUnit.equipmentId],
		references: [equipment.customerId, equipment.id],
	}),
}));

export * from "./auth.schema.ts";

// --- Tenants and modules --------------------------------------------------------------------------

/** The optional modules (see `#lib/modules/manifests.ts`) a tenant has, e.g. through their subscription. */
export const organizationModule = sqliteTable(
	"organization_module",
	{
		organizationId: organizationId(),
		moduleId: text("module_id").notNull(),
		enabledAt: createdAt(),
	},
	(table) => [primaryKey({ columns: [table.organizationId, table.moduleId] })],
);

/**
 * A module's simulation for a demo (`#lib/server/simulation.ts`): a row means the organization is
 * offered one for that module (the seed gives SHLTR its docks' and energy's; real tenants never
 * have one). While it runs, the runner has the module move its data on over each interval of real
 * time since `last_tick_at`, `speed` times as busy.
 */
export const simulation = sqliteTable(
	"simulation",
	{
		organizationId: organizationId(),
		moduleId: text("module_id").notNull(),
		running: integer("running", { mode: "boolean" }).notNull().default(true),
		/** One of `simulationSpeeds` (`#lib/simulation/extensions.ts`). */
		speed: integer("speed").notNull().default(1),
		/** Up to when the simulation has been ticked: the next tick covers what came after. */
		lastTickAt: moment("last_tick_at")
			.notNull()
			.default(sql`(unixepoch())`),
		/** When it was last (re)started from its starting states. */
		startedAt: moment("started_at")
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.moduleId] }),
		check("simulation_speed", sql.raw(`speed in (${simulationSpeeds.join(", ")})`)),
	],
);

/**
 * What a tenant changed about one of the order types, which managers keep on the settings page
 * (`#lib/orders/types.ts`): its own names, by language, and whether the order form leaves it out.
 * A type without a row is as standard. Loaded with the tenant, once per request (`loadTenant()`).
 */
export const orderTypeSetting = sqliteTable(
	"order_type_setting",
	{
		organizationId: organizationId(),
		type: text("type", { enum: orderTypes }).notNull(),
		/** By locale (`{ "nl": "Offerte-opname" }`); a language without a name has the standard one. */
		names: text("names", { mode: "json" }).$type<Partial<Record<string, string>>>().notNull(),
		hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
	},
	(table) => [primaryKey({ columns: [table.organizationId, table.type] })],
);

/**
 * A token a system outside the app (e.g. the Salvo dock hardware's feed) posts to a module's
 * integration endpoints with (its `(api)` routes, see `#lib/server/auth/integrations.ts`): it says
 * which tenant the data is for. Managers make and revoke them on the module's settings page; the
 * token itself is shown once and never stored, only its SHA-256 hash and its first characters (to
 * tell tokens apart). A revoked token stays, so the log can name it.
 */
export const integrationToken = sqliteTable(
	"integration_token",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		/** The module whose endpoints it may post to. */
		moduleId: text("module_id").notNull(),
		/** What it's for, e.g. "Salvo Barneveld". */
		name: text("name").notNull(),
		/** The token's SHA-256, in hex. */
		tokenHash: text("token_hash").notNull(),
		/** The token's first characters, e.g. `fwi_3f9a`. */
		prefix: text("prefix").notNull(),
		/** Who made it; none once their account is gone. */
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		/** When it was last used, to the minute. */
		lastUsedAt: moment("last_used_at"),
		revokedAt: moment("revoked_at"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("integration_token_hash").on(table.tokenHash),
		index("integration_token_organization_module").on(table.organizationId, table.moduleId),
		index("integration_token_created_by").on(table.createdBy),
	],
);

// --- Engineer portal ------------------------------------------------------------------------------
// What engineers record on their orders in the field (see `src/routes/(field)/my`).

/** A note written on an order while working on it. */
export const orderNote = sqliteTable(
	"order_note",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		orderId: integer("order_id").notNull(),
		/** Who wrote it; empty once their account is deleted. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		text: text("text").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("order_note_order").on(table.organizationId, table.orderId, table.createdAt),
		index("order_note_user").on(table.userId),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
	],
);

/**
 * The sign-off of a completed order, the work order's signatures: who signed for the customer and
 * their signature as drawn on the engineer's screen (a PNG data URL), and the engineer's own. One
 * per order; completing it again replaces it.
 */
export const orderSignoff = sqliteTable(
	"order_signoff",
	{
		orderId: integer("order_id").primaryKey(),
		organizationId: organizationId(),
		signerName: text("signer_name").notNull(),
		signature: text("signature").notNull(),
		/**
		 * The engineer's own signature on the work order, besides the customer's: their name and
		 * drawing. None on the sign-offs from before engineers signed too.
		 */
		engineerName: text("engineer_name"),
		engineerSignature: text("engineer_signature"),
		/** Who collected it; empty once their account is deleted. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		signedAt: moment("signed_at").notNull(),
	},
	(table) => [
		index("order_signoff_organization_order").on(table.organizationId, table.orderId),
		index("order_signoff_user").on(table.userId),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
	],
);

// --- Customer portal ------------------------------------------------------------------------------
// Customers' contacts who sign in to the customer portal (`src/routes/(customer)/portal`), and the
// orders they report there (see `#lib/server/auth/customer.ts`).

/**
 * A customer's contact with access to the customer portal: a member of the tenant with the role
 * `customer`, linked to one of its customers. Made when the office invites them (by email, from
 * the customer's page), linked to their account when they accept (`userId`); revoking access
 * removes it with their membership. They see that customer's orders, units and sites: all its
 * sites, or only those in `portal_contact_site` when `allSites` is off.
 */
export const portalContact = sqliteTable(
	"portal_contact",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
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
		uniqueIndex("portal_contact_organization_id").on(table.organizationId, table.id),
		// For their sites, which must be their own customer's.
		uniqueIndex("portal_contact_customer_id").on(table.customerId, table.id),
		// A user is at most one customer's contact per tenant (the user first: also the key to
		// `user`), and an address is invited once.
		uniqueIndex("portal_contact_user_organization").on(table.userId, table.organizationId),
		uniqueIndex("portal_contact_organization_email").on(table.organizationId, table.email),
		index("portal_contact_organization_customer").on(table.organizationId, table.customerId),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}).onDelete("cascade"),
	],
);

/** The sites a portal contact without `allSites` sees: their customer's own. */
export const portalContactSite = sqliteTable(
	"portal_contact_site",
	{
		organizationId: organizationId(),
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
		foreignKey({
			columns: [table.organizationId, table.contactId],
			foreignColumns: [portalContact.organizationId, portalContact.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customerId, table.contactId],
			foreignColumns: [portalContact.customerId, portalContact.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customerId, table.siteId],
			foreignColumns: [customerSite.customerId, customerSite.id],
		}).onDelete("cascade"),
	],
);

/**
 * An order a customer's contact reported in the customer portal (a breakdown), and the planner's
 * decision on it: while the order is `awaiting_acceptance` there's none; accepting it sets
 * `decidedAt`, rejecting it also `rejectionReason`, which the customer reads in their portal.
 * Orders made in the office have none.
 */
export const orderRequest = sqliteTable(
	"order_request",
	{
		orderId: integer("order_id").primaryKey(),
		organizationId: organizationId(),
		/** Who reported it; empty once their account is deleted (`reporterName` keeps who it was). */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		reporterName: text("reporter_name").notNull(),
		decidedAt: moment("decided_at"),
		/** Who accepted or rejected it; empty once their account is deleted. */
		decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
		/** Why it was rejected, for the customer; none when it was accepted. */
		rejectionReason: text("rejection_reason"),
	},
	(table) => [
		index("order_request_organization_order").on(table.organizationId, table.orderId),
		index("order_request_user").on(table.userId),
		index("order_request_decided_by").on(table.decidedBy),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
	],
);

export const portalContactRelations = relations(portalContact, ({ one, many }) => ({
	customer: one(customer, {
		fields: [portalContact.organizationId, portalContact.customerId],
		references: [customer.organizationId, customer.id],
	}),
	sites: many(portalContactSite),
	user: one(user, { fields: [portalContact.userId], references: [user.id] }),
}));

export const portalContactSiteRelations = relations(portalContactSite, ({ one }) => ({
	contact: one(portalContact, {
		fields: [portalContactSite.organizationId, portalContactSite.contactId],
		references: [portalContact.organizationId, portalContact.id],
	}),
	site: one(customerSite, {
		fields: [portalContactSite.customerId, portalContactSite.siteId],
		references: [customerSite.customerId, customerSite.id],
	}),
}));

export const orderNoteRelations = relations(orderNote, ({ one }) => ({
	order: one(order, {
		fields: [orderNote.organizationId, orderNote.orderId],
		references: [order.organizationId, order.id],
	}),
	user: one(user, { fields: [orderNote.userId], references: [user.id] }),
}));

// --- Saved views ----------------------------------------------------------------------------------

/** Which of a table's columns are shown, by id (see `#lib/components/data-table/column-visibility.ts`). */
type ColumnVisibility = Record<string, boolean>;

/**
 * A data table's search, filters, sorting, page size and columns saved under a name (see
 * `#lib/components/data-table/views.ts`), to get back to in one click. Personal to the user who
 * saved it, unless an owner or admin shares it with the whole organization. It references no
 * business records: only the tenant and its creator (deleted with either), so a member who leaves
 * keeps their personal views out of sight and their shared ones stay with the organization.
 */
export const savedView = sqliteTable(
	"saved_view",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		/** Who saved it, and who may change it (besides owners and admins, if it's shared). */
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** The table, e.g. `/(app)/orders`: its route, plus its URL prefix if it has one. */
		tableKey: text("table_key").notNull(),
		name: text("name").notNull(),
		/** The table's parameters as its URL has them, e.g. `?status=quote&sort=-priority`. */
		query: text("query").notNull(),
		/**
		 * Which of the table's hideable columns it shows, as they were when it was saved; `null` for a
		 * view saved before views had columns, which leaves the columns as they are.
		 */
		columns: text("columns", { mode: "json" }).$type<ColumnVisibility>(),
		/** Whether every member of the organization sees it. */
		shared: integer("shared", { mode: "boolean" }).notNull().default(false),
		createdAt: createdAt(),
		updatedAt: moment("updated_at")
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => Temporal.Now.instant()),
	},
	(table) => [
		// A user's views of a table have different names. The user first: also the key to `user`.
		uniqueIndex("saved_view_user_table_name").on(
			table.userId,
			table.organizationId,
			table.tableKey,
			table.name,
		),
		index("saved_view_table").on(table.organizationId, table.tableKey),
	],
);

/**
 * What the app remembers of a user's data table (see
 * `#lib/components/data-table/table-memory.svelte.ts`): the columns they show, and where they left
 * it (its parameters and the saved view they had open), to come back to. One row per user and
 * table, only while there's something to remember. Like a personal view, it concerns nobody else.
 */
export const tableMemory = sqliteTable(
	"table_memory",
	{
		organizationId: organizationId(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** The table, as for saved views: `/(app)/orders`. */
		tableKey: text("table_key").notNull(),
		/** Which of the table's hideable columns they show; `null` for the table's defaults. */
		columns: text("columns", { mode: "json" }).$type<ColumnVisibility>(),
		/** The table's parameters as its URL had them last, without the page: `?status=quote`. */
		query: text("query").notNull().default(""),
		/**
		 * The saved view they had open, if any (with `query` as they left it, which may have changes
		 * they didn't save in it). Not a foreign key: a view that's gone (or no longer shared) is
		 * simply not found.
		 */
		viewId: integer("view_id"),
		updatedAt: moment("updated_at")
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => Temporal.Now.instant()),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.userId, table.tableKey] }),
		index("table_memory_user").on(table.userId),
	],
);

// --- Activity log ---------------------------------------------------------------------------------

/** An update's changed fields with their values before and after, e.g. `{ status: ["quote", "scheduled"] }`. */
export type ActivityChanges = Record<string, [unknown, unknown]>;

/**
 * Who did what to which record, and when: one row per change, written by `recordActivity()` in
 * `#lib/server/activity/log.ts` in the same transaction as the change. The subject (and the optional
 * parent, e.g. the order of an order line) is a type and id without a foreign key, so it can be
 * any table's, a module's included, and outlives the record: its label and the user's name are
 * kept as they were. Rows are never changed afterwards.
 */
export const activity = sqliteTable(
	"activity",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		/** Cleared when the user is deleted; `userName` keeps who it was. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		userName: text("user_name").notNull(),
		action: text("action").$type<ActivityAction>().notNull(),
		/** E.g. `order`, see `subjectTypes` in `#lib/activity/subjects.ts`. */
		subjectType: text("subject_type").notNull(),
		/** The record's id, as text (the auth tables' ids are text). */
		subjectId: text("subject_id").notNull(),
		/** How the record read at the time, e.g. its order number or customer code. */
		subjectLabel: text("subject_label").notNull(),
		parentType: text("parent_type"),
		parentId: text("parent_id"),
		parentLabel: text("parent_label"),
		/** The fields an update changed, see `ActivityChanges`. */
		changes: text("changes", { mode: "json" }).$type<ActivityChanges>(),
		/** Anything else worth saying, e.g. the note with received stock. */
		note: text("note"),
		createdAt: createdAt(),
	},
	(table) => [
		index("activity_organization").on(table.organizationId, table.id),
		index("activity_subject").on(table.organizationId, table.subjectType, table.subjectId),
		index("activity_parent").on(table.organizationId, table.parentType, table.parentId),
		index("activity_user").on(table.userId),
	],
);
