import { expect, test } from "vite-plus/test";

import { countQuery, countRequest, timedTransaction } from "#lib/server/logs/counts.ts";

test("a request's transactions and statements are counted, also across awaits", async () => {
	const { counted, result } = countRequest(async () => {
		countQuery();
		await timedTransaction(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			countQuery();
			countQuery();
		});
		await timedTransaction(async () => countQuery());
		return "answered";
	});

	expect(await result).toBe("answered");
	expect(counted).toMatchObject({ transactions: 2, queries: 4 });
	expect(counted.transactionMs).toBeGreaterThan(0);
});

test("a transaction that fails is counted too, and still fails", async () => {
	const { counted, result } = countRequest(() =>
		timedTransaction(() => Promise.reject(new Error("rolled back"))),
	);

	await expect(result).rejects.toThrow("rolled back");
	expect(counted.transactions).toBe(1);
});

test("outside a counted request, nothing is counted and the work runs as it is", async () => {
	countQuery();
	expect(await timedTransaction(async () => 42)).toBe(42);
});

test("two requests at once count their own", async () => {
	const one = countRequest(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		countQuery();
	});
	const other = countRequest(async () => {
		countQuery();
		countQuery();
	});
	await Promise.all([one.result, other.result]);
	expect(one.counted.queries).toBe(1);
	expect(other.counted.queries).toBe(2);
});
