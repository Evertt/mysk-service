import { relations, sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
} from "#lib/models.ts";

export const task = sqliteTable("task", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text("title").notNull(),
	priority: integer("priority").notNull().default(1),
});

const createdAt = () =>
	integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`);

/** A company that owns equipment and places orders. */
export const customer = sqliteTable("customer", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	contactName: text("contact_name").notNull(),
	email: text("email").notNull(),
	phone: text("phone").notNull(),
	city: text("city").notNull(),
	country: text("country").notNull(),
	segment: text("segment", { enum: customerSegments }).notNull(),
	createdAt: createdAt(),
});

/** A field engineer who carries out orders. */
export const engineer = sqliteTable("engineer", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	phone: text("phone").notNull(),
	specialty: text("specialty", { enum: engineerSpecialties }).notNull(),
	region: text("region").notNull(),
	/** In cents. */
	hourlyRate: integer("hourly_rate").notNull(),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	hiredAt: integer("hired_at", { mode: "timestamp" }).notNull(),
});

/** A machine installed at a customer site. */
export const equipment = sqliteTable("equipment", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	serialNumber: text("serial_number").notNull().unique(),
	model: text("model").notNull(),
	manufacturer: text("manufacturer").notNull(),
	category: text("category", { enum: equipmentCategories }).notNull(),
	status: text("status", { enum: equipmentStatuses }).notNull(),
	customerId: integer("customer_id")
		.notNull()
		.references(() => customer.id),
	installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
	warrantyUntil: integer("warranty_until", { mode: "timestamp" }).notNull(),
});

/** A stocked part or consumable that orders use. */
export const material = sqliteTable("material", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	sku: text("sku").notNull().unique(),
	name: text("name").notNull(),
	unit: text("unit", { enum: materialUnits }).notNull(),
	/** In cents. */
	unitPrice: integer("unit_price").notNull(),
	stock: integer("stock").notNull(),
});

/** A work order for a customer, usually on one of their pieces of equipment. */
export const order = sqliteTable("order", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	number: text("number").notNull().unique(),
	customerId: integer("customer_id")
		.notNull()
		.references(() => customer.id),
	equipmentId: integer("equipment_id").references(() => equipment.id),
	/** Unassigned while the order is a quote. */
	engineerId: integer("engineer_id").references(() => engineer.id),
	type: text("type", { enum: orderTypes }).notNull(),
	status: text("status", { enum: orderStatuses }).notNull(),
	priority: text("priority", { enum: orderPriorities }).notNull(),
	description: text("description").notNull(),
	scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
	completedAt: integer("completed_at", { mode: "timestamp" }),
	laborHours: real("labor_hours").notNull().default(0),
	createdAt: createdAt(),
});

/** Materials used on an order, with the unit price at the time of ordering. */
export const orderLine = sqliteTable("order_line", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	orderId: integer("order_id")
		.notNull()
		.references(() => order.id, { onDelete: "cascade" }),
	materialId: integer("material_id")
		.notNull()
		.references(() => material.id),
	quantity: integer("quantity").notNull(),
	/** In cents. */
	unitPrice: integer("unit_price").notNull(),
});

export const customerRelations = relations(customer, ({ many }) => ({
	equipment: many(equipment),
	orders: many(order),
}));

export const engineerRelations = relations(engineer, ({ many }) => ({
	orders: many(order),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
	customer: one(customer, { fields: [equipment.customerId], references: [customer.id] }),
	orders: many(order),
}));

export const materialRelations = relations(material, ({ many }) => ({
	orderLines: many(orderLine),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
	customer: one(customer, { fields: [order.customerId], references: [customer.id] }),
	equipment: one(equipment, { fields: [order.equipmentId], references: [equipment.id] }),
	engineer: one(engineer, { fields: [order.engineerId], references: [engineer.id] }),
	lines: many(orderLine),
}));

export const orderLineRelations = relations(orderLine, ({ one }) => ({
	order: one(order, { fields: [orderLine.orderId], references: [order.id] }),
	material: one(material, { fields: [orderLine.materialId], references: [material.id] }),
}));

export * from "./auth.schema.ts";

// --- Service contracts (optional module, see `#lib/modules.ts`) --------------------------------
// These tables reference the core tables, never the other way round.

/**
 * A maintenance agreement: for a monthly fee, the customer's covered equipment gets service with
 * a guaranteed response time. Its status (upcoming, active, expired) follows from the period,
 * see `contractStatus` in `#lib/models.ts`.
 */
export const contract = sqliteTable("contract", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	number: text("number").notNull().unique(),
	customerId: integer("customer_id")
		.notNull()
		.references(() => customer.id),
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
});

/**
 * The equipment a contract covers (only the contract's customer's). Removing a unit or the
 * contract removes its coverage, so deleting equipment doesn't need to know about contracts.
 */
export const contractEquipment = sqliteTable(
	"contract_equipment",
	{
		contractId: integer("contract_id")
			.notNull()
			.references(() => contract.id, { onDelete: "cascade" }),
		equipmentId: integer("equipment_id")
			.notNull()
			.references(() => equipment.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.contractId, table.equipmentId] })],
);

export const contractRelations = relations(contract, ({ one, many }) => ({
	customer: one(customer, { fields: [contract.customerId], references: [customer.id] }),
	coverage: many(contractEquipment),
}));

export const contractEquipmentRelations = relations(contractEquipment, ({ one }) => ({
	contract: one(contract, { fields: [contractEquipment.contractId], references: [contract.id] }),
	equipment: one(equipment, {
		fields: [contractEquipment.equipmentId],
		references: [equipment.id],
	}),
}));
