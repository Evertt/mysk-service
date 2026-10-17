/**
 * What the checklists module tells the modules that link things to its templates' points: the
 * parts shop (the points a product can fix, `parts-shop.checkpoints`) and the condition module (the
 * points a unit's components can be checked by, `condition.checkpoints`), by id, in the templates'
 * order. A retired template's points are only told when asked for by id, so a product or a
 * component keeps the points it has.
 */
import { and, asc, eq, or } from "drizzle-orm";

import { idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import type { Checkpoint as ComponentCheckpoint } from "#modules/condition/api/extensions.ts";
import type { Checkpoint } from "#modules/parts-shop/api/extensions.ts";

import { checklistTemplate, checklistTemplateItem } from "./schema.ts";
import { offeredTemplate } from "./templates.ts";

/** The tenant's template points with `ids`, or those of its templates in use (`null`). */
export async function shopCheckpoints({
	ids,
}: {
	ids: readonly number[] | null;
}): Promise<Checkpoint[]> {
	return db
		.select({
			id: checklistTemplateItem.id,
			template: checklistTemplate.name,
			group: checklistTemplateItem.group,
			text: checklistTemplateItem.text,
		})
		.from(checklistTemplateItem)
		.innerJoin(...tenantJoin(checklistTemplate, checklistTemplateItem.templateId))
		.where(
			and(
				inTenant(checklistTemplateItem),
				ids ? inList(checklistTemplateItem.id, [...ids]) : eq(checklistTemplate.archived, false),
			),
		)
		.orderBy(asc(checklistTemplate.position), asc(checklistTemplateItem.position));
}

/**
 * The tenant's template points a component of the unit `equipmentId` can be checked by: those of
 * the template its category is inspected by, and those with `ids`. None for another tenant's unit.
 */
export async function unitCheckpoints({
	equipmentId,
	ids,
}: {
	equipmentId: number;
	ids: readonly number[];
}): Promise<ComponentCheckpoint[]> {
	const [unit] = await db
		.select({ categoryId: equipment.categoryId })
		.from(equipment)
		.where(idInTenant(equipment, equipmentId));
	if (!unit) return [];
	const template = await offeredTemplate(db, unit.categoryId);
	const picked = or(
		template ? eq(checklistTemplateItem.templateId, template.id) : undefined,
		ids.length ? inList(checklistTemplateItem.id, [...ids]) : undefined,
	);
	if (!picked) return [];
	return db
		.select({
			id: checklistTemplateItem.id,
			template: checklistTemplate.name,
			group: checklistTemplateItem.group,
			text: checklistTemplateItem.text,
		})
		.from(checklistTemplateItem)
		.innerJoin(...tenantJoin(checklistTemplate, checklistTemplateItem.templateId))
		.where(and(inTenant(checklistTemplateItem), picked))
		.orderBy(asc(checklistTemplate.position), asc(checklistTemplateItem.position));
}
