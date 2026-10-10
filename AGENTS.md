## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: vitest, tailwindcss, sveltekit-adapter, drizzle, better-auth, paraglide, ai-tools, experimental
- **Before committing**: `pnpm run check` (code generation, format, lint and svelte-check; plain
  `vp check` skips the type check), then `pnpm knip` (unused files, exports and dependencies; about
  3 seconds; drop what's unused, or, if it's used in a way knip can't follow, say why in `knip.ts`),
  then `pnpm test`.
- **Parallel agents** that edit code each get their own worktree (`isolation: "worktree"`), rename
  its branch after the task, copy in `.env` (`git worktreeinclude apply`) and run `pnpm install`
  first: in a shared checkout they type-check each other's half-written files and reload each
  other's dev servers.

## Where files go

Put a module next to the code that uses it, in the nearest folder that contains all of its users,
with one exception: **`src/routes` holds route files only** (names starting with `+`), plus the files
of the app shell, the dashboard, the auth pages and the engineer portal, which belong to no core
domain. Whatever belongs to a core domain lives in that domain's folder.

- **A core domain's code** (`orders`, `customers`, `equipment`, `engineers`, `materials`): in
  `src/lib/<domain>/`, in a folder by feature. Specs and test harnesses sit next to their subject.
  - `ui/`: the small pieces other sections reuse: links, badges, labels, cards, tags
    (`#lib/orders/ui/order-link.svelte`).
  - `list/`: the list definition (`orders-list.ts`), columns, table, cells, bulk actions, and the
    list's remote functions (`order-list.remote.ts`, `order-bulk.remote.ts`).
  - `form/`: the new/edit form, its fields and valibot schema.
  - `detail/`: what only the detail page shows: cards, history, dialogs, their helpers and remote
    functions.
  - `server/`: server-only code: services (`pricing.ts`, `stock.ts`), hooks, and the list's `ListSql`
    in `list-sql.ts`.
  - at the root: `display.ts` (display maps, options, domain rules), `extensions.ts` (the domain's
    extension points), `countries.ts`-like data, and the record's own remote functions
    (`order.remote.ts`: get, form options, create, update, delete).

  A page is a `+page.svelte` in `src/routes/(app)/<domain>/` that composes these.

- **Barrels**: code outside a domain imports it through its barrels, by file: `#lib/<domain>/index.ts`
  (plain TS: display maps, list definitions, data; safe to load anywhere Vite's Svelte plugin runs),
  `components.ts` (Svelte components), `remotes.ts` (re-exports the `*.remote.ts` files; not named
  `remote.ts`, which SvelteKit would treat as a remote module) and `server/index.ts` (server-only;
  only orders and materials have one: add one when something outside needs it).
  E.g. `import { OrderLink } from "#lib/orders/components.ts"`. A barrel exports what something
  outside the domain imports, no more. Exceptions: `#lib/<domain>/extensions.ts` is imported as itself
  (the module generator reads it and the modules contribute to it at module scope), and `e2e/` and
  `scripts/`, which have no Vite plugins and import plain `.ts` files by path. Inside a domain, import
  siblings relatively and never the domain's own barrels (a barrel imports its files: the other way
  round is a cycle). Code that runs when a module is evaluated (list definitions, `withLabels()`,
  constants) never reads an import from another domain: a cycle between two barrels is harmless only
  if nothing is read while they evaluate. `src/lib/domain-boundaries.spec.ts` checks all of this, and
  that a domain's route folder and a module's `routes/` hold `+` files only.
- **Used by one route outside the domains** (the shell, dashboard, auth pages, portal):
  in that route's folder, e.g. `src/routes/(app)/(dashboard)/dashboard-charts.ts`. **Used by several
  routes under one folder**: in that folder, e.g. `src/routes/(app)/app-sidebar.svelte` serves every
  route behind the login. Import it relatively. Plain helpers that a route's remote files share (a
  `.remote.ts` may only export remote functions) go in a `*.server.ts` next to them, which SvelteKit
  keeps out of client bundles.
- **Generic, domain-free code** (UI kit, data table, forms, themes, activity subjects, auth,
  i18n, module manifests, extension point declarations): `src/lib/components/`, `src/lib/activity/`,
  `src/lib/auth/`, `src/lib/i18n/`, `src/lib/modules/`, `src/lib/extensions/`, `src/lib/themes/`;
  the loose `src/lib/*.ts` that remain are domain enums (`models.ts`), valibot blocks
  (`schema.ts`), date maths (`dates.ts`), code shapes (`numbering.ts`), what's billed besides
  orders (`billing.ts`, types the seed shares with invoicing) and shadcn's `cn` (`utils.ts`).
  Infrastructure on the server (database, auth, activity log, list plans and bulk helpers, mail,
  the modules' route guards): `src/lib/server/db/`, `server/auth/`, `server/activity/`,
  `server/lists/`, `server/mail/`, `server/modules/`; the loose `src/lib/server/*.ts` that remain
  are `extensions.ts` (the hooks' dispatch), `forms.ts`, `records.ts` and `numbering.ts`.
- **An optional module** (something a tenant can switch off, like contracts and invoicing): everything of it in `src/modules/<id>/`, whoever uses it, see "Modules". Its server-only code is in the module's `server/` folder, and what other modules may use is in its `api/` folder (see "Modules"). Core code never imports from `src/modules/`.

**Imports name a file by its real extension**: `.ts` for TypeScript (`allowImportingTsExtensions` is
on, and plain Node, which runs the seed, `org:create` and `scripts/modules.ts`, needs it), `.svelte.ts`
for rune modules, `.svelte` for components, and `.js` only for real JavaScript, which is paraglide's
generated output (`#lib/paraglide/messages.js`, `runtime.js`). So `../order.remote.ts`, never
`../order.remote.js` or `../order.remote`; the same goes for `vi.mock(...)` paths and `import()`.
`src/import-extensions.spec.ts` fails with the file and line of an import that breaks this. The
`#ui/<name>` imports have no extension: `package.json` adds `/index.ts` (it maps shadcn's component
folders, which the shadcn CLI and the auto-imports rely on). Seven generic folders also have
a barrel `index.ts` re-exporting their files (`activity/`, `auth/`, `i18n/` and `server/activity/`,
`server/auth/`, `server/lists/`, `server/mail/`), and so does each core domain (above); a barrel is
imported by that file, `#lib/i18n/index.ts`: no `package.json` `imports` entry or `tsconfig` path maps
a folder to its `index.ts`, so a folder is never imported as `#lib/i18n`
(`src/import-extensions.spec.ts` fails with the line).

Any `server/` folder outside `src/routes` (and any `*.server.ts`) is server-only: SvelteKit refuses to bundle it for the browser (`server_only_import`). Never put secrets or database code anywhere else.

When a module gains a user outside its folder, move it up to the nearest common folder; when it loses users, move it down.

## Tenants and modules

The app is multi-tenant: organizations (better-auth's organization plugin) own all business data, and
optional modules (`src/modules/<id>/`, see "Modules") are enabled per organization (`organization_module`). The
helpers are in `src/lib/server/auth/session.ts`:

- Every remote function is made with a gated set from `src/lib/server/remote-functions.ts`, the
  only file that may import `query`, `form` and `command` from `$app/server`
  (`remote-functions.spec.ts` checks): `forMembers.query(schema, handler)` for the office,
  `forManagers` (an owner or admin) for organization settings, `forEngineers` for the engineer
  portal, `forUsers` if it doesn't touch tenant data, `forAnyone` only for what's public on purpose
  (signing in, the theme, an invitation's link); an optional module uses its own set (see
  "Modules"). The set runs its gate (`requireMember()` and friends) before the handler on every
  call, so the handler doesn't check again: it reads what the gate admitted with `currentTenant()`
  (`organizationId`, `roles`, `modules`, `user`), `currentUser()` or `await currentEngineer()`.
- Every select, update and delete on a tenant table (one with `organizationId`) includes
  `inTenant(table)` in its `where`, including lookups by id or code: ids are global and come from
  the client. Check that submitted references (e.g. a `customerId`) belong to the tenant, for a
  clear message (the foreign keys would refuse them anyway). Write the tenant scope with
  `idInTenant(table, id)` and `idsInTenant(table, ids)` (`session.ts`) instead of spelling out
  `and(eq(table.id, id), inTenant(table))`, and a join to a tenant table with
  `.leftJoin(...tenantJoin(engineer, order.engineerId))`: a bare `eq(table.id, id)` then stands out
  in review. `contract_equipment` has no `organization_id`: reach it through a tenant-checked
  contract or equipment.
- Inserts set `organizationId` from `currentTenant()`. Codes and numbers are unique and sequential
  per organization: pick the next one with `nextNumber(tx, "order")` (`src/lib/server/numbering.ts`;
  the formats are in `src/lib/numbering.ts`) and insert it in the same `db.transaction`
  (transactions take turns, see `src/lib/server/db/serialize.ts`, so concurrent creates can't pick
  the same one). A module numbers its own records with a format and table of its own:
  `nextNumber(tx, { format, table, column })`, e.g. `contractNumbers` in
  `src/modules/contracts/server/contracts.ts` and `invoiceNumbers` in
  `src/modules/invoicing/server/invoices.ts`.
- References between tenant tables are composite foreign keys that include the tenant, e.g.
  `(organization_id, customer_id)` → `customer (organization_id, id)`, and relations use the same
  column pairs, so the database refuses cross-tenant references and `with:` loads stay in the
  tenant. A new reference gets the same treatment; joins also add `inTenant()` for the joined
  table. Where a reference must belong to the same customer (an order's equipment, a contract's
  coverage), the key pairs `customer_id` instead.
- An optional module's tables reference core tables, never the reverse; core sections don't know
  about modules. A module adds to core pages through slots (components that load their own data
  with the module's remote functions; `<ExtensionSlot>`, `src/routes/(app)/extension-slot.svelte`,
  renders each in a boundary of its own, so one that fails shows a notice instead of breaking the
  page) and bulk actions on tables' selections, and to its owners' server logic through hooks; all
  only take part for tenants that have the module.
  A hook is an extension point its owner declares (`#lib/extensions/define.ts`): core's in
  `src/lib/<domain>/extensions.ts` (`orders.adjustPrices`, `orders.tag`, `orders.committed` in
  `src/lib/orders/extensions.ts`), a module's in its `api/extensions.ts`
  (`invoicing.billableItems`). A module contributes in its `server/index.ts`:
  `defineServerModule(id, [contribute(adjustPrices, …), …])`, with the point imported from its
  owner. The owner calls it through the kernel (`src/lib/server/extensions.ts`), for the modules
  that are on, in registry order: `collect()` for a collector (asked in parallel about a batch;
  the point's `onError` says whether an error fails the request, `fail`, or is logged and left
  out, `skip`), `emit()` for an event after commit (via `afterCommit()` in
  `src/lib/server/db/serialize.ts`; errors are logged, not thrown) and `vote()` for a vote (any
  refusal wins). Each point has one caller in its owner's domain (`priceOrders()`, `tagOrders()`
  and `orderCommitted()` in `src/lib/orders/server/`, `offeredItems()` in invoicing's
  `server/billable.ts`); a new extension point is added when a module needs it.
  Anything that shows or adds up order totals prices them with `priceOrders()`
  (`src/lib/orders/server/pricing.ts`), which applies the modules' adjustments.
- Shared server helpers, so each section doesn't write them again: `bulkChange()` and
  `refreshRequested()` for bulk commands (`lists/bulk.ts`), `deleteAndLog()` for deleting a record
  (`records.ts`), `refuse()` for refusing a form with its problems (`forms.ts`), and in pricing
  `lineTotalSql()` and `materialsPerOrder()` for the SQL twins of an order line's total.

## Modules

Optional modules (things a tenant can switch off) are folders `src/modules/<id>/`, each
self-contained: `module.ts` (its manifest, `defineModule()` from `#lib/modules/define.ts`: label,
description, `route`, icon, `nav`, `subjects`, `actions`; it is in every tenant's
bundle, so it imports only messages, icons, types, `import()` loaders and its own small scripts),
`server/` (`index.ts` with `defineServerModule()`, `schema.ts`, `seed.ts` with `defineSeed()`, its
logic; server-only), `routes/` (its pages, mirroring `src/routes`: `+` files only), its components
and remote functions in `list/`, `form/`, `detail/` (the same folders as a core domain's) or at the
root, `messages/<locale>/<section>.json` and `e2e/*.test.ts`. The folder name is the id
(`^[a-z][a-z0-9-]*$`). A module with tables also needs `pnpm db:generate --name add-<id>` and its
migration committed.

- `scripts/modules.ts` (its parts, each with a spec, are in `scripts/modules/`) links the folders in;
  `pnpm generate` runs it before `svelte-kit sync`, `vite.config.ts` runs it when it loads, and in
  dev it reruns when a module's files come or go. It writes the registries (`src/lib/modules/manifests.gen.ts`,
  `ids.gen.ts`, `src/lib/server/modules/hooks.gen.ts`,
  `src/lib/server/db/modules.gen.ts`, `module-schemas.gen.ts` and `module-seeds.gen.ts`; gitignored), the route stubs (below)
  and the module entries of `pathPattern` in `project.inlang/settings.json`. It fails, listing
  everything wrong, when a module's route folder collides with a core route or another module's, a
  route file is outside a folder of the module's own, a `(modules)` folder holds a file it didn't
  write, or message sections are missing in a language or not unique.
- **Dependencies**: `module.ts` may list `requires` (modules it can't work without) and `enhances`
  (modules it only adds to when they're on) as string-literal arrays, and `alwaysOn: true`; the
  generator reads them with a pattern, and `manifests.spec.ts` compares them with the runtime
  values. A module whose requirement is off is off everywhere (`effectiveModules()` in
  `loadTenant()`), and the registries (hooks, slots, bulk actions, seeds) run in dependency order.
  The settings page switches a module on together with its requirements and off together with its
  dependents (`setModules`, `changeModules()` in `#lib/modules/graph.ts`), and refuses a set that
  would leave a module without its requirements.
- **The sidebar**: a module's entry is in the sidebar's Modules group, unless its manifest says
  `nav: { after: "orders" }` (a core entry's id from `coreNavIds` in `#lib/modules/nav.ts`, or
  another module's id; a literal, read by the generator like `requires`): then it goes right after
  that entry (`placeNav()`), or in the Modules group while that entry isn't shown.
- **Route stubs**: every `+` file of a module's `routes/` gets a stub in `src/routes`, in a
  `(modules)` group inside the file's leading groups: `routes/(app)/contracts/[number]/+page.svelte`
  → `src/routes/(app)/(modules)/contracts/[number]/+page.svelte`. They are real routes (`RouteId`,
  `resolve()`, the `(app)` layout, endpoints, SvelteKit's server-only guard), the URL is unchanged
  (`/contracts/…`), and the core's route folders hold only core files. Every `(modules)` folder
  is the generator's (gitignored; it deletes and rewrites them), so never edit one, and core never
  uses the name.
- **Route ids include the group**: a module names its routes `/(app)/(modules)/contracts/[number]`
  everywhere a route id goes: `resolve()`, `RouteParams<…>`, the manifest's `route`, its activity
  subjects' `href`s.
- **The guard**: each `(modules)` group's generated `+layout.server.ts` 404s the tenants without
  the module that owns the route (`guardModuleRoute()` in `#lib/server/modules/hooks.ts`), so they
  get the app's own 404 page inside the app layout. Kit runs server loads in parallel, and form
  actions and endpoints without the layouts, so the stub of each server file (`+page.server.ts`,
  `+layout.server.ts`, `+server.ts`) also guards its `load`, `actions` and request handlers
  (`GET`, `POST`, …) before running the module's (`guarded()`, `guardedActions()`).
- **Slots and bulk actions are contributed by file**: a component at a slot is
  `src/modules/<id>/slots/<point id>/<name>.svelte` (e.g. `slots/orders.detail.side/coverage.svelte`),
  and a table's bulk actions are the default export of `src/modules/<id>/bulk-actions/<point id>.ts`
  (an array of `BulkAction`s). The generator lists them in `src/lib/extensions/contributions.gen.ts`
  with `slotContribution()` and `bulkContribution()`, which hold each to its point's types, and
  checks that the point exists and that its owner is core, the module itself, or a module it
  `requires` or `enhances`. Every `.svelte` directly in `slots/<point id>/` is a contribution, so a
  contribution's helper components live outside `slots/` (next to the module's other components). A
  slot's component must declare the slot's props (optional is fine): a component without them is
  refused by the type check at a slot that passes props. The owner's page renders a slot with
  `<ExtensionSlot point={detailSide} props={{ number }} />` (`detailSide` from the owner's
  `extensions.ts`), and a table gets its contributed actions with
  `extensionBulkActions(list)` (`src/lib/extensions/bulk-actions.svelte.ts`); both show only
  the contributions of the modules the tenant has, in registry order, and key a contribution by its
  id (`<module>/<point id>/<name>`).
- A module's `routes/` holds route files (`+` files) only; everything they use is in the module's own
  folders (`list/`, `form/`, `detail/`, `server/`, the root) and imported as `#modules/<id>/…`.
  A module's route folders are plain names of its own (`routes/(app)/contracts/…`); it never adds
  files to a core route. To add something to a core page, use a slot. Its pages type their params
  with `RouteParams<"/(app)/(modules)/contracts/[number]">` from `$app/types`, since `./$types`
  only resolves for files physically in `src/routes`; the stub is typed with the route's `PageProps`, so
  svelte-check verifies that the page accepts what SvelteKit passes it. Page options
  (`export const ssr = false`) go in the module's `+page.ts` as literals: the stub repeats them
  because SvelteKit reads them without running the file. Don't `export * from` in a route file.
- A module makes its remote functions with its own set, in `src/modules/<id>/remote-functions.ts`:
  `export const { query, form, command } = moduleRemote("<id>")` (plus
  `moduleRemote("<id>", "manager")` for what only managers may do), which refuses tenants without
  the module with a 404 (`requireModule("<id>")`); its remote files import `query` and friends from
  there (not `remote.ts`: SvelteKit takes any `remote.*` file for a remote file). The module's
  route stubs guard its server loads, form actions and endpoints (see above); its remote functions
  are guarded only by the set they're made with, which is what keeps their data safe.
- Core declares its extension points (`#lib/<domain>/extensions.ts`); core never
  imports a module (`#modules/…` is for the generated registries, and for a module's own route files), which
  `src/modules/boundaries.spec.ts` checks. A module's tables reference core tables (composite tenant keys, columns from
  `#lib/server/db/columns.ts`) and the tables of the modules it `requires` in its `module.ts`,
  never the reverse; one migration stream in `drizzle/`, and `src/lib/server/db/modules.spec.ts`
  checks that no core table has a foreign key to a module table, and that a module's tables
  reference only core tables and those of modules it requires (`module-schemas.gen.ts` lists each
  module's schema for it). A module's specs sit next to its code (`*.spec.ts`, `*.svelte.spec.ts`);
  its end-to-end tests in `e2e/` import helpers from `#e2e/app.ts` and run in the e2e project.
- **The `api/` folder**: what a module offers the modules that depend on it (its types, queries and
  services, and its extension points in `api/extensions.ts`, like invoicing's) is in `src/modules/<id>/api/`, and nothing else of
  it is public. A module imports another's files only as `#modules/<other>/api/…`, and only if it
  lists `<other>` in `requires`; for a module it only `enhances` it may import `api/extensions.ts`
  (the points its enhancements plug into) and types. `boundaries.spec.ts` checks it (`apiImports`)
  with the graph from the manifests, so a module that needs another says so first.
- **Read tables, write through services**: a module may read any table it can import (a join to
  `order`), but changes only its own: `.insert()`, `.update()` and `.delete()` take its own
  tables (`foreignWrites` in `boundaries.spec.ts`). A change to the core's records goes through the
  service the core offers, which holds the rules and the activity log entry, e.g.
  `setOrdersStatus()` (`src/lib/orders/server/order-changes.ts`), which invoicing uses to mark an
  invoice's orders invoiced and completed again, and `scheduleOrder(tx, plan)`
  (`src/lib/orders/server/scheduling.ts`), through which the schedule plans orders. A module's own `api/` offers such services to the
  modules that require it.

Contracts, invoicing and the schedule are the modules (`src/modules/contracts/`,
`src/modules/invoicing/`, `src/modules/schedule/`: look there for an example of each part; the
registries list them by id). The schedule is the one without tables of its own: a view of the
orders, which changes them through a core service and owns only its route, components and messages. Extension points are added with
the first module that needs them. Not there yet: several `nav` entries per module, module
columns, filters and row actions in tables, `order.actions`-style slots, slot options (order,
roles), `settings.cards`, and the server `refuseChange`/`saved` hooks.

- A module's seed has two steps (`src/lib/server/db/seed/module-seed.ts`): `generate()` makes its
  data for a tenant right after the core's, with the same faker (so the demo data doesn't change
  with where the module's code lives), and may add to the core's draft (contracts adds call-out
  orders); `run()` inserts it. What a module does at runtime through hooks it does at seed time
  through collectors (`adjustPrices()`, `billableItems()`), which the seed of whoever consumes it
  asks without knowing the module, from `run()` (a tenant's `collect`), when every module has made
  its data: invoicing's seed prices orders and bills fees through them.
- The page guard is a layout load, so it also answers a form posted from a module's page (the
  organization switcher's) in an organization without the module: a refused form is a 404 there, not
  its own status. Tests that tamper with such a form start from a page that exists.
- A core e2e test of something a module changes (a customer's revenue less what contracts include)
  can't import the module's helpers, and a module's e2e can't import another module's, so
  `e2e/contracts-helpers.ts`, which works the contracts' effect on prices and billing out in SQL
  (which contract covers an order, the fees due), stays in `e2e/`; the e2e of contracts and
  invoicing import it from there. A core test of what a module adds (invoicing's bulk action on the
  orders list) is that module's e2e test, not the core's.
- Core specs test core with made-up modules (`src/lib/modules/fakes.ts`, mocked in as `manifests.gen.ts`
  or passed to the function as the registry); what a module does is tested in its own folder.

## Server-side lists

Orders, equipment and materials page, filter and sort in the database. A list is three layers (the
orders list in `src/lib/orders/` is the example):

1. **The definition**, `defineList()` in `list/<section>-list.ts` (`orders-list.ts`; isomorphic, no
   server imports): the columns, what each sorts, groups and filters by, and the filter's value
   type (`code`, `id`, `oneOf(values)`; `orNone(kind)` for a column that can be empty, `none` in the
   URL). It makes the valibot schemas `list.query` and `list.where`, the typed
   `ListQuery`/`ListWhere`, and the URL spec. The table's URL state is read into a query
   with `toListQuery()`; the URL stays lenient (bad values are dropped), the remote query strict
   (a malformed argument is a 400).
2. **The SQL**, `ListSql` from a per-request factory (`ordersSql()`) in the domain's
   `server/list-sql.ts`: the SQL of every column the definition sorts, groups or filters by
   (a missing or extra one is a type error), the search columns, the id and the tenant scope. Write
   the joins once in a helper generic over the query (`withOrderJoins`, drizzle's `$dynamic()`
   pattern) and use it for the rows and in `ListSql.from`, so rows, counts, facets and bulk ids can't
   drift apart. Never build a `ListSql` at module scope: `inTenant()` reads the request.
3. **The plan**, `planList(ordersSql(), query)` (`src/lib/server/lists/plan.ts`): `paged()` for the
   rows, and `count()`, `facets()`, `groupCounts()` and `ids()`, each written once.

Remote queries take `list.query` (the rows) or `list.where` (the filters' counts) as their argument
and answer with the `query` and `queryKey()` they ran, which the table compares with its state
(`isStale()`, `serverTableLoading()`). Bulk commands take ids or the list's where:
`listTarget(list.where)` for a list (and `list: ordersSql` to `bulkChange()`), `idsTarget` for a
client-side table. A new column is one edit in the definition, one in `ListSql` and one in the
table's columns (`columns.spec.ts` checks the table against `list.urlSpec`).

## Database schema

The schema is `src/lib/server/db/schema.ts`; the database gets it through the migrations in
`drizzle/`, never `drizzle-kit push`. After changing the schema, run
`pnpm db:generate --name <what-changed>` (e.g. `add-invoice-reference`), check the SQL it wrote,
and commit it with the change; `pnpm db:migrate` applies it to `local.db` (`pnpm db:reset` starts
over from the migrations and the seed). `src/lib/server/db/migrations.spec.ts` fails while the
schema has changes no migration makes. Never edit a migration that's been committed: add another.

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
- An order's lines are logged by `saveOrderLines()` (`src/lib/orders/server/lines.ts`); stock that
  follows an order's status needs no entry of its own beyond the status change.

## Translations

The app is in English (the base locale) and Dutch, with Paraglide JS 2. The language comes from the
`PARAGLIDE_LOCALE` cookie (the language switchers set it and reload), else the browser's language,
else English; on the server `paraglideMiddleware` (`hooks.server.ts`) sets it per request, also for
remote functions. Every user-facing text goes through a message; nothing English is hard-coded.

- **Files**: `messages/<locale>/<section>.json`, one per section (`common`, `enum`, `validation`,
  `auth`, `dashboard`, `orders`, `customers`, `equipment`, `engineers`, `materials`,
  `settings`, `portal`, `activity`), each listed in `project.inlang/settings.json`. A new file goes
  in every locale folder and in that list. A module's sections are in its own folder
  (`src/modules/contracts/messages/<locale>/contracts.json`, `schedule.json` of the schedule, and
  `invoices.json` of the invoicing module: the section's name is the key prefix, not the module's
  id), which the generator lists.
- **Keys**: `<section>_<what>` in snake_case, e.g. `orders_title`, `orders_column_customer`,
  `orders_delete_refused`; shared UI is `common_*`. Add each key to `en` and `nl` together:
  `src/lib/i18n/messages.spec.ts` fails on a missing key, a key without its section prefix, or
  variables that differ between languages.
- **Using them**: `m.orders_title()` (auto-imported in `.svelte`; in `.ts`,
  `import { m } from "#lib/paraglide/messages.js"`). Variables: `"Delete {name}?"` →
  `m.customers_delete_title({ name })`; pass numbers as `formatNumber(n)` unless they're a plural's
  `count`. Plurals are variant messages on `count`, shown as `{countText}` (formatted), e.g.
  `"common_count_orders"` in `messages/en/common.json`; copy its shape.
- **Not at module scope**: a message, label or format call in a `.ts` module's top level (or a
  `<script module>`) runs once, so the server would render every request in the language of the
  first. Pass the message function where it's read later: column labels
  (`meta: { label: m.orders_column_customer }`), validation messages, `NumberCell`'s
  `format: m.common_count_units`. In component scripts, templates, `$derived` and function bodies
  (including remote functions) call it.
- **Enum values** (statuses, types, units, roles, …) are shown with `label("orderStatus", value)`
  from `#lib/i18n/labels.ts`, options with `labelOptions(kind, values, details?)` and display maps
  with `withLabels(kind, details)` (their `label` is a getter, read when shown). The texts are in
  `enum.json`; a new enum gets a kind there.
- **Validation**: valibot messages are message functions, e.g. `v.nonEmpty(m.orders_description_required)`
  or `(issue) => m.orders_quantity_max({ max: issue.requirement })`, so they're translated where the
  validation runs. The helpers in `#lib/schema.ts` take a `Message` and default to
  `validation.json`.
- **Server refusals**: `error(404, m.orders_not_found())`, `invalid(m.orders_delete_refused())` in
  the remote function's body, so they're in the request's language. Shared ones are
  `common_error_*` (`requireMember()` and friends use them).
- **Formatting**: money, dates, times and numbers only through `#lib/i18n/format.ts` (`formatCents`,
  `formatDate`, `formatDateTime`, `formatTime`, `formatNumber`; `dateFormatter(options)` and
  `numberFormatter(options)` for other formats, safe at module scope), never `new Intl.*("en-GB")`
  or `toLocaleString()`. Number and date inputs stay `type="number"`/`"date"`: the browser shows
  them in its own language and submits a dot and `yyyy-mm-dd`.
- **Stored text** (e.g. an invoice line's description) is in the language of whoever made it; store
  values and translate when showing where you can.
- **Dutch**: informal (`je`, never `u`), short, sentence case like the English. Terms: order →
  opdracht, schedule → planning, customer → klant, equipment → apparatuur (a unit → apparaat),
  engineer → monteur, engineer portal → monteursportaal, material → materiaal, stock → voorraad,
  service contract → servicecontract, response time → reactietijd, invoice → factuur, invoicing →
  facturatie, draft → concept, quote → offerte, VAT → btw, labour → arbeid, due date → vervaldatum,
  serial number → serienummer, manufacturer → fabrikant, warranty → garantie, organization →
  organisatie, member → lid, settings → instellingen, sign in/out → inloggen/afmelden, save →
  opslaan, cancel → annuleren, delete → verwijderen, edit → bewerken.
- **Tests** run in English: e2e browsers use `BROWSER_LOCALE` (pass it to every new browser
  context), so e2e and component tests keep asserting English texts; `e2e/i18n.test.ts` covers
  Dutch. Unit tests check Dutch output with the `locale` argument of the format helpers, or
  `overwriteGetLocale(() => "nl")` (see `src/lib/i18n/labels.spec.ts`).

## Tests

`pnpm test` runs everything: unit tests (`*.spec.ts` next to the code, in Node; `*.svelte.spec.ts`
in the browser) and the end-to-end tests in `e2e/`, which drive a production build of the app in
Chromium, one server and fresh, seeded database per test worker (see the Testing section of
README.md).

- A change to a section's behaviour gets an e2e test in that section's file
  (`e2e/<section>.test.ts`, or `e2e/<section>.<aspect>.test.ts` where a long section is split by
  aspect, e.g. `orders.bulk.test.ts`, `orders.tenancy.test.ts`; shared helpers go in
  `e2e/<section>-helpers.ts`), written like the existing ones: tests are sequential steps sharing
  one signed-in page from `useApp()`, changes go through the UI, checks read the database with
  `rows()`/`value()`. Split a file by its independent `describe` blocks when it passes a few
  hundred lines: the longest file sets the e2e wall-clock time. A module's e2e tests are in its
  own folder (`src/modules/<id>/e2e/<section>.test.ts` and `<section>.<aspect>.test.ts`, with the
  helpers they share in `helpers.ts`, importing `#e2e/app.ts`) and cover a tenant that
  has the module, one that hasn't (its pages and endpoints are 404s, the sidebar lacks it, the
  slots are empty, its remote queries are refused) and tenant isolation.
- Tenant isolation is part of every section's tests: South can't see or change North's records,
  including by tampering with hidden ids (`app.expectingErrors`).
- Pure helpers (validation, formatting, domain rules, form schemas, table columns) get unit tests
  next to them (`*.spec.ts`).
- Shared components get component tests next to them (`*.svelte.spec.ts`, rendered with
  `vitest-browser-svelte`). A component that needs a parent (a table, the theme provider) gets a
  `*.test-harness.svelte`; form fields take fakes of remote form fields from
  `src/lib/components/form/fake-form.ts`; remote functions are replaced with `vi.mock`.
- Test files run in parallel, each worker against its own database; within a file, tests run in
  order. A file may change data (through the UI), but must not rely on another file's changes, nor
  break when another file ran before it on the same worker (so a test that needs the seeded state
  stays in a file before the tests that change it, or reads what it needs from the database).
- Only run one e2e run at a time: each run builds into `.svelte-kit/output`.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
