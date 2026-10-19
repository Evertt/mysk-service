/**
 * The tenant's equipment categories, which managers keep on the settings page
 * (`categories.remote.ts`): adding, renaming, a specialty, their order and deleting, each in a
 * transaction that also logs it (`recordActivity`). Names are unique within the tenant, whatever
 * their case; a category that units have can't be deleted.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { equipment, equipmentCategory } from "#lib/server/db/schema.ts";
import { deleteAndLog } from "#lib/server/records.ts";

import type { CategoryInput, MoveDirection } from "../categories/category-schema.ts";
import { moved } from "../categories/positions.ts";

/** Refuses a form with a message on its name field (`issue.name` of a remote form). */
type NameIssue = (message: string) => Parameters<typeof invalid>[number];

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
async function findCategory(tx: Transaction | typeof db, id: number) {
	const [found] = await tx
		.select()
		.from(equipmentCategory)
		.where(idInTenant(equipmentCategory, id));
	if (!found) error(404, m.equipment_category_not_found());
	return found;
}

/**
 * Refuses `name` if another of the tenant's categories (than `except`) has it, in any case.
 * Compared with SQLite's `lower()`, as the unique index compares them: it lowers ASCII letters only.
 */
async function refuseTakenName(tx: Transaction, name: string, issue: NameIssue, except?: number) {
	const [taken] = await tx
		.select({ name: equipmentCategory.name })
		.from(equipmentCategory)
		.where(
			and(
				inTenant(equipmentCategory),
				eq(sql`lower(${equipmentCategory.name})`, sql`lower(${name})`),
				except === undefined ? undefined : ne(equipmentCategory.id, except),
			),
		);
	if (taken) invalid(issue(m.equipment_category_name_taken({ name: taken.name })));
}

/** Adds a category to the tenant's, last in their order; returns its id. */
export function createCategory(input: CategoryInput, issue: NameIssue) {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		await refuseTakenName(tx, input.name, issue);
		const [{ last }] = await tx
			.select({ last: sql<number | null>`max(${equipmentCategory.position})` })
			.from(equipmentCategory)
			.where(inTenant(equipmentCategory));
		const [created] = await tx
			.insert(equipmentCategory)
			.values({ ...input, organizationId, position: (last ?? -1) + 1 })
			.returning({ id: equipmentCategory.id });
		await recordActivity(tx, {
			action: "created",
			subject: subject({ id: created.id, name: input.name }),
		});
		return created.id;
	});
}

/** Renames the tenant's category `id`, or changes its specialty. */
export function updateCategory(id: number, input: CategoryInput, issue: NameIssue) {
	return db.transaction(async (tx) => {
		const existing = await findCategory(tx, id);
		await refuseTakenName(tx, input.name, issue, id);
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
		const rows = await tx
			.select({
				id: equipmentCategory.id,
				name: equipmentCategory.name,
				position: equipmentCategory.position,
			})
			.from(equipmentCategory)
			.where(inTenant(equipmentCategory))
			.orderBy(asc(equipmentCategory.position), asc(equipmentCategory.id));
		const ids = rows.map((row) => row.id);
		const order = moved(ids, id, direction);
		if (order.every((rowId, i) => rowId === ids[i])) return;
		// Numbered afresh from 0, so places that were equal or had gaps between them are in order.
		for (const [position, rowId] of order.entries()) {
			const row = rows.find((r) => r.id === rowId)!;
			if (row.position === position) continue;
			await tx
				.update(equipmentCategory)
				.set({ position })
				.where(idInTenant(equipmentCategory, row.id));
			await recordActivity(tx, {
				action: "updated",
				subject: subject(row),
				before: row,
				after: { position },
			});
		}
	});
}

/** Deletes the tenant's category `id`; refuses one that units have. */
export async function removeCategory(id: number) {
	const existing = await findCategory(db, id);
	const [{ units }] = await db
		.select({ units: count() })
		.from(equipment)
		.where(and(eq(equipment.categoryId, id), inTenant(equipment)));
	if (units)
		invalid(
			m.equipment_category_delete_refused({
				name: existing.name,
				units: m.common_count_units({ count: units }),
			}),
		);
	await deleteAndLog(
		equipmentCategory,
		subject(existing),
		m.equipment_category_delete_referenced(),
	);
}
