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
	customerSegments,
	engineerSpecialties,
	equipmentCategories,
	equipmentStatuses,
	materialUnits,
	orderPriorities,
	orderStatuses,
	orderTypes,
	stockMovementKinds,
} from "#lib/models.ts";

import { user } from "./auth.schema.ts";
import { createdAt, organizationId } from "./columns.ts";

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
		hiredAt: integer("hired_at", { mode: "timestamp" }).notNull(),
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

/** A machine installed at a customer site. */
export const equipment = sqliteTable(
	"equipment",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		serialNumber: text("serial_number").notNull(),
		model: text("model").notNull(),
		manufacturer: text("manufacturer").notNull(),
		category: text("category", { enum: equipmentCategories }).notNull(),
		status: text("status", { enum: equipmentStatuses }).notNull(),
		customerId: integer("customer_id").notNull(),
		installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
		warrantyUntil: integer("warranty_until", { mode: "timestamp" }).notNull(),
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
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
	],
);

/** A stocked part or consumable that orders use. */
export const material = sqliteTable(
	"material",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		sku: text("sku").notNull(),
		name: text("name").notNull(),
		unit: text("unit", { enum: materialUnits }).notNull(),
		/** In cents. */
		unitPrice: integer("unit_price").notNull(),
		/** In the material's unit: whole pieces, or metres, kilos or litres to two decimals. */
		stock: real("stock").notNull(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same sku.
		uniqueIndex("material_organization_sku").on(table.organizationId, table.sku),
		uniqueIndex("material_organization_id").on(table.organizationId, table.id),
		index("material_organization_name").on(table.organizationId, table.name),
	],
);

/** A work order for a customer, usually on one of their pieces of equipment. */
export const order = sqliteTable(
	"order",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		number: text("number").notNull(),
		customerId: integer("customer_id").notNull(),
		/** One of the customer's units, if the order is about one. */
		equipmentId: integer("equipment_id"),
		/** Unassigned while the order is a quote. */
		engineerId: integer("engineer_id"),
		type: text("type", { enum: orderTypes }).notNull(),
		status: text("status", { enum: orderStatuses }).notNull(),
		priority: text("priority", { enum: orderPriorities }).notNull(),
		description: text("description").notNull(),
		scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
		completedAt: integer("completed_at", { mode: "timestamp" }),
		laborHours: real("labor_hours").notNull().default(0),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same number.
		uniqueIndex("order_organization_number").on(table.organizationId, table.number),
		uniqueIndex("order_organization_id").on(table.organizationId, table.id),
		// For the orders list, which is newest first by default and filters by these.
		index("order_organization_created").on(table.organizationId, table.createdAt),
		index("order_organization_status").on(table.organizationId, table.status),
		index("order_organization_customer").on(table.organizationId, table.customerId),
		index("order_organization_engineer").on(table.organizationId, table.engineerId),
		// A unit's (open) orders, e.g. in the equipment list.
		index("order_equipment_status").on(table.equipmentId, table.status),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
		// The customer's own unit; a unit with orders therefore can't move to another customer.
		foreignKey({
			columns: [table.customerId, table.equipmentId],
			foreignColumns: [equipment.customerId, equipment.id],
		}),
		foreignKey({
			columns: [table.organizationId, table.engineerId],
			foreignColumns: [engineer.organizationId, engineer.id],
		}),
	],
);

/** Materials used on an order, with the unit price at the time of ordering. */
export const orderLine = sqliteTable(
	"order_line",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		orderId: integer("order_id").notNull(),
		materialId: integer("material_id").notNull(),
		/** In the material's unit, like its stock. */
		quantity: real("quantity").notNull(),
		/** In cents. */
		unitPrice: integer("unit_price").notNull(),
	},
	(table) => [
		// An order's lines, and the orders using a material (in the materials list).
		index("order_line_order").on(table.organizationId, table.orderId),
		index("order_line_material").on(table.organizationId, table.materialId, table.orderId),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.materialId],
			foreignColumns: [material.organizationId, material.id],
		}),
	],
);

export const customerRelations = relations(customer, ({ many }) => ({
	equipment: many(equipment),
	orders: many(order),
}));

export const engineerRelations = relations(engineer, ({ many }) => ({
	orders: many(order),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
	customer: one(customer, {
		fields: [equipment.organizationId, equipment.customerId],
		references: [customer.organizationId, customer.id],
	}),
	orders: many(order),
}));

export const materialRelations = relations(material, ({ many }) => ({
	orderLines: many(orderLine),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
	customer: one(customer, {
		fields: [order.organizationId, order.customerId],
		references: [customer.organizationId, customer.id],
	}),
	equipment: one(equipment, {
		fields: [order.customerId, order.equipmentId],
		references: [equipment.customerId, equipment.id],
	}),
	engineer: one(engineer, {
		fields: [order.organizationId, order.engineerId],
		references: [engineer.organizationId, engineer.id],
	}),
	lines: many(orderLine),
}));

export const orderLineRelations = relations(orderLine, ({ one }) => ({
	order: one(order, {
		fields: [orderLine.organizationId, orderLine.orderId],
		references: [order.organizationId, order.id],
	}),
	material: one(material, {
		fields: [orderLine.organizationId, orderLine.materialId],
		references: [material.organizationId, material.id],
	}),
}));

export * from "./auth.schema.ts";

// --- Stock movements -----------------------------------------------------------------------------

/**
 * The stock ledger: every change to a material's stock, signed (positive adds, negative takes),
 * in the material's unit. `material.stock` is the cached balance and always equals the sum of the
 * material's movements: change it only through `moveStock` in `#lib/materials/server/stock.ts`, which writes
 * both in one transaction. Deleting a material deletes its movements.
 */
export const stockMovement = sqliteTable(
	"stock_movement",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		materialId: integer("material_id").notNull(),
		quantity: real("quantity").notNull(),
		kind: text("kind", { enum: stockMovementKinds }).notNull(),
		/** The order whose lines consumed or returned the stock; cleared when the order is deleted. */
		orderId: integer("order_id"),
		/** The order's number, which the movement keeps after the order is deleted. */
		orderNumber: text("order_number"),
		/** Who made the change; empty for seeded movements. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		note: text("note"),
		createdAt: createdAt(),
	},
	(table) => [
		index("stock_movement_material").on(table.materialId, table.createdAt),
		foreignKey({
			columns: [table.organizationId, table.materialId],
			foreignColumns: [material.organizationId, material.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}),
	],
);

export const stockMovementRelations = relations(stockMovement, ({ one }) => ({
	material: one(material, {
		fields: [stockMovement.organizationId, stockMovement.materialId],
		references: [material.organizationId, material.id],
	}),
	order: one(order, {
		fields: [stockMovement.organizationId, stockMovement.orderId],
		references: [order.organizationId, order.id],
	}),
	user: one(user, { fields: [stockMovement.userId], references: [user.id] }),
}));

// --- Tenants and modules --------------------------------------------------------------------------

/** The optional modules (see `#lib/modules.ts`) a tenant has, e.g. through their subscription. */
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
		signedAt: integer("signed_at", { mode: "timestamp" }).notNull(),
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

/**
 * A data table's search, filters, sorting and page size saved under a name (see
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
		/** Whether every member of the organization sees it. */
		shared: integer("shared", { mode: "boolean" }).notNull().default(false),
		createdAt: createdAt(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => new Date()),
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

// --- Activity log ---------------------------------------------------------------------------------

/** An update's changed fields with their values before and after, e.g. `{ status: ["quote", "scheduled"] }`. */
export type ActivityChanges = Record<string, [unknown, unknown]>;

/**
 * Who did what to which record, and when: one row per change, written by `recordActivity()` in
 * `#lib/server/activity.ts` in the same transaction as the change. The subject (and the optional
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
		/** E.g. `order`, see `subjectTypes` in `#lib/activity.ts`. */
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
