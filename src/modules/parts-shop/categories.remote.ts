/**
 * The shop's categories (`/parts-shop/settings`, the module's settings): every office member
 * reads them, managers add, rename and delete them (one with products stays).
 */
import { isManager } from "#lib/auth/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";

import { categoryIdSchema, newCategorySchema, renameCategorySchema } from "./form/schemas.ts";
import { forManagers, query } from "./remote-functions.ts";
import { addCategory, deleteCategory, renameCategory, shopCategories } from "./server/products.ts";

/** The tenant's categories in their order, with how many products each has. */
export const getShopCategories = query(async () => ({
	categories: await shopCategories(),
	canManage: isManager(currentTenant().roles),
}));

/** Adds a category after the others. */
export const addShopCategory = forManagers.form(newCategorySchema, async (input) => {
	await addCategory(input.name);
	void getShopCategories().refresh();
});

/** Renames a category. */
export const renameShopCategory = forManagers.form(renameCategorySchema, async (input) => {
	await renameCategory(input.id, input.name);
	void getShopCategories().refresh();
});

/** Deletes a category without products. */
export const deleteShopCategory = forManagers.form(categoryIdSchema, async (input) => {
	await deleteCategory(input.id);
	void getShopCategories().refresh();
});
