import {
	foreignKey,
	index,
	integer,
	primaryKey,
	real,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";

import { user } from "../auth.schema.ts";
import { createdAt, moment, tenantRef, tenantTable } from "../columns.ts";
import { customer } from "./customers.ts";
import { engineer } from "./engineers.ts";
import { equipment } from "./equipment.ts";

/** A work order for a customer, usually on one or more of their units (`orderUnit`). */
export const order = tenantTable(
	"order",
	{
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
		// For the order's units, which must be its own customer's.
		uniqueIndex("order_customer_id").on(table.customerId, table.id),
		// For the orders list, which is newest first by default and filters by these.
		index("order_organization_created").on(table.organizationId, table.createdAt),
		index("order_organization_status").on(table.organizationId, table.status),
		index("order_organization_customer").on(table.organizationId, table.customerId),
		index("order_organization_engineer").on(table.organizationId, table.engineerId),
		tenantRef(table, table.customerId, customer),
		tenantRef(table, table.engineerId, engineer),
	],
	{ referenced: true },
);

/**
 * One of the units an order is about, e.g. one of the fifteen doors of a yearly inspection. An
 * order has none (a new installation, a survey) or several, in the order they're worked on
 * (`position`, from 0); a unit is on an order at most once. The unit is the order's customer's, so
 * a unit on orders can't move to another customer, and an order keeps no units of a customer it no
 * longer has.
 */
export const orderUnit = tenantTable(
	"order_unit",
	{
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
		tenantRef(table, table.orderId, order, { onDelete: "cascade" }),
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
	{ key: "own" },
);

/**
 * What a tenant changed about one of the order types, which managers keep on the settings page
 * (`#lib/orders/types.ts`): its own names, by language, and whether the order form leaves it out.
 * A type without a row is as standard. Loaded with the tenant, once per request (`loadTenant()`).
 */
export const orderTypeSetting = tenantTable(
	"order_type_setting",
	{
		type: text("type", { enum: orderTypes }).notNull(),
		/** By locale (`{ "nl": "Offerte-opname" }`); a language without a name has the standard one. */
		names: text("names", { mode: "json" }).$type<Partial<Record<string, string>>>().notNull(),
		hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
	},
	(table) => [primaryKey({ columns: [table.organizationId, table.type] })],
	{ key: "own" },
);

// --- Engineer portal ------------------------------------------------------------------------------
// What engineers record on their orders in the field (see `src/routes/(field)/my`).

/** A note written on an order while working on it. */
export const orderNote = tenantTable(
	"order_note",
	{
		orderId: integer("order_id").notNull(),
		/** Who wrote it; empty once their account is deleted. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		text: text("text").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("order_note_order").on(table.organizationId, table.orderId, table.createdAt),
		index("order_note_user").on(table.userId),
		tenantRef(table, table.orderId, order, { onDelete: "cascade" }),
	],
);

/**
 * The sign-off of a completed order, the work order's signatures: who signed for the customer and
 * their signature as drawn on the engineer's screen (a PNG data URL), and the engineer's own. One
 * per order; completing it again replaces it.
 */
export const orderSignoff = tenantTable(
	"order_signoff",
	{
		orderId: integer("order_id").primaryKey(),
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
		tenantRef(table, table.orderId, order, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/**
 * An order a customer's contact reported in the customer portal (a breakdown), and the planner's
 * decision on it: while the order is `awaiting_acceptance` there's none; accepting it sets
 * `decidedAt`, rejecting it also `rejectionReason`, which the customer reads in their portal.
 * Orders made in the office have none.
 */
export const orderRequest = tenantTable(
	"order_request",
	{
		orderId: integer("order_id").primaryKey(),
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
		tenantRef(table, table.orderId, order, { onDelete: "cascade" }),
	],
	{ key: "own" },
);
