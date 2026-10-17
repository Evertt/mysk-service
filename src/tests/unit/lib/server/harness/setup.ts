/**
 * Loaded before each spec file of the `server-harness` project (`setupFiles` in vite.config.ts):
 * gives the file a copy of the seeded demo database (`global-setup.ts`) as the app's database, so
 * `#lib/server/db/index.ts` works as it does in the app (libsql, transactions taking turns, the
 * parameter limit) on data of the file's own. A file may change it as it likes: the next file gets
 * a fresh copy. It imports no more of the app than the database, so a spec's `vi.mock()` of
 * anything else (the module-gate spec's `$app/server`) still reaches all of the app it imports.
 */
import { rmSync } from "node:fs";

import { afterAll, vi } from "vite-plus/test";

import { db } from "#lib/server/db/index.ts";

// Before anything imports the app's database (hoisted above the imports, as `vi.mock` is).
const copy = await vi.hoisted(async () => {
	const [fs, os, path, { inject }] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
		import("vite-plus/test"),
	]);
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fieldworks-spec-"));
	const file = path.join(folder, "app.db");
	fs.copyFileSync(inject("seededDatabase"), file);
	return { folder, url: `file:${file}` };
});

// The app's database is the copy: only `DATABASE_URL` differs from the other variables.
vi.mock("$app/env/private", async (importOriginal) => ({
	...(await importOriginal<object>()),
	DATABASE_URL: copy.url,
	DATABASE_AUTH_TOKEN: undefined,
}));

afterAll(() => {
	db.$client.close();
	rmSync(copy.folder, { recursive: true, force: true, maxRetries: 3 });
});
