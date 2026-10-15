import { DATABASE_AUTH_TOKEN, DATABASE_URL } from "$app/env/private";
import { createClient } from "@libsql/client";

import { type DurableStorage, drizzleDurable } from "./durable.ts";
import * as moduleSchema from "./modules.gen.ts";
import * as schema from "./schema.ts";
import { drizzleQueued } from "./serialize.ts";

const config = { schema: { ...schema, ...moduleSchema } };

/** The libsql database, made when first used (never inside a Durable Object). */
let libsql: ReturnType<typeof drizzleQueued<typeof config.schema>> | undefined;

function libsqlDb() {
	if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
	// Transactions take turns (see `drizzleQueued`). The busy timeout is for other processes using
	// the file, e.g. drizzle-kit studio or the e2e tests. A Turso database (`libsql://…`) needs its
	// token. The modules' tables (and their relations) are in the schema too, so `db.query.<table>`
	// knows them.
	libsql ??= drizzleQueued(
		createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN, timeout: 5000 }),
		config,
	);
	return libsql;
}

/** SPIKE: each Durable Object's database, made on its first request (see `durable.ts`). */
const durableDbs = new WeakMap<DurableStorage, ReturnType<typeof drizzleDurable>>();

function currentDb() {
	const request = globalThis.durableRequests?.getStore();
	if (!request) return libsqlDb();
	let database = durableDbs.get(request.storage);
	if (!database) {
		database = drizzleDurable(request.storage, config);
		durableDbs.set(request.storage, database);
	}
	// Typed as the libsql database: the app awaits every query, which works on both.
	return database as unknown as ReturnType<typeof libsqlDb>;
}

/** The request's database: its organization's Durable Object's, else the libsql one. */
export const db = new Proxy({} as ReturnType<typeof libsqlDb>, {
	get(_, property) {
		const database = currentDb();
		const value = Reflect.get(database, property, database);
		return typeof value === "function" ? value.bind(database) : value;
	},
});

/** A transaction on the app's database, as `db.transaction` passes it to its callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
