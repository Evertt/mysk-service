/**
 * The keys of the records' files in the file store: each starts with the tenant's id, so a tenant's
 * files stay together and a key never names another's, then its kind's own folder, so a sweep of
 * one kind (`sweepFiles()`) never sees another's. Plain functions, which the seed (plain Node) uses
 * too.
 */

/** What the keys of a tenant's orders' photos start with: `<tenant>/orders/`. */
export const photoPrefix = (organizationId: string) => `${organizationId}/orders/`;

/** A new photo's key in the store: `<tenant>/orders/<uuid>.<extension>`. */
export const photoKey = (organizationId: string, extension: string) =>
	`${photoPrefix(organizationId)}${crypto.randomUUID()}.${extension}`;

/** What the keys of a tenant's units' documents start with: `<tenant>/equipment/`. */
export const documentPrefix = (organizationId: string) => `${organizationId}/equipment/`;

/**
 * A new document's key in the store: `<tenant>/equipment/<uuid>.<extension>` (`name` instead of
 * the uuid for the seed's, which are the same each time it runs).
 */
export const documentKey = (
	organizationId: string,
	extension: string,
	name: string = crypto.randomUUID(),
) => `${documentPrefix(organizationId)}${name}.${extension}`;
