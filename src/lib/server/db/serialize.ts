import { AsyncLocalStorage } from "node:async_hooks";

import type { Client } from "@libsql/client";
import type { DrizzleConfig } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { timedTransaction } from "#lib/server/logs/counts.ts";

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

type Callback = () => void | Promise<void>;

/** The callbacks `afterCommit()` collected in the running (outermost) transaction. */
export const pendingCallbacks = new AsyncLocalStorage<Callback[]>();

/** Runs `callback`, logging what it throws: nothing that follows a commit can undo it. */
export async function runCallback(callback: Callback) {
	try {
		await callback();
	} catch (error) {
		console.error(error);
	}
}

/**
 * Runs `callback` once the running transaction has committed (the outermost one, if they nest), or
 * right away outside a transaction. Callbacks run in the order they were added, outside the
 * queue (they don't hold up other writers), and none of them runs if the transaction rolls back.
 * One that throws is logged, never thrown: the change is already made. A rolled back savepoint
 * (a nested `tx.transaction`) doesn't take its callbacks with it.
 */
export function afterCommit(callback: Callback) {
	const pending = pendingCallbacks.getStore();
	if (pending) pending.push(callback);
	else void runCallback(callback);
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
		transaction: (async (work, options) => {
			// Inside another transaction's work, the callbacks join its list.
			if (pendingCallbacks.getStore()) return queue.run(() => transaction(work, options));
			const pending: Callback[] = [];
			// Counted for the request's timing line (`TIMING_LOGS`), its wait in the queue included.
			const result = await pendingCallbacks.run(pending, () =>
				timedTransaction(() => queue.run(() => transaction(work, options))),
			);
			for (const callback of pending) await runCallback(callback);
			return result;
		}) as typeof transaction,
	});
}
