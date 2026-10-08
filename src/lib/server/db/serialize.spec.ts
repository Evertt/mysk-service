import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { afterCommit, drizzleQueued } from "./serialize.ts";

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

	describe("afterCommit", () => {
		const insert = (tx: ReturnType<typeof open>, code: string) =>
			tx.run(sql`insert into thing (code) values (${code})`);

		it("runs the callbacks once the transaction has committed, in order", async () => {
			const db = open(true);
			const seen: unknown[] = [];
			const result = await db.transaction(async (tx) => {
				afterCommit(() => void seen.push("first"));
				await insert(tx, "1");
				afterCommit(async () => {
					seen.push("second", await db.all(sql`select code from thing`));
				});
				seen.push("in the transaction");
				return "done";
			});
			expect(result).toBe("done");
			expect(seen).toEqual(["in the transaction", "first", "second", [{ code: "1" }]]);
		});

		it("runs none when the transaction rolls back", async () => {
			const db = open(true);
			const callback = vi.fn();
			const failed = db.transaction(async (tx) => {
				await insert(tx, "1");
				afterCommit(callback);
				throw new Error("Changed my mind");
			});
			await expect(failed).rejects.toThrow("Changed my mind");
			expect(callback).not.toHaveBeenCalled();
			// Nor does it leak into the next transaction.
			await db.transaction(() => Promise.resolve());
			expect(callback).not.toHaveBeenCalled();
		});

		it("waits for the outermost transaction when they nest", async () => {
			const db = open(true);
			const seen: string[] = [];
			await db.transaction(async (tx) => {
				afterCommit(() => void seen.push("outer"));
				await tx.transaction(async (inner) => {
					await insert(inner, "1");
					afterCommit(() => void seen.push("inner"));
				});
				seen.push("inner done");
			});
			expect(seen).toEqual(["inner done", "outer", "inner"]);
		});

		it("runs the callbacks of each transaction after its own commit", async () => {
			const db = open(true);
			const seen: string[] = [];
			await Promise.all(
				["a", "b"].map((name) =>
					db.transaction(async (tx) => {
						await insert(tx, name);
						afterCommit(() => void seen.push(name));
					}),
				),
			);
			expect(seen).toEqual(["a", "b"]);
		});

		it("runs right away outside a transaction", () => {
			const callback = vi.fn();
			afterCommit(callback);
			expect(callback).toHaveBeenCalledOnce();
		});

		it("logs a callback that fails, and carries on", async () => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			try {
				const db = open(true);
				const after = vi.fn();
				const result = await db.transaction(async () => {
					afterCommit(() => {
						throw new Error("Broken");
					});
					afterCommit(() => Promise.reject(new Error("Broken too")));
					afterCommit(after);
					return "committed";
				});
				expect(result).toBe("committed");
				expect(after).toHaveBeenCalledOnce();
				expect(log.mock.calls.map(([error]) => (error as Error).message)).toEqual([
					"Broken",
					"Broken too",
				]);

				afterCommit(() => {
					throw new Error("Outside");
				});
				await Promise.resolve();
				expect(log).toHaveBeenCalledTimes(3);
			} finally {
				log.mockRestore();
			}
		});
	});
});
