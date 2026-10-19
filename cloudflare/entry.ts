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
 *   The bug reports' R2 bucket goes along (`bugReportStore()`): the adapter's worker passes the app
 *   no `platform`.
 * - `POST /_ops/import` (with `Authorization: Bearer <OPS_TOKEN>`) replaces the database's data
 *   with an export of a libsql one (`cloudflare/export-database.ts`): to move from Turso, or to
 *   start with the demo data.
 * - The Cron Triggers (`triggers.crons` in `wrangler.jsonc`): the daily one starts the daily jobs,
 *   the one every 15 minutes ticks the demo's simulations (an open page's simulation bar ticks in
 *   between). `scheduled()` has the object answer `POST /_ops/daily` or `POST /_ops/tick` with the
 *   `OPS_TOKEN`, like a request from outside (a tick only if a simulation runs: else it asks
 *   nothing of the app, see `operation()`), so
 *   they run inside it with its database (`runDaily()`, `src/lib/server/jobs/daily.ts`;
 *   `runSimulations()`, `src/lib/server/simulation.ts`).
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import kit from "#kit-worker";

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
		return globalThis.durableRequests!.run(
			{ storage: this.ctx.storage, bugReports: this.env.BUG_REPORTS },
			() => kit.fetch(request, this.env, this.ctx),
		);
	}

	/**
	 * Runs an operation's endpoint (`/_ops/daily`, the daily jobs; `/_ops/tick`, the simulations;
	 * see `scheduled()` below) as a cron would on Node, and answers what it did (as JSON); throws if
	 * the app refused or failed.
	 */
	async operation(path: "/_ops/daily" | "/_ops/tick"): Promise<string> {
		// No simulation running (the usual case): the tick asks nothing of SvelteKit, a query only.
		if (path === "/_ops/tick" && !this.simulationRuns()) return JSON.stringify({ ticked: [] });
		const response = await this.fetch(
			new Request(new URL(path, this.env.ORIGIN), {
				method: "POST",
				// JSON, not a form: SvelteKit refuses a cross-site POST without a content type (CSRF).
				headers: {
					authorization: `Bearer ${this.env.OPS_TOKEN}`,
					"content-type": "application/json",
				},
				body: "{}",
			}),
		);
		if (!response.ok) {
			throw new Error(`${path} failed (${response.status}): ${await response.text()}`);
		}
		return response.text();
	}

	/** Whether any organization's simulation runs, straight from the object's SQLite. */
	private simulationRuns() {
		const running = this.ctx.storage.sql.exec("select 1 from simulation where running = 1 limit 1");
		return running.toArray().length > 0;
	}

	/**
	 * Replaces the data of the tables in `data` with its rows, in one transaction: inserted in its
	 * order and deleted in the reverse, so an export's parents come first (as
	 * `cloudflare/export-database.ts` writes them; another order makes SQLite rescan the child tables
	 * for every parent row, Cloudflare's rows read). Answers the rows per table, the database's size,
	 * and the rows the import read and wrote.
	 */
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
		const usage = { rowsRead: 0, rowsWritten: 0 };
		const run = (query: string, ...values: SqlStorageValue[]) => {
			const cursor = sql.exec(query, ...values);
			usage.rowsRead += cursor.rowsRead;
			usage.rowsWritten += cursor.rowsWritten;
		};
		this.ctx.storage.transactionSync(() => {
			// The rows reference each other (a cycle's, too): check the keys when the transaction commits.
			run("pragma defer_foreign_keys = on");
			for (const table of Object.keys(data).reverse()) run(`delete from "${table}"`);
			for (const [table, { columns, rows }] of Object.entries(data)) {
				const names = columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(", ");
				const marks = columns.map(() => "?").join(", ");
				for (const row of rows) run(`insert into "${table}" (${names}) values (${marks})`, ...row);
				counts[table] = rows.length;
			}
		});
		return { counts, bytes: sql.databaseSize, ...usage };
	}
}

/** Whether `request` carries the ops token (compared in constant time). */
function authorized(request: Request, token: string | undefined) {
	if (!token) return false;
	const given = new TextEncoder().encode(request.headers.get("authorization") ?? "");
	const wanted = new TextEncoder().encode(`Bearer ${token}`);
	return given.byteLength === wanted.byteLength && crypto.subtle.timingSafeEqual(given, wanted);
}

/** The Cron Trigger that ticks the simulations (`wrangler.jsonc`); any other runs the daily jobs. */
const tickCron = "*/15 * * * *";

/** The app's one object, kept in western Europe, near its users. */
const appDatabase = (env: Env) =>
	env.APP_DATABASE.get(env.APP_DATABASE.idFromName("app"), { locationHint: "weur" });

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const app = appDatabase(env);

		if (new URL(request.url).pathname === "/_ops/import") {
			if (request.method !== "POST") return new Response(null, { status: 405 });
			if (!authorized(request, env.OPS_TOKEN)) return new Response(null, { status: 403 });
			try {
				return Response.json(await app.import(await request.json()));
			} catch (error) {
				// Its reason in the answer, for whoever imports (CI prints it), not Cloudflare's bare 1101.
				return new Response(error instanceof Error ? error.message : String(error), {
					status: 500,
				});
			}
		}
		return app.fetch(request);
	},

	/**
	 * The Cron Triggers, in the object (see `AppDatabase.operation()`): the simulations' tick every
	 * 15 minutes (`tickCron`), the daily jobs at the other one.
	 */
	async scheduled(controller, env, ctx) {
		const path = controller.cron === tickCron ? "/_ops/tick" : "/_ops/daily";
		ctx.waitUntil(
			appDatabase(env)
				.operation(path)
				.then((report) => {
					// A tick that ticked nothing isn't worth a line.
					if (path === "/_ops/daily" || !report.includes('"ticked":[]')) {
						console.info(`${path}:`, report);
					}
				}),
		);
	},
} satisfies ExportedHandler<Env>;
