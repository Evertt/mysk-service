/**
 * The shop's products and categories as the office manages them: which of the tenant's materials
 * are in the shop, with their category, description, unit, flags and the checklist points they fix;
 * and the categories, in their order. Every change is logged.
 */
import { error } from "@sveltejs/kit";
import { and, asc, count, eq, sql } from "drizzle-orm";
import type * as v from "valibot";

import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, sameTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { deleteAndLog, defineRemoval, nameTaken, nextPosition } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";
import { material } from "#modules/materials/api/tables.server.ts";

import type { productSchema } from "../form/schemas.ts";
import { checkpointTexts } from "./catalogue.ts";
import { shopCategory, shopProduct, shopProductCheckpoint } from "./schema.ts";

/** The tenant's categories, in their order, with how many products each has. */
export async function shopCategories() {
	return db
		.select({
			id: shopCategory.id,
			name: shopCategory.name,
			position: shopCategory.position,
			products: sql<number>`(select count(*) from ${shopProduct} where ${and(
				sameTenant(shopProduct, shopCategory),
				eq(shopProduct.categoryId, shopCategory.id),
			)})`,
		})
		.from(shopCategory)
		.where(inTenant(shopCategory))
		.orderBy(asc(shopCategory.position), asc(shopCategory.id));
}

const categorySubject = (row: { id: number; name: string }): Subject => ({
	type: "shop_category",
	id: row.id,
	label: row.name,
});

/**
 * Refuses a name another of the tenant's categories has (whatever the case), on the form's name.
 */
async function refuseTaken(tx: Transaction, name: string, except?: number) {
	if (await nameTaken(tx, shopCategory, name, { except })) {
		throw new Refused({ path: ["name"], message: m.shop_category_taken({ name }) });
	}
}

/** Adds a category after the tenant's others, logged. */
export async function addCategory(name: string) {
	await db.transaction(async (tx) => {
		await refuseTaken(tx, name);
		const position = await nextPosition(tx, shopCategory);
		const [added] = await tx
			.insert(shopCategory)
			.values({ organizationId: currentTenant().organizationId, name, position })
			.returning({ id: shopCategory.id, name: shopCategory.name });
		await recordActivity(tx, { action: "created", subject: categorySubject(added) });
	});
}

/** Renames one of the tenant's categories, logged; a 404 for another tenant's. */
export async function renameCategory(id: number, name: string) {
	await db.transaction(async (tx) => {
		const [found] = await tx.select().from(shopCategory).where(idInTenant(shopCategory, id));
		if (!found) error(404, m.shop_category_not_found());
		await refuseTaken(tx, name, id);
		await tx.update(shopCategory).set({ name }).where(idInTenant(shopCategory, id));
		await recordActivity(tx, {
			action: "updated",
			subject: categorySubject({ id, name }),
			before: found,
			after: { name },
		});
	});
}

/** Deletes one of the tenant's categories, logged; refused while it has products. */
export const deleteCategory = defineRemoval({
	table: shopCategory,
	find: (tx, id) =>
		tx.query.shopCategory.findFirst({
			columns: { id: true, name: true },
			where: idInTenant(shopCategory, id),
		}),
	notFound: m.shop_category_not_found,
	subject: categorySubject,
	blockers: async (found, tx) => {
		const [used] = await tx
			.select({ count: count() })
			.from(shopProduct)
			.where(and(inTenant(shopProduct), eq(shopProduct.categoryId, found.id)));
		if (used.count) return m.shop_category_in_use({ name: found.name });
	},
});

/**
 * The tenant's materials with their place in the shop, if they have one (its fields and the
 * checklist points it fixes), by SKU: what the office's products page lists.
 */
export async function materialsWithProducts() {
	const rows = await db
		.select({
			materialId: material.id,
			sku: material.sku,
			name: material.name,
			price: material.unitPrice,
			stock: material.stock,
			product: {
				id: shopProduct.id,
				categoryId: shopProduct.categoryId,
				description: shopProduct.description,
				unit: shopProduct.unit,
				popular: shopProduct.popular,
				creditEligible: shopProduct.creditEligible,
				onRequest: shopProduct.onRequest,
			},
		})
		.from(material)
		.leftJoin(shopProduct, and(eq(shopProduct.materialId, material.id), inTenant(shopProduct)))
		.where(inTenant(material))
		.orderBy(asc(material.sku));
	const links = await db
		.select({
			productId: shopProductCheckpoint.productId,
			templateItemId: shopProductCheckpoint.templateItemId,
		})
		.from(shopProductCheckpoint)
		.where(inTenant(shopProductCheckpoint));
	const byProduct = Map.groupBy(links, (link) => link.productId);
	return rows.map(({ product, ...row }) => ({
		...row,
		product: product?.id
			? {
					...product,
					checkpointIds: (byProduct.get(product.id) ?? []).map((link) => link.templateItemId),
				}
			: null,
	}));
}

type ProductInput = v.InferOutput<typeof productSchema>;

/**
 * Puts one of the tenant's materials in the shop as `input` says, changes its product, or (not
 * `inShop`) takes it out; logged by the material's SKU. Its checklist points are those of the ids
 * the checklists module knows. A 404 for another tenant's material or category.
 */
export async function saveProduct(input: ProductInput) {
	// Only points the checklists module knows, as the shop can't check them itself.
	const known = input.inShop ? await checkpointTexts([...new Set(input.checkpointIds)]) : new Map();
	await db.transaction(async (tx) => {
		const [found] = await tx
			.select({ id: material.id, sku: material.sku })
			.from(material)
			.where(idInTenant(material, input.materialId));
		if (!found) error(404, m.shop_material_not_found());
		const [existing] = await tx
			.select()
			.from(shopProduct)
			.where(and(inTenant(shopProduct), eq(shopProduct.materialId, found.id)));
		const subject = (id: number): Subject => ({ type: "shop_product", id, label: found.sku });

		if (!input.inShop) {
			if (!existing) return;
			await deleteAndLog(shopProduct, { tx, subject: subject(existing.id) });
			return;
		}

		const [category] = await tx
			.select({ id: shopCategory.id })
			.from(shopCategory)
			.where(idInTenant(shopCategory, input.categoryId!));
		if (!category) error(404, m.shop_category_not_found());
		const fields = {
			categoryId: category.id,
			description: input.description || null,
			unit: input.unit,
			popular: input.popular,
			creditEligible: input.creditEligible,
			onRequest: input.onRequest,
		};
		let productId: number;
		if (existing) {
			productId = existing.id;
			await tx.update(shopProduct).set(fields).where(idInTenant(shopProduct, existing.id));
			await recordActivity(tx, {
				action: "updated",
				subject: subject(existing.id),
				before: existing,
				after: fields,
			});
		} else {
			const [added] = await tx
				.insert(shopProduct)
				.values({ organizationId: currentTenant().organizationId, materialId: found.id, ...fields })
				.returning({ id: shopProduct.id });
			productId = added.id;
			await recordActivity(tx, {
				action: "created",
				subject: subject(added.id),
				before: {},
				after: fields,
			});
		}

		await tx
			.delete(shopProductCheckpoint)
			.where(and(inTenant(shopProductCheckpoint), eq(shopProductCheckpoint.productId, productId)));
		await insertRows(
			tx,
			shopProductCheckpoint,
			[...known.keys()].map((templateItemId: number) => ({
				organizationId: currentTenant().organizationId,
				productId,
				templateItemId,
			})),
		);
	});
}
