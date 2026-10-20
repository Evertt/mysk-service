import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import {
	createdAt,
	day,
	moment,
	tenantOne,
	tenantRef,
	tenantTable,
} from "#lib/server/db/columns.ts";
import { engineer, equipmentCategory, orderUnit, user } from "#lib/server/db/schema.ts";

import {
	checklistKinds,
	checklistStatuses,
	defaultValidityMonths,
	pointResults,
} from "../model.ts";

// These tables reference the core's, never the other way round.

/**
 * A checklist the tenant inspects or services a kind of unit by, e.g. "Sectionaaldeur" by
 * NEN-EN 12604/12453: its points (`checklist_template_item`) and the equipment categories it's for
 * (`checklist_template_category`). Its texts are the tenant's own (in its language), not messages.
 * A template is never deleted, so the checklists made with it keep their template: it's retired
 * instead (`archived`), which frees its categories and stops it being offered.
 */
export const checklistTemplate = tenantTable(
	"checklist_template",
	{
		name: text("name").notNull(),
		/** The norm it inspects by, e.g. "NEN-EN 12604/12453"; none for a general inspection. */
		norm: text("norm"),
		/** How many months an inspection by it stays valid. */
		validityMonths: integer("validity_months").notNull().default(defaultValidityMonths),
		/** Where it comes in the tenant's templates, from 0. */
		position: integer("position").notNull(),
		/** Retired: kept for the checklists made with it, but no longer offered. */
		archived: integer("archived", { mode: "boolean" }).notNull().default(false),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant, whatever the case, like equipment categories.
		uniqueIndex("checklist_template_organization_name").on(
			table.organizationId,
			sql`lower(${table.name})`,
		),
		index("checklist_template_organization_position").on(table.organizationId, table.position),
	],
	{ referenced: true },
);

/**
 * A point of a template's checklist, e.g. "Torsieveren op spanning en breuk gecontroleerd", in a
 * group such as "Mechanisch" (the group is just this text; the template shows its points under
 * their groups' headings). `position` orders all of a template's points, from 0, with each group's
 * together (see `orderPoints()` in `../model.ts`).
 */
export const checklistTemplateItem = tenantTable(
	"checklist_template_item",
	{
		templateId: integer("template_id").notNull(),
		/** E.g. "Mechanisch"; empty for a point outside any group. */
		group: text("group_name").notNull().default(""),
		text: text("text").notNull(),
		position: integer("position").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("checklist_template_item_template").on(
			table.organizationId,
			table.templateId,
			table.position,
		),
		tenantRef(table, table.templateId, checklistTemplate, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

/**
 * Which of the tenant's equipment categories a template is for: a unit of the category is
 * inspected by it. A category has at most one template (the primary key); deleting either
 * removes the link.
 */
export const checklistTemplateCategory = tenantTable(
	"checklist_template_category",
	{
		categoryId: integer("category_id").notNull(),
		templateId: integer("template_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.categoryId] }),
		index("checklist_template_category_template").on(table.templateId, table.organizationId),
		tenantRef(table, table.templateId, checklistTemplate, { onDelete: "cascade" }),
		tenantRef(table, table.categoryId, equipmentCategory, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

export const checklistTemplateRelations = relations(checklistTemplate, ({ many }) => ({
	items: many(checklistTemplateItem),
	categories: many(checklistTemplateCategory),
}));

export const checklistTemplateItemRelations = relations(checklistTemplateItem, ({ one }) => ({
	template: tenantOne(one, checklistTemplateItem.templateId, checklistTemplate),
}));

export const checklistTemplateCategoryRelations = relations(
	checklistTemplateCategory,
	({ one }) => ({
		template: tenantOne(one, checklistTemplateCategory.templateId, checklistTemplate),
		category: tenantOne(one, checklistTemplateCategory.categoryId, equipmentCategory),
	}),
);

/**
 * A unit's checklist on an inspection or maintenance order (the digital work order, "werkbon"):
 * one per unit of the order (`order_unit`, so the unit must be one of the order's, and it goes when
 * the unit is taken off the order or the order is deleted), made from the template of the unit's
 * category when the order gets the unit. Its template's name, norm and validity are copied (and its
 * points, `checklist_result`), so a later change to the template never rewrites an inspection.
 * While it's a draft the engineer fills it in; completed, it's on record and isn't changed again.
 */
export const checklist = tenantTable(
	"checklist",
	{
		orderId: integer("order_id").notNull(),
		equipmentId: integer("equipment_id").notNull(),
		/** The template it was made from. Templates are never deleted (they're retired). */
		templateId: integer("template_id").notNull(),
		/** The template's name, norm and validity when it was made. */
		name: text("name").notNull(),
		norm: text("norm"),
		validityMonths: integer("validity_months").notNull(),
		/** As the order's type: an inspection or a maintenance visit. */
		kind: text("kind", { enum: checklistKinds }).notNull(),
		status: text("status", { enum: checklistStatuses }).notNull().default("draft"),
		/** The general remark and advice for the customer ("Algemene opmerking / advies aan klant"). */
		remarks: text("remarks"),
		completedAt: moment("completed_at"),
		/** The engineer who completed it in the field; none when the office completed it. */
		completedBy: integer("completed_by"),
		/**
		 * Who completed it, as a user: the engineer's account in the field, or the office member who
		 * filled it in on the engineer's behalf (from a paper form brought back), then without an
		 * engineer. None for a checklist completed before this was kept.
		 */
		completedByUser: text("completed_by_user").references(() => user.id, { onDelete: "set null" }),
		/**
		 * An inspection's last valid day, from the day it was completed and its validity (see
		 * `validUntil()` in `../model.ts`): what a unit's inspection status is worked out from.
		 */
		validUntil: day("valid_until"),
		createdAt: createdAt(),
	},
	(table) => [
		// One per unit per order.
		uniqueIndex("checklist_order_equipment").on(table.orderId, table.equipmentId),
		// A unit's checklists: its history, its latest inspection.
		index("checklist_equipment").on(table.equipmentId, table.kind, table.completedAt),
		// The keys to the order's unit, the template and the engineer.
		index("checklist_order_unit").on(table.organizationId, table.orderId, table.equipmentId),
		index("checklist_by_template").on(table.organizationId, table.templateId),
		index("checklist_completed_by").on(table.organizationId, table.completedBy),
		index("checklist_completed_by_user").on(table.completedByUser),
		tenantRef(table, [table.orderId, table.equipmentId], orderUnit, {
			onDelete: "cascade",
			to: [orderUnit.orderId, orderUnit.equipmentId],
		}),
		tenantRef(table, table.templateId, checklistTemplate),
		tenantRef(table, table.completedBy, engineer),
	],
	{ referenced: true },
);

/**
 * A point of a checklist, copied from its template when the checklist was made: its group, text and
 * place, the template point it came from, and what the engineer found (`result`, none until
 * answered) with a remark, which a rejection (`nok`) needs.
 */
export const checklistResult = tenantTable(
	"checklist_result",
	{
		checklistId: integer("checklist_id").notNull(),
		/**
		 * The template point it was copied from, by id without a key: a template's points may be
		 * deleted while the checklists made with it stay on record (ids aren't reused). What the
		 * modules link to a point by: the parts shop's products, the condition module's components.
		 * None for a point copied before this was kept that no template point matched.
		 */
		templateItemId: integer("template_item_id"),
		group: text("group_name").notNull().default(""),
		text: text("text").notNull(),
		/** Its place among the checklist's points, from 0, as in the template then. */
		position: integer("position").notNull(),
		result: text("result", { enum: pointResults }),
		remark: text("remark"),
	},
	(table) => [
		uniqueIndex("checklist_result_checklist_position").on(table.checklistId, table.position),
		index("checklist_result_checklist").on(table.organizationId, table.checklistId),
		tenantRef(table, table.checklistId, checklist, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

export const checklistRelations = relations(checklist, ({ many }) => ({
	results: many(checklistResult),
}));

export const checklistResultRelations = relations(checklistResult, ({ one }) => ({
	checklist: tenantOne(one, checklistResult.checklistId, checklist),
}));
