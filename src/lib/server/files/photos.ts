/**
 * The store of the orders' photos: on Cloudflare the `PHOTOS` R2 bucket (`wrangler.jsonc`),
 * elsewhere a folder (`PHOTOS_DIR`, `.photos` by default). Its keys start with the tenant's id
 * (`photoKey()`), so a tenant's photos stay together (`photoPrefix()`) and a key never names
 * another's.
 */
import { fileSettings } from "./settings.ts";
import { storeOf } from "./store.ts";

/** The request's store of photos. */
export const photoStore = () => storeOf("photos", fileSettings.photosFolder);

/** What the keys of a tenant's orders' photos start with: `<tenant>/orders/`. */
export const photoPrefix = (organizationId: string) => `${organizationId}/orders/`;

/** A new photo's key in the store: `<tenant>/orders/<uuid>.<extension>`. */
export const photoKey = (organizationId: string, extension: string) =>
	`${photoPrefix(organizationId)}${crypto.randomUUID()}.${extension}`;
