/**
 * The app's database on Cloudflare: the SQLite of the app's Durable Object (`cloudflare/entry.ts`),
 * which answers every request there. The entry runs each request with the object's storage in
 * `durableRequests` (on `globalThis`: the entry and the app are separate bundles), and `db`
 * (`index.ts`) is the drizzle database of the storage it finds there.
 *
 * Transactions: drizzle's `durable-sqlite` driver runs one in `storage.transactionSync()`, which
 * commits when its callback returns, so an async callback's work after its first `await` is
 * outside it, and a throw rolls nothing back. Ours are async, so `drizzleDurable()` runs them in
 * `storage.transaction()`, which takes an async callback, rolls back what it wrote when it throws,
 * and holds the object's input gate until it's done: other requests wait their turn, as
 * `drizzleQueued()` makes them on libsql. Nested in another, a transaction is part of it (the
 * storage API has no savepoints, and SQL's `SAVEPOINT` is refused).
 */
import type { AsyncLocalStorage } from "node:async_hooks";

import type { DrizzleConfig } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";

import { pendingCallbacks, runCallback } from "./serialize.ts";

/** The part of a Durable Object's storage (`DurableObjectStorage`) the app's database uses. */
export interface DurableStorage {
	sql: unknown;
	transaction<T>(work: () => Promise<T>): Promise<T>;
	transactionSync<T>(work: () => T): T;
}

/** What the entry runs each request of the Durable Object with. */
export interface DurableRequest {
	storage: DurableStorage;
}

declare global {
	/** Set by `cloudflare/entry.ts`; absent everywhere else (dev, tests, Node). */
	var durableRequests: AsyncLocalStorage<DurableRequest> | undefined;
}

/** A drizzle database on a Durable Object's storage, whose transactions are the storage's. */
export function drizzleDurable<TSchema extends Record<string, unknown>>(
	storage: DurableStorage,
	config: DrizzleConfig<TSchema>,
) {
	// drizzle's types want workerd's `DurableObjectStorage`; the app isn't typed against workerd.
	const database = drizzle(storage as never, config);
	return Object.assign(database, {
		transaction: async <T>(work: (tx: typeof database) => Promise<T>): Promise<T> => {
			// Inside another transaction's work: part of it, and its callbacks join the outer one's.
			if (pendingCallbacks.getStore()) return work(database);
			const pending: (() => void | Promise<void>)[] = [];
			const result = await pendingCallbacks.run(pending, () =>
				storage.transaction(() => work(database)),
			);
			for (const callback of pending) await runCallback(callback);
			return result;
		},
	});
}
