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

import { createdAt, moment, organizationId } from "#lib/server/db/columns.ts";
import { engineer, equipment, order, user } from "#lib/server/db/schema.ts";

import { conditionSources, defaultThresholds } from "../model.ts";

// These tables reference the core's, never the other way round.

/**
 * A unit's condition at a moment: a score from 0 to 100 and the advice that goes with it, e.g.
 * "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.", recorded by an engineer after the
 * unit's checklist (on that order) or by a member in the office. Never changed: a newer one takes
 * its place as the unit's condition, and the older ones are its history. Removing the unit
 * removes them.
 */
export const unitCondition = sqliteTable(
	"unit_condition",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		equipmentId: integer("equipment_id").notNull(),
		/** In percent, 0–100. */
		score: integer("score").notNull(),
		advice: text("advice"),
		source: text("source", { enum: conditionSources }).notNull(),
		/** The order it was recorded on (an engineer's, after its checklist); cleared when that goes. */
		orderId: integer("order_id"),
		/**
		 * The record's tenant while it has an order, else null: the other half of the order's key
		 * (`on delete set null` clears every column of a key, see `maintenance_plan`).
		 */
		orderOrganizationId: text("order_organization_id"),
		/** The engineer who recorded it in the portal. */
		engineerId: integer("engineer_id"),
		/** The member who recorded it in the office (or the engineer's account). */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		recordedAt: moment("recorded_at").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("unit_condition_organization_id").on(table.organizationId, table.id),
		// A unit's latest condition and its history.
		index("unit_condition_equipment").on(table.equipmentId, table.recordedAt),
		foreignKey({
			columns: [table.organizationId, table.equipmentId],
			foreignColumns: [equipment.organizationId, equipment.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.orderOrganizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("set null"),
		foreignKey({
			columns: [table.organizationId, table.engineerId],
			foreignColumns: [engineer.organizationId, engineer.id],
		}),
		check("unit_condition_score", sql`${table.score} between 0 and 100`),
		check(
			"unit_condition_order_tenant",
			sql`${table.orderOrganizationId} is null or ${table.orderOrganizationId} = ${table.organizationId}`,
		),
	],
);

export const unitConditionRelations = relations(unitCondition, ({ one }) => ({
	equipment: one(equipment, {
		fields: [unitCondition.organizationId, unitCondition.equipmentId],
		references: [equipment.organizationId, equipment.id],
	}),
}));

/**
 * The organization's condition settings: the scores below which a unit is critical and needs
 * attention, and whether the daily run makes an order for a critical unit by itself (with when it
 * last looked). Made with the defaults when first read (`settingsOf()`).
 */
export const conditionSettings = sqliteTable("condition_settings", {
	organizationId: organizationId().primaryKey(),
	criticalBelow: integer("critical_below").notNull().default(defaultThresholds.critical),
	attentionBelow: integer("attention_below").notNull().default(defaultThresholds.attention),
	/** Whether the daily run plans the critical units without an open order. */
	autoPlan: integer("auto_plan", { mode: "boolean" }).notNull().default(false),
	lastRunAt: moment("last_run_at"),
	lastRunOrders: integer("last_run_orders"),
});
