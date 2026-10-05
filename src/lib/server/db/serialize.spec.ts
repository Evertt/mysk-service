import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { drizzleQueued } from "./serialize.ts";

describe("drizzleQueued", () => {
	// A file, not `:memory:`: transactions get a connection of their own, as in the app.
	let folder: string;
	let url: string;

	beforeEach(async () => {
		folder = mkdtempSync(join(tmpdir(), "queue-"));
		url = `file:${join(folder, "test.db")}`;
		const setup = createClient({ url });
		await setup.execute("create table thing (id integer primary key, code text not null unique)");
		setup.close();
	});

	afterEach(() => rmSync(folder, { recursive: true, force: true }));

	/** A database like the app's, or a plain one. */
	const open = (queued: boolean) =>
		queued ? drizzleQueued(createClient({ url })) : drizzle(createClient({ url }));

	/** Picks the next code and inserts it, in a transaction that awaits in between. */
	const create = (db: ReturnType<typeof open>) =>
		db.transaction(async (tx) => {
			const [{ last }] = await tx.all<{ last: number | null }>(
				sql`select max(cast(code as integer)) as last from thing`,
			);
			await new Promise((resolve) => setTimeout(resolve, 5));
			const code = String((last ?? 0) + 1);
			await tx.run(sql`insert into thing (code) values (${code})`);
			return code;
		});

	it("without it, concurrent transactions fail with SQLITE_BUSY", async () => {
		const db = open(false);
		const results = await Promise.allSettled([create(db), create(db), create(db)]);
		expect(results.filter((result) => result.status === "rejected").length).toBeGreaterThan(0);
	});

	it("runs concurrent transactions one after another, each with the next code", async () => {
		const db = open(true);
		const codes = await Promise.all([create(db), create(db), create(db), create(db)]);
		expect(codes).toEqual(["1", "2", "3", "4"]);
	});

	it("lets statements wait for a running transaction", async () => {
		const db = open(true);
		const [code] = await Promise.all([
			create(db),
			db.run(sql`insert into thing (code) values ('other')`),
		]);
		expect(code).toBe("1");
		expect(await db.all(sql`select code from thing order by id`)).toEqual([
			{ code: "1" },
			{ code: "other" },
		]);
	});

	it("doesn't wait for itself when a transaction uses the database directly", async () => {
		const db = open(true);
		const rows = await db.transaction(() => db.all(sql`select count(*) as total from thing`));
		expect(rows).toEqual([{ total: 0 }]);
	});

	it("keeps going after a transaction fails", async () => {
		const db = open(true);
		const failed = db.transaction(async (tx) => {
			await tx.run(sql`insert into thing (code) values ('1')`);
			throw new Error("Changed my mind");
		});
		await expect(failed).rejects.toThrow("Changed my mind");
		expect(await create(db)).toBe("1");
	});
});
