/**
 * The shop's catalogue: its products with their materials' SKU, name, price and stock, their
 * categories, and the checklist points each fixes (their texts asked of the checklists module,
 * `parts-shop.checkpoints`). Read by the office's products page, the portal's shop, the checkout
 * and the checklists' suggested parts alike.
 */
import { and, asc, type SQL } from "drizzle-orm";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { collect } from "#lib/server/extensions.ts";
import { stockLevel } from "#modules/materials/api/stock.ts";
import { material } from "#modules/materials/api/tables.server.ts";

import { type Checkpoint, checkpoints } from "../api/extensions.ts";
import { productStock } from "../model.ts";
import { shopCategory, shopProduct, shopProductCheckpoint } from "./schema.ts";

/** The tenant's products that `where` picks, by category (in its order), then SKU. */
export async function catalogue(where?: SQL, tx: Transaction | typeof db = db) {
	const rows = await tx
		.select({
			id: shopProduct.id,
			materialId: shopProduct.materialId,
			sku: material.sku,
			name: material.name,
			/** Excluding VAT, in cents. */
			price: material.unitPrice,
			stock: material.stock,
			materialUnit: material.unit,
			categoryId: shopProduct.categoryId,
			category: shopCategory.name,
			description: shopProduct.description,
			unit: shopProduct.unit,
			popular: shopProduct.popular,
			creditEligible: shopProduct.creditEligible,
			onRequest: shopProduct.onRequest,
		})
		.from(shopProduct)
		.innerJoin(...tenantJoin(material, shopProduct.materialId))
		.innerJoin(...tenantJoin(shopCategory, shopProduct.categoryId))
		.where(and(inTenant(shopProduct), where))
		.orderBy(asc(shopCategory.position), asc(material.sku));
	const linked = await checkpointIdsOf(
		rows.map((row) => row.id),
		tx,
	);
	return rows.map((row) => ({
		...row,
		/** "Op voorraad", "Laag voorraad" or "Op aanvraag", by the materials' low threshold. */
		availability: productStock(row, (stock) => stockLevel(stock, row.materialUnit) === "low"),
		checkpointIds: linked.get(row.id) ?? [],
	}));
}

export type CatalogueRow = Awaited<ReturnType<typeof catalogue>>[number];

/** The checklist points each of the products fixes, by product id. */
async function checkpointIdsOf(productIds: number[], tx: Transaction | typeof db = db) {
	if (!productIds.length) return new Map<number, number[]>();
	const rows = await tx
		.select({
			productId: shopProductCheckpoint.productId,
			templateItemId: shopProductCheckpoint.templateItemId,
		})
		.from(shopProductCheckpoint)
		.where(
			and(inTenant(shopProductCheckpoint), inList(shopProductCheckpoint.productId, productIds)),
		)
		.orderBy(asc(shopProductCheckpoint.templateItemId));
	const byProduct = new Map<number, number[]>();
	for (const row of rows) {
		byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), row.templateItemId]);
	}
	return byProduct;
}

/**
 * The checklist points with these ids (or all that can be chosen: `null`), as the modules that
 * know them answer (`parts-shop.checkpoints`), by id. None without checklists.
 */
export async function checkpointTexts(ids: readonly number[] | null) {
	if (ids && !ids.length) return new Map<number, Checkpoint>();
	const answers = await collect(checkpoints, { ids });
	return new Map(answers.flat().map((point) => [point.id, point]));
}

/** The products with their points' texts (those still there), for the pages that show them. */
export async function withCheckpoints(rows: CatalogueRow[]) {
	const texts = await checkpointTexts([...new Set(rows.flatMap((row) => row.checkpointIds))]);
	return rows.map((row) => ({
		...row,
		checkpoints: row.checkpointIds.flatMap((id) => {
			const point = texts.get(id);
			return point ? [point] : [];
		}),
	}));
}

/** How many of the products run low: the portal's banner ("N artikelen met laag voorraad"). */
export const lowCount = (rows: readonly CatalogueRow[]) =>
	rows.filter((row) => row.availability === "low").length;
