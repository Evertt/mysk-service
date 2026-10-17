/**
 * What the checklists module tells the parts shop (which it enhances): the template points a
 * product can fix (`parts-shop.checkpoints`), by id, in the templates' order. A retired template's
 * points are only told when asked for by id, so a product keeps the points it has.
 */
import { and, asc, eq } from "drizzle-orm";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import type { Checkpoint } from "#modules/parts-shop/api/extensions.ts";

import { checklistTemplate, checklistTemplateItem } from "./schema.ts";

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
