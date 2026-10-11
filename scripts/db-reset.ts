/**
 * Starts the local database over: deletes `local.db`, builds it from the migrations, puts it in WAL
 * mode (which Turso's upload requires; the mode is stored in the file) and seeds it. Run it with
 * `pnpm db:reset`.
 *
 * It resets `file:local.db` only, and refuses any other `DATABASE_URL` (a Turso database, say):
 * the migrations and the seed would otherwise go there.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

import { createClient } from "@libsql/client";

const url = "file:local.db";

if (process.env.DATABASE_URL !== url) {
	console.error(
		`db:reset resets only ${url}, and DATABASE_URL is ${process.env.DATABASE_URL ?? "not set"}.`,
	);
	process.exit(1);
}

for (const file of ["local.db", "local.db-wal", "local.db-shm"]) rmSync(file, { force: true });

execFileSync("drizzle-kit", ["migrate"], { stdio: "inherit" });

const client = createClient({ url });
await client.execute("PRAGMA journal_mode=WAL");
client.close();

execFileSync("node", ["--env-file=.env", "src/lib/server/db/seed/index.ts"], { stdio: "inherit" });
