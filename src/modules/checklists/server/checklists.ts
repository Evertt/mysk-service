/**
 * The checklists on orders: each unit of an inspection or maintenance order that's still to be done
 * has one, made from the template of the unit's category (none without a template), kept in step
 * with the order as core saves it (`orders.units`, `orders.saving`). A checklist that's filled in
 * (an answer, a point's remark or the customer's), or completed, is on record: its unit can't be
 * taken off the order, the order can't change to another type or be deleted. An order is completed
 * only once all of its checklists are.
 *
 * The drafts that follow an order's units and type aren't logged: like the stock that follows an
 * order's status, they need no entry beyond the order's own.
 */
import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";

import { unitTitle } from "#lib/equipment/index.ts";
import { isDoneOrder } from "#lib/models.ts";
import type { OrderProblem, OrderSaving, OrderUnitsSaving } from "#lib/orders/extensions.ts";
import { idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { inList, literal } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { checklistKind, getsChecklists, orderPoints } from "../model.ts";
import {
	checklist,
	checklistResult,
	checklistTemplate,
	checklistTemplateCategory,
	checklistTemplateItem,
} from "./schema.ts";

/** The unit names in a message, e.g. "Deur 07, Deur 08". */
const names = (units: readonly { title: string }[]) => units.map((unit) => unit.title).join(", ");

/** The order's units as they are in `tx` (the ones it's losing too), in their order. */
function unitsOf(tx: Transaction, orderId: number) {
	return tx
		.select({
			id: equipment.id,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
		})
		.from(orderUnit)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.where(and(eq(orderUnit.orderId, orderId), inTenant(orderUnit)))
		.orderBy(asc(orderUnit.position));
}

/**
 * The order's checklists, with how many of their points have an answer or a remark, and whether
 * the customer's remark is written.
 */
function checklistsOf(tx: Transaction, orderId: number) {
	const filledIn = sql<number>`(select count(*) from ${checklistResult} where ${and(
		eq(checklistResult.checklistId, checklist.id),
		or(isNotNull(checklistResult.result), isNotNull(checklistResult.remark)),
	)})`.mapWith(Number);
	return tx
		.select({
			id: checklist.id,
			equipmentId: checklist.equipmentId,
			kind: checklist.kind,
			status: checklist.status,
			filledIn,
			remarked: isNotNull(checklist.remarks).mapWith(Boolean),
		})
		.from(checklist)
		.where(and(eq(checklist.orderId, orderId), inTenant(checklist)));
}

/** Whether a checklist is on record: completed, or with answers or remarks. */
const onRecord = (found: { status: string; filledIn: number; remarked: boolean }) =>
	found.status === "completed" || found.filledIn > 0 || found.remarked;

/**
 * Makes a draft checklist for each of `units` of the order (in their order), from the template of
 * its category (none for a unit whose category has none), with the template's points. In three
 * statements however many units there are, as the order's transaction holds every other request on
 * Cloudflare: the checklists and their points are copied from the templates by `insert … select`,
 * which names a value for every column of the table, in its order.
 */
async function createChecklists(
	tx: Transaction,
	target: { id: number },
	kind: "inspection" | "maintenance",
	units: readonly { id: number }[],
) {
	if (!units.length) return;
	const unitIds = units.map((unit) => unit.id);
	const created = await tx
		.insert(checklist)
		.select(
			tx
				.select({
					id: sql`null`.as("id"),
					organizationId: equipment.organizationId,
					orderId: sql`${target.id}`.as("orderId"),
					equipmentId: equipment.id,
					templateId: checklistTemplate.id,
					name: checklistTemplate.name,
					norm: checklistTemplate.norm,
					validityMonths: checklistTemplate.validityMonths,
					kind: sql`${kind}`.as("kind"),
					status: literal("draft").as("status"),
					remarks: sql`null`.as("remarks"),
					completedAt: sql`null`.as("completedAt"),
					completedBy: sql`null`.as("completedBy"),
					completedByUser: sql`null`.as("completedByUser"),
					validUntil: sql`null`.as("validUntil"),
					createdAt: sql`unixepoch()`.as("createdAt"),
				})
				.from(equipment)
				.innerJoin(
					checklistTemplateCategory,
					and(
						eq(checklistTemplateCategory.categoryId, equipment.categoryId),
						inTenant(checklistTemplateCategory),
					),
				)
				.innerJoin(...tenantJoin(checklistTemplate, checklistTemplateCategory.templateId))
				.where(
					and(
						inList(equipment.id, unitIds),
						inTenant(equipment),
						eq(checklistTemplate.archived, false),
					),
				)
				.orderBy(
					sql`(select key from json_each(${JSON.stringify(unitIds)}) where value = ${equipment.id})`,
				),
		)
		.returning({ id: checklist.id, templateId: checklist.templateId });
	if (!created.length) return;

	// Each template point's place in the checklists made with it (see `orderPoints()`), as
	// `[point, place]`, bound as one JSON parameter.
	const items = await tx
		.select({
			id: checklistTemplateItem.id,
			templateId: checklistTemplateItem.templateId,
			group: checklistTemplateItem.group,
			position: checklistTemplateItem.position,
		})
		.from(checklistTemplateItem)
		.where(
			and(
				inList(checklistTemplateItem.templateId, [
					...new Set(created.map((made) => made.templateId)),
				]),
				inTenant(checklistTemplateItem),
			),
		);
	const places = [...Map.groupBy(items, (item) => item.templateId).values()].flatMap((points) =>
		orderPoints(points).map((point, place) => [point.id, place]),
	);
	const place = sql.identifier("place");
	await tx.insert(checklistResult).select(
		tx
			.select({
				id: sql`null`.as("id"),
				organizationId: checklist.organizationId,
				checklistId: checklist.id,
				templateItemId: checklistTemplateItem.id,
				group: checklistTemplateItem.group,
				text: checklistTemplateItem.text,
				position: sql`json_extract(${place}.value, '$[1]')`.as("position"),
				result: sql`null`.as("result"),
				remark: sql`null`.as("remark"),
			})
			.from(checklist)
			.innerJoin(
				checklistTemplateItem,
				and(
					eq(checklistTemplateItem.organizationId, checklist.organizationId),
					eq(checklistTemplateItem.templateId, checklist.templateId),
				),
			)
			.innerJoin(
				sql`json_each(${JSON.stringify(places)}) as ${place}`,
				sql`json_extract(${place}.value, '$[0]') = ${checklistTemplateItem.id}`,
			)
			.where(
				and(
					inList(
						checklist.id,
						created.map((made) => made.id),
					),
					inTenant(checklist),
				),
			),
	);
}

/**
 * Keeps the checklists of the tenant's order `orderId` in step with it, in `tx`: the units it's
 * losing (`leaving`, still there) lose theirs, and so do all its units when it's no longer an
 * inspection or maintenance order, unless a checklist is on record (completed or filled in),
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
 * one becomes done (completed or invoiced) only once every one of its checklists is completed. A change of
 * status alone makes no checklists: they come with the units (`orders.units`), which the order form
 * sets on every save, so its type is followed there too.
 */
export async function saveOrderChecklists({
	tx,
	order: target,
	from,
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
	// Only becoming done needs its checklists completed: moving between completed and invoiced (an
	// invoice issued or voided) isn't completing it, e.g. one completed while the module was off.
	if (!isDoneOrder(status) || (from !== null && isDoneOrder(from))) return undefined;
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
