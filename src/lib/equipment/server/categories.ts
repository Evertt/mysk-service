/**
 * The tenant's equipment categories, which managers keep on the settings page
 * (`categories.remote.ts`): adding, renaming, a specialty, their order and deleting, each in a
 * transaction that also logs it (`recordActivity`). Names are unique within the tenant, whatever
 * their case; a category that units have can't be deleted.
 */
import { and, asc, count, eq, sql } from "drizzle-orm";

import type { MoveDirection } from "#lib/schema.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Runner, type Transaction } from "#lib/server/db/index.ts";
import { equipment, equipmentCategory } from "#lib/server/db/schema.ts";
import {
	defineRemoval,
	nameTaken,
	nextPosition,
	orNotFound,
	reorder,
} from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import type { CategoryInput } from "../categories/category-schema.ts";

/** A category as the activity log knows it: by its name. */
const subject = (category: { id: number; name: string }): Subject & { id: number } => ({
	type: "equipment_category",
	id: category.id,
	label: category.name,
});

/** The tenant's categories in their order, with how many units each has. */
export async function categoriesWithUnits() {
	const units = db
		.select({ categoryId: equipment.categoryId, n: count().as("n") })
		.from(equipment)
		.where(inTenant(equipment))
		.groupBy(equipment.categoryId)
		.as("units");
	return db
		.select({
			id: equipmentCategory.id,
			name: equipmentCategory.name,
			specialty: equipmentCategory.specialty,
			unitCount: sql<number>`coalesce(${units.n}, 0)`,
		})
		.from(equipmentCategory)
		.leftJoin(units, eq(units.categoryId, equipmentCategory.id))
		.where(inTenant(equipmentCategory))
		.orderBy(asc(equipmentCategory.position), asc(equipmentCategory.id));
}

/** The tenant's category `id`, or a 404. */
async function findCategory(tx: Runner, id: number) {
	const [found] = await tx
		.select()
		.from(equipmentCategory)
		.where(idInTenant(equipmentCategory, id));
	return orNotFound(found, m.equipment_category_not_found());
}

/**
 * Refuses `name`, on the form's name, if another of the tenant's categories (than `except`) has it.
 */
async function refuseTakenName(tx: Transaction, name: string, except?: number) {
	const taken = await nameTaken(tx, equipmentCategory, name, { except });
	if (taken) {
		throw new Refused({
			path: ["name"],
			message: m.equipment_category_name_taken({ name: taken.name }),
		});
	}
}

/** Adds a category to the tenant's, last in their order; returns its id. */
export function createCategory(input: CategoryInput) {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		await refuseTakenName(tx, input.name);
		const [created] = await tx
			.insert(equipmentCategory)
			.values({ ...input, organizationId, position: await nextPosition(tx, equipmentCategory) })
			.returning({ id: equipmentCategory.id });
		await recordActivity(tx, {
			action: "created",
			subject: subject({ id: created.id, name: input.name }),
		});
		return created.id;
	});
}

/** Renames the tenant's category `id`, or changes its specialty. */
export function updateCategory(id: number, input: CategoryInput) {
	return db.transaction(async (tx) => {
		const existing = await findCategory(tx, id);
		await refuseTakenName(tx, input.name, id);
		await tx.update(equipmentCategory).set(input).where(idInTenant(equipmentCategory, id));
		await recordActivity(tx, {
			action: "updated",
			subject: subject({ id, name: input.name }),
			before: existing,
			after: input,
		});
	});
}

/**
 * Moves the tenant's category `id` one place up or down their order, past its neighbour; nothing
 * changes for the first one up or the last one down. Both are logged with their new place.
 */
export function moveCategory(id: number, direction: MoveDirection) {
	return db.transaction(async (tx) => {
		await findCategory(tx, id);
		for (const row of await reorder(tx, equipmentCategory, id, direction)) {
			const category = await findCategory(tx, row.id);
			await recordActivity(tx, {
				action: "updated",
				subject: subject(category),
				before: { position: row.from },
				after: { position: row.to },
			});
		}
	});
}

/** Deletes the tenant's category `id`; refuses one that units have. */
export const removeCategory = defineRemoval({
	table: equipmentCategory,
	find: async (tx, id) => {
		const [found] = await tx
			.select({ id: equipmentCategory.id, name: equipmentCategory.name })
			.from(equipmentCategory)
			.where(idInTenant(equipmentCategory, id));
		return found;
	},
	notFound: m.equipment_category_not_found,
	subject,
	blockers: async (found, tx) => {
		const [{ units }] = await tx
			.select({ units: count() })
			.from(equipment)
			.where(and(eq(equipment.categoryId, found.id), inTenant(equipment)));
		if (units) {
			return m.equipment_category_delete_refused({
				name: found.name,
				units: m.common_count_units({ count: units }),
			});
		}
	},
	referenced: m.equipment_category_delete_referenced,
});
