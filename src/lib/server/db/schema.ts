/**
 * The core's tables, by domain in `schema/`, and better-auth's. Import them from here. A tenant's
 * table is declared with `tenantTable()` (`columns.ts`, see "Schema and migrations" in
 * `docs/agents/database.md`); the modules' are in `src/modules/<id>/server/schema.ts`.
 */
export * from "./auth.schema.ts";
export * from "./schema/customers.ts";
export * from "./schema/engineers.ts";
export * from "./schema/equipment.ts";
export * from "./schema/infra.ts";
export * from "./schema/orders.ts";
export * from "./schema/portal.ts";
export * from "./schema/relations.ts";
