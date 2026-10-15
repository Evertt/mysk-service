import { defineConfig } from "drizzle-kit";

/**
 * The migrations of the Durable Object's database (`cloudflare/entry.ts`), plain SQLite: the
 * libsql ones in `drizzle/` may use libsql's own SQL (`ALTER COLUMN`). The same schema as
 * `drizzle.config.ts`'s; `pnpm db:generate` writes both (`scripts/db-generate.ts`). The
 * `durable-sqlite` driver has drizzle-kit write `migrations.js`, which bundles them for the Worker.
 * They start from a baseline of the schema as it was at `drizzle/0008`.
 */
export default defineConfig({
	schema: ["./src/lib/server/db/schema.ts", "./src/modules/*/server/schema.ts"],
	out: "./cloudflare/migrations",
	dialect: "sqlite",
	driver: "durable-sqlite",
	verbose: true,
	strict: true,
});
