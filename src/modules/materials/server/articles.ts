/**
 * What the materials module tells the condition module (which it enhances): the tenant's materials
 * as the articles a unit's components are linked to (`condition.articles`), by SKU.
 */
import { and, asc, type SQL } from "drizzle-orm";

import { idsInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { searchMatch } from "#lib/server/lists/index.ts";
import type { Article, ArticleQuery } from "#modules/condition/api/extensions.ts";

import { material } from "./schema.ts";

/** The tenant's materials with `ids`, or the first `limit` matching `search`, as articles. */
export async function materialArticles(input: ArticleQuery): Promise<Article[]> {
	if ("ids" in input && !input.ids.length) return [];
	const select = (where: SQL | undefined) =>
		db
			.select({ id: material.id, sku: material.sku, name: material.name })
			.from(material)
			.where(where)
			.orderBy(asc(material.sku));
	return "ids" in input
		? select(idsInTenant(material, [...input.ids])).limit(input.ids.length)
		: select(
				and(inTenant(material), searchMatch([material.sku, material.name], input.search)),
			).limit(input.limit);
}
