/**
 * The materials' catalog table, for the modules that require materials: to refer to a material
 * from their own tables (a composite key on `(organization_id, id)`) and to read it (join it,
 * scoped with `inTenant()`). They never write it: stock changes through `./stock.server.ts`.
 * Free of SvelteKit, so the seed (plain Node) can load the schemas that import it.
 */
export { material } from "../server/schema.ts";
