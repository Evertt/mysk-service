/**
 * Shrinks a photo of a defect in the browser before its form sends it (the office's condition, the
 * engineer's rejected point), as the customer portal's report does: its longest side to
 * `PHOTO_LONGEST_SIDE` (never larger than it was), as a JPEG, so a phone's photo of several MB is a
 * few hundred KB. Turned as the camera held it (its EXIF orientation), since the JPEG keeps none.
 */
import { PHOTO_LONGEST_SIDE } from "../photos.ts";

/** How much a shrunk photo's JPEG keeps: enough to read a type plate. */
const QUALITY = 0.82;

/** `file` shrunk, as a JPEG named after it; throws if the browser can't read the image. */
export async function shrinkPhoto(file: File): Promise<File> {
	const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	const scale = Math.min(1, PHOTO_LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", QUALITY));
	if (!blob) throw new Error(`Couldn't shrink ${file.name}`);
	const name = `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`;
	return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
}
