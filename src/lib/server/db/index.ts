import { DATABASE_AUTH_TOKEN, DATABASE_URL } from "$app/env/private";
import { createClient } from "@libsql/client";
import type { Logger } from "drizzle-orm";

import { countQuery } from "#lib/server/logs/counts.ts";

import { type DurableStorage, drizzleDurable } from "./durable.ts";
import * as moduleSchema from "./modules.gen.ts";
import { checkParameters } from "./parameters.ts";
import * as schema from "./schema.ts";
import { drizzleQueued } from "./serialize.ts";

/**
 * Holds every statement to the parameter limit of Cloudflare's SQLite (see `parameters.ts`), and
 * counts it for the request's timing line (`TIMING_LOGS`, `#lib/server/logs/timing.ts`).
 */
const parameterCheck: Logger = {
	logQuery: (query, params) => {
		checkParameters(query, params.length);
		countQuery();
	},
};

// The modules' tables (and their relations) are in the schema too, so `db.query.<table>` knows them.
const config = { schema: { ...schema, ...moduleSchema }, logger: parameterCheck };

/** The libsql database (a file, or Turso), made when first used: never on Cloudflare. */
let libsql: ReturnType<typeof drizzleQueued<typeof config.schema>> | undefined;

function libsqlDb() {
	if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
	// Transactions take turns (see `drizzleQueued`). The busy timeout is for other processes using
	// the file, e.g. drizzle-kit studio or the e2e tests. A Turso database (`libsql://…`) needs its
	// token.
	libsql ??= drizzleQueued(
		createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN, timeout: 5000 }),
		config,
	);
	return libsql;
}

/** The Durable Object's database, made on its first request (see `durable.ts`). */
const durableDbs = new WeakMap<DurableStorage, ReturnType<typeof drizzleDurable>>();

/** The database of the running request: the Durable Object's on Cloudflare, else libsql's. */
function currentDb() {
	const request = globalThis.durableRequests?.getStore();
	if (!request) return libsqlDb();
	let database = durableDbs.get(request.storage);
	if (!database) {
		database = drizzleDurable(request.storage, config);
		durableDbs.set(request.storage, database);
	}
	// Typed as the libsql database: the app awaits every query, which both drivers answer.
	return database as unknown as ReturnType<typeof libsqlDb>;
}

/** The app's database (see `currentDb()`). */
export const db = new Proxy({} as ReturnType<typeof libsqlDb>, {
	get(_, property) {
		const database = currentDb();
		const value = Reflect.get(database, property, database);
		return typeof value === "function" ? value.bind(database) : value;
	},
});

/**
 * A runner that keeps the database of the request it's made in, for a live query that reads it
 * again after each change: its generator is resumed by the stream that sends its answers, outside
 * the Durable Object's request, where `db` would find no storage (and fall back to libsql, which
 * Cloudflare hasn't). Make it while the request runs, then `yield await again(() => read())`. On
 * Node it just runs the work.
 */
export function inThisRequest() {
	const requests = globalThis.durableRequests;
	const request = requests?.getStore();
	return <T>(work: () => T): T => (request ? requests!.run(request, work) : work());
}

/** A transaction on the app's database, as `db.transaction` passes it to its callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What runs a statement: the database, or a transaction on it. */
export type Runner = Transaction | typeof db;
