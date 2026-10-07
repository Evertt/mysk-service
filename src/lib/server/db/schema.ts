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
	contractLevels,
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

import { organization, user } from "./auth.schema.ts";

/**
 * The tenant a row belongs to. Every business table has one, except contract coverage, whose
 * customer pins it to a tenant. Queries scope by it with `inTenant()` from
 * `#lib/server/session.ts`.
 *
 * References between tenant tables are composite foreign keys that include the tenant (e.g.
 * `(organization_id, customer_id)` → `customer (organization_id, id)`), so the database refuses a
 * reference to another tenant's row, and relations and joins match on both columns. Each table
 * that is referenced this way has a unique index on `(organization_id, id)` for them to point at.
 */
const organizationId = () =>
	text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" });

const createdAt = () =>
	integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`);

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
 * material's movements: change it only through `moveStock` in `#lib/server/stock.ts`, which writes
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

// --- Service contracts (optional module, see `#lib/modules.ts`) --------------------------------
// These tables reference the core tables, never the other way round.

/**
 * A maintenance agreement: for a monthly fee, the customer's covered equipment gets service with
 * a guaranteed response time. Its status (upcoming, active, expired) follows from the period,
 * see `contractStatus` in `#lib/models.ts`.
 */
export const contract = sqliteTable(
	"contract",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		number: text("number").notNull(),
		customerId: integer("customer_id").notNull(),
		level: text("level", { enum: contractLevels }).notNull(),
		/** The first day of the contract, at local midnight. */
		startsOn: integer("starts_on", { mode: "timestamp" }).notNull(),
		/** The last day of the contract (inclusive), at local midnight. */
		endsOn: integer("ends_on", { mode: "timestamp" }).notNull(),
		/** In cents. */
		monthlyFee: integer("monthly_fee").notNull(),
		/** The promised response time for a call-out. */
		responseHours: integer("response_hours").notNull(),
		notes: text("notes"),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same number.
		uniqueIndex("contract_organization_number").on(table.organizationId, table.number),
		// For coverage, which must be of the contract's customer's equipment.
		uniqueIndex("contract_customer_id").on(table.customerId, table.id),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
	],
);

/**
 * The equipment a contract covers: only the contract's customer's, which the foreign keys on
 * `customer_id` enforce. So a covered unit can't move to another customer. Removing a unit or the
 * contract removes its coverage, so deleting equipment doesn't need to know about contracts.
 */
export const contractEquipment = sqliteTable(
	"contract_equipment",
	{
		customerId: integer("customer_id").notNull(),
		contractId: integer("contract_id").notNull(),
		equipmentId: integer("equipment_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.contractId, table.equipmentId] }),
		foreignKey({
			columns: [table.customerId, table.contractId],
			foreignColumns: [contract.customerId, contract.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customerId, table.equipmentId],
			foreignColumns: [equipment.customerId, equipment.id],
		}).onDelete("cascade"),
	],
);

export const contractRelations = relations(contract, ({ one, many }) => ({
	customer: one(customer, {
		fields: [contract.organizationId, contract.customerId],
		references: [customer.organizationId, customer.id],
	}),
	coverage: many(contractEquipment),
}));

export const contractEquipmentRelations = relations(contractEquipment, ({ one }) => ({
	contract: one(contract, {
		fields: [contractEquipment.customerId, contractEquipment.contractId],
		references: [contract.customerId, contract.id],
	}),
	equipment: one(equipment, {
		fields: [contractEquipment.customerId, contractEquipment.equipmentId],
		references: [equipment.customerId, equipment.id],
	}),
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
