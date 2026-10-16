import { relations, sql } from "drizzle-orm";
import {
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
		// A user is at most one engineer per tenant.
		uniqueIndex("engineer_organization_user").on(table.organizationId, table.userId),
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
		/** Where it is at the site, e.g. "Expeditie dock 07". */
		location: text("location"),
		installedAt: day("installed_at").notNull(),
		warrantyUntil: day("warranty_until").notNull(),
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
		index("equipment_site").on(table.siteId),
		// Whether a category is in use, and the list's filter by it.
		index("equipment_organization_category").on(table.organizationId, table.categoryId),
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
		uniqueIndex("order_unit_order_position").on(table.orderId, table.position),
		// A unit's orders: its service history, its open orders in the equipment list.
		index("order_unit_equipment").on(table.equipmentId, table.orderId),
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
		index("order_note_order").on(table.orderId, table.createdAt),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
	],
);

/**
 * The customer's sign-off of a completed order: who signed, and their signature as drawn on the
 * engineer's screen (a PNG data URL). One per order; completing it again replaces it.
 */
export const orderSignoff = sqliteTable(
	"order_signoff",
	{
		orderId: integer("order_id").primaryKey(),
		organizationId: organizationId(),
		signerName: text("signer_name").notNull(),
		signature: text("signature").notNull(),
		/** Who collected it; empty once their account is deleted. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		signedAt: moment("signed_at").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
	],
);

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
		// A user's views of a table have different names.
		uniqueIndex("saved_view_user_table_name").on(
			table.organizationId,
			table.userId,
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
	(table) => [primaryKey({ columns: [table.organizationId, table.userId, table.tableKey] })],
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
	],
);
