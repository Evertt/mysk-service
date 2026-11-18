/**
 * The photos of defects (`condition_defect_photo`): taken with a defect the office records, or with
 * the defect an engineer gives a rejected checklist point. The files are in the photo store (the
 * core's, `photoStore()`, under the tenant's keys), the rows say whose they are, and whoever may
 * read the unit's conditions sees them (the access registry's `conditionPhoto`, `access.ts`), at
 * `/condition/photos/<id>` (`serveConditionPhoto()`), never at a public URL.
 *
 * Storing is in two steps, as a store must never be written inside a transaction (on Cloudflare one
 * holds every other request): `storeDefectPhotos()` puts the files first, outside it; then the
 * transaction that records the defect records them. Should it fail, `discardDefectPhotos()` takes
 * the files away again.
 *
 * Deleting a unit or a component takes its photos' rows with it (the keys cascade): the transaction
 * that deletes it asks first what lets go of their files (`unitPhotoFiles()`, through core's
 * `equipment.removing`; `componentPhotoFiles()`), which runs once it has committed. Whatever is
 * missed the daily sweep deletes (`sweepConditionPhotos()`, `jobs.fileSweeps`): the tenant's files
 * under `<tenant>/conditions/` that no row points to.
 */
import { error } from "@sveltejs/kit";
import { and, eq, or } from "drizzle-orm";

import type { UnitRemoval } from "#lib/equipment/extensions.ts";
import { formatNumber, numberFormatter } from "#lib/i18n/format.ts";
import type { DailyReport } from "#lib/jobs/extensions.ts";
import { readOrNotFound } from "#lib/server/access/index.ts";
import {
	currentTenant,
	idInTenant,
	inTenant,
	requireTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { photoStore } from "#lib/server/files/photos.ts";
import type { FileStore } from "#lib/server/files/store.ts";
import { discardFiles, sweepFiles } from "#lib/server/files/stored.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import {
	isPhotoType,
	MAX_DEFECT_PHOTOS,
	MAX_PHOTO_BYTES,
	type PhotoType,
	photoTypes,
} from "../photos.ts";
import { conditionDefect, conditionDefectPhoto, unitCondition } from "./schema.ts";

/** A photo put in the store, not yet recorded on a defect. */
export interface StoredPhoto {
	objectKey: string;
	contentType: PhotoType;
	size: number;
}

const megabytes = numberFormatter({ style: "unit", unit: "megabyte", maximumFractionDigits: 0 });

/** Each kind's first bytes: a photo is what its bytes say, whatever type the browser gave it. */
const signatures: Record<PhotoType, (bytes: Uint8Array) => boolean> = {
	"image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
	"image/png": (bytes) =>
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte),
	"image/webp": (bytes) =>
		String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
		String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP",
};

/** What the keys of a tenant's defect photos start with: `<tenant>/conditions/`. */
export const conditionPhotoPrefix = (organizationId: string) => `${organizationId}/conditions/`;

/** A new photo's key in the store: `<tenant>/conditions/<uuid>.<extension>`. */
const photoKey = (organizationId: string, extension: string) =>
	`${conditionPhotoPrefix(organizationId)}${crypto.randomUUID()}.${extension}`;

/**
 * Checks `files` against the limits (at most `MAX_DEFECT_PHOTOS` with the `already` it has, each a
 * JPEG, PNG or WebP image of at most `MAX_PHOTO_BYTES`), and answers each one's bytes and type; a
 * `Refused` on `path` if one isn't. Before anything is stored.
 */
async function readPhotos(files: readonly File[], path: (string | number)[], already: number) {
	const refuse = (message: string) => new Refused({ path, message });
	if (files.length + already > MAX_DEFECT_PHOTOS) {
		throw refuse(m.condition_photos_too_many({ max: formatNumber(MAX_DEFECT_PHOTOS) }));
	}
	for (const file of files) {
		if (file.size > MAX_PHOTO_BYTES) {
			throw refuse(m.condition_photo_too_large({ size: megabytes(MAX_PHOTO_BYTES / 2 ** 20) }));
		}
	}
	return Promise.all(
		files.map(async (file) => {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const type = isPhotoType(file.type) ? file.type : undefined;
			if (!type || !signatures[type](bytes)) throw refuse(m.condition_photo_not_image());
			return { bytes, type };
		}),
	);
}

/**
 * Puts each defect's `files` in the photo store under the tenant's keys, outside any transaction,
 * once all pass the checks (`readPhotos()`: else a `Refused` on that defect's photos, `path(i)`, and
 * nothing is stored). Answers each one's stored photos, in the order given.
 */
export async function storeDefectPhotos(
	perDefect: readonly (readonly File[])[],
	path: (index: number) => (string | number)[],
	already = 0,
): Promise<StoredPhoto[][]> {
	const read = [];
	for (const [index, files] of perDefect.entries()) {
		read.push(await readPhotos(files, path(index), already));
	}
	const { organizationId } = currentTenant();
	const store = photoStore();
	return Promise.all(
		read.map((photos) =>
			Promise.all(
				photos.map(async ({ bytes, type }) => {
					const objectKey = photoKey(organizationId, photoTypes[type]);
					await store.put(objectKey, bytes, type);
					return { objectKey, contentType: type, size: bytes.byteLength };
				}),
			),
		),
	);
}

/** Takes stored photos away again, when what they were for wasn't recorded (or was deleted). */
export async function discardDefectPhotos(keys: readonly string[]) {
	await discardFiles(photoStore(), keys);
}

/** Of `keys`, those a photo row of the tenant points to (one statement: `inList()`). */
async function referencedPhotoKeys(keys: readonly string[]) {
	const rows = await db
		.select({ objectKey: conditionDefectPhoto.objectKey })
		.from(conditionDefectPhoto)
		.where(and(inList(conditionDefectPhoto.objectKey, keys), inTenant(conditionDefectPhoto)));
	return rows.map((row) => row.objectKey);
}

/**
 * What lets go of the files of the photos that `query` (in `tx`) finds, which the transaction that
 * deletes a unit or a component takes with it: asked in it before the delete, it answers what
 * deletes, once it has committed, those of the files no photo points to any more (a checklist's
 * defect on a component shares its files with the unit's, which may stay).
 */
async function photoFilesOf(query: PromiseLike<{ objectKey: string }[]>) {
	const keys = [...new Set((await query).map((row) => row.objectKey))];
	return async () => {
		if (!keys.length) return;
		const kept = new Set(await referencedPhotoKeys(keys));
		await discardDefectPhotos(keys.filter((key) => !kept.has(key)));
	};
}

/**
 * `equipment.removing`: what lets go of the files of the photos of the unit core deletes in `tx`
 * (its defects', its components' and its checklist's rejected points'), once that has committed.
 */
export const unitPhotoFiles = ({ tx, unitId }: UnitRemoval) =>
	photoFilesOf(
		tx
			.select({ objectKey: conditionDefectPhoto.objectKey })
			.from(conditionDefectPhoto)
			.where(and(eq(conditionDefectPhoto.equipmentId, unitId), inTenant(conditionDefectPhoto))),
	);

/**
 * What lets go of the files of the photos of the component `componentId`, which its removal in
 * `tx` takes with it: those of the defects on it, and of the defects of its conditions.
 */
export const componentPhotoFiles = (tx: Transaction, componentId: number) =>
	photoFilesOf(
		tx
			.select({ objectKey: conditionDefectPhoto.objectKey })
			.from(conditionDefectPhoto)
			.innerJoin(...tenantJoin(conditionDefect, conditionDefectPhoto.defectId))
			.innerJoin(...tenantJoin(unitCondition, conditionDefect.conditionId))
			.where(
				and(
					inTenant(conditionDefectPhoto),
					or(
						eq(conditionDefect.componentId, componentId),
						eq(unitCondition.componentId, componentId),
					),
				),
			),
	);

/**
 * Deletes the tenant's stored defect photos (in `store`, the request's photo store by default) that
 * no `condition_defect_photo` row points to and that were stored more than a day before `now`
 * (`sweepFiles()`). For the daily run (`jobs.fileSweeps`), as the system; answers how many it
 * deleted, in the run's report.
 */
export async function sweepConditionPhotos(
	{ now }: { now: Temporal.Instant },
	store: FileStore = photoStore(),
): Promise<DailyReport> {
	const swept = await sweepFiles(
		{ store, prefix: conditionPhotoPrefix, referenced: referencedPhotoKeys },
		now,
	);
	return swept ? { "condition.photos_swept": swept } : {};
}

/**
 * The photo `id`, for a signed-in member who may read its unit's conditions (the office, the
 * engineer of an order the unit is on; a 401 signed out); a 404 for anyone else, also another
 * tenant's. Served as stored, cached by their browser only.
 */
export async function serveConditionPhoto(id: string): Promise<Response> {
	requireTenant();
	if (!/^[1-9]\d{0,14}$/.test(id)) error(404, m.common_error_not_found());
	await readOrNotFound({ type: "conditionPhoto", id });
	const [row] = await db
		.select({
			objectKey: conditionDefectPhoto.objectKey,
			contentType: conditionDefectPhoto.contentType,
		})
		.from(conditionDefectPhoto)
		.where(idInTenant(conditionDefectPhoto, Number(id)));
	const found = orNotFound(row, m.common_error_not_found());
	const bytes = orNotFound(await photoStore().get(found.objectKey), m.common_error_not_found());
	return new Response(bytes, {
		headers: {
			"content-type": found.contentType,
			"content-length": String(bytes.byteLength),
			"cache-control": "private, max-age=86400",
			"x-content-type-options": "nosniff",
		},
	});
}
