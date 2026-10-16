import { relations, sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { createdAt, organizationId } from "#lib/server/db/columns.ts";
import { equipmentCategory } from "#lib/server/db/schema.ts";

import { defaultValidityMonths } from "../model.ts";

// These tables reference the core's, never the other way round.

/**
 * A checklist the tenant inspects or services a kind of unit by, e.g. "Sectionaaldeur" by
 * NEN-EN 12604/12453: its points (`checklist_template_item`) and the equipment categories it's for
 * (`checklist_template_category`). Its texts are the tenant's own (in its language), not messages.
 * A template is never deleted, so the checklists made with it keep their template: it's retired
 * instead (`archived`), which frees its categories and stops it being offered.
 */
export const checklistTemplate = sqliteTable(
	"checklist_template",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
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
		uniqueIndex("checklist_template_organization_id").on(table.organizationId, table.id),
		// Unique within a tenant, whatever the case, like equipment categories.
		uniqueIndex("checklist_template_organization_name").on(
			table.organizationId,
			sql`lower(${table.name})`,
		),
		index("checklist_template_organization_position").on(table.organizationId, table.position),
	],
);

/**
 * A point of a template's checklist, e.g. "Torsieveren op spanning en breuk gecontroleerd", in a
 * group such as "Mechanisch" (the group is just this text; the template shows its points under
 * their groups' headings). `position` orders all of a template's points, from 0, with each group's
 * together (see `orderPoints()` in `../model.ts`).
 */
export const checklistTemplateItem = sqliteTable(
	"checklist_template_item",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		templateId: integer("template_id").notNull(),
		/** E.g. "Mechanisch"; empty for a point outside any group. */
		group: text("group_name").notNull().default(""),
		text: text("text").notNull(),
		position: integer("position").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("checklist_template_item_organization_id").on(table.organizationId, table.id),
		index("checklist_template_item_template").on(table.templateId, table.position),
		foreignKey({
			columns: [table.organizationId, table.templateId],
			foreignColumns: [checklistTemplate.organizationId, checklistTemplate.id],
		}).onDelete("cascade"),
	],
);

/**
 * Which of the tenant's equipment categories a template is for: a unit of the category is
 * inspected by it. A category has at most one template (the primary key); deleting either
 * removes the link.
 */
export const checklistTemplateCategory = sqliteTable(
	"checklist_template_category",
	{
		organizationId: organizationId(),
		categoryId: integer("category_id").notNull(),
		templateId: integer("template_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.categoryId] }),
		index("checklist_template_category_template").on(table.templateId),
		foreignKey({
			columns: [table.organizationId, table.templateId],
			foreignColumns: [checklistTemplate.organizationId, checklistTemplate.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.categoryId],
			foreignColumns: [equipmentCategory.organizationId, equipmentCategory.id],
		}).onDelete("cascade"),
	],
);

export const checklistTemplateRelations = relations(checklistTemplate, ({ many }) => ({
	items: many(checklistTemplateItem),
	categories: many(checklistTemplateCategory),
}));

export const checklistTemplateItemRelations = relations(checklistTemplateItem, ({ one }) => ({
	template: one(checklistTemplate, {
		fields: [checklistTemplateItem.organizationId, checklistTemplateItem.templateId],
		references: [checklistTemplate.organizationId, checklistTemplate.id],
	}),
}));

export const checklistTemplateCategoryRelations = relations(
	checklistTemplateCategory,
	({ one }) => ({
		template: one(checklistTemplate, {
			fields: [checklistTemplateCategory.organizationId, checklistTemplateCategory.templateId],
			references: [checklistTemplate.organizationId, checklistTemplate.id],
		}),
		category: one(equipmentCategory, {
			fields: [checklistTemplateCategory.organizationId, checklistTemplateCategory.categoryId],
			references: [equipmentCategory.organizationId, equipmentCategory.id],
		}),
	}),
);
