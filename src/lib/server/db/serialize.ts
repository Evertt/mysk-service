import { AsyncLocalStorage } from "node:async_hooks";

import type { Client } from "@libsql/client";
import type { DrizzleConfig } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

/**
 * Runs database work one piece at a time. SQLite has one writer at a time, and libsql runs a local
 * database synchronously: a transaction holds the write lock on a connection of its own while it
 * awaits, so a second transaction (or a write) that starts meanwhile fails with `SQLITE_BUSY`, and
 * waiting for the lock (a busy timeout) would block the very event loop the first one needs to
 * finish. So transactions queue here instead, which also makes "pick the next code, insert it"
 * inside a transaction safe from concurrent requests.
 */
function createQueue() {
	let tail: Promise<unknown> = Promise.resolve();
	const inside = new AsyncLocalStorage<boolean>();

	/** Runs `work` after everything queued before it; work queued from inside it runs right away. */
	function run<T>(work: () => Promise<T>): Promise<T> {
		if (inside.getStore()) return work();
		const result = tail.then(() => inside.run(true, work));
		tail = result.catch(() => {});
		return result;
	}

	/** A client whose statements wait for queued work (e.g. a transaction) to finish first. */
	function client(base: Client): Client {
		return new Proxy(base, {
			get(target, property, receiver) {
				const value = Reflect.get(target, property, receiver);
				if (property === "execute" || property === "batch" || property === "executeMultiple") {
					return (...args: unknown[]) =>
						run(() => (value as (...args: unknown[]) => Promise<unknown>).apply(target, args));
				}
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	}

	return { run, client };
}

/** A drizzle database on `base` whose transactions take turns (see `createQueue`). */
export function drizzleQueued<TSchema extends Record<string, unknown> = Record<string, never>>(
	base: Client,
	config: DrizzleConfig<TSchema> = {},
) {
	const queue = createQueue();
	const database = drizzle(queue.client(base), config);
	const transaction = database.transaction.bind(database);
	return Object.assign(database, {
		transaction: ((work, options) =>
			queue.run(() => transaction(work, options))) as typeof transaction,
	});
}
