/**
 * Recording a unit's condition: its defects, scored on NEN 2767's scale (the worst defect wins,
 * `recordScore()`, worked out here and kept on the record). From its checklist when an engineer
 * completes it in the portal (`checklists.completed`: its rejected points are the defects, with the
 * grade and photos the engineer gave each, `point-defects.ts`), with the engineer's advice added to
 * it after; or by a member in the office (on the unit's page), as a correction. Each is a new record
 * (the latest is the unit's condition, or its component's), made and logged in a transaction,
 * against the unit. Another tenant's unit or component, or another engineer's order, is a 404, also
 * by a tampered id.
 */
import { error } from "@sveltejs/kit";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { equipmentSubject } from "#lib/activity/index.ts";
import { unitBySerial } from "#lib/equipment/server/index.ts";
import { fieldActions } from "#lib/orders/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	engineerOrder,
	engineerOrderNotFound,
	idInTenant,
	inTenant,
	isSystemUser,
	sameTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { withTenantRefs } from "#lib/server/db/columns.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import { engineer, equipment, order, orderUnit, user } from "#lib/server/db/schema.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";
import { orNotFound } from "#lib/server/records.ts";
import type { ChecklistCompleting } from "#modules/checklists/api/extensions.ts";

import { conditionLabel } from "../activity.ts";
import {
	type ConditionSource,
	type RecordedDefect,
	recordScore,
	REJECTED_POINT_GRADE,
} from "../model.ts";
import { type DefectGrade, defectScore } from "../nen2767.ts";
import { checkpointsOf } from "./components.ts";
import { discardDefectPhotos, type StoredPhoto, storeDefectPhotos } from "./photos.ts";
import {
	component,
	conditionDefect,
	conditionDefectPhoto,
	conditionPointDefect,
	unitCondition,
} from "./schema.ts";

/** A defect as it's recorded: what, on which element (none: the unit itself), its grade and photos. */
export interface DefectInput extends DefectGrade {
	componentId: number | null;
	description: string;
	/** The checklist point it was rejected on; none for the office's. */
	checklistPointId?: number | null;
	photos: readonly StoredPhoto[];
}

/** A unit as a condition is recorded for it. */
interface Unit {
	id: number;
	serialNumber: string;
}

/** A component of the unit, whose condition it is. */
interface Part {
	id: number;
	number: string;
}

/**
 * Records the condition of the unit (or of its component `by.component`) in `tx` with its defects
 * and their photos, scored by them (`recordScore()`), and logs it against the unit.
 */
async function insertCondition(
	tx: Transaction,
	unit: Unit,
	input: { defects: readonly DefectInput[]; advice: string },
	by: {
		source: ConditionSource;
		orderId?: number;
		engineerId?: number | null;
		component?: Part;
	},
) {
	const tenant = currentTenant();
	const advice = input.advice.trim() || null;
	const score = recordScore(input.defects);
	const [made] = await tx
		.insert(unitCondition)
		.values({
			organizationId: tenant.organizationId,
			equipmentId: unit.id,
			componentId: by.component?.id ?? null,
			score,
			advice,
			source: by.source,
			...withTenantRefs(tenant.organizationId, { orderId: by.orderId ?? null }),
			engineerId: by.engineerId ?? null,
			userId: isSystemUser(tenant.user) ? null : tenant.user.id,
			recordedAt: Temporal.Now.instant(),
		})
		.returning({ id: unitCondition.id });
	for (const [position, defect] of input.defects.entries()) {
		const [row] = await tx
			.insert(conditionDefect)
			.values({
				organizationId: tenant.organizationId,
				conditionId: made.id,
				componentId: defect.componentId,
				description: defect.description,
				severity: defect.severity,
				extent: defect.extent,
				intensity: defect.intensity,
				score: defectScore(defect),
				checklistPointId: defect.checklistPointId ?? null,
				position,
			})
			.returning({ id: conditionDefect.id });
		await insertRows(
			tx,
			conditionDefectPhoto,
			defect.photos.map((photo, index) => ({
				...photo,
				organizationId: tenant.organizationId,
				equipmentId: unit.id,
				defectId: row.id,
				position: index,
			})),
		);
	}
	await recordActivity(tx, {
		action: "recorded",
		subject: {
			type: "unitCondition",
			id: made.id,
			label: conditionLabel({
				serialNumber: unit.serialNumber,
				component: by.component?.number,
				score,
			}),
		},
		parent: equipmentSubject(unit),
		// The advice, as it was given.
		note: advice,
	});
	return made.id;
}

/** The unit's components, in `tx`, in their order. */
const componentsOf = (tx: Transaction, equipmentId: number) =>
	tx
		.select({ id: component.id, number: component.number })
		.from(component)
		.where(and(eq(component.equipmentId, equipmentId), inTenant(component)))
		.orderBy(asc(component.position), asc(component.id));

/** The unit's components by number and name, in their order: what a defect may be on. */
export const elementsOf = (equipmentId: number) =>
	db
		.select({ id: component.id, number: component.number, name: component.name })
		.from(component)
		.where(and(eq(component.equipmentId, equipmentId), inTenant(component)))
		.orderBy(asc(component.position), asc(component.id));

/** A defect the office records, with the photos taken of it. */
export interface OfficeDefect extends DefectGrade {
	componentId: number | null;
	description: string;
	photos: readonly File[];
}

/** What the office records: the element (none: the unit as a whole), its defects and advice. */
export interface OfficeCondition {
	componentId: number | null;
	defects: readonly OfficeDefect[];
	advice: string;
}

/**
 * Records the condition of the tenant's unit `serialNumber` (or of its component
 * `input.componentId`) by a member in the office: its defects, each on the unit or one of its
 * components (on a component's condition, that component), with their photos. The unit's condition
 * takes all its defects; each component a defect is on gets a condition of its own with that
 * component's, so its row shows it too. Another tenant's unit, or a component that isn't the unit's,
 * is a 404. The photos are stored first, and taken away again if it's refused.
 */
export async function recordOfficeCondition(serialNumber: string, input: OfficeCondition) {
	const stored = await storeDefectPhotos(
		input.defects.map((defect) => defect.photos),
		(index) => ["defects", index, "photos"],
	);
	try {
		return await db.transaction(async (tx) => {
			const unit = await unitBySerial(
				serialNumber,
				{ id: equipment.id, serialNumber: equipment.serialNumber },
				tx,
			);
			const parts = new Map((await componentsOf(tx, unit.id)).map((part) => [part.id, part]));
			const partOf = (id: number) => orNotFound(parts.get(id), m.condition_component_not_found());
			const whose = input.componentId === null ? undefined : partOf(input.componentId);
			const defects = input.defects.map(({ photos: _files, ...defect }, index): DefectInput => ({
				...defect,
				// On a component's condition, every defect is on that component.
				componentId: whose?.id ?? defect.componentId,
				description: defect.description.trim(),
				photos: stored[index],
			}));
			for (const defect of defects) if (defect.componentId !== null) partOf(defect.componentId);
			const by = { source: "office" as const, component: whose };
			await insertCondition(tx, unit, { defects, advice: input.advice }, by);
			if (!whose) {
				const onParts = [...new Set(defects.flatMap((each) => each.componentId ?? []))];
				for (const id of onParts) {
					const own = defects.filter((each) => each.componentId === id);
					await insertCondition(
						tx,
						unit,
						{ defects: own, advice: "" },
						{ ...by, component: partOf(id) },
					);
				}
			}
			return unit;
		});
	} catch (failure) {
		await discardDefectPhotos(stored.flat().map((photo) => photo.objectKey));
		throw failure;
	}
}

/**
 * The tenant's order `number` of the engineer's, with its unit `equipmentId`: a 404 when either
 * isn't theirs (or the unit isn't on the order).
 */
export async function findFieldUnit(
	tx: Transaction | typeof db,
	number: string,
	equipmentId: number,
) {
	const [found] = await tx
		.select({
			order: { id: order.id, number: order.number, status: order.status },
			unit: {
				id: equipment.id,
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
			},
		})
		.from(order)
		.innerJoin(
			orderUnit,
			and(
				sameTenant(orderUnit, order),
				eq(orderUnit.orderId, order.id),
				eq(orderUnit.equipmentId, equipmentId),
			),
		)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.where(await engineerOrder({ number }));
	if (!found) engineerOrderNotFound({ number });
	return found;
}

/** The unit's components with the template points that check each, in `tx`, in their order. */
async function checkedComponents(tx: Transaction, equipmentId: number) {
	const parts = await componentsOf(tx, equipmentId);
	const points = await checkpointsOf(
		parts.map((part) => part.id),
		tx,
	);
	return parts.map((part) => ({ ...part, items: new Set(points.get(part.id)) }));
}

/** What a rejected point says is wrong: its text, and its remark after it. */
const pointDescription = (point: { text: string; remark: string | null }) =>
	point.remark?.trim() ? `${point.text}: ${point.remark.trim()}` : point.text;

/**
 * `checklists.completed`: records the conditions a completed checklist found, in its transaction,
 * on its order, by the engineer who completed it (none when the office did), without advice (which
 * they add after, `adviseFieldCondition()`). Its rejected points are the defects, each with the
 * grade and photos the engineer gave it (`condition_point_defect`), or `REJECTED_POINT_GRADE`
 * without one: the unit's condition takes all of them (each on the first component whose points it
 * is, else on the unit), and each component whose points it answered gets one of its own from those
 * alone. OK and not-applicable points add no defects: a checklist with counted points and none
 * rejected records 1. Nothing for one none of whose points count (all not applicable). The drafts
 * go, with the photos of points that weren't rejected after all.
 */
export async function recordChecklistConditions({ tx, checklist, points }: ChecklistCompleting) {
	const [unit] = await tx
		.select({ id: equipment.id, serialNumber: equipment.serialNumber })
		.from(equipment)
		.where(idInTenant(equipment, checklist.equipmentId));
	if (!unit) return undefined;
	const drafts = points.length
		? await tx
				.select({
					id: conditionPointDefect.id,
					pointId: conditionPointDefect.checklistPointId,
					severity: conditionPointDefect.severity,
					extent: conditionPointDefect.extent,
					intensity: conditionPointDefect.intensity,
				})
				.from(conditionPointDefect)
				.where(
					and(
						inList(
							conditionPointDefect.checklistPointId,
							points.map((point) => point.id),
						),
						eq(conditionPointDefect.equipmentId, unit.id),
						inTenant(conditionPointDefect),
					),
				)
		: [];
	const photos = drafts.length
		? await tx
				.select({
					pointDefectId: conditionDefectPhoto.pointDefectId,
					objectKey: conditionDefectPhoto.objectKey,
					contentType: conditionDefectPhoto.contentType,
					size: conditionDefectPhoto.size,
				})
				.from(conditionDefectPhoto)
				.where(
					and(
						inList(
							conditionDefectPhoto.pointDefectId,
							drafts.map((draft) => draft.id),
						),
						inTenant(conditionDefectPhoto),
					),
				)
				.orderBy(asc(conditionDefectPhoto.position), asc(conditionDefectPhoto.id))
		: [];
	const draftOf = new Map(drafts.map((draft) => [draft.pointId, draft]));
	const parts = await checkedComponents(tx, unit.id);
	const isPart = (part: (typeof parts)[number], point: (typeof points)[number]) =>
		point.templateItemId !== null && part.items.has(point.templateItemId);
	const counts = (point: (typeof points)[number]) =>
		point.result === "ok" || point.result === "nok";
	const used = new Set<number>();
	const defectOf = (point: (typeof points)[number], componentId: number | null): DefectInput => {
		const draft = draftOf.get(point.id);
		if (draft) used.add(draft.id);
		return {
			componentId,
			description: pointDescription(point),
			...(draft
				? {
						severity: draft.severity,
						extent: draft.extent as DefectGrade["extent"],
						intensity: draft.intensity,
					}
				: REJECTED_POINT_GRADE),
			checklistPointId: point.id,
			photos: draft
				? photos
						.filter((photo) => photo.pointDefectId === draft.id)
						.map(({ pointDefectId: _draft, ...photo }) => photo as StoredPhoto)
				: [],
		};
	};
	const rejected = points.filter((point) => point.result === "nok");
	const by = {
		source: "checklist" as const,
		orderId: checklist.orderId,
		engineerId: checklist.engineerId,
	};
	if (points.some(counts)) {
		const defects = rejected.map((point) =>
			defectOf(point, parts.find((part) => isPart(part, point))?.id ?? null),
		);
		await insertCondition(tx, unit, { defects, advice: "" }, by);
	}
	for (const part of parts) {
		const own = points.filter((point) => isPart(part, point));
		if (!own.some(counts)) continue;
		const defects = own
			.filter((point) => point.result === "nok")
			.map((point) => defectOf(point, part.id));
		await insertCondition(tx, unit, { defects, advice: "" }, { ...by, component: part });
	}
	if (drafts.length) {
		// The photos of drafts that became no defect: their files go once this is committed.
		const left = photos
			.filter((photo) => photo.pointDefectId !== null && !used.has(photo.pointDefectId))
			.map((photo) => photo.objectKey);
		await tx.delete(conditionPointDefect).where(
			and(
				inList(
					conditionPointDefect.id,
					drafts.map((draft) => draft.id),
				),
				inTenant(conditionPointDefect),
			),
		);
		if (left.length) afterCommit(() => discardDefectPhotos(left));
	}
	return undefined;
}

/** The condition its checklist gave the unit on the order (the latest), in `tx`, if any. */
export async function checklistCondition(
	tx: Transaction | typeof db,
	equipmentId: number,
	orderId: number,
) {
	const [found] = await tx
		.select({ id: unitCondition.id, score: unitCondition.score, advice: unitCondition.advice })
		.from(unitCondition)
		.where(
			and(
				eq(unitCondition.equipmentId, equipmentId),
				eq(unitCondition.orderId, orderId),
				eq(unitCondition.source, "checklist"),
				isNull(unitCondition.componentId),
				inTenant(unitCondition),
			),
		)
		.orderBy(desc(unitCondition.recordedAt), desc(unitCondition.id))
		.limit(1);
	return found;
}

/** The conditions its checklist on the order gave the unit's components, in their order. */
export function checklistComponentConditions(equipmentId: number, orderId: number) {
	return db
		.select({
			id: unitCondition.id,
			number: component.number,
			name: component.name,
			score: unitCondition.score,
		})
		.from(unitCondition)
		.innerJoin(
			component,
			and(sameTenant(component, unitCondition), eq(component.id, unitCondition.componentId)),
		)
		.where(
			and(
				eq(unitCondition.equipmentId, equipmentId),
				eq(unitCondition.orderId, orderId),
				eq(unitCondition.source, "checklist"),
				inTenant(unitCondition),
			),
		)
		.orderBy(asc(component.position), asc(component.id), desc(unitCondition.id));
}

/**
 * Gives the condition the checklist of a unit on one of the engineer's orders gave it (see
 * `recordChecklistConditions()`) the engineer's advice (none when empty), while the order is in
 * progress. Logged as a change of that condition. A 400 when the checklist gave it no score.
 */
export function adviseFieldCondition(number: string, equipmentId: number, advice: string) {
	return db.transaction(async (tx) => {
		const found = await findFieldUnit(tx, number, equipmentId);
		if (!fieldActions(found.order.status).work) {
			error(400, m.condition_not_in_progress({ number }));
		}
		const recorded = await checklistCondition(tx, found.unit.id, found.order.id);
		if (!recorded) error(400, m.condition_portal_no_score());
		const after = { advice: advice.trim() || null };
		await tx.update(unitCondition).set(after).where(idInTenant(unitCondition, recorded.id));
		await recordActivity(tx, {
			action: "updated",
			subject: {
				type: "unitCondition",
				id: recorded.id,
				label: conditionLabel({ serialNumber: found.unit.serialNumber, score: recorded.score }),
			},
			parent: equipmentSubject(found.unit),
			before: { advice: recorded.advice },
			after,
		});
		return found;
	});
}

/**
 * The defects of the tenant's conditions `conditionIds`, each with its photos, by condition, in
 * their order.
 */
export async function defectsOf(
	conditionIds: readonly number[],
	tx: Transaction | typeof db = db,
): Promise<Map<number, RecordedDefect[]>> {
	const byCondition = new Map<number, RecordedDefect[]>();
	if (!conditionIds.length) return byCondition;
	const found = await tx
		.select({
			id: conditionDefect.id,
			conditionId: conditionDefect.conditionId,
			description: conditionDefect.description,
			severity: conditionDefect.severity,
			extent: conditionDefect.extent,
			intensity: conditionDefect.intensity,
			score: conditionDefect.score,
			componentId: component.id,
			componentNumber: component.number,
			componentName: component.name,
		})
		.from(conditionDefect)
		.leftJoin(...tenantJoin(component, conditionDefect.componentId))
		.where(and(inList(conditionDefect.conditionId, conditionIds), inTenant(conditionDefect)))
		.orderBy(asc(conditionDefect.conditionId), asc(conditionDefect.position));
	const photos = found.length
		? await tx
				.select({ id: conditionDefectPhoto.id, defectId: conditionDefectPhoto.defectId })
				.from(conditionDefectPhoto)
				.where(
					and(
						inList(
							conditionDefectPhoto.defectId,
							found.map((defect) => defect.id),
						),
						inTenant(conditionDefectPhoto),
					),
				)
				.orderBy(asc(conditionDefectPhoto.position), asc(conditionDefectPhoto.id))
		: [];
	const photosOf = Map.groupBy(photos, (photo) => photo.defectId);
	for (const { conditionId, componentId, componentNumber, componentName, ...defect } of found) {
		const recorded: RecordedDefect = {
			...defect,
			extent: defect.extent as DefectGrade["extent"],
			component:
				componentId === null
					? null
					: { id: componentId, number: componentNumber!, name: componentName! },
			photos: (photosOf.get(defect.id) ?? []).map(({ id }) => ({ id })),
		};
		byCondition.set(conditionId, [...(byCondition.get(conditionId) ?? []), recorded]);
	}
	return byCondition;
}

/**
 * The conditions of the unit as a whole (or of its component `componentId`), newest first, with
 * who recorded each and on which order, its defects, and the percentage of one converted from
 * before NEN 2767.
 */
export async function conditionsOf(equipmentId: number, componentId: number | null = null) {
	const found = await db
		.select({
			id: unitCondition.id,
			score: unitCondition.score,
			legacyPercent: unitCondition.legacyPercent,
			advice: unitCondition.advice,
			source: unitCondition.source,
			recordedAt: unitCondition.recordedAt,
			engineer: engineer.name,
			user: user.name,
			order: order.number,
		})
		.from(unitCondition)
		.leftJoin(...tenantJoin(engineer, unitCondition.engineerId))
		.leftJoin(user, eq(user.id, unitCondition.userId))
		.leftJoin(...tenantJoin(order, unitCondition.orderId))
		.where(
			and(
				eq(unitCondition.equipmentId, equipmentId),
				componentId === null
					? isNull(unitCondition.componentId)
					: eq(unitCondition.componentId, componentId),
				inTenant(unitCondition),
			),
		)
		.orderBy(desc(unitCondition.recordedAt), desc(unitCondition.id));
	const defects = await defectsOf(found.map((row) => row.id));
	return found.map(({ engineer, user, ...row }) => ({
		...row,
		by: engineer ?? user,
		defects: defects.get(row.id) ?? [],
	}));
}
