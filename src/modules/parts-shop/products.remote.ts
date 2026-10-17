/**
 * The shop's catalogue as the office manages it (`/parts-shop/products`): the tenant's materials
 * with their place in the shop, the categories and the checklist points to choose from; and
 * putting a material in the shop, changing it, or taking it out. The categories themselves are
 * set up by managers (`categories.remote.ts`).
 */
import { isManager } from "#lib/auth/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";

import { productSchema } from "./form/schemas.ts";
import { form, query } from "./remote-functions.ts";
import { checkpointTexts } from "./server/catalogue.ts";
import { materialsWithProducts, saveProduct, shopCategories } from "./server/products.ts";

/** The tenant's materials, each with its product if it's in the shop, and what a product takes. */
export const getShopProducts = query(async () => {
	const [materials, categories, points] = await Promise.all([
		materialsWithProducts(),
		shopCategories(),
		checkpointTexts(null),
	]);
	return {
		materials,
		categories: categories.map(({ id, name }) => ({ id, name })),
		checkpoints: [...points.values()],
		canManage: isManager(currentTenant().roles),
	};
});

/** Puts a material in the shop, changes its product, or takes it out of the shop. */
export const saveShopProduct = form(productSchema, async (input) => {
	await saveProduct(input);
	void getShopProducts().refresh();
});
