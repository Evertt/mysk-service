/**
 * What the materials module tells the condition module (which it enhances): the tenant's materials
 * as the articles a unit's components are linked to (`condition.articles`), by SKU.
 */
import { asc } from "drizzle-orm";

import { idsInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import type { Article } from "#modules/condition/api/extensions.ts";

import { material } from "./schema.ts";

/** The most it answers when asked for them all: a component's picker lists them. */
const ALL_MAX = 2000;

/** The tenant's materials with `ids`, or all of them (`null`), as articles. */
export async function materialArticles({
	ids,
}: {
	ids: readonly number[] | null;
}): Promise<Article[]> {
	if (ids && !ids.length) return [];
	return db
		.select({ id: material.id, sku: material.sku, name: material.name })
		.from(material)
		.where(ids ? idsInTenant(material, [...ids]) : inTenant(material))
		.orderBy(asc(material.sku))
		.limit(ids ? ids.length : ALL_MAX);
}
