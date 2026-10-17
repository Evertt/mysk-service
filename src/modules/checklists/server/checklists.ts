/**
 * The checklists on orders: each unit of an inspection or maintenance order that's still to be done
 * has one, made from the template of the unit's category (none without a template), kept in step
 * with the order as core saves it (`orders.units`, `orders.saving`). A checklist that has answers,
 * or is completed, is on record: its unit can't be taken off the order, the order can't change to
 * another type or be deleted. An order is completed only once all of its checklists are.
 *
 * The drafts that follow an order's units and type aren't logged: like the stock that follows an
 * order's status, they need no entry beyond the order's own.
 */
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { unitTitle } from "#lib/equipment/index.ts";
import type { OrderProblem, OrderSaving, OrderUnitsSaving } from "#lib/orders/extensions.ts";
import { idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { checklistKind, getsChecklists, orderPoints } from "../model.ts";
import { checklist, checklistResult, checklistTemplateItem } from "./schema.ts";
import { offeredTemplate } from "./templates.ts";

/** The unit names in a message, e.g. "Deur 07, Deur 08". */
const names = (units: readonly { title: string }[]) => units.map((unit) => unit.title).join(", ");

/** The order's units as they are in `tx` (the ones it's losing too), in their order. */
function unitsOf(tx: Transaction, orderId: number) {
	return tx
		.select({
			id: equipment.id,
			categoryId: equipment.categoryId,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
		})
		.from(orderUnit)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.where(and(eq(orderUnit.orderId, orderId), inTenant(orderUnit)))
		.orderBy(asc(orderUnit.position));
}

/** The order's checklists, with how many of their points have an answer. */
function checklistsOf(tx: Transaction, orderId: number) {
	const answered = sql<number>`(select count(*) from ${checklistResult} where ${and(
		eq(checklistResult.checklistId, checklist.id),
		isNotNull(checklistResult.result),
	)})`.mapWith(Number);
	return tx
		.select({
			id: checklist.id,
			equipmentId: checklist.equipmentId,
			kind: checklist.kind,
			status: checklist.status,
			answered,
		})
		.from(checklist)
		.where(and(eq(checklist.orderId, orderId), inTenant(checklist)));
}

/** Whether a checklist is on record: completed, or with answers. */
const onRecord = (found: { status: string; answered: number }) =>
	found.status === "completed" || found.answered > 0;

/**
 * Makes a draft checklist for each of `units` of the order, from the template of its category
 * (none for a unit whose category has none), with the template's points.
 */
async function createChecklists(
	tx: Transaction,
	target: { id: number; organizationId: string },
	kind: "inspection" | "maintenance",
	units: readonly { id: number; categoryId: number }[],
) {
	const points = new Map<number, { id: number; group: string; text: string }[]>();
	for (const unit of units) {
		const template = await offeredTemplate(tx, unit.categoryId);
		if (!template) continue;
		if (!points.has(template.id)) {
			const items = await tx
				.select({
					id: checklistTemplateItem.id,
					group: checklistTemplateItem.group,
					text: checklistTemplateItem.text,
					position: checklistTemplateItem.position,
				})
				.from(checklistTemplateItem)
				.where(
					and(eq(checklistTemplateItem.templateId, template.id), inTenant(checklistTemplateItem)),
				);
			points.set(template.id, orderPoints(items));
		}
		const [created] = await tx
			.insert(checklist)
			.values({
				organizationId: target.organizationId,
				orderId: target.id,
				equipmentId: unit.id,
				templateId: template.id,
				name: template.name,
				norm: template.norm,
				validityMonths: template.validityMonths,
				kind,
			})
			.returning({ id: checklist.id });
		await insertRows(
			tx,
			checklistResult,
			points.get(template.id)!.map(({ id, group, text }, position) => ({
				organizationId: target.organizationId,
				checklistId: created.id,
				templateItemId: id,
				group,
				text,
				position,
			})),
		);
	}
}

/**
 * Keeps the checklists of the tenant's order `orderId` in step with it, in `tx`: the units it's
 * losing (`leaving`, still there) lose theirs, and so do all its units when it's no longer an
 * inspection or maintenance order, unless a checklist is on record (completed or with answers),
 * which refuses the change; a draft follows the order's type; and while the order is still to be
 * done, each unit without one gets one. Answers the problems that refuse the change, if any.
 */
export async function syncChecklists(
	tx: Transaction,
	orderId: number,
	leaving: readonly number[] = [],
): Promise<OrderProblem[] | undefined> {
	const [target] = await tx
		.select({
			id: order.id,
			organizationId: order.organizationId,
			type: order.type,
			status: order.status,
		})
		.from(order)
		.where(idInTenant(order, orderId));
	if (!target) return undefined;
	const [units, existing] = await Promise.all([unitsOf(tx, orderId), checklistsOf(tx, orderId)]);
	const unitById = new Map(units.map((unit) => [unit.id, { ...unit, title: unitTitle(unit) }]));
	const kind = checklistKind(target.type);

	// The units it's losing, and all of them for an order of another type, lose their checklists.
	const going = existing.filter((found) => kind === null || leaving.includes(found.equipmentId));
	const kept = going.filter(onRecord);
	if (kept.length) {
		const units = kept.flatMap((found) => unitById.get(found.equipmentId) ?? []);
		const typeChange = kind === null && kept.some((found) => !leaving.includes(found.equipmentId));
		return [
			typeChange
				? { message: m.checklists_type_change_refused({ units: names(units) }), path: ["type"] }
				: { message: m.checklists_unit_removal_refused({ units: names(units) }) },
		];
	}
	if (going.length) {
		await tx.delete(checklist).where(
			and(
				inList(
					checklist.id,
					going.map((found) => found.id),
				),
				inTenant(checklist),
			),
		);
	}
	if (kind === null || !getsChecklists(target.status)) return undefined;

	// A draft is of the order's kind.
	const otherKind = existing.filter(
		(found) => found.status === "draft" && found.kind !== kind && !going.includes(found),
	);
	if (otherKind.length) {
		await tx
			.update(checklist)
			.set({ kind })
			.where(
				and(
					inList(
						checklist.id,
						otherKind.map((found) => found.id),
					),
					inTenant(checklist),
				),
			);
	}
	const has = new Set(existing.map((found) => found.equipmentId));
	const missing = units.filter((unit) => !has.has(unit.id) && !leaving.includes(unit.id));
	await createChecklists(tx, target, kind, missing);
	return undefined;
}

/** `orders.units`: the units an order gets get their checklists, the ones it loses lose them. */
export const saveUnitChecklists = ({ tx, order, removed }: OrderUnitsSaving) =>
	syncChecklists(tx, order.id, removed);

/**
 * `orders.saving`: an order that's deleted takes its checklists along, unless one is on record; and
 * one is completed (or invoiced) only once every one of its checklists is completed. A change of
 * status alone makes no checklists: they come with the units (`orders.units`), which the order form
 * sets on every save, so its type is followed there too.
 */
export async function saveOrderChecklists({
	tx,
	order: target,
	status,
}: OrderSaving): Promise<OrderProblem[] | undefined> {
	if (status === null) {
		const [units, existing] = await Promise.all([
			unitsOf(tx, target.id),
			checklistsOf(tx, target.id),
		]);
		const kept = existing.filter(onRecord);
		if (!kept.length) return undefined;
		const titles = units
			.filter((unit) => kept.some((found) => found.equipmentId === unit.id))
			.map((unit) => ({ title: unitTitle(unit) }));
		return [
			{ message: m.checklists_delete_refused({ number: target.number, units: names(titles) }) },
		];
	}
	if (status !== "completed" && status !== "invoiced") return undefined;
	const open = await tx
		.select({
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
		})
		.from(checklist)
		.innerJoin(...tenantJoin(equipment, checklist.equipmentId))
		.innerJoin(
			orderUnit,
			and(
				eq(orderUnit.organizationId, checklist.organizationId),
				eq(orderUnit.orderId, checklist.orderId),
				eq(orderUnit.equipmentId, checklist.equipmentId),
			),
		)
		.where(
			and(eq(checklist.orderId, target.id), eq(checklist.status, "draft"), inTenant(checklist)),
		)
		.orderBy(asc(orderUnit.position));
	if (!open.length) return undefined;
	const units = open.map((unit) => ({ title: unitTitle(unit) }));
	return [
		{
			message: m.checklists_complete_refused({
				number: target.number,
				count: units.length,
				units: names(units),
			}),
		},
	];
}
