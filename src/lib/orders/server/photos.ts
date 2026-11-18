/**
 * The photos of an order (`order_photo`): a customer's contact adds them to a breakdown they report
 * in the portal. The files are in the photo store (`photoStore()`), the rows say whose they are, and
 * whoever may read the order sees them (the access registry's `order_photo`, a part of `order`), at
 * `/photos/<id>` (`servePhoto()`), never at a public URL.
 *
 * Storing is in two steps, as a store must never be written inside a transaction (on Cloudflare one
 * holds every other request): `storeOrderPhotos()` puts the files first, outside it; then the
 * transaction that makes the order records them (`addOrderPhotos()`). Should it fail,
 * `discardOrderPhotos()` takes the files away again.
 */
import { error } from "@sveltejs/kit";
import { and, asc } from "drizzle-orm";

import { orderSubject } from "#lib/activity/index.ts";
import { formatNumber, numberFormatter } from "#lib/i18n/format.ts";
import {
	isPhotoType,
	MAX_PHOTO_BYTES,
	MAX_PHOTOS,
	type PhotoType,
	photoTypes,
} from "#lib/orders/photos.ts";
import { readOrNotFound, visibleOrNone } from "#lib/server/access/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, requireTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertBatches } from "#lib/server/db/parameters.ts";
import { orderPhoto } from "#lib/server/db/schema.ts";
import { photoKey, photoStore } from "#lib/server/files/photos.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

/** A photo put in the store, not yet recorded on an order. */
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

/** A refusal on the form's `photos` field. */
const onPhotos = (message: string) => new Refused({ path: ["photos"], message });

/**
 * Checks `files` against the limits (at most `MAX_PHOTOS`, each a JPEG, PNG or WebP image of at
 * most `MAX_PHOTO_BYTES`), and answers each one's bytes and type; a `Refused` on `photos` if one
 * isn't. Before anything is stored.
 */
async function readPhotos(files: readonly File[]) {
	if (files.length > MAX_PHOTOS)
		throw onPhotos(m.client_report_photos_too_many({ max: formatNumber(MAX_PHOTOS) }));
	for (const file of files) {
		if (file.size > MAX_PHOTO_BYTES) {
			throw onPhotos(
				m.client_report_photo_too_large({ size: megabytes(MAX_PHOTO_BYTES / 2 ** 20) }),
			);
		}
	}
	return Promise.all(
		files.map(async (file) => {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const type = isPhotoType(file.type) ? file.type : undefined;
			if (!type || !signatures[type](bytes)) throw onPhotos(m.client_report_photo_not_image());
			return { bytes, type };
		}),
	);
}

/**
 * Puts `files` in the photo store under the tenant's keys, outside any transaction, once all pass
 * the checks (`readPhotos()`: else a `Refused` on `photos`, and nothing is stored).
 */
export async function storeOrderPhotos(files: readonly File[]): Promise<StoredPhoto[]> {
	const photos = await readPhotos(files);
	const { organizationId } = currentTenant();
	const store = photoStore();
	return Promise.all(
		photos.map(async ({ bytes, type }) => {
			const objectKey = photoKey(organizationId, photoTypes[type]);
			await store.put(objectKey, bytes, type);
			return { objectKey, contentType: type, size: bytes.byteLength };
		}),
	);
}

/** Takes stored photos away again, when the order they were for wasn't made. */
export async function discardOrderPhotos(photos: readonly StoredPhoto[]) {
	const store = photoStore();
	await Promise.all(photos.map((photo) => store.delete(photo.objectKey)));
}

/**
 * Records `photos` (put in the store by `storeOrderPhotos()`) on the order `of`, in their order,
 * in `tx`: one row each, each logged as created on the order, by the signed-in user.
 */
export async function addOrderPhotos(
	tx: Transaction,
	of: { id: number; number: string },
	photos: readonly StoredPhoto[],
) {
	if (!photos.length) return;
	const { organizationId, user } = currentTenant();
	const rows = photos.map((photo, position) => ({
		...photo,
		organizationId,
		orderId: of.id,
		position,
		userId: user.id,
	}));
	const added: { id: number; position: number }[] = [];
	for (const batch of insertBatches(orderPhoto, rows)) {
		added.push(
			...(await tx
				.insert(orderPhoto)
				.values(batch)
				.returning({ id: orderPhoto.id, position: orderPhoto.position })),
		);
	}
	for (const { id, position } of added) {
		await recordActivity(tx, {
			action: "created",
			subject: { type: "order_photo", id, label: `#${position + 1}` },
			parent: orderSubject(of),
		});
	}
}

/** A photo as the pages show it: its id, by which `/photos/<id>` serves it. */
export interface OrderPhoto {
	id: number;
}

/**
 * The photos of the orders `orderIds` that the viewer may see (those of the orders they may read),
 * by order, each in its order.
 */
export async function photosOf(orderIds: readonly number[]): Promise<Map<number, OrderPhoto[]>> {
	const byOrder = new Map<number, OrderPhoto[]>();
	if (!orderIds.length) return byOrder;
	const found = await db
		.select({ id: orderPhoto.id, orderId: orderPhoto.orderId })
		.from(orderPhoto)
		.where(and(inList(orderPhoto.orderId, orderIds), await visibleOrNone("order_photo")))
		.orderBy(asc(orderPhoto.orderId), asc(orderPhoto.position));
	for (const { id, orderId } of found)
		byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), { id }]);
	return byOrder;
}

/**
 * The photo `id`, for a signed-in member who may read its order (the office, its engineer, the
 * customer's contact who sees it; a 401 signed out); a 404 for anyone else, also another tenant's.
 * Served as stored, cached by their browser only.
 */
export async function servePhoto(id: string): Promise<Response> {
	requireTenant();
	if (!/^[1-9]\d{0,14}$/.test(id)) error(404, m.common_error_not_found());
	await readOrNotFound({ type: "order_photo", id });
	const [row] = await db
		.select({ objectKey: orderPhoto.objectKey, contentType: orderPhoto.contentType })
		.from(orderPhoto)
		.where(idInTenant(orderPhoto, Number(id)));
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
