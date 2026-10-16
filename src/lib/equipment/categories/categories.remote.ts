/**
 * The tenant's equipment categories: every member reads them (the equipment form, the list's
 * filter); managers keep them on the settings page. Each change refreshes both queries.
 */
import { asc } from "drizzle-orm";
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipmentCategory } from "#lib/server/db/schema.ts";
import { forManagers, forMembers } from "#lib/server/remote-functions.ts";

import {
	categoriesWithUnits,
	createCategory,
	moveCategory,
	removeCategory,
	updateCategory,
} from "../server/categories.ts";
import { categorySchema, moveCategorySchema, newCategorySchema } from "./category-schema.ts";

/** The tenant's categories in their order, e.g. for the equipment form's select. */
export const getEquipmentCategories = forMembers.query(() =>
	db
		.select({
			id: equipmentCategory.id,
			name: equipmentCategory.name,
			specialty: equipmentCategory.specialty,
		})
		.from(equipmentCategory)
		.where(inTenant(equipmentCategory))
		.orderBy(asc(equipmentCategory.position), asc(equipmentCategory.id)),
);

/** The tenant's categories in their order, with how many units each has: the settings page's. */
export const getCategorySettings = forManagers.query(() => categoriesWithUnits());

const refreshCategories = () => {
	void getCategorySettings().refresh();
	void getEquipmentCategories().refresh();
};

export const addEquipmentCategory = forManagers.form(newCategorySchema, async (input, issue) => {
	await createCategory(input, issue.name);
	refreshCategories();
});

export const updateEquipmentCategory = forManagers.form(
	categorySchema,
	async ({ id, ...input }, issue) => {
		await updateCategory(id, input, issue.name);
		refreshCategories();
	},
);

export const moveEquipmentCategory = forManagers.form(
	moveCategorySchema,
	async ({ id, direction }) => {
		await moveCategory(id, direction);
		refreshCategories();
	},
);

export const deleteEquipmentCategory = forManagers.form(v.object({ id: id() }), async ({ id }) => {
	await removeCategory(id);
	refreshCategories();
});
