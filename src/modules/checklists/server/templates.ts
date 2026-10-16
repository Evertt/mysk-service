/**
 * The tenant's checklist templates, which managers keep (`templates.remote.ts`): a template's
 * details, the equipment categories it's for, retiring and restoring it, each in a transaction that
 * also logs it (`recordActivity`). Names are unique within the tenant, whatever their case; a
 * category has at most one template; a retired template has none, and isn't changed until it's
 * restored. Its points are in `points.ts`.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { equipment, equipmentCategory } from "#lib/server/db/schema.ts";

import type { TemplateInput } from "../form/template-schema.ts";
import { orderPoints } from "../model.ts";
import { checklistTemplate, checklistTemplateCategory, checklistTemplateItem } from "./schema.ts";

/** Refuses a form with a message on one of its fields (`issue.name` of a remote form). */
type FieldIssue = (message: string) => Parameters<typeof invalid>[number];

/** A template as the activity log knows it: by its name. */
export const templateSubject = (template: { id: number; name: string }) => ({
	type: "checklistTemplate",
	id: template.id,
	label: template.name,
});

/** The tenant's template `id`, or a 404. */
async function findTemplate(tx: Transaction | typeof db, id: number) {
	const [found] = await tx
		.select()
		.from(checklistTemplate)
		.where(idInTenant(checklistTemplate, id));
	if (!found) error(404, m.checklists_template_not_found());
	return found;
}

/** The tenant's template `id`, or a 404; refuses one that's retired, which isn't changed. */
export async function findActiveTemplate(tx: Transaction, id: number) {
	const found = await findTemplate(tx, id);
	if (found.archived) invalid(m.checklists_retired_refused({ name: found.name }));
	return found;
}

/** The ids of the categories template `id` is for, in order. */
async function categoryIdsOf(tx: Transaction | typeof db, id: number) {
	const rows = await tx
		.select({ id: checklistTemplateCategory.categoryId })
		.from(checklistTemplateCategory)
		.where(and(eq(checklistTemplateCategory.templateId, id), inTenant(checklistTemplateCategory)))
		.orderBy(asc(checklistTemplateCategory.categoryId));
	return rows.map((row) => row.id);
}

/** The tenant's categories in their order, with the template each is for, if any. */
function categoriesWithTemplates(tx: Transaction | typeof db) {
	return tx
		.select({
			id: equipmentCategory.id,
			name: equipmentCategory.name,
			templateId: checklistTemplate.id,
			templateName: checklistTemplate.name,
		})
		.from(equipmentCategory)
		.leftJoin(
			checklistTemplateCategory,
			and(
				eq(checklistTemplateCategory.organizationId, equipmentCategory.organizationId),
				eq(checklistTemplateCategory.categoryId, equipmentCategory.id),
			),
		)
		.leftJoin(...tenantJoin(checklistTemplate, checklistTemplateCategory.templateId))
		.where(inTenant(equipmentCategory))
		.orderBy(asc(equipmentCategory.position), asc(equipmentCategory.id));
}

/**
 * The tenant's templates in their order, the retired ones too, with their categories and how many
 * points each has; and the categories that have no template, the gaps.
 */
export async function templateList() {
	const points = db
		.select({ templateId: checklistTemplateItem.templateId, n: count().as("n") })
		.from(checklistTemplateItem)
		.where(inTenant(checklistTemplateItem))
		.groupBy(checklistTemplateItem.templateId)
		.as("points");
	const [templates, categories] = await Promise.all([
		db
			.select({
				id: checklistTemplate.id,
				name: checklistTemplate.name,
				norm: checklistTemplate.norm,
				validityMonths: checklistTemplate.validityMonths,
				archived: checklistTemplate.archived,
				pointCount: sql<number>`coalesce(${points.n}, 0)`,
			})
			.from(checklistTemplate)
			.leftJoin(points, eq(points.templateId, checklistTemplate.id))
			.where(inTenant(checklistTemplate))
			.orderBy(asc(checklistTemplate.position), asc(checklistTemplate.id)),
		categoriesWithTemplates(db),
	]);
	const byTemplate = Map.groupBy(
		categories.filter((category) => category.templateId !== null),
		(category) => category.templateId!,
	);
	return {
		templates: templates.map((template) => ({
			...template,
			categories: (byTemplate.get(template.id) ?? []).map(({ id, name }) => ({ id, name })),
		})),
		uncovered: categories
			.filter((category) => category.templateId === null)
			.map(({ id, name }) => ({ id, name })),
	};
}

/**
 * The tenant's template `id` (or a 404) with its points in their order, and the tenant's
 * categories with the template each is for.
 */
export async function templateDetail(id: number) {
	const template = await findTemplate(db, id);
	const [points, categories] = await Promise.all([
		db
			.select({
				id: checklistTemplateItem.id,
				group: checklistTemplateItem.group,
				text: checklistTemplateItem.text,
				position: checklistTemplateItem.position,
			})
			.from(checklistTemplateItem)
			.where(and(eq(checklistTemplateItem.templateId, id), inTenant(checklistTemplateItem))),
		categoriesWithTemplates(db),
	]);
	return { template, points: orderPoints(points), categories };
}

/**
 * The template a unit of the tenant's category `categoryId` is inspected by: the one that's for
 * the category, unless it's retired (it then has none). Null when there's none.
 */
export async function offeredTemplate(tx: Transaction | typeof db, categoryId: number) {
	const [found] = await tx
		.select({
			id: checklistTemplate.id,
			name: checklistTemplate.name,
			norm: checklistTemplate.norm,
			validityMonths: checklistTemplate.validityMonths,
		})
		.from(checklistTemplateCategory)
		.innerJoin(...tenantJoin(checklistTemplate, checklistTemplateCategory.templateId))
		.where(
			and(
				eq(checklistTemplateCategory.categoryId, categoryId),
				inTenant(checklistTemplateCategory),
				eq(checklistTemplate.archived, false),
			),
		);
	return found ?? null;
}

/** The tenant's unit `serialNumber` (or a 404) with its category and the template it's offered. */
export async function unitTemplate(serialNumber: string) {
	const [unit] = await db
		.select({
			id: equipment.id,
			categoryId: equipment.categoryId,
			category: equipmentCategory.name,
		})
		.from(equipment)
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!unit) error(404, m.checklists_equipment_not_found({ serial: serialNumber }));
	return { category: unit.category, template: await offeredTemplate(db, unit.categoryId) };
}

/** Refuses `name` if another of the tenant's templates (than `except`) has it, in any case. */
async function refuseTakenName(tx: Transaction, name: string, issue: FieldIssue, except?: number) {
	const [taken] = await tx
		.select({ name: checklistTemplate.name })
		.from(checklistTemplate)
		.where(
			and(
				inTenant(checklistTemplate),
				eq(sql`lower(${checklistTemplate.name})`, name.toLowerCase()),
				except === undefined ? undefined : ne(checklistTemplate.id, except),
			),
		);
	if (taken) invalid(issue(m.checklists_name_taken({ name: taken.name })));
}

/** Adds a template to the tenant's, last in their order and without points; returns its id. */
export function createTemplate(input: TemplateInput, issue: FieldIssue) {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		await refuseTakenName(tx, input.name, issue);
		const [{ last }] = await tx
			.select({ last: sql<number | null>`max(${checklistTemplate.position})` })
			.from(checklistTemplate)
			.where(inTenant(checklistTemplate));
		const [created] = await tx
			.insert(checklistTemplate)
			.values({ ...input, organizationId, position: (last ?? -1) + 1 })
			.returning({ id: checklistTemplate.id });
		await recordActivity(tx, {
			action: "created",
			subject: templateSubject({ id: created.id, name: input.name }),
		});
		return created.id;
	});
}

/** Changes the details of the tenant's template `id`: its name, norm and validity. */
export function updateTemplate(id: number, input: TemplateInput, issue: FieldIssue) {
	return db.transaction(async (tx) => {
		const existing = await findActiveTemplate(tx, id);
		await refuseTakenName(tx, input.name, issue, id);
		await tx.update(checklistTemplate).set(input).where(idInTenant(checklistTemplate, id));
		await recordActivity(tx, {
			action: "updated",
			subject: templateSubject({ id, name: input.name }),
			before: existing,
			after: input,
		});
	});
}

/**
 * Makes the tenant's template `id` the one for the categories `categoryIds` (and no others).
 * Refuses a category that isn't the tenant's (a 404) or that another template is for (with
 * `issue`, naming both).
 */
export function setTemplateCategories(id: number, categoryIds: number[], issue: FieldIssue) {
	const { organizationId } = currentTenant();
	const wanted = [...new Set(categoryIds)].toSorted((a, b) => a - b);
	return db.transaction(async (tx) => {
		const template = await findActiveTemplate(tx, id);
		const before = await categoryIdsOf(tx, id);
		const categories = await categoriesWithTemplates(tx);
		for (const categoryId of wanted) {
			const category = categories.find((c) => c.id === categoryId);
			if (!category) error(404, m.checklists_category_not_found());
			if (category.templateId !== null && category.templateId !== id) {
				invalid(
					issue(
						m.checklists_category_taken({
							category: category.name,
							template: category.templateName!,
						}),
					),
				);
			}
		}
		await tx
			.delete(checklistTemplateCategory)
			.where(
				and(eq(checklistTemplateCategory.templateId, id), inTenant(checklistTemplateCategory)),
			);
		if (wanted.length) {
			await tx
				.insert(checklistTemplateCategory)
				.values(wanted.map((categoryId) => ({ organizationId, templateId: id, categoryId })));
		}
		await recordActivity(tx, {
			action: "updated",
			subject: templateSubject(template),
			before: { categoryIds: before },
			after: { categoryIds: wanted },
		});
	});
}

/**
 * Retires the tenant's template `id`: it's kept, with its points, but no longer offered, and its
 * categories are free for another. Nothing changes for one that's retired already.
 */
export function retireTemplate(id: number) {
	return db.transaction(async (tx) => {
		const template = await findTemplate(tx, id);
		if (template.archived) return;
		const categoryIds = await categoryIdsOf(tx, id);
		await tx
			.delete(checklistTemplateCategory)
			.where(
				and(eq(checklistTemplateCategory.templateId, id), inTenant(checklistTemplateCategory)),
			);
		await tx
			.update(checklistTemplate)
			.set({ archived: true })
			.where(idInTenant(checklistTemplate, id));
		// The categories it gave up are in the entry; without any, it's just retired.
		const changes = categoryIds.length
			? { before: { categoryIds }, after: { categoryIds: [] } }
			: {};
		await recordActivity(tx, { action: "retired", subject: templateSubject(template), ...changes });
	});
}

/** Restores the tenant's retired template `id`, without categories; nothing for an active one. */
export function restoreTemplate(id: number) {
	return db.transaction(async (tx) => {
		const template = await findTemplate(tx, id);
		if (!template.archived) return;
		await tx
			.update(checklistTemplate)
			.set({ archived: false })
			.where(idInTenant(checklistTemplate, id));
		await recordActivity(tx, { action: "restored", subject: templateSubject(template) });
	});
}
