/**
 * The Worker on Cloudflare (`wrangler.jsonc`). SvelteKit's adapter writes the app's worker to
 * `.svelte-kit/cloudflare/_worker.js` (configured by `adapter.wrangler.jsonc`); this entry wraps it
 * and exports the Durable Object it runs in:
 *
 * - The Worker sends every request to the app's one Durable Object, `AppDatabase` (static files
 *   never reach it: Cloudflare serves them first).
 * - `AppDatabase` migrates its SQLite database when it starts, then answers each request by running
 *   SvelteKit inside itself, with its storage in `durableRequests`, where `db` finds it
 *   (`src/lib/server/db/durable.ts`). So every query is a call into SQLite in the same process.
 * - `POST /_ops/import` (with `Authorization: Bearer <OPS_TOKEN>`) replaces the database's data
 *   with an export of a libsql one (`cloudflare/export-database.ts`): to move from Turso, or to
 *   start with the demo data.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import kit from "../.svelte-kit/cloudflare/_worker.js";
import type { DurableRequest } from "../src/lib/server/db/durable.ts";
import migrations from "./migrations/migrations.js";

globalThis.durableRequests ??= new AsyncLocalStorage<DurableRequest>();

/** The Worker's bindings (`wrangler.jsonc`), as `wrangler types` writes them. */
type Env = Cloudflare.Env;

/** A table of an export: its columns, and its rows' values in that order. */
interface ExportedTable {
	columns: string[];
	rows: SqlStorageValue[][];
}

/** The tables an import may fill: the schema's, by name. */
const tableName = /^[a-z_]+$/;

export class AppDatabase extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Before any request: requests wait until the database is up to date.
		void ctx.blockConcurrencyWhile(() => migrate(drizzle(ctx.storage), migrations));
	}

	fetch(request: Request): Promise<Response> {
		return globalThis.durableRequests!.run({ storage: this.ctx.storage }, () =>
			kit.fetch(request, this.env, this.ctx),
		);
	}

	/** Replaces the data of the tables in `data` with its rows, in one transaction. */
	import(data: Record<string, ExportedTable>) {
		const { sql } = this.ctx.storage;
		const known = new Set(
			sql
				.exec<{ name: string }>("select name from sqlite_master where type = 'table'")
				.toArray()
				.map((row) => row.name),
		);
		const unknown = Object.keys(data).filter(
			(table) => !tableName.test(table) || !known.has(table),
		);
		if (unknown.length) throw new Error(`Not tables of the database: ${unknown.join(", ")}`);

		const counts: Record<string, number> = {};
		this.ctx.storage.transactionSync(() => {
			// The rows reference each other: check the keys when the transaction commits.
			sql.exec("pragma defer_foreign_keys = on");
			for (const table of Object.keys(data)) sql.exec(`delete from "${table}"`);
			for (const [table, { columns, rows }] of Object.entries(data)) {
				const names = columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(", ");
				const marks = columns.map(() => "?").join(", ");
				for (const row of rows)
					sql.exec(`insert into "${table}" (${names}) values (${marks})`, ...row);
				counts[table] = rows.length;
			}
		});
		return { counts, bytes: sql.databaseSize };
	}
}

/** Whether `request` carries the ops token (compared in constant time). */
function authorized(request: Request, token: string | undefined) {
	if (!token) return false;
	const given = new TextEncoder().encode(request.headers.get("authorization") ?? "");
	const wanted = new TextEncoder().encode(`Bearer ${token}`);
	return given.byteLength === wanted.byteLength && crypto.subtle.timingSafeEqual(given, wanted);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// One object for the app, kept in western Europe, near its users.
		const app = env.APP_DATABASE.get(env.APP_DATABASE.idFromName("app"), { locationHint: "weur" });

		if (new URL(request.url).pathname === "/_ops/import") {
			if (request.method !== "POST") return new Response(null, { status: 405 });
			if (!authorized(request, env.OPS_TOKEN)) return new Response(null, { status: 403 });
			return Response.json(await app.import(await request.json()));
		}
		return app.fetch(request);
	},
} satisfies ExportedHandler<Env>;
