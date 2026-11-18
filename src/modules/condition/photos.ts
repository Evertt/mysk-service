/**
 * The photos of a defect: how many, of which kinds and how large. The forms shrink each in the
 * browser first (its longest side to `PHOTO_LONGEST_SIDE`, as JPEG, `ui/shrink.ts`), so a photo from
 * a phone is a few hundred KB; the server holds every photo to these limits whatever the browser
 * did (`storeDefectPhotos()`). The same limits as an order's photos (`#lib/orders/photos.ts`).
 */

/** The most photos a defect may have. */
export const MAX_DEFECT_PHOTOS = 5;

/** The most bytes a photo may have once it's shrunk: 2 MB. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

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
