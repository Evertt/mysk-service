# Database, Cloudflare and the activity log

Read before you change the schema, write a migration, bind a list of values, touch transactions, or log a new kind of change.

## Schema and migrations

The schema is `src/lib/server/db/schema.ts`; the database gets it through the migrations in
`drizzle/`, never `drizzle-kit push`. After changing the schema, run
`pnpm db:generate --name <what-changed>` (e.g. `add-invoice-reference`), check the SQL it wrote,
and commit it with the change; `pnpm db:migrate` applies it to `local.db` (`pnpm db:reset` starts
over from the migrations and the seed). `src/tests/unit/lib/server/db/migrations.spec.ts` fails while the
schema has changes no migration makes. Never edit a migration that's been committed: add another.

`pnpm db:generate` writes the migration twice (`scripts/db-generate.ts`): in `drizzle/` for libsql
(a file, Turso) and in `cloudflare/migrations/` for the Durable Object's plain SQLite on Cloudflare,
which has none of libsql's own SQL (`ALTER COLUMN`); check and commit both. The spec holds both
streams to the schema. A change SQLite can only make by rebuilding a table (a new composite foreign
key, a column made `NOT NULL`) needs the Durable Object's copy written by hand: drizzle-kit turns the
foreign keys off, which a Durable Object can't, and dropping a table others refer to deletes what
cascades from it. `cloudflare/migrations/0002_add-customer-sites.sql` is the example (it defers the
key checks to the commit, copies the rows back after the rename, and puts the cascaded rows back);
`0004_order-units.sql` rebuilds `order` the same way, and also puts back what a `set null` emptied
(maintenance plans' last order). `migrations.spec.ts` runs them with the keys on, and checks that
nothing that refers to the rebuilt table is lost.

A rebuild keeps the table's `AUTOINCREMENT` sequence, in both streams: dropping the table drops its
row in `sqlite_sequence`, and the new table would count on from its highest id left, giving the ids
of the newest deleted rows again, whose activity log entries (keyed by subject id) a new record
would then have. Copy the sequence aside before the drop (`__old_<table>_sequence`), and after the
rename set the table's row to the greater of it and its `max(id)`; the three rebuilds (`0010`–`0012`,
`cloudflare/migrations/0002`–`0004`) are the example, and `migrations.spec.ts` checks that a new row
gets an id above a deleted one's. (Those rebuilds got this after they were committed, before they
were released anywhere: a released migration is never edited.)

**Bound parameters**: a statement binds at most 100 values (`#lib/server/db/parameters.ts`): it's
Cloudflare's limit, and `db` enforces it everywhere (a statement over it throws, in tests too). So
a list of values is never bound one by one: `inList(column, values)` and `notInList()` instead of
drizzle's `inArray()`/`notInArray()` (one JSON parameter; `parameters.spec.ts` refuses the
latter), and `insertRows(tx, table, rows)` (or `insertBatches()` with `.returning()`) for a
multi-row insert. The seed, which runs in Node only, is exempt.

## Cloudflare

Besides Node (and Vercel), the app deploys to Cloudflare Workers (`pnpm deploy:cloudflare`; see
"On Cloudflare" in README.md): `cloudflare/entry.ts` wraps the worker SvelteKit's
`adapter-cloudflare` writes (`ADAPTER=cloudflare`, `cloudflare/adapter.wrangler.jsonc`) and runs
every request inside one Durable Object, `AppDatabase`, whose SQLite is the app's database.

- `db` (`src/lib/server/db/index.ts`) is the Durable Object's database inside a request there
  (`durable.ts`), else libsql's: the app's code is the same for both. Code that runs while a module
  loads (outside a request) mustn't touch `db`: on Cloudflare there is none then.
- Transactions there run in the object's `storage.transaction()`, which holds every other request
  until they're done (as `drizzleQueued` does on libsql): keep outside I/O (mail, `fetch`) out of
  them, or the whole app waits for it. Nested transactions are part of the outer one (no
  savepoints).
- `pnpm check` type-checks `cloudflare/` against the Workers runtime
  (`cloudflare/worker-configuration.d.ts`; rerun `pnpm types:cloudflare` after changing
  `wrangler.jsonc`).
- What changed, for live queries: `recordActivity()` announces each change after its commit
  (`announceChange()`, `src/lib/server/changes.ts`), and a `query.live` watches the subject types it
  shows (`watchChanges()`; the schedule's `watchSchedule` is the example) or one record
  (`watchSubject()`, which says who changed it; `<ChangedElsewhere>` on an order's and a customer's
  pages, through `watchRecordChanges`). In memory: on Cloudflare
  one object serves every request; on Node, one process.

## Activity log

Every mutation logs itself with `recordActivity(tx, …)` (`src/lib/server/activity/log.ts`), inside the
`db.transaction` that makes the change and after making it, so a refused or rolled-back change logs
nothing (wrap a single write in a transaction for this). Tenant and user come from the request
(`requireTenant()`, so the engineer portal logs too):

```ts
await db.transaction(async (tx) => {
	await tx.update(customer).set(input).where(idInTenant(customer, id));
	const subject = { type: "customer", id, label: existing.code };
	await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
});
```

- `action` is one of `activityActions` (`src/lib/models.ts`): created, updated, deleted, or a verb
  that says more (scheduled, stock_received, …); a new one also gets a sentence in `actionVerbs`
  (`messages/<locale>/activity.json`).
- `subject` is the record: its type, id, and the label it's known (and its page found) by now,
  e.g. the order number. `parent` puts it on another record's card too (an order line's order).
- For an update, pass the row as loaded as `before` and what the update sets as `after`: only
  `after`'s fields are compared, and an update that changes nothing logs nothing. `ignore` leaves
  out fields that follow from others.
- A new subject type gets a noun, page and field formats in `coreSubjectTypes`
  (`src/lib/activity/subjects.ts`), or, for a module's records, in the `subjects` of its manifest
  (`src/modules/<id>/module.ts`; its verbs are its `actions`).
  Its detail page shows `<ActivityCard type="…" id={…} />` (`#lib/components/activity/`).
- Log deletions too: a subject links to its page until its deletion (or removal) is logged.
- Changes made outside the app's transactions (better-auth's member and invitation endpoints) log
  with `recordActivityAfter()` once they succeed. Pass `by` (tenant and user) when the change
  belongs to another organization than the current one, e.g. accepting an invitation.
- An order's material lines are logged by the materials module (`saveLines()` in
  `src/modules/materials/server/lines.ts`), against the order; stock that follows an order's
  status needs no entry of its own beyond the status change.
