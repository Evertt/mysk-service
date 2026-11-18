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
 */
import { error } from "@sveltejs/kit";

import { formatNumber, numberFormatter } from "#lib/i18n/format.ts";
import { readOrNotFound } from "#lib/server/access/index.ts";
import { currentTenant, idInTenant, requireTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { photoStore } from "#lib/server/files/photos.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import {
	isPhotoType,
	MAX_DEFECT_PHOTOS,
	MAX_PHOTO_BYTES,
	type PhotoType,
	photoTypes,
} from "../photos.ts";
import { conditionDefectPhoto } from "./schema.ts";

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

/** A new photo's key in the store: `<tenant>/conditions/<uuid>.<extension>`. */
const photoKey = (organizationId: string, extension: string) =>
	`${organizationId}/conditions/${crypto.randomUUID()}.${extension}`;

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

/** Takes stored photos away again, when what they were for wasn't recorded. */
export async function discardDefectPhotos(keys: readonly string[]) {
	const store = photoStore();
	await Promise.all(keys.map((key) => store.delete(key)));
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
