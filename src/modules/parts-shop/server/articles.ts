/**
 * What the parts shop tells the condition module (which it enhances): the checklist points the
 * products of the articles asked about fix (`condition.articleCheckpoints`), what a component with
 * one of them as its article is checked by unless it's told otherwise.
 */
import { and, asc, eq } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import type { ArticleCheckpoints } from "#modules/condition/api/extensions.ts";

import { shopProduct, shopProductCheckpoint } from "./schema.ts";

/** The points the tenant's products of the materials `materialIds` fix, per material in the shop. */
export async function articleCheckpointsOf({
	materialIds,
}: {
	materialIds: readonly number[];
}): Promise<ArticleCheckpoints[]> {
	if (!materialIds.length) return [];
	const found = await db
		.select({
			materialId: shopProduct.materialId,
			templateItemId: shopProductCheckpoint.templateItemId,
		})
		.from(shopProduct)
		.innerJoin(
			shopProductCheckpoint,
			and(
				eq(shopProductCheckpoint.organizationId, shopProduct.organizationId),
				eq(shopProductCheckpoint.productId, shopProduct.id),
			),
		)
		.where(and(inList(shopProduct.materialId, [...materialIds]), inTenant(shopProduct)))
		.orderBy(asc(shopProduct.materialId), asc(shopProductCheckpoint.templateItemId));
	return [...Map.groupBy(found, (row) => row.materialId)].map(([materialId, rows]) => ({
		materialId,
		templateItemIds: rows.map((row) => row.templateItemId),
	}));
}
