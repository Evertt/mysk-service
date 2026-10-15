import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { asc, inArray, type Logger, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
	checkParameters,
	insertBatches,
	insertRows,
	inList,
	maxParameters,
	notInList,
	TooManyParameters,
} from "#lib/server/db/parameters.ts";

const thing = sqliteTable("thing", {
	id: integer().primaryKey(),
	code: text().notNull(),
	size: integer().notNull(),
});

/** Like the app's database: every statement held to the limit (see `#lib/server/db/index.ts`). */
const logger: Logger = { logQuery: (query, params) => checkParameters(query, params.length) };

describe("statements within the parameter limit", () => {
	let folder: string;
	let db: ReturnType<typeof drizzle>;

	beforeEach(async () => {
		folder = mkdtempSync(join(tmpdir(), "parameters-"));
		const client = createClient({ url: `file:${join(folder, "test.db")}` });
		await client.execute(
			"create table thing (id integer primary key, code text not null, size integer not null)",
		);
		db = drizzle(client, { logger });
	});

	afterEach(() => rmSync(folder, { recursive: true, force: true }));

	const rows = (count: number) =>
		Array.from({ length: count }, (_, i) => ({ id: i + 1, code: `T${i + 1}`, size: i % 7 }));

	it("refuses a statement over the limit, as Cloudflare's SQLite would", async () => {
		const ids = Array.from({ length: maxParameters + 1 }, (_, i) => i);
		await expect(db.select().from(thing).where(inArray(thing.id, ids))).rejects.toThrow(
			TooManyParameters,
		);
	});

	it("inserts many rows in statements that fit", async () => {
		await db.transaction((tx) => insertRows(tx as never, thing, rows(250)));
		const [{ count }] = await db.all<{ count: number }>(sql`select count(*) as count from thing`);
		expect(count).toBe(250);
		// Three columns: 33 rows a statement.
		expect(insertBatches(thing, rows(250)).map((batch) => batch.length)).toEqual([
			...Array(7).fill(33),
			19,
		]);
	});

	it("finds rows by a list of any length in one parameter", async () => {
		await db.transaction((tx) => insertRows(tx as never, thing, rows(400)));
		const ids = Array.from({ length: 150 }, (_, i) => i * 2 + 1);
		const found = await db
			.select({ id: thing.id })
			.from(thing)
			.where(inList(thing.id, ids))
			.orderBy(asc(thing.id));
		expect(found.map((row) => row.id)).toEqual(ids);

		const codes = await db
			.select()
			.from(thing)
			.where(inList(thing.code, ["T3", "T5", "T999"]));
		expect(codes.map((row) => row.id).sort((a, b) => a - b)).toEqual([3, 5]);
	});

	it("matches nothing for no values, and notInList everything", async () => {
		await db.transaction((tx) => insertRows(tx as never, thing, rows(5)));
		expect(await db.select().from(thing).where(inList(thing.id, []))).toEqual([]);
		expect(await db.select().from(thing).where(notInList(thing.id, []))).toHaveLength(5);
		const rest = await db
			.select()
			.from(thing)
			.where(notInList(thing.id, [1, 2]));
		expect(rest.map((row) => row.id)).toEqual([3, 4, 5]);
	});

	it("compares the values as the column stores them", async () => {
		const flag = sqliteTable("thing", {
			id: integer().primaryKey(),
			code: text().notNull(),
			size: integer({ mode: "boolean" }).notNull(),
		});
		await db.transaction((tx) => insertRows(tx as never, thing, rows(14)));
		// `size % 7` is 1 for rows 2 and 9: stored as 1, asked for as `true`.
		const found = await db
			.select({ id: flag.id })
			.from(flag)
			.where(inList(flag.size, [true]));
		expect(found.map((row) => row.id)).toEqual([2, 9]);
	});
});

it("leaves drizzle's inArray and notInArray out of the app", () => {
	const root = join(import.meta.dirname, "../../../../../..");
	const files = globSync(["src/**/*.{ts,svelte}", "scripts/**/*.ts"], {
		cwd: root,
		// The tests, and the seed, which runs in Node on libsql only.
		exclude: ["src/tests/**", "src/modules/*/tests/**", "src/lib/server/db/seed/**"],
	});
	const offenders = files.filter((file) =>
		/\b(?:inArray|notInArray)\b/.test(
			readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
		),
	);
	// Use inList() and notInList() from #lib/server/db/parameters.ts.
	expect(offenders).toEqual([]);
});
