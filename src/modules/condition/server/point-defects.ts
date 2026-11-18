/**
 * The defect an engineer gives a rejected point of a unit's checklist in the portal, while it's a
 * draft (`condition_point_defect`, `checklists.field.rejected`): its severity, extent and
 * intensity, and photos of it. Kept by the point's id, which the checklists module's
 * `rejectedFieldPoint()` checks is a point of the engineer's own checklist (another engineer's, or
 * tenant's, is a 404, also by a tampered id), changed while the checklist is a draft and its order
 * in progress. When the checklist is completed, it becomes a defect of the conditions it records
 * (`recordChecklistConditions()`).
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";

import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";
import { orNotFound } from "#lib/server/records.ts";
import { rejectedFieldPoint } from "#modules/checklists/api/points.server.ts";

import type { DefectGrade } from "../nen2767.ts";
import { discardDefectPhotos, storeDefectPhotos } from "./photos.ts";
import { conditionDefectPhoto, conditionPointDefect } from "./schema.ts";

/** Which point: of the unit `equipmentId`'s checklist on the engineer's order `number`. */
export interface FieldPointRef {
	number: string;
	equipmentId: number;
	pointId: number;
}

/** The engineer's point `ref`, in `tx`: a 404 when it isn't theirs. */
async function pointOf(tx: Transaction | typeof db, ref: FieldPointRef) {
	return orNotFound(await rejectedFieldPoint(tx, ref), m.condition_point_not_found());
}

/** The draft of the point `pointId` of the unit, in `tx`, if it has one. */
async function draftOf(tx: Transaction | typeof db, ref: FieldPointRef) {
	const [found] = await tx
		.select({
			id: conditionPointDefect.id,
			severity: conditionPointDefect.severity,
			extent: conditionPointDefect.extent,
			intensity: conditionPointDefect.intensity,
		})
		.from(conditionPointDefect)
		.where(
			and(
				eq(conditionPointDefect.checklistPointId, ref.pointId),
				eq(conditionPointDefect.equipmentId, ref.equipmentId),
				inTenant(conditionPointDefect),
			),
		);
	return found;
}

/** The photos of the draft `id`, in `tx`, in their order. */
const photosOf = (tx: Transaction | typeof db, id: number) =>
	tx
		.select({ id: conditionDefectPhoto.id, objectKey: conditionDefectPhoto.objectKey })
		.from(conditionDefectPhoto)
		.where(and(eq(conditionDefectPhoto.pointDefectId, id), inTenant(conditionDefectPhoto)))
		.orderBy(asc(conditionDefectPhoto.position), asc(conditionDefectPhoto.id));

/**
 * The defect the engineer gave their point `ref` (none yet), with its photos, and whether they can
 * still change it.
 */
export async function fieldPointDefect(ref: FieldPointRef) {
	const point = await pointOf(db, ref);
	const draft = await draftOf(db, ref);
	const photos = draft ? await photosOf(db, draft.id) : [];
	return {
		point: { id: point.id, text: point.text, result: point.result },
		canChange: point.canChange,
		defect: draft
			? { severity: draft.severity, extent: draft.extent, intensity: draft.intensity }
			: null,
		photos: photos.map(({ id }) => ({ id })),
	};
}

/**
 * Gives the engineer's point `ref` its defect's grade, and adds `photos` to it (at most
 * `MAX_DEFECT_PHOTOS` in all), while they can change it: a 400 once the checklist is completed or
 * the order no longer in progress. The photos are stored first, and taken away again if it's
 * refused.
 */
export async function saveFieldPointDefect(
	ref: FieldPointRef,
	grade: DefectGrade,
	photos: readonly File[],
) {
	const before = await draftOf(db, ref);
	const already = before ? (await photosOf(db, before.id)).length : 0;
	await pointOf(db, ref);
	const [stored] = await storeDefectPhotos([photos], () => ["photos"], already);
	try {
		await db.transaction(async (tx) => {
			const point = await pointOf(tx, ref);
			if (!point.canChange) error(400, m.condition_point_closed());
			const { organizationId } = currentTenant();
			const values = { ...grade, updatedAt: Temporal.Now.instant() };
			const [draft] = await tx
				.insert(conditionPointDefect)
				.values({
					organizationId,
					checklistPointId: point.id,
					equipmentId: ref.equipmentId,
					...values,
				})
				.onConflictDoUpdate({
					target: [conditionPointDefect.organizationId, conditionPointDefect.checklistPointId],
					set: values,
				})
				.returning({ id: conditionPointDefect.id });
			const count = (await photosOf(tx, draft.id)).length;
			await insertRows(
				tx,
				conditionDefectPhoto,
				stored.map((photo, index) => ({
					...photo,
					organizationId,
					equipmentId: ref.equipmentId,
					pointDefectId: draft.id,
					position: count + index,
				})),
			);
		});
	} catch (failure) {
		await discardDefectPhotos(stored.map((photo) => photo.objectKey));
		throw failure;
	}
}

/**
 * Takes the photo `photoId` off the engineer's point `ref`, while they can change it; its file goes
 * once that's committed. A 404 for a photo that isn't the point's.
 */
export function removeFieldDefectPhoto(ref: FieldPointRef, photoId: number) {
	return db.transaction(async (tx) => {
		const point = await pointOf(tx, ref);
		if (!point.canChange) error(400, m.condition_point_closed());
		const draft = orNotFound(await draftOf(tx, ref), m.common_error_not_found());
		const [photo] = await tx
			.delete(conditionDefectPhoto)
			.where(
				and(
					idInTenant(conditionDefectPhoto, photoId),
					eq(conditionDefectPhoto.pointDefectId, draft.id),
				),
			)
			.returning({ objectKey: conditionDefectPhoto.objectKey });
		orNotFound(photo, m.common_error_not_found());
		afterCommit(() => discardDefectPhotos([photo.objectKey]));
	});
}
