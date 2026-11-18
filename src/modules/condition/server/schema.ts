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
import { defectIntensities, defectSeverities } from "../nen2767.ts";

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
 * A unit's condition at a moment, or one of its components' (`component_id`): its defects
 * (`condition_defect`), the NEN 2767 score they give it (1–6, the worst defect's, 1 without any),
 * worked out on the server and kept here so the lists' SQL stays simple, and the advice that goes
 * with it, e.g. "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.". From the unit's
 * checklist when an engineer completed it (on that order, by them; its rejected points are the
 * defects) or recorded by a member in the office, as a correction. Never changed but for the
 * advice the engineer adds to what their checklist gave: a newer one takes its place as the
 * condition, and the older ones are its history. Removing the unit or the component removes them.
 * One recorded as a percentage before NEN 2767 was converted by band (`scoreOfPercent()`), keeping
 * its percentage (`legacy_percent`, which marks it converted) and no defects.
 */
export const unitCondition = tenantTable(
	"unit_condition",
	{
		equipmentId: integer("equipment_id").notNull(),
		/** The component of the unit it's the condition of; none for the unit as a whole. */
		componentId: integer("component_id"),
		/**
		 * On NEN 2767's scale, 1–6: its worst element's, each by NEN 2767-1's method over its defects
		 * (`recordScore()`), derived on the server.
		 */
		score: integer("score").notNull(),
		/**
		 * The percentage it had before conditions were scored on NEN 2767, for one converted then
		 * (none for those recorded since): what the history says it was converted from.
		 */
		legacyPercent: integer("legacy_percent"),
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
		check("unit_condition_score", sql`${table.score} between 1 and 6`),
	],
	{ referenced: true },
);

export const unitConditionRelations = relations(unitCondition, ({ one }) => ({
	equipment: tenantOne(one, unitCondition.equipmentId, equipment),
}));

/**
 * A defect ("gebrek") a condition found: what it is, the element it's on (the unit itself, or one
 * of its components), its severity, extent (in percent) and intensity, and the score NEN 2767's
 * tables give it alone (`defectScore()`, derived on the server; its condition's is its element's
 * defects' together, `recordScore()`). A checklist's comes from a rejected point, which it
 * names by the point's id without a key (the module only enhances checklists). Removing the
 * condition, or the component it's on, removes it.
 */
export const conditionDefect = tenantTable(
	"condition_defect",
	{
		conditionId: integer("condition_id").notNull(),
		/** The component it's on; none for the unit itself. */
		componentId: integer("component_id"),
		/** What's wrong, e.g. "Veerbreuk onderste veer". */
		description: text("description").notNull(),
		severity: text("severity", { enum: defectSeverities }).notNull(),
		/** How much of the element it covers, in whole percents, 1–100 (its class: `extentClass()`). */
		extent: integer("extent").notNull(),
		intensity: text("intensity", { enum: defectIntensities }).notNull(),
		/** Its score, 1–6, from NEN 2767's tables. */
		score: integer("score").notNull(),
		/** The checklist point it was rejected on, by id without a key; none for the office's. */
		checklistPointId: integer("checklist_point_id"),
		/** Where it comes among its condition's defects, from 0. */
		position: integer("position").notNull(),
	},
	(table) => [
		index("condition_defect_condition").on(table.organizationId, table.conditionId, table.position),
		index("condition_defect_component").on(table.organizationId, table.componentId),
		tenantRef(table, table.conditionId, unitCondition, { onDelete: "cascade" }),
		tenantRef(table, table.componentId, component, { onDelete: "cascade" }),
		check("condition_defect_extent", sql`${table.extent} between 1 and 100`),
		check("condition_defect_score", sql`${table.score} between 1 and 6`),
	],
	{ referenced: true },
);

/**
 * The defect an engineer gives a rejected point of a unit's checklist in the portal while it's a
 * draft: its severity, extent and intensity (and photos). The point by id without a key (the module
 * only enhances checklists), one each. When the checklist is completed, a rejected point's becomes
 * a defect of the conditions it records (`recordChecklistConditions()`), and the drafts go.
 */
export const conditionPointDefect = tenantTable(
	"condition_point_defect",
	{
		checklistPointId: integer("checklist_point_id").notNull(),
		/** The unit whose checklist it is: who may see it goes by it. */
		equipmentId: integer("equipment_id").notNull(),
		severity: text("severity", { enum: defectSeverities }).notNull(),
		/** In whole percents of the element, 1–100. */
		extent: integer("extent").notNull(),
		intensity: text("intensity", { enum: defectIntensities }).notNull(),
		updatedAt: moment("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("condition_point_defect_point").on(table.organizationId, table.checklistPointId),
		index("condition_point_defect_equipment").on(table.organizationId, table.equipmentId),
		tenantRef(table, table.equipmentId, equipment, { onDelete: "cascade" }),
		check("condition_point_defect_extent", sql`${table.extent} between 1 and 100`),
	],
	{ referenced: true },
);

/**
 * A photo of a defect: the file is in the photo store (under the tenant's key), the row says whose
 * it is, a recorded defect's or, until its checklist is completed, a rejected point's
 * (`condition_point_defect`): one of the two. Served at `/condition/photos/<id>` to whoever may read
 * its unit's conditions (`serveConditionPhoto()`, `conditionPhoto` in the access registry), never
 * at a public URL. A checklist's defect on a component is the unit's and the component's: it has
 * its photos twice, of the same files.
 */
export const conditionDefectPhoto = tenantTable(
	"condition_defect_photo",
	{
		/** The unit it's of: who may see it goes by it. */
		equipmentId: integer("equipment_id").notNull(),
		defectId: integer("defect_id"),
		pointDefectId: integer("point_defect_id"),
		objectKey: text("object_key").notNull(),
		contentType: text("content_type").notNull(),
		size: integer("size").notNull(),
		/** Its place among its defect's photos, from 0. */
		position: integer("position").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("condition_defect_photo_equipment").on(table.organizationId, table.equipmentId),
		index("condition_defect_photo_defect").on(table.organizationId, table.defectId, table.position),
		index("condition_defect_photo_point").on(table.organizationId, table.pointDefectId),
		tenantRef(table, table.equipmentId, equipment, { onDelete: "cascade" }),
		tenantRef(table, table.defectId, conditionDefect, { onDelete: "cascade" }),
		tenantRef(table, table.pointDefectId, conditionPointDefect, { onDelete: "cascade" }),
		check(
			"condition_defect_photo_owner",
			sql`(${table.defectId} is null) <> (${table.pointDefectId} is null)`,
		),
	],
	{ referenced: true },
);

export const conditionDefectRelations = relations(conditionDefect, ({ one }) => ({
	condition: tenantOne(one, conditionDefect.conditionId, unitCondition),
}));

/**
 * The organization's condition settings: the scores from which a unit is critical and needs
 * attention (on NEN 2767's scale), and whether the daily run makes an order for a critical unit by
 * itself (with when it last looked). Made with the defaults when first read (`settingsOf()`).
 */
export const conditionSettings = tenantTable(
	"condition_settings",
	{
		criticalFrom: integer("critical_from").notNull().default(defaultThresholds.critical),
		attentionFrom: integer("attention_from")
			.notNull()
			.default(
				defaultThresholds.attention,
			) /** Whether the daily run plans the critical units without an open order. */,
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
