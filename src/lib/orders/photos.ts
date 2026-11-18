/**
 * The photos of an order: a customer's contact adds them to a breakdown they report in the portal,
 * its engineer on site in the engineer portal, and the office on the order's page. How many, of
 * which kinds and how large, and who may add them when. The picker shrinks each in the browser
 * first (its longest side to `PHOTO_LONGEST_SIDE`, as JPEG), so a photo from a phone is a few
 * hundred KB; without JavaScript a form sends them as they are, so the server takes a photo of up
 * to `MAX_PHOTO_BYTES`, `MAX_PHOTOS_BYTES` a request, and holds every photo to these limits whatever
 * the browser did (`storeOrderPhotos()`).
 */
import { isEditableOrder, type OrderStatus } from "#lib/models.ts";

import { fieldActions } from "./lifecycle.ts";

/** The most photos one form may send. */
export const MAX_PHOTOS = 5;

/** The most photos an order may have, from the report and added later together. */
export const MAX_ORDER_PHOTOS = 30;

/**
 * The most bytes a photo may have: 10 MB, a phone's photo as it is, for a form sent without
 * JavaScript (with it, the picker sends a few hundred KB).
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * The most bytes a form's photos may have together: 25 MB. Workers take 100 MB a request;
 * adapter-node takes only its `BODY_SIZE_LIMIT` (512 KB unless raised: see README.md).
 */
export const MAX_PHOTOS_BYTES = 25 * 1024 * 1024;

/** The longest side, in pixels, the browser shrinks a photo to. */
export const PHOTO_LONGEST_SIDE = 1600;

/** The kinds of image the server keeps, each with the extension its key gets. */
export const photoTypes = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
} as const;

export type PhotoType = keyof typeof photoTypes;

/** Whether `type` is a kind of image the server keeps. */
export const isPhotoType = (type: string): type is PhotoType => Object.hasOwn(photoTypes, type);

/**
 * Whether photos may be added to an order in `status` later, by the office (while it isn't invoiced)
 * or its engineer (while they work on it: `fieldActions()`'s `photo`). Who may add them to which
 * order is the access registry's (whoever may change the order); customers' contacts add theirs to
 * the report only. Who may delete one is the registry's `order_photo` rule.
 */
export const mayAddPhotos = (audience: "office" | "engineer", status: OrderStatus) =>
	audience === "office" ? isEditableOrder(status) : fieldActions(status).photo;
