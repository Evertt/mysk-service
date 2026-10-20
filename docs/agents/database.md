# Database, Cloudflare and the activity log

Read before you change the schema, write a migration, bind a list of values, touch transactions, or log a new kind of change.

## Schema and migrations

The core's schema is `src/lib/server/db/schema.ts`, which exports the tables of `schema/` (by
domain: customers, engineers, equipment, orders, the customer portal, and `infra.ts` for the app's
own: modules, simulations, tokens, views, table memory, the activity log, notifications and bug
reports; the core's relations are in `schema/relations.ts`); a module's is its
`server/schema.ts`. The database gets it through the migrations in `drizzle/`, never
`drizzle-kit push`. After changing the schema, run
`pnpm db:generate --name <what-changed>` (e.g. `add-invoice-reference`), check the SQL it wrote,
and commit it with the change; `pnpm db:migrate` applies it to `local.db` (`pnpm db:reset` starts
over from the migrations and the seed). `src/tests/unit/lib/server/db/migrations.spec.ts` fails while the
schema has changes no migration makes. Never edit a migration that's been committed: add another.

### Tenant tables

A tenant's table is declared one way, with the factories of `src/lib/server/db/columns.ts`;
`tenant-tables.spec.ts` (next to `migrations.spec.ts`) refuses the hand-written forms:

```ts
export const customerSite = tenantTable(
	"customer_site",
	{ customerId: integer("customer_id").notNull(), name: text("name").notNull() },
	(table) => [tenantRef(table, table.customerId, customer, { onDelete: "cascade" })],
	{ referenced: true },
);
```

- `tenantTable(name, columns, extra?, options?)` puts `id` (autoincrement) and `organization_id`
  (deleted with the organization) before `columns`. `key: "tenant"` keys it by the tenant instead
  (one row per tenant: a module's settings), `key: "own"` by its own columns (a `primaryKey()` in
  `extra`, or a column's). `referenced: true` adds the unique index `<table>_organization_id` on
  `(organization_id, id)` that other tables' keys point at.
- `tenantRef(table, table.xId, x, { onDelete? })` is the composite key
  `(organization_id, x_id)` → `x (organization_id, id)`; `to` points it at other columns (a
  checklist's order unit). A key that pairs `customer_id` instead (a unit's site, an order's units)
  stays a plain `foreignKey()`.
- A reference that the deletion of its row clears (a dock's door) can't use `organization_id`:
  `on delete set null` clears every column of a key. `...optionalTenantColumns("door")` adds
  `doorId` and `doorOrganizationId`, and `...optionalTenantRef(table, "door", equipment)` in
  `extra` their index `<table>_door` (`idFirst` puts the id first), the `set null` key and the
  check `<table>_door_tenant` that holds the tenant to the row's. Write them with
  `withTenantRefs(organizationId, { doorId })`, which sets `doorOrganizationId` where there's a
  door.
- Relations: `customer: tenantOne(one, customerSite.customerId, customer)`, on the key's column
  pairs (an optional reference's too).

Every foreign key has an index (or the primary key) whose first columns are the key's, in any
order: deleting a parent row, or inserting one while deferred keys are violated (an import),
otherwise scans the whole child table for each row. `foreign-key-indexes.spec.ts` (next to
`migrations.spec.ts`) names the keys without one. Extend an index a query already uses with the
key's other columns rather than adding a second one.

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
multi-row insert; `insertRows()` takes the seed's transaction too. The seed, which runs in Node
only, is otherwise exempt. An expression a statement repeats
many times (the condition module's unit status, in a list's select, sort and filter) writes the
code's own constants in with `literal()` and `inLiterals()` instead of binding them; never input.

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
  (`announceChange()`, `src/lib/server/changes.ts`). A `query.live` returns `live()`
  (`src/lib/server/live.ts`), which watches before the first answer, stops when the request ends
  and answers later changes inside the Cloudflare request:
  - `live(types)` answers when the tenant's records of those types last changed (the schedule's
    `watchSchedule`, the portals' `watchMyWork` and `watchPortal`);
  - `live(watched, answer)` answers what `answer` makes of nothing first (`null`: a check that
    refuses goes there), then of each change, to records of some types or to one record, with who
    changed it (`getSimulation`);
  - `liveFeed(types, present)` answers every change to the tenant's records, for a shell's one
    feed (the office's `watchTenantChanges`, the engineer portal's `watchFieldChanges`), which a
    record's cards and `<ChangedElsewhere>` follow with `refreshOnRecordChange()` /
    `onRecordChange()` (`#lib/components/activity/change-feed.svelte.ts`): no live query per record.

  The page refreshes with `refreshOnChange(watchX, () => getX().refresh())`
  (`src/lib/hooks/refresh-on-change.svelte.ts`): not on the first answer, unless it is later than
  the data's read time (`readAt()` on the server; the schedule's board and month pass it).
  Record types are typed (`ChangeType`): a type a module announces but never logs, like energy's
  readings, is in its manifest's `liveTypes`. In memory: on Cloudflare one object serves every
  request; on Node, one process.

## Activity log

Every mutation logs itself with `recordActivity(tx, …)` (`src/lib/server/activity/log.ts`), inside the
`db.transaction` that makes the change and after making it, so a refused or rolled-back change logs
nothing (wrap a single write in a transaction for this). Tenant and user come from the request
(`requireTenant()`, so the engineer portal logs too):

```ts
await db.transaction(async (tx) => {
	await tx.update(customer).set(input).where(idInTenant(customer, id));
	const subject = customerSubject(existing);
	await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
});
```

- `action` is one of `activityActions` (`src/lib/models.ts`): created, updated, deleted, or a verb
  that says more (scheduled, stock_received, …); a new one also gets a sentence in `actionVerbs`
  (`messages/<locale>/activity.json`).
- `subject` is the record: its type (`LoggedType`), id, and the label it's known (and its page
  found) by now, e.g. the order number. Orders, customers and units are named by their builders,
  `orderSubject()`, `customerSubject()` and `equipmentSubject()` (`#lib/activity`), as subject or
  parent, since their label is their page's URL key. `parent` puts it on another record's card too
  (an order line's order).
- For an update, pass the row as loaded as `before` and what the update sets as `after`: only
  `after`'s fields are compared, and an update that changes nothing logs nothing. `ignore` leaves
  out fields that follow from others.
- A new subject type gets a noun, page and field formats in `coreSubjectTypes`
  (`src/lib/activity/subjects.ts`), or, for a module's records, in the `subjects` of its manifest
  (`src/modules/<id>/module.ts`, written `satisfies Record<string, SubjectType>` so its type names
  stay in the `LoggedType` union; its verbs are its `actions`).
  Its detail page shows `<ActivityCard type="…" id={…} />` (`#lib/components/activity/`).
- Log deletions too: a subject links to its page until its deletion (or removal) is logged.
- Changes made outside the app's transactions (better-auth's member and invitation endpoints) log
  with `recordActivityAfter()` once they succeed. Pass `by` (tenant and user) when the change
  belongs to another organization than the current one, e.g. accepting an invitation.
- An order's material lines are logged by the materials module (`saveLines()` in
  `src/modules/materials/server/lines.ts`), against the order; stock that follows an order's
  status needs no entry of its own beyond the status change.
