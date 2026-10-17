/**
 * The materials module's tables: the catalog with its stock, the materials used on orders, and the
 * stock ledger. They reference the core's `order` and `user`; nothing of the core references them.
 */
import { relations } from "drizzle-orm";
import {
	foreignKey,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { createdAt, organizationId } from "#lib/server/db/columns.ts";
import { order, user } from "#lib/server/db/schema.ts";

import { materialUnits, stockMovementKinds } from "../model.ts";

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

/**
 * The stock ledger: every change to a material's stock, signed (positive adds, negative takes),
 * in the material's unit. `material.stock` is the cached balance and always equals the sum of the
 * material's movements: change it only through `moveStock` in `./stock.ts`, which writes
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
		index("stock_movement_material").on(table.organizationId, table.materialId, table.createdAt),
		index("stock_movement_order").on(table.organizationId, table.orderId),
		index("stock_movement_user").on(table.userId),
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

export const materialRelations = relations(material, ({ many }) => ({
	orderLines: many(orderLine),
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
