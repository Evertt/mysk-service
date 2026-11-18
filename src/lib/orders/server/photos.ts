/**
 * The photos of an order (`order_photo`): a customer's contact adds them to a breakdown they report
 * in the portal (`reportOrder()`), its engineer on site and the office on the order's page later
 * (`addPhotosLater()`). The files are in the photo store (`photoStore()`), the rows say whose they
 * are, and whoever may read the order sees them (the access registry's `order_photo`, a part of
 * `order`), at `/photos/<id>` (`servePhoto()`), never at a public URL. The office deletes any, the
 * one who added a photo theirs while the order is still to be done (`removeOrderPhoto()`, the same
 * rule's change).
 *
 * A store is never written inside a transaction (on Cloudflare one holds every other request):
 *
 * - adding: `withStoredPhotos()` puts the files first, outside it, then the transaction records them
 *   (`addOrderPhotos()`); should it fail, the stored files are deleted again;
 * - deleting a photo or an order: the transaction deletes the rows and answers their files' keys,
 *   which are deleted once it has committed (`discardPhotoFiles()`);
 * - whatever was missed (a server stopped between the two, a delete that failed, an order deleted
 *   with its customer) the daily run's `sweepOrderPhotos()` deletes: stored files no row points to.
 */
import { error } from "@sveltejs/kit";
import { and, asc, count, eq, sql } from "drizzle-orm";

import { orderSubject } from "#lib/activity/index.ts";
import { formatNumber, numberFormatter } from "#lib/i18n/format.ts";
import { readOrNotFound, visible, visibleOrNone } from "#lib/server/access/index.ts";
import { audienceOf } from "#lib/server/access/viewer.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, requireTenant } from "#lib/server/auth/index.ts";
import { db, type Runner, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertBatches } from "#lib/server/db/parameters.ts";
import { order, orderPhoto } from "#lib/server/db/schema.ts";
import { photoKey, photoPrefix, photoStore } from "#lib/server/files/photos.ts";
import { deleteAndLog, nextPosition, orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { notEditable } from "../lifecycle.ts";
import {
	isPhotoType,
	MAX_ORDER_PHOTOS,
	MAX_PHOTO_BYTES,
	MAX_PHOTOS,
	MAX_PHOTOS_BYTES,
	mayAddPhotos,
	type PhotoType,
	photoTypes,
} from "../photos.ts";
import { findEngineerOrder } from "./field.ts";

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
 * most `MAX_PHOTO_BYTES`, `MAX_PHOTOS_BYTES` together), and answers each one's bytes and type; a
 * `Refused` on `photos` if one isn't. Before anything is stored.
 */
async function readPhotos(files: readonly File[]) {
	if (files.length > MAX_PHOTOS)
		throw onPhotos(m.orders_photos_too_many({ max: formatNumber(MAX_PHOTOS) }));
	for (const file of files) {
		if (file.size > MAX_PHOTO_BYTES) {
			throw onPhotos(m.orders_photo_too_large({ size: megabytes(MAX_PHOTO_BYTES / 2 ** 20) }));
		}
	}
	if (files.reduce((sum, file) => sum + file.size, 0) > MAX_PHOTOS_BYTES) {
		throw onPhotos(m.orders_photos_too_large({ size: megabytes(MAX_PHOTOS_BYTES / 2 ** 20) }));
	}
	return Promise.all(
		files.map(async (file) => {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const type = isPhotoType(file.type) ? file.type : undefined;
			if (!type || !signatures[type](bytes)) throw onPhotos(m.orders_photo_not_image());
			return { bytes, type };
		}),
	);
}

/**
 * Deletes the files `keys` from the photo store (`store`, the request's by default), once nothing
 * points to them any more: after the transaction that deleted their rows committed, or when the
 * one that was to record them failed. A file that can't be deleted now is logged and left to the
 * daily sweep (`sweepOrderPhotos()`), so it never fails what came before.
 */
export async function discardPhotoFiles(keys: readonly string[], store = photoStore()) {
	const results = await Promise.allSettled(keys.map((key) => store.delete(key)));
	results.forEach((result, i) => {
		if (result.status === "rejected") {
			console.error(`Couldn't delete the photo ${keys[i]}; the daily sweep will:`, result.reason);
		}
	});
}

/**
 * Puts `files` in the photo store under the tenant's keys, outside any transaction, once all pass
 * the checks (`readPhotos()`: else a `Refused` on `photos`, and nothing is stored). Should one fail
 * to be stored, those that were are deleted again.
 */
export async function storeOrderPhotos(files: readonly File[]): Promise<StoredPhoto[]> {
	const photos = await readPhotos(files);
	const { organizationId } = currentTenant();
	const store = photoStore();
	const results = await Promise.allSettled(
		photos.map(async ({ bytes, type }) => {
			const objectKey = photoKey(organizationId, photoTypes[type]);
			await store.put(objectKey, bytes, type);
			return { objectKey, contentType: type, size: bytes.byteLength };
		}),
	);
	const stored = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
	const failed = results.find((result) => result.status === "rejected");
	if (failed) {
		await discardPhotoFiles(stored.map((photo) => photo.objectKey));
		throw failed.reason;
	}
	return stored;
}

/** Deletes stored photos again, when the order they were for wasn't made or changed. */
const discardOrderPhotos = (photos: readonly StoredPhoto[]) =>
	discardPhotoFiles(photos.map((photo) => photo.objectKey));

/**
 * Stores `files` (`storeOrderPhotos()`, outside any transaction), then runs `record` with them,
 * which records them in a transaction of its own (`addOrderPhotos()`); should it fail, the stored
 * files are deleted again and its error thrown.
 */
export async function withStoredPhotos<T>(
	files: readonly File[],
	record: (photos: StoredPhoto[]) => Promise<T>,
): Promise<T> {
	const photos = await storeOrderPhotos(files);
	try {
		return await record(photos);
	} catch (thrown) {
		await discardOrderPhotos(photos);
		throw thrown;
	}
}

/**
 * Records `photos` (put in the store by `storeOrderPhotos()`) on the order `of`, after the ones it
 * has, in `tx`: one row each, each logged as created on the order, by the signed-in user. Refuses
 * (on `photos`) more than `MAX_ORDER_PHOTOS` on the order.
 */
export async function addOrderPhotos(
	tx: Transaction,
	of: { id: number; number: string },
	photos: readonly StoredPhoto[],
) {
	if (!photos.length) return;
	const [{ has }] = await tx
		.select({ has: count() })
		.from(orderPhoto)
		.where(and(eq(orderPhoto.orderId, of.id), inTenant(orderPhoto)));
	if (has + photos.length > MAX_ORDER_PHOTOS) {
		throw onPhotos(m.orders_photos_order_full({ max: formatNumber(MAX_ORDER_PHOTOS) }));
	}
	const { organizationId, user } = currentTenant();
	const first = await nextPosition(tx, orderPhoto, eq(orderPhoto.orderId, of.id));
	const rows = photos.map((photo, i) => ({
		...photo,
		organizationId,
		orderId: of.id,
		position: first + i,
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
			subject: { type: "order_photo", id, label: photoLabel(position) },
			parent: orderSubject(of),
		});
	}
}

/** A photo's label in the log: its place among the order's, `#1` the first. */
const photoLabel = (position: number) => `#${position + 1}`;

/**
 * The order `id` that the viewer may add photos to now, in `runner`: the office one of the
 * tenant's that isn't invoiced, its engineer one of theirs they work on (`mayAddPhotos()`). A 404
 * for anyone else's (the access registry's change of `order`: no customer's contact changes one),
 * a `Refused` once its status lets no one add any.
 */
async function orderToAddTo(runner: Runner, id: number) {
	const audience = audienceOf();
	if (audience === "engineer") return findEngineerOrder(runner, { id }, "photo");
	const theirs = await visible("order", "change");
	const found = orNotFound(
		audience === "office" && theirs
			? await runner.query.order.findFirst({
					columns: { id: true, number: true, status: true },
					where: and(idInTenant(order, id), theirs),
				})
			: undefined,
		m.orders_not_found_plain(),
	);
	if (!mayAddPhotos("office", found.status))
		throw new Refused(notEditable(found.number, "changed"));
	return found;
}

/**
 * Adds `files` to the order `orderId` later, as its engineer on site or the office: checked first
 * (`orderToAddTo()`), then stored and recorded (`withStoredPhotos()`), checked again in the
 * transaction. Answers the order's number.
 */
export async function addPhotosLater(orderId: number, files: readonly File[]) {
	if (!files.length) throw onPhotos(m.orders_photos_none_chosen());
	await orderToAddTo(db, orderId);
	return withStoredPhotos(files, (photos) =>
		db.transaction(async (tx) => {
			const found = await orderToAddTo(tx, orderId);
			await addOrderPhotos(tx, found, photos);
			return found.number;
		}),
	);
}

/**
 * Deletes the photo `id`, for whoever may (the access registry's change of `order_photo`: the
 * office, or who added it while the order is still to be done; a 404 for anyone else, also by a
 * tampered id), logged as deleted on its order; then its file, once that has committed. Answers
 * the order's number.
 */
export async function removeOrderPhoto(id: number) {
	const theirs = orNotFound(await visible("order_photo", "change"), m.orders_photo_not_found());
	const removed = await db.transaction(async (tx) => {
		const [found] = await tx
			.select({
				id: orderPhoto.id,
				orderId: orderPhoto.orderId,
				position: orderPhoto.position,
				objectKey: orderPhoto.objectKey,
			})
			.from(orderPhoto)
			.where(and(idInTenant(orderPhoto, id), theirs));
		const photo = orNotFound(found, m.orders_photo_not_found());
		const [parent] = await tx
			.select({ id: order.id, number: order.number })
			.from(order)
			.where(idInTenant(order, photo.orderId));
		await deleteAndLog(orderPhoto, {
			tx,
			subject: { type: "order_photo", id: photo.id, label: photoLabel(photo.position) },
			parent: orderSubject(parent),
		});
		return { objectKey: photo.objectKey, number: parent.number };
	});
	await discardPhotoFiles([removed.objectKey]);
	return removed.number;
}

/**
 * The files of the orders `orderIds`' photos, in `tx`: the transaction that deletes the orders
 * (their photos' rows go with them) answers them, to delete once it has committed
 * (`discardPhotoFiles()`).
 */
export async function photoFilesOf(tx: Transaction, orderIds: readonly number[]) {
	if (!orderIds.length) return [];
	const found = await tx
		.select({ objectKey: orderPhoto.objectKey })
		.from(orderPhoto)
		.where(and(inList(orderPhoto.orderId, orderIds), inTenant(orderPhoto)));
	return found.map((row) => row.objectKey);
}

/**
 * A photo as the pages show it: its id, by which `/photos/<id>` serves it, and whether the viewer
 * may delete it (the access registry's change of `order_photo`).
 */
export interface OrderPhoto {
	id: number;
	deletable: boolean;
}

/**
 * The photos of the orders `orderIds` that the viewer may see (those of the orders they may read),
 * by order, each in its order.
 */
export async function photosOf(orderIds: readonly number[]): Promise<Map<number, OrderPhoto[]>> {
	const byOrder = new Map<number, OrderPhoto[]>();
	if (!orderIds.length) return byOrder;
	const [seen, changed] = await Promise.all([
		visibleOrNone("order_photo"),
		visible("order_photo", "change"),
	]);
	const found = await db
		.select({
			id: orderPhoto.id,
			orderId: orderPhoto.orderId,
			deletable: changed ? sql<number>`case when ${changed} then 1 else 0 end` : sql<number>`0`,
		})
		.from(orderPhoto)
		.where(and(inList(orderPhoto.orderId, orderIds), seen))
		.orderBy(asc(orderPhoto.orderId), asc(orderPhoto.position));
	for (const { id, orderId, deletable } of found) {
		byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), { id, deletable: Boolean(deletable) }]);
	}
	return byOrder;
}

/** How old a stored file must be before the sweep may delete it: a day, past any form in flight. */
const SWEEP_AFTER = { hours: 24 };

/**
 * Deletes the tenant's stored photo files (in `store`, the request's by default) that no
 * `order_photo` row points to and that were stored more than a day before `now`: those a deletion
 * or a failed form left behind (see the top of this file). A younger one may belong to a form still
 * being recorded, so it stays. For the daily run (`runDaily()`), as the system. Answers how many it
 * deleted.
 */
export async function sweepOrderPhotos(now = Temporal.Now.instant(), store = photoStore()) {
	const { organizationId } = currentTenant();
	const before = now.subtract(SWEEP_AFTER);
	const old = (await store.list(photoPrefix(organizationId)))
		.filter((file) => Temporal.Instant.compare(file.storedAt, before) < 0)
		.map((file) => file.key);
	if (!old.length) return 0;
	const kept = await db
		.select({ objectKey: orderPhoto.objectKey })
		.from(orderPhoto)
		.where(and(inList(orderPhoto.objectKey, old), inTenant(orderPhoto)));
	const pointedTo = new Set(kept.map((row) => row.objectKey));
	const orphans = old.filter((key) => !pointedTo.has(key));
	await discardPhotoFiles(orphans, store);
	return orphans.length;
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
