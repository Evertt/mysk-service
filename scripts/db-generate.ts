/**
 * Writes the migrations of a schema change for both databases, with the arguments it's given
 * (`pnpm db:generate --name add-invoice-reference`):
 *
 * - `drizzle/`, libsql's (a local file, Turso): `drizzle.config.ts`;
 * - `cloudflare/migrations/`, the Durable Object's plain SQLite (`cloudflare/drizzle.config.ts`),
 *   which has none of libsql's own SQL, such as `ALTER COLUMN`, and is bundled into the Worker.
 *
 * Check the SQL of both, and commit them with the change.
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);

execFileSync("drizzle-kit", ["generate", ...args], { stdio: "inherit" });
execFileSync("drizzle-kit", ["generate", "--config", "cloudflare/drizzle.config.ts", ...args], {
	stdio: "inherit",
});
