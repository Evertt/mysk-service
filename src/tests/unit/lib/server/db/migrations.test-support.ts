/**
 * What a spec of a data migration needs: the two migration streams, and a copy of one that stops
 * before a migration, to make a database as it was before it. `migrations.spec.ts` uses them, and
 * a module's own spec of a migration of its tables does too.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, expect } from "vite-plus/test";

const root = join(import.meta.dirname, "../../../../../..");

/** libsql's migrations (a file, Turso). */
export const migrationsFolder = join(root, "drizzle");

/** The Durable Object's (Cloudflare), plain SQLite; see `cloudflare/drizzle.config.ts`. */
export const durableFolder = join(root, "cloudflare/migrations");

type Journal = { entries: { idx: number; tag: string }[] };

export const readJournal = (folder: string): Journal =>
	JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8")) as Journal;

/**
 * A folder for a spec's databases, removed after its tests, and `streamBefore()`, which copies a
 * stream's folder into it as `name`, with a journal that stops before `tag`.
 */
export function migrationScratch() {
	const folder = mkdtempSync(join(tmpdir(), "migrations-spec-"));
	afterAll(() => rmSync(folder, { recursive: true, force: true }));
	const streamBefore = (stream: string, tag: string, name: string) => {
		const before = join(folder, name);
		cpSync(stream, before, { recursive: true });
		const own = readJournal(stream);
		const index = own.entries.findIndex((entry) => entry.tag === tag);
		expect(index).toBeGreaterThan(0);
		writeFileSync(
			join(before, "meta/_journal.json"),
			JSON.stringify({ ...own, entries: own.entries.slice(0, index) }),
		);
		return before;
	};
	return { folder, streamBefore };
}
