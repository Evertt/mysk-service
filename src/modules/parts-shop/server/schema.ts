/**
 * The parts shop's tables: its categories, its products (the tenant's materials it offers, with the
 * checklist points each fixes), and its orders with their lines. They reference the core's tables
 * and those of the modules it requires (materials' `material`, the partner programme's wallet
 * entries), never the other way round. A product's points are checklist template points by id,
 * without a foreign key: the shop only enhances checklists, so it can't refer to their tables.
 * Amounts in cents.
 */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { createdAt, moment, tenantRef, tenantTable } from "#lib/server/db/columns.ts";
import { customer, user } from "#lib/server/db/schema.ts";
import { material } from "#modules/materials/api/tables.server.ts";
import { walletEntry } from "#modules/partner-programme/api/tables.server.ts";

import { productUnits, shopOrderStatuses, shopPayments } from "../model.ts";

/** A category of the shop's catalogue, e.g. "Sectionaaldeuren": the tenant's own, in its order. */
export const shopCategory = tenantTable(
	"shop_category",
	{
		name: text("name").notNull(),
		/** Where it comes among the tenant's categories, from 0. */
		position: integer("position").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("shop_category_organization_name").on(
			table.organizationId,
			sql`lower(${table.name})`,
		),
	],
	{ referenced: true },
);

/**
 * One of the tenant's materials in its shop: its category, its description for customers, how it's
 * sold, and whether it's popular, payable with Parts Credit or only to order on request. Its name,
 * SKU, price and stock are the material's.
 */
export const shopProduct = tenantTable(
	"shop_product",
	{
		materialId: integer("material_id").notNull(),
		categoryId: integer("category_id").notNull(),
		description: text("description"),
		unit: text("unit", { enum: productUnits }).notNull(),
		popular: integer("popular", { mode: "boolean" }).notNull().default(false),
		creditEligible: integer("credit_eligible", { mode: "boolean" }).notNull().default(true),
		onRequest: integer("on_request", { mode: "boolean" }).notNull().default(false),
		createdAt: createdAt(),
	},
	(table) => [
		// A material is in the shop once.
		uniqueIndex("shop_product_organization_material").on(table.organizationId, table.materialId),
		index("shop_product_category").on(table.organizationId, table.categoryId),
		tenantRef(table, table.materialId, material, { onDelete: "cascade" }),
		tenantRef(table, table.categoryId, shopCategory),
	],
	{ referenced: true },
);

/**
 * A checklist point a product fixes (§2.8's "Checkpoint-punten"): a rejected point on a checklist
 * suggests it. By the template point's id, without a key (see above); a point that's gone is left
 * out where it's shown.
 */
export const shopProductCheckpoint = tenantTable(
	"shop_product_checkpoint",
	{
		productId: integer("product_id").notNull(),
		templateItemId: integer("template_item_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.productId, table.templateItemId] }),
		index("shop_product_checkpoint_item").on(table.organizationId, table.templateItemId),
		tenantRef(table, table.productId, shopProduct, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/**
 * A customer's order in the shop, placed by one of its contacts in the customer portal: paid with
 * its Parts Credit (the wallet's `spend`), its stock set aside while it's open. Its total excludes
 * VAT, and so does what it took of the credit; the VAT on it is none for now (an open question).
 */
export const shopOrder = tenantTable(
	"shop_order",
	{
		/** `SH-2026-012`. */
		number: text("number").notNull(),
		customerId: integer("customer_id").notNull(),
		/** The contact who placed it; none once their account is gone. */
		placedBy: text("placed_by").references(() => user.id, { onDelete: "set null" }),
		status: text("status", { enum: shopOrderStatuses }).notNull().default("placed"),
		payment: text("payment", { enum: shopPayments }).notNull().default("parts_credit"),
		/** Excluding VAT. */
		total: integer("total").notNull(),
		vat: integer("vat").notNull().default(0),
		/** The wallet's spend that paid it. */
		walletEntryId: integer("wallet_entry_id"),
		createdAt: createdAt(),
		/** When it last changed status. */
		updatedAt: moment("updated_at"),
	},
	(table) => [
		uniqueIndex("shop_order_organization_number").on(table.organizationId, table.number),
		index("shop_order_customer").on(table.organizationId, table.customerId),
		index("shop_order_wallet_entry").on(table.organizationId, table.walletEntryId),
		index("shop_order_placed_by").on(table.placedBy),
		tenantRef(table, table.customerId, customer, { onDelete: "cascade" }),
		tenantRef(table, table.walletEntryId, walletEntry),
	],
	{ referenced: true },
);

/**
 * A line of a shop order: a product's material, how many and at what price (excluding VAT) when
 * ordered, with its SKU and name then, which the order keeps.
 */
export const shopOrderLine = tenantTable(
	"shop_order_line",
	{
		orderId: integer("order_id").notNull(),
		materialId: integer("material_id").notNull(),
		sku: text("sku").notNull(),
		name: text("name").notNull(),
		quantity: integer("quantity").notNull(),
		unitPrice: integer("unit_price").notNull(),
	},
	(table) => [
		index("shop_order_line_order").on(table.organizationId, table.orderId),
		index("shop_order_line_material").on(table.organizationId, table.materialId),
		tenantRef(table, table.orderId, shopOrder, { onDelete: "cascade" }),
		tenantRef(table, table.materialId, material),
	],
);
