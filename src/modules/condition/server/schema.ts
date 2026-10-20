import { relations, sql } from "drizzle-orm";
import { check, index, integer, primaryKey, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import {
	createdAt,
	moment,
	optionalTenantColumns,
	optionalTenantRef,
	tenantOne,
	tenantRef,
	tenantTable,
} from "#lib/server/db/columns.ts";
import { engineer, equipment, order, user } from "#lib/server/db/schema.ts";

import { conditionSources, defaultThresholds } from "../model.ts";

// These tables reference the core's, never the other way round.

/**
 * A component of a unit ("onderdeel"), e.g. the torsion spring set of a sectional door: what
 * Connect tracks the condition of, numbered per tenant (`OC-0001`), in its unit's order. Its article
 * is one of the materials module's materials (whose SKU the parts shop sells), by id without a key:
 * the module only enhances materials, so it can't refer to their table, and an article that's gone
 * is left out where it's shown. Removing the unit removes its components.
 */
export const component = tenantTable(
	"component",
	{
		equipmentId: integer("equipment_id").notNull(),
		/** `OC-0001`. */
		number: text("number").notNull(),
		/** E.g. "Torsieveerpakket": the tenant's own text. */
		name: text("name").notNull(),
		/** The article: a material's id (see above); none without one. */
		materialId: integer("material_id"),
		/** Where it comes among its unit's components, from 0. */
		position: integer("position").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("component_organization_number").on(table.organizationId, table.number),
		// A unit's components in their order.
		index("component_equipment").on(table.organizationId, table.equipmentId, table.position),
		tenantRef(table, table.equipmentId, equipment, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

/**
 * A checklist point that checks a component: one of its unit's template's points, by the template
 * point's id without a key (the module only enhances checklists), like the parts shop's products'
 * points. A completed checklist's answers to them give the component its score.
 */
export const componentCheckpoint = tenantTable(
	"component_checkpoint",
	{
		componentId: integer("component_id").notNull(),
		templateItemId: integer("template_item_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.componentId, table.templateItemId] }),
		index("component_checkpoint_item").on(table.organizationId, table.templateItemId),
		tenantRef(table, table.componentId, component, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/**
 * A unit's condition at a moment, or one of its components' (`component_id`): a score from 0 to 100
 * and the advice that goes with it, e.g. "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
 * worked out from the unit's checklist when an engineer completed it (on that order, by them) or
 * recorded by a member in the office, as a correction. Never changed but for the advice the
 * engineer adds to what their checklist gave: a newer one takes its place as the condition, and
 * the older ones are its history. Removing the unit or the component removes them.
 */
export const unitCondition = tenantTable(
	"unit_condition",
	{
		equipmentId: integer("equipment_id").notNull(),
		/** The component of the unit it's the condition of; none for the unit as a whole. */
		componentId: integer("component_id"),
		/** In percent, 0–100. */
		score: integer("score").notNull(),
		advice: text("advice"),
		source: text("source", { enum: conditionSources }).notNull(),
		/**
		 * The order it was recorded on (an engineer's, after its checklist), with the record's tenant
		 * while it has one (see `optionalTenantColumns()`); cleared when that goes.
		 */
		...optionalTenantColumns("order"),
		/** The engineer who recorded it in the portal. */
		engineerId: integer("engineer_id"),
		/** The member who recorded it in the office (or the engineer's account). */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		recordedAt: moment("recorded_at").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		// A unit's latest condition and its history.
		index("unit_condition_equipment").on(table.organizationId, table.equipmentId, table.recordedAt),
		// A component's latest condition and its history.
		index("unit_condition_component").on(table.organizationId, table.componentId, table.recordedAt),
		...optionalTenantRef(table, "order", order),
		index("unit_condition_engineer").on(table.organizationId, table.engineerId),
		index("unit_condition_user").on(table.userId),
		tenantRef(table, table.equipmentId, equipment, { onDelete: "cascade" }),
		tenantRef(table, table.componentId, component, { onDelete: "cascade" }),
		tenantRef(table, table.engineerId, engineer),
		check("unit_condition_score", sql`${table.score} between 0 and 100`),
	],
	{ referenced: true },
);

export const unitConditionRelations = relations(unitCondition, ({ one }) => ({
	equipment: tenantOne(one, unitCondition.equipmentId, equipment),
}));

/**
 * The organization's condition settings: the scores below which a unit is critical and needs
 * attention, and whether the daily run makes an order for a critical unit by itself (with when it
 * last looked). Made with the defaults when first read (`settingsOf()`).
 */
export const conditionSettings = tenantTable(
	"condition_settings",
	{
		criticalBelow: integer("critical_below").notNull().default(defaultThresholds.critical),
		attentionBelow: integer("attention_below").notNull().default(defaultThresholds.attention),
		/** Whether the daily run plans the critical units without an open order. */
		autoPlan: integer("auto_plan", { mode: "boolean" }).notNull().default(false),
		lastRunAt: moment("last_run_at"),
		lastRunOrders: integer("last_run_orders"),
	},
	undefined,
	{ key: "tenant" },
);

export const componentRelations = relations(component, ({ one, many }) => ({
	equipment: tenantOne(one, component.equipmentId, equipment),
	checkpoints: many(componentCheckpoint),
}));

export const componentCheckpointRelations = relations(componentCheckpoint, ({ one }) => ({
	component: tenantOne(one, componentCheckpoint.componentId, component),
}));
