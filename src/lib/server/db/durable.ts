/**
 * SPIKE: the app's database inside a Cloudflare Durable Object (one per organization), see
 * `cloudflare/entry.ts`. The entry runs each request with its Durable Object's storage in
 * `durableRequests` (on `globalThis`, since the entry and the app are separate bundles), and `db`
 * (`index.ts`) answers with that storage's drizzle database.
 *
 * drizzle's own `durable-sqlite` transactions run the callback in `transactionSync()`, which
 * commits as soon as an async callback returns its promise: what it does after its first `await`
 * is outside the transaction, and a throw rolls nothing back. `ctx.storage.transaction()` takes an
 * async callback, rolls back what it wrote when it throws, and holds the object's input gate until
 * it's done, so other requests wait their turn (what `drizzleQueued` does for libsql).
 */
import type { AsyncLocalStorage } from "node:async_hooks";

import type { DrizzleConfig } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";

import { pendingCallbacks, runCallback } from "./serialize.ts";

/** The part of a Durable Object's storage this needs (`DurableObjectStorage`). */
export interface DurableStorage {
	sql: unknown;
	transaction<T>(work: () => Promise<T>): Promise<T>;
	transactionSync<T>(work: () => T): T;
}

/** What the entry puts in `durableRequests` for each request. */
export interface DurableRequest {
	storage: DurableStorage;
	organizationSlug: string;
}

declare global {
	var durableRequests: AsyncLocalStorage<DurableRequest> | undefined;
}

/** A Durable Object's SQLite takes at most this many bound parameters per statement. */
const maxParameters = 100;

/** An SQL literal for a bound value (numbers, text, null, booleans; no blobs). */
function literal(value: unknown): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number" || typeof value === "bigint") return String(value);
	if (typeof value === "boolean") return value ? "1" : "0";
	if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
	throw new Error(`SPIKE: can't inline a ${typeof value} parameter`);
}

/**
 * SPIKE: `query` with its `?` placeholders (outside quotes) replaced by `params` as literals, for
 * statements over the parameter limit. The real fix is to pass id lists as one JSON parameter
 * (`IN (SELECT value FROM json_each(?))`).
 */
function inline(query: string, params: unknown[]): string {
	let out = "";
	let next = 0;
	let quote: string | undefined;
	for (const char of query) {
		if (quote) {
			if (char === quote) quote = undefined;
			out += char;
		} else if (char === "'" || char === '"' || char === "`") {
			quote = char;
			out += char;
		} else if (char === "?") out += literal(params[next++]);
		else out += char;
	}
	return out;
}

/** `storage` whose `sql.exec` inlines the parameters of a statement that has too many. */
function withInlining(storage: DurableStorage): DurableStorage {
	const sql = storage.sql as { exec(query: string, ...params: unknown[]): unknown };
	const exec = (query: string, ...params: unknown[]) =>
		params.length > maxParameters ? sql.exec(inline(query, params)) : sql.exec(query, ...params);
	return new Proxy(storage, {
		get(target, property) {
			if (property === "sql") return new Proxy(sql, { get: (s, p) => (p === "exec" ? exec : Reflect.get(s, p)) });
			const value = Reflect.get(target, property);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** A drizzle database on a Durable Object's storage, whose transactions are the storage's. */
export function drizzleDurable<TSchema extends Record<string, unknown>>(
	storage: DurableStorage,
	config: DrizzleConfig<TSchema>,
) {
	// drizzle's types want workerd's `DurableObjectStorage`; the app isn't typed against workerd.
	const database = drizzle(withInlining(storage) as never, config);
	return Object.assign(database, {
		transaction: async <T>(work: (tx: typeof database) => Promise<T>): Promise<T> => {
			// Nested: runs inside the outer one (the storage API has no savepoints), and its
			// callbacks join the outer one's.
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
