# Cloudflare: the app in a Durable Object

Built (October 2026), after a spike. The app deploys to Cloudflare Workers as well as Node: one
Durable Object, `AppDatabase`, answers every request with SvelteKit running inside it, and its
SQLite is the app's database. How to deploy is in README.md ("On Cloudflare"), the rules in
CLAUDE.md ("Cloudflare", "Bound parameters").

## Why

On Vercel with Turso every query is a network round trip. In a Durable Object the database is in
the same process as the code, so a page's dozens of queries cost microseconds each, and the app
felt much faster. One object also sees every request, which makes live queries (`query.live`)
simple: a change announced in memory reaches every open stream (`src/lib/server/changes.ts`).

## Decisions

- **One object for the whole app**, not one per organization. The auth tables (users, sessions,
  members) are joined and referenced by the business tables (a note's author, the members page),
  so one per organization would need them in a shared store with copies in each object. One object
  keeps everything as it is on libsql. Its limits: it lives in one place (hinted to western
  Europe), runs one request at a time between awaits, and holds 10 GB. Splitting it per
  organization can come later.
- **No fork of the adapter.** `adapter-cloudflare` can't export a Durable Object
  (sveltejs/kit#1712). It reads `cloudflare/adapter.wrangler.jsonc`, whose only job is to name
  where it writes its worker; `wrangler.jsonc` deploys `cloudflare/entry.ts`, which imports that
  worker and exports the object.
- **Transactions on the storage API.** drizzle's `durable-sqlite` driver runs a transaction in
  `transactionSync()`, which commits when an async callback returns its promise: after its first
  `await`, nothing is in the transaction, and a throw rolls nothing back (measured on workerd).
  `drizzleDurable()` (`src/lib/server/db/durable.ts`) uses `storage.transaction()` instead, which
  takes an async callback, rolls back on a throw, and holds the object's input gate: a concurrent
  request waited for the transaction and wasn't part of it. Order refusals (`saveOrderParts`) roll
  back, and concurrent creates get unique numbers (`nextNumber`), as on libsql. `BEGIN` and
  `SAVEPOINT` are refused by the object's SQLite, so a nested transaction is part of the outer one.
- **At most 100 bound parameters a statement** (libsql: 32,766). Lists go in one JSON parameter
  (`inList()`, `json_each`), multi-row inserts in batches (`insertRows()`), and `db` throws on a
  statement over the limit in every environment, so the tests catch it.
- **Two migration streams.** `drizzle/0007` uses libsql's `ALTER COLUMN`, which SQLite lacks, and
  committed migrations aren't edited; so `cloudflare/migrations/` starts from a baseline of the
  schema at `drizzle/0008`, and `pnpm db:generate` writes both from then on.
- **Data comes in by import.** Scripts like `org:create` run in Node against libsql, so a new
  object gets its data from a libsql database through `POST /_ops/import` (token-protected,
  `cloudflare/export-database.ts`): the first organization, the demo data, or Turso's database.
- **`sideEffects`**: `package.json` marks only CSS as having side effects, so wrangler's bundler
  dropped Kit's `.svelte-kit/output/server/chunks/async.js` (Svelte's async-mode flag) and every
  page with an `await` failed (`await_invalid`). `./.svelte-kit/output/**` is listed too.
- **better-auth's start-up schema check is off**: it ran while the module loaded, outside any
  request, where there's no database on Cloudflare. The migrations' spec checks the auth tables.

## Live queries and their cost

`recordActivity()` announces each change once its transaction commits; a live query watches the
subject types it shows (`watchChanges()`). The schedule board's `watchSchedule` yields when orders,
engineers or customers change, and the page refreshes `getSchedule`, so drag and drop stays
optimistic. Its e2e test plans an order in one tab and waits for another tab's board to show it.

An open stream keeps the object awake, which Cloudflare bills as duration. `query.live` streams
over HTTP from inside the object. To let the object hibernate, the live query would run in the
Worker (billed by CPU time, so an idle stream costs little) and listen to the object over a
hibernatable WebSocket. Not built yet.

## Measured

Worker start-up 91–109 ms (limit 1 s), 1.68 MB gzipped (free plan limit 3 MB). Migrating a new
object: 1–4 ms. Importing the demo data: about 2 s.

## Open

- Mail through `SMTP_URL` (nodemailer) is untested on Workers; Cloudflare's own email binding is
  an alternative.
- The e2e suite runs on Node with libsql; the Cloudflare path is covered by the unit specs, the
  parameter check and manual checks of a deployment.
- Latency for users far from the object's location; eviction and cold starts.
