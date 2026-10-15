/**
 * SPIKE: the Worker's entry. SvelteKit's adapter writes `.svelte-kit/cloudflare/_worker.js`
 * (configured by `adapter.wrangler.jsonc`); this file, which `wrangler.jsonc` deploys, wraps it:
 *
 * - The Worker sends every request to its organization's Durable Object (`Tenant`), picked by the
 *   `spike-org` cookie (`/__spike/org/<slug>` sets it): a stand-in for routing by the session's
 *   organization, whose auth tables would have to live outside the objects.
 * - `Tenant` migrates its SQLite database on start, then answers requests by running SvelteKit
 *   inside the object, with its storage in `durableRequests` for `db` (`src/lib/server/db/`).
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import kit from "../.svelte-kit/cloudflare/_worker.js";
import type { DurableRequest } from "../src/lib/server/db/durable.ts";
import migrations from "./migrations/migrations.js";

globalThis.durableRequests ??= new AsyncLocalStorage<DurableRequest>();

interface Env {
	TENANT: DurableObjectNamespace<Tenant>;
	SPIKE_IMPORT_TOKEN?: string;
}

type Table = { columns: string[]; rows: unknown[][] };

export class Tenant extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		void ctx.blockConcurrencyWhile(async () => {
			const started = Date.now();
			await migrate(drizzle(ctx.storage), migrations);
			console.log(`migrated in ${Date.now() - started} ms`);
		});
	}

	async fetch(request: Request): Promise<Response> {
		const slug = request.headers.get("x-spike-org") ?? "north";
		return globalThis.durableRequests!.run({ storage: this.ctx.storage, organizationSlug: slug }, () =>
			kit.fetch(request, this.env, this.ctx),
		);
	}

	/** A read-only look at the object's data, for checking the spike's writes. */
	query(statement: string) {
		if (!/^\s*select\b/i.test(statement)) throw new Error("SELECT only");
		return this.ctx.storage.sql.exec(statement).toArray();
	}

	/** Replaces the object's data with an export (`export-tenant.ts`), in one transaction. */
	import(data: Record<string, Table>) {
		const sql = this.ctx.storage.sql;
		const counts: Record<string, number> = {};
		this.ctx.storage.transactionSync(() => {
			sql.exec("PRAGMA defer_foreign_keys = ON");
			for (const table of Object.keys(data)) sql.exec(`DELETE FROM "${table}"`);
			for (const [table, { columns, rows }] of Object.entries(data)) {
				const list = columns.map((column) => `"${column}"`).join(", ");
				const marks = columns.map(() => "?").join(", ");
				for (const row of rows) {
					sql.exec(`INSERT INTO "${table}" (${list}) VALUES (${marks})`, ...(row as SqlStorageValue[]));
				}
				counts[table] = rows.length;
			}
		});
		return { counts, bytes: this.ctx.storage.sql.databaseSize };
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const chosen = url.pathname.match(/^\/__spike\/org\/([a-z]+)$/)?.[1];
		if (chosen) {
			return new Response(null, {
				status: 303,
				headers: { location: "/login", "set-cookie": `spike-org=${chosen}; Path=/; HttpOnly; SameSite=Lax` },
			});
		}
		const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)spike-org=([a-z]+)/)?.[1];
		const slug = url.searchParams.get("spike-org") ?? cookie ?? "north";
		const stub = env.TENANT.get(env.TENANT.idFromName(slug));

		if (url.pathname === "/__spike/import" && request.method === "POST") {
			if (!env.SPIKE_IMPORT_TOKEN || request.headers.get("authorization") !== `Bearer ${env.SPIKE_IMPORT_TOKEN}`) {
				return new Response("Forbidden", { status: 403 });
			}
			return Response.json(await stub.import(await request.json()));
		}

		if (url.pathname === "/__spike/sql") {
			if (!env.SPIKE_IMPORT_TOKEN || request.headers.get("authorization") !== `Bearer ${env.SPIKE_IMPORT_TOKEN}`) {
				return new Response("Forbidden", { status: 403 });
			}
			return Response.json(await stub.query(url.searchParams.get("q") ?? ""));
		}

		// Built files and static ones don't need the database.
		// (Remote functions are under `/_app/remote/`: those do.)
		if (url.pathname.startsWith("/_app/immutable/") || /\.[a-z0-9]+$/i.test(url.pathname)) {
			return kit.fetch(request, env, ctx);
		}
		const forwarded = new Request(request);
		forwarded.headers.set("x-spike-org", slug);
		return stub.fetch(forwarded);
	},
};
