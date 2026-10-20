/**
 * The materials module's tables: the catalog with its stock, the materials used on orders, and the
 * stock ledger. They reference the core's `order` and `user`; nothing of the core references them.
 */
import { relations } from "drizzle-orm";
import { index, integer, real, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { createdAt, tenantOne, tenantRef, tenantTable } from "#lib/server/db/columns.ts";
import { order, user } from "#lib/server/db/schema.ts";

import { materialUnits, stockMovementKinds } from "../model.ts";

/** A stocked part or consumable that orders use. */
export const material = tenantTable(
	"material",
	{
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
		index("material_organization_name").on(table.organizationId, table.name),
	],
	{ referenced: true },
);

/** Materials used on an order, with the unit price at the time of ordering. */
export const orderLine = tenantTable(
	"order_line",
	{
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
		tenantRef(table, table.orderId, order, { onDelete: "cascade" }),
		tenantRef(table, table.materialId, material),
	],
);

/**
 * The stock ledger: every change to a material's stock, signed (positive adds, negative takes),
 * in the material's unit. `material.stock` is the cached balance and always equals the sum of the
 * material's movements: change it only through `moveStock` in `./stock.ts`, which writes
 * both in one transaction. Deleting a material deletes its movements.
 */
export const stockMovement = tenantTable(
	"stock_movement",
	{
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
		tenantRef(table, table.materialId, material, { onDelete: "cascade" }),
		tenantRef(table, table.orderId, order),
	],
);

export const stockMovementRelations = relations(stockMovement, ({ one }) => ({
	material: tenantOne(one, stockMovement.materialId, material),
	order: tenantOne(one, stockMovement.orderId, order),
	user: one(user, { fields: [stockMovement.userId], references: [user.id] }),
}));

export const materialRelations = relations(material, ({ many }) => ({
	orderLines: many(orderLine),
}));

export const orderLineRelations = relations(orderLine, ({ one }) => ({
	order: tenantOne(one, orderLine.orderId, order),
	material: tenantOne(one, orderLine.materialId, material),
}));
