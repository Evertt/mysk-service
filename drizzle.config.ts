import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

export default defineConfig({
	// The core's tables, and each module's (`src/modules/<id>/server/schema.ts`).
	schema: ["./src/lib/server/db/schema.ts", "./src/modules/*/server/schema.ts"],
	out: "./drizzle",
	dialect: "sqlite",
	dbCredentials: { url: process.env.DATABASE_URL },
	verbose: true,
	strict: true,
});
