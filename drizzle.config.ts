import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

export default defineConfig({
	// The core's tables, and each module's (`src/modules/<id>/server/schema.ts`).
	schema: ["./src/lib/server/db/schema.ts", "./src/modules/*/server/schema.ts"],
	out: "./drizzle",
	// libsql's dialect, for a local file (`file:local.db`) and a Turso database
	// (`libsql://….turso.io`, with `DATABASE_AUTH_TOKEN`) alike. Its migrations may use libsql's
	// own SQL (e.g. `ALTER COLUMN`), which the app's driver, `@libsql/client`, always runs.
	dialect: "turso",
	dbCredentials: {
		url: process.env.DATABASE_URL,
		authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
	},
	verbose: true,
	strict: true,
});
