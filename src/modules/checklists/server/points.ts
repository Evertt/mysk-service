/**
 * The points of the tenant's checklist templates: adding, editing, moving and deleting them, and
 * moving a group of them, each in a transaction that also logs it (`recordActivity`). A point is
 * logged against its template (`parent`), so it shows on the template's activity too; the points
 * that only make room for it aren't logged. A retired template's points aren't changed.
 */
import { and, eq } from "drizzle-orm";

import type { MoveDirection } from "#lib/schema.ts";
import { recordActivity, type LoggedSubjects } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { deleteAndLog, orNotFound } from "#lib/server/records.ts";

import type { PointInput } from "../form/template-schema.ts";
import {
	changedPlaces,
	moveGroup as movedGroup,
	movePoint as movedPoint,
	orderPoints,
	placePoint,
	type PointPlace,
} from "../model.ts";
import { checklistTemplate, checklistTemplateItem } from "./schema.ts";
import { findActiveTemplate, templateSubject } from "./templates.ts";

/** A point as the activity log knows it: by its text, with its template as its parent. */
const subjects = (
	point: { id: number; text: string },
	template: { id: number; name: string },
): LoggedSubjects => ({
	subject: { type: "checklistTemplateItem", id: point.id, label: point.text },
	parent: templateSubject(template),
});

/** The places of the points of template `templateId`, in their order. */
async function placesOf(tx: Transaction, templateId: number) {
	const points = await tx
		.select({
			id: checklistTemplateItem.id,
			group: checklistTemplateItem.group,
			position: checklistTemplateItem.position,
		})
		.from(checklistTemplateItem)
		.where(and(eq(checklistTemplateItem.templateId, templateId), inTenant(checklistTemplateItem)));
	return orderPoints(points);
}

/** Gives the points their new places (from `changedPlaces()`), without logging them. */
async function applyPlaces(tx: Transaction, places: PointPlace[]) {
	for (const { id, group, position } of places) {
		await tx
			.update(checklistTemplateItem)
			.set({ group, position })
			.where(idInTenant(checklistTemplateItem, id));
	}
}

/** The tenant's point `id` with its template (or a 404), which mustn't be retired. */
async function findPoint(tx: Transaction, id: number) {
	const found = orNotFound(
		await tx
			.select({ point: checklistTemplateItem, templateId: checklistTemplate.id })
			.from(checklistTemplateItem)
			.innerJoin(...tenantJoin(checklistTemplate, checklistTemplateItem.templateId))
			.where(idInTenant(checklistTemplateItem, id)),
		m.checklists_point_not_found(),
	);
	return { point: found.point, template: await findActiveTemplate(tx, found.templateId) };
}

/** Adds a point to the tenant's template `templateId`, last in its group; returns the template id. */
export function addPoint({ templateId, ...input }: PointInput) {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		const template = await findActiveTemplate(tx, templateId);
		const points = await placesOf(tx, template.id);
		// Made room for at the end of its group, with an id no point has.
		const order = placePoint(points, 0, input.group);
		const position = order.findIndex((point) => point.id === 0);
		await applyPlaces(
			tx,
			changedPlaces(points, order).filter((place) => place.id !== 0),
		);
		const [created] = await tx
			.insert(checklistTemplateItem)
			.values({ ...input, organizationId, templateId: template.id, position })
			.returning({ id: checklistTemplateItem.id });
		await recordActivity(tx, {
			action: "created",
			...subjects({ id: created.id, text: input.text }, template),
		});
		return template.id;
	});
}

/**
 * Changes the text or group of the tenant's point `id`; one that changes group goes last in the
 * other. Returns its template's id.
 */
export function updatePoint(id: number, input: Omit<PointInput, "templateId">) {
	return db.transaction(async (tx) => {
		const { point, template } = await findPoint(tx, id);
		const points = await placesOf(tx, template.id);
		const places = changedPlaces(points, placePoint(points, id, input.group));
		await applyPlaces(tx, places);
		await tx
			.update(checklistTemplateItem)
			.set({ text: input.text })
			.where(idInTenant(checklistTemplateItem, id));
		const position = places.find((place) => place.id === id)?.position ?? point.position;
		await recordActivity(tx, {
			action: "updated",
			...subjects({ id, text: input.text }, template),
			before: point,
			after: { ...input, position },
		});
		return template.id;
	});
}

/**
 * Moves the tenant's point `id` one place `direction` (see `movePoint()` in `../model.ts`): past
 * its neighbour, or into the next group. Returns its template's id.
 */
export function movePoint(id: number, direction: MoveDirection) {
	return db.transaction(async (tx) => {
		const { point, template } = await findPoint(tx, id);
		const points = await placesOf(tx, template.id);
		const places = changedPlaces(points, movedPoint(points, id, direction));
		await applyPlaces(tx, places);
		const moved = places.find((place) => place.id === id);
		if (moved) {
			await recordActivity(tx, {
				action: "updated",
				...subjects(point, template),
				before: point,
				after: { group: moved.group, position: moved.position },
			});
		}
		return template.id;
	});
}

/**
 * Moves the group `group` of the tenant's template `templateId` one place `direction`, past the
 * group next to it, logged against the template with the groups' order before and after.
 */
export function moveGroup(templateId: number, group: string, direction: MoveDirection) {
	return db.transaction(async (tx) => {
		const template = await findActiveTemplate(tx, templateId);
		const points = await placesOf(tx, template.id);
		const order = movedGroup(points, group, direction);
		const places = changedPlaces(points, order);
		if (!places.length) return template.id;
		await applyPlaces(tx, places);
		const groups = (list: { group: string }[]) => [...new Set(list.map((point) => point.group))];
		await recordActivity(tx, {
			action: "updated",
			subject: templateSubject(template),
			before: { groups: groups(points) },
			after: { groups: groups(order) },
		});
		return template.id;
	});
}

/** Deletes the tenant's point `id`; returns its template's id. */
export function deletePoint(id: number) {
	return db.transaction(async (tx) => {
		const { point, template } = await findPoint(tx, id);
		await deleteAndLog(checklistTemplateItem, { tx, ...subjects(point, template) });
		return template.id;
	});
}
