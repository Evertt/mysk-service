/**
 * The photos of an order (`order_photo`): a customer's contact adds them to a breakdown they report
 * in the portal (`reportOrder()`), its engineer on site and the office on the order's page later
 * (`addPhotosLater()`). The files are in the photo store (`photoStore()`), the rows say whose they
 * are, and whoever may read the order sees them (the access registry's `order_photo`, a part of
 * `order`), at `/photos/<id>` (`servePhoto()`), never at a public URL. The office deletes any, the
 * one who added a photo theirs while the order is still to be done (`removeOrderPhoto()`, the same
 * rule's change).
 *
 * The files follow the records' files' one way (`#lib/server/files/stored.ts`): stored before the
 * transaction that records them (`withStoredPhotos()`), deleted after the one that deletes them
 * (`discardPhotoFiles()`), and swept daily (`sweepOrderPhotos()`).
 */
import { and, asc, count, eq, sql } from "drizzle-orm";

import { orderSubject } from "#lib/activity/index.ts";
import { formatNumber, numberFormatter } from "#lib/i18n/format.ts";
import { visible, visibleOrNone } from "#lib/server/access/index.ts";
import { audienceOf } from "#lib/server/access/viewer.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Runner, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertBatches } from "#lib/server/db/parameters.ts";
import { order, orderPhoto } from "#lib/server/db/schema.ts";
import { photoKey, photoPrefix } from "#lib/server/files/keys.ts";
import { photoStore } from "#lib/server/files/photos.ts";
import {
	discardFiles,
	serveStoredFile,
	type StoredFile,
	storeFiles,
	sweepFiles,
	withStoredFiles,
} from "#lib/server/files/stored.ts";
import { fileSignatures } from "#lib/server/files/types.ts";
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

const megabytes = numberFormatter({ style: "unit", unit: "megabyte", maximumFractionDigits: 0 });

/** A refusal on the form's `photos` field. */
const onPhotos = (message: string) => new Refused({ path: ["photos"], message });

/**
 * Checks `files` against the limits (at most `MAX_PHOTOS`, each a JPEG, PNG or WebP image of at
 * most `MAX_PHOTO_BYTES`, `MAX_PHOTOS_BYTES` together, as its bytes say), and answers each one
 * to store under a new key of the tenant's; a `Refused` on `photos` if one isn't. Before anything
 * is stored.
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
	const { organizationId } = currentTenant();
	return Promise.all(
		files.map(async (file) => {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const type = isPhotoType(file.type) ? file.type : undefined;
			if (!type || !fileSignatures[type](bytes)) throw onPhotos(m.orders_photo_not_image());
			return { objectKey: photoKey(organizationId, photoTypes[type]), bytes, contentType: type };
		}),
	);
}

/**
 * Deletes the files `keys` from the photo store (`store`, the request's by default), once nothing
 * points to them any more (`discardFiles()`: a failure is left to the sweep).
 */
export const discardPhotoFiles = (keys: readonly string[], store = photoStore()) =>
	discardFiles(store, keys);

/**
 * Puts `files` in the photo store under the tenant's keys, outside any transaction, once all pass
 * the checks (`readPhotos()`: else a `Refused` on `photos`, and nothing is stored). Should one fail
 * to be stored, those that were are deleted again (`storeFiles()`).
 */
export async function storeOrderPhotos(files: readonly File[]): Promise<StoredFile[]> {
	return storeFiles(photoStore(), await readPhotos(files));
}

/**
 * Checks `files` (`readPhotos()`), stores them (outside any transaction), then runs `record` with
 * them, which records them in a transaction of its own (`addOrderPhotos()`); should it fail, the
 * stored files are deleted again and its error thrown (`withStoredFiles()`).
 */
export async function withStoredPhotos<T>(
	files: readonly File[],
	record: (photos: StoredFile[]) => Promise<T>,
): Promise<T> {
	return withStoredFiles(photoStore(), await readPhotos(files), record);
}

/**
 * Records `photos` (put in the store by `storeOrderPhotos()`) on the order `of`, after the ones it
 * has, in `tx`: one row each, each logged as created on the order, by the signed-in user. Refuses
 * (on `photos`) more than `MAX_ORDER_PHOTOS` on the order.
 */
export async function addOrderPhotos(
	tx: Transaction,
	of: { id: number; number: string },
	photos: readonly StoredFile[],
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

/**
 * Deletes the tenant's stored photo files (in `store`, the request's by default) that no
 * `order_photo` row points to and that were stored more than a day before `now` (`sweepFiles()`).
 * For the daily run (`runDaily()`), as the system. Answers how many it deleted.
 */
export const sweepOrderPhotos = (now = Temporal.Now.instant(), store = photoStore()) =>
	sweepFiles(
		{
			store,
			prefix: photoPrefix,
			referenced: async (keys) =>
				(
					await db
						.select({ objectKey: orderPhoto.objectKey })
						.from(orderPhoto)
						.where(and(inList(orderPhoto.objectKey, keys), inTenant(orderPhoto)))
				).map((row) => row.objectKey),
		},
		now,
	);

/**
 * The photo `id`, for a signed-in member who may read its order (the office, its engineer, the
 * customer's contact who sees it; a 401 signed out); a 404 for anyone else, also another tenant's.
 * Served as stored (`serveStoredFile()`).
 */
export const servePhoto = (id: string): Promise<Response> =>
	serveStoredFile(
		{ type: "order_photo", id },
		async (photoId) =>
			(
				await db
					.select({ objectKey: orderPhoto.objectKey, contentType: orderPhoto.contentType })
					.from(orderPhoto)
					.where(idInTenant(orderPhoto, photoId))
			)[0],
		photoStore(),
	);
