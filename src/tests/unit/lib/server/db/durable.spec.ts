import { describe, expect, it, vi } from "vite-plus/test";

import { type DurableStorage, drizzleDurable } from "#lib/server/db/durable.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";

/**
 * A storage whose `transaction()` behaves like a Durable Object's for what `drizzleDurable` relies
 * on: it runs the async callback and answers with its result, or rejects with what it throws (the
 * object rolls the writes back, as measured on workerd: see `docs/plans/cloudflare.md`).
 */
function fakeStorage() {
	const transaction = vi.fn();
	const storage: DurableStorage = {
		sql: { exec: vi.fn(), databaseSize: 0 },
		transaction: (work) => {
			transaction();
			return work();
		},
		transactionSync: (work) => work(),
	};
	return { storage, transaction };
}

describe("drizzleDurable transactions", () => {
	it("run in the storage's async transaction, with the callback's result", async () => {
		const { storage, transaction } = fakeStorage();
		const db = drizzleDurable(storage, {});
		const result = await db.transaction(async () => {
			await new Promise((resolve) => setTimeout(resolve, 1));
			return "done";
		});
		expect(result).toBe("done");
		expect(transaction).toHaveBeenCalledOnce();
	});

	it("run afterCommit callbacks once committed, in order, and none after a throw", async () => {
		const { storage } = fakeStorage();
		const db = drizzleDurable(storage, {});
		const ran: string[] = [];
		await db.transaction(async () => {
			afterCommit(() => void ran.push("first"));
			afterCommit(() => void ran.push("second"));
			expect(ran).toEqual([]);
		});
		expect(ran).toEqual(["first", "second"]);

		await expect(
			db.transaction(async () => {
				afterCommit(() => void ran.push("refused"));
				throw new Error("refused");
			}),
		).rejects.toThrow("refused");
		expect(ran).toEqual(["first", "second"]);
	});

	it("nested, are part of the outer one, with their callbacks after its commit", async () => {
		const { storage, transaction } = fakeStorage();
		const db = drizzleDurable(storage, {});
		const ran: string[] = [];
		await db.transaction(async () => {
			await db.transaction(async () => {
				afterCommit(() => void ran.push("inner"));
			});
			expect(ran).toEqual([]);
		});
		expect(ran).toEqual(["inner"]);
		expect(transaction).toHaveBeenCalledOnce();
	});
});
