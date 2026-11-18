/**
 * Adding photos to an order later and deleting one, in every shell that shows an order's photos:
 * the office's order page, the engineer portal's and the customer portal's. Any member may call
 * them (`forAnyRole`); which order or photo they reach is the access registry's (see
 * `./server/photos.ts`): the office adds to an order that isn't invoiced and deletes any photo, an
 * engineer adds to an order of theirs they work on, and whoever added a photo deletes it while the
 * order is still to be done. Anyone else's is a 404, also by a tampered id. Neither keeps a list of
 * queries to refresh, so each refreshes the page it's sent from.
 */
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { forAnyRole } from "#lib/server/remote-functions.ts";

import { addPhotosLater, removeOrderPhoto } from "./server/photos.ts";

/**
 * Adds photos (at most `MAX_PHOTOS`, shrunk by the picker, or as they are without JavaScript) to
 * the order `id`.
 */
export const addPhotos = forAnyRole.form(
	v.object({ id: id(), photos: v.optional(v.array(v.file()), []) }),
	async ({ id, photos }) => {
		await addPhotosLater(id, photos);
	},
);

/** Deletes the photo `id`. */
export const deletePhoto = forAnyRole.form(v.object({ id: id() }), async ({ id }) => {
	await removeOrderPhoto(id);
});
