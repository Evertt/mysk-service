import { relations, sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { createdAt, day, moment, organizationId } from "#lib/server/db/columns.ts";
import { equipment, order } from "#lib/server/db/schema.ts";

import { defaultLeadDays, planOrderTypes } from "../model.ts";

// This table references the core's, never the other way round.

/**
 * A unit's maintenance plan: a visit every `intervalMonths`, the next one due on `nextDueOn`.
 * "Create orders" on the due list turns a due plan into an order (through the core's
 * `createOrders()`) and moves it on by one interval from its previous due date, on its
 * `anchorDay`. Paused plans aren't due. Removing the unit removes its plans.
 */
export const maintenancePlan = sqliteTable(
	"maintenance_plan",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		equipmentId: integer("equipment_id").notNull(),
		orderType: text("order_type", { enum: planOrderTypes }).notNull(),
		/** Becomes the order's description, e.g. "Annual boiler service". */
		description: text("description").notNull(),
		/** In whole months, 1–60. */
		intervalMonths: integer("interval_months").notNull(),
		/** The day the next visit is due, at local midnight. */
		nextDueOn: day("next_due_on").notNull(),
		/**
		 * The day of the month the visits fall on (1–31): the day of the due date the office last set.
		 * A shorter month takes its last day, and the next step comes back to this one.
		 */
		anchorDay: integer("anchor_day").notNull(),
		paused: integer("paused", { mode: "boolean" }).notNull().default(false),
		/** The order "Create orders" made last; cleared when that order is deleted. */
		lastOrderId: integer("last_order_id"),
		/**
		 * The plan's tenant while it has a last order, else null: the other half of that order's
		 * foreign key. SQLite's `on delete set null` clears every column of a key, and
		 * `organization_id` can't be null, so the key has a tenant column of its own, which the
		 * check holds to the plan's.
		 */
		lastOrderOrganizationId: text("last_order_organization_id"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("maintenance_plan_organization_id").on(table.organizationId, table.id),
		// For the due list and the dashboard, which look for the plans due before a day.
		index("maintenance_plan_organization_next_due").on(table.organizationId, table.nextDueOn),
		// For a unit's plans (its page, the equipment list's column); with the tenant, also the key to
		// the unit.
		index("maintenance_plan_equipment").on(table.equipmentId, table.organizationId),
		index("maintenance_plan_last_order").on(table.lastOrderOrganizationId, table.lastOrderId),
		foreignKey({
			columns: [table.organizationId, table.equipmentId],
			foreignColumns: [equipment.organizationId, equipment.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.lastOrderOrganizationId, table.lastOrderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("set null"),
		check(
			"maintenance_plan_last_order_tenant",
			sql`${table.lastOrderOrganizationId} is null or ${table.lastOrderOrganizationId} = ${table.organizationId}`,
		),
	],
);

/**
 * The organization's maintenance settings: whether the daily run turns its due plans into orders
 * by itself (`runDueMaintenance()`), how far ahead, and whether it tells the customers. Made with
 * the defaults when first read (`settingsOf()`).
 */
export const maintenanceSettings = sqliteTable("maintenance_settings", {
	organizationId: organizationId().primaryKey(),
	/** Whether the daily run makes the orders of the plans that are due. */
	autoCreate: integer("auto_create", { mode: "boolean" }).notNull().default(false),
	/** A plan is due when its next visit is less than this many days away (overdue ones too). */
	leadDays: integer("lead_days").notNull().default(defaultLeadDays),
	/** Whether a customer gets an email when the daily run makes an order for their unit. */
	remindCustomers: integer("remind_customers", { mode: "boolean" }).notNull().default(false),
	/** When the daily run last looked at the plans, and how many orders it made then. */
	lastRunAt: moment("last_run_at"),
	lastRunOrders: integer("last_run_orders"),
});

export const maintenancePlanRelations = relations(maintenancePlan, ({ one }) => ({
	equipment: one(equipment, {
		fields: [maintenancePlan.organizationId, maintenancePlan.equipmentId],
		references: [equipment.organizationId, equipment.id],
	}),
	lastOrder: one(order, {
		fields: [maintenancePlan.lastOrderOrganizationId, maintenancePlan.lastOrderId],
		references: [order.organizationId, order.id],
	}),
}));
