import { defineConfig } from "drizzle-kit";

// SPIKE: the Durable Objects' migrations, plain SQLite (the libsql ones in `drizzle/` use libsql's
// own `ALTER COLUMN`), bundled into the worker by drizzle-kit (`migrations.js`).
export default defineConfig({
	schema: ["./src/lib/server/db/schema.ts", "./src/modules/*/server/schema.ts"],
	out: "./cloudflare/migrations",
	dialect: "sqlite",
	driver: "durable-sqlite",
});
