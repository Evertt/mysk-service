# Spike: one Durable Object per organization

Branch `spike/durable-objects` (2026-10-15). Question: can the app run inside a Cloudflare Durable
Object per organization, with drizzle's `durable-sqlite` driver and our migrations, and do our
async transactions (`nextNumber`, `saveOrderParts`) hold there?

**Answer: yes, locally under `wrangler dev` (workerd, the production runtime).** Every office page
renders from the object, sign-in works, orders are created, refused and rolled back, and concurrent
creates get unique numbers. It took one fix in our code and four workarounds, listed below. Not
deployed yet: that needs a Cloudflare account (`wrangler login`).

## How it's wired (no fork of the adapter)

- `vite.config.ts`: `ADAPTER=cloudflare pnpm build` uses `@sveltejs/adapter-cloudflare` with
  `cloudflare/adapter.wrangler.jsonc`, which only tells it to write `.svelte-kit/cloudflare/_worker.js`.
- `wrangler.jsonc` deploys `cloudflare/entry.ts`, which imports that `_worker.js` and exports the
  `Tenant` Durable Object class. That's the whole "export a DO from SvelteKit" problem of
  kit#1712: a second wrangler config, no fork, no post-build patching.
- The Worker sends each request to `env.TENANT.idFromName(<org slug>)`. `Tenant` migrates its
  database in `blockConcurrencyWhile` (1–4 ms) and runs SvelteKit inside itself
  (`kit.fetch(request, env, ctx)`) with its storage in an `AsyncLocalStorage` on `globalThis`.
- `db` (`src/lib/server/db/index.ts`) is now a proxy: the request's object's drizzle database, or
  the libsql one outside an object (dev, tests, scripts: unchanged).

## Findings

1. **drizzle's `durable-sqlite` transactions don't work with async callbacks.** They run the
   callback in `transactionSync()`, which commits when the callback returns its promise: after the
   first `await` nothing is in the transaction, and a throw rolls nothing back (probe: 2 rows left
   after a refusal). Every transaction of ours is async.
   **Fix (works):** `drizzleDurable()` (`src/lib/server/db/durable.ts`) runs our transactions in
   `ctx.storage.transaction(async …)`, which rolls back on a throw and **holds the object's input
   gate** until it's done: a concurrent request waited ~300 ms for a transaction and wasn't part of
   it. That replaces `drizzleQueued`'s queue. `afterCommit()` callbacks work as before. Nested
   transactions run inside the outer one (the storage API has no savepoints).
2. **`SAVEPOINT` / `BEGIN` are refused** by Durable Object SQLite ("use
   `state.storage.transaction()`"), so a nested `tx.transaction()` can't roll back on its own.
   Check whether any caller relies on that (`afterCommit()`'s doc mentions rolled back savepoints).
3. **At most 100 bound parameters per statement** (libsql: 32,766). The dashboard failed on
   `materialCosts()` (chunks of 500) and `coverageOf()`. There are 47 `inArray()` calls outside the
   seed. Spike workaround: the driver inlines a statement's parameters as SQL literals when there
   are more than 100. Real fix: pass id lists as one JSON parameter,
   `inArray` → a helper like `inIds(column, ids)` = `column IN (SELECT value FROM json_each(?))`,
   which also works on libsql.
4. **Migration `0007` uses libsql's `ALTER COLUMN`**, which plain SQLite doesn't have. Spike:
   `cloudflare/drizzle.config.ts` generates a separate plain-SQLite baseline
   (`cloudflare/migrations/`, `driver: "durable-sqlite"`, bundled as `migrations.js`). For real,
   switch `drizzle.config.ts` to `dialect: "sqlite"` and squash to a baseline, so one migration
   stream runs on both.
5. **Our `package.json` `"sideEffects": ["*.css"]` breaks async SSR in wrangler's bundle.**
   esbuild dropped `.svelte-kit/output/server/chunks/async.js` (Svelte's async-mode flag) as
   side-effect free, so Svelte rendered synchronously and every page with `await` was a 500
   (`await_invalid`). Fixed by adding `"./.svelte-kit/output/**"` to `sideEffects`. Worth keeping
   in mind for any bundler that re-bundles Kit's output.
6. **Auth is per organization in this spike.** Each object holds its own copy of better-auth's
   tables (a user of both organizations exists in both objects), and the organization is picked by
   a `spike-org` cookie (`/__spike/org/<slug>`), not by the session. better-auth also tries to
   reach the database at start-up, outside any object, and logs "Could not validate the database
   schema" (harmless). The real design needs the auth tables in one place (D1 or a global object)
   and routing by the session's active organization; the organization switcher and invitations
   cross objects.
7. **Seeding**: the seed is a Node script on libsql. The spike seeds a scratch libsql file and
   copies each organization's rows into its object (`cloudflare/export-tenant.ts` →
   `POST /__spike/import`, one `transactionSync`). Fine for a demo; a real tenant would be created
   by `org:create`-like code running inside its object.
8. **Bundle**: 1.68 MB gzipped (free plan limit 3 MB, paid 10 MB). Start-up time on Cloudflare not
   measured yet (needs the deploy).

## Checked (locally, `wrangler dev`)

- Migrations run in each new object (1–4 ms); North and South imported (753 and 320 orders).
- Sign-in as `admin@fieldworks.example`; dashboard, orders, schedule, customers, equipment,
  engineers, materials, contracts, invoices, activity, maintenance, settings and the new-order and
  new-customer forms all render (200), also on client-side navigation.
- New order with a material line of 99,999 m (stock 814): refused by materials' save hook
  (`saveOrderParts`) after `nextNumber` and the insert ran; afterwards still 753 orders, last
  number `ORD-2026-00753`, stock 814, no activity entry: rolled back.
- Same order with 2 m: `ORD-2026-00754`, stock 814 → 812, a stock movement, two activity entries.
  South's object unchanged.
- Five concurrent `createCustomer` posts: `CUST-0061`…`0065`, unique, no gaps (finished out of
  order, so they did run concurrently).

## Not checked

- The deploy itself, latency, and cold starts on Cloudflare.
- The engineer portal, invoices' and maintenance's writes, bulk actions, e2e tests (they run a
  Node build; they'd need workerd or Miniflare to cover this path).
- The service worker (the in-app browser refused to register it; the file is served).
- A transaction that awaits outside I/O (mail, `fetch`) holds the whole organization's object
  for that long: everything else of that tenant waits.

## Run it

```bash
ADAPTER=cloudflare pnpm build
pnpm exec wrangler dev
```

`.dev.vars` needs `BETTER_AUTH_SECRET` and `SPIKE_IMPORT_TOKEN`. Then import an organization
exported from a seeded libsql file:

```bash
node cloudflare/export-tenant.ts file:seed.db north > north.json
curl -X POST "localhost:8787/__spike/import?spike-org=north" -H "authorization: Bearer $SPIKE_IMPORT_TOKEN" --data-binary @north.json
```

and open `localhost:8787/__spike/org/north`.
