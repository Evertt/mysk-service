/**
 * What the database does for one request, counted for its timing line (`timing.ts`): the
 * transactions it runs (and their time) and its statements. The database calls `timedTransaction()`
 * and `countQuery()` (`#lib/server/db/`), which count only inside `countRequest()`, so they cost
 * nothing without `TIMING_LOGS`. Free of SvelteKit's modules, as the database's are.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** What one request did. */
export interface RequestCounts {
	transactions: number;
	transactionMs: number;
	queries: number;
}

const counts = new AsyncLocalStorage<RequestCounts>();

/** Runs `work` (a request), counting what it does into what this returns with its result. */
export function countRequest<T>(work: () => T): { counted: RequestCounts; result: T } {
	const counted: RequestCounts = { transactions: 0, transactionMs: 0, queries: 0 };
	return { counted, result: counts.run(counted, work) };
}

/** Runs a database transaction, counting it (and its time) for the running request. */
export async function timedTransaction<T>(work: () => Promise<T>): Promise<T> {
	const counted = counts.getStore();
	if (!counted) return work();
	const start = performance.now();
	try {
		return await work();
	} finally {
		counted.transactions += 1;
		counted.transactionMs += performance.now() - start;
	}
}

/** Counts a statement for the running request (the database's logger calls it). */
export function countQuery() {
	const counted = counts.getStore();
	if (counted) counted.queries += 1;
}
