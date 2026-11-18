/**
 * The store of the records' files (the orders' photos, the units' documents): on Cloudflare the
 * `PHOTOS` R2 bucket (`wrangler.jsonc`), elsewhere a folder (`PHOTOS_DIR`, `.photos` by default).
 * Each kind's keys have a prefix of their own in the tenant's (`./keys.ts`).
 */
import { fileSettings } from "./settings.ts";
import { storeOf } from "./store.ts";

/** The request's store of the orders' photos. */
export const photoStore = () => storeOf("photos", fileSettings.photosFolder);

/**
 * The request's store of the units' documents: the photos' bucket (or folder), under the documents'
 * own prefix (`documentPrefix()`).
 */
export const documentStore = () => storeOf("photos", fileSettings.photosFolder);
