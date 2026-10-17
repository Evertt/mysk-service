# Modules and extension points

Read before you add or change a module (`src/modules/<id>/`), an extension point (hook, slot, form slot, bulk action, list column), or a module's seed, routes or tests.

## Extension points

- An optional module's tables reference core tables, never the reverse; core sections don't know
  about modules. A module adds to core pages through slots (components that load their own data
  with the module's remote functions; `<ExtensionSlot>`, `src/lib/extensions/extension-slot.svelte`,
  renders each in a boundary of its own, so one that fails shows a notice instead of breaking the
  page), bulk actions on tables' selections and columns in server-side lists, and to its owners'
  server logic through hooks; all only take part for tenants that have the module.
  A hook is an extension point its owner declares (`#lib/extensions/define.ts`): core's in
  `src/lib/<domain>/extensions.ts` (`orders.costs`, `orders.adjustPrices`, `orders.tag`,
  `orders.committed`, `orders.saving`, `orders.units` in `src/lib/orders/extensions.ts`), a module's in its
  `api/extensions.ts`
  (`invoices.billableItems`). A module contributes in its `server/index.ts`:
  `defineServerModule(id, [contribute(adjustPrices, …), …])`, with the point imported from its
  owner. The owner calls it through the kernel (`src/lib/server/extensions.ts`), for the modules
  that are on, in registry order: `collect()` for a collector (asked in parallel about a batch;
  the point's `onError` says whether an error fails the request, `fail`, or is logged and left
  out, `skip`), `collectNow()` for an immediate collector (`defineCollector(id, { onError, now:
true })`, whose contributors answer at once, without awaiting: for an owner that can't wait, like
  a list column's SQL; the condition module's `condition.signals`), `emit()` for an event after commit (via `afterCommit()` in
  `src/lib/server/db/serialize.ts`; errors are logged, not thrown), `vote()` for a vote (any
  refusal wins) and `save()` for a save hook (each module saves its part in the owner's
  transaction, which the input carries, one after another; the first that answers problems stops
  the rest, and the owner refuses the change, rolling the transaction back). Each point has one
  caller in its owner's domain (`priceOrders()`, `tagOrders()`, `orderCommitted()`,
  `saveOrderParts()` and `saveUnitParts()` in `src/lib/orders/server/`, `offeredItems()` in
  invoices' `server/billable.ts`); a new extension point is added when a module needs it.
  Anything that shows or adds up order totals prices them with `priceOrders()`
  (`src/lib/orders/server/pricing.ts`): labour, the costs the modules add (`orders.costs`, e.g.
  materials, with what they're made of when asked for `items`) and their adjustments.
  Every change to an order's status, its form's save and its deletion goes through
  `saveOrderParts()` (`orders.saving`), which throws an `OrderRefused` with the problems of a module
  that refuses (e.g. a shortage of stock; its problems are Standard Schema issues, `{ message,
path? }` from the form's root, which the form passes to `invalid()` as they are); the caller
  shows them on the form's fields or as a message. An order's units are set only by
  `setOrderUnits()` (`src/lib/orders/server/units.ts`, from `createOrders()` and the order form):
  the units it keeps keep their rows, and the modules save their part (`orders.units`,
  `saveUnitParts()`) once the new units are in and before the ones it loses go, so a module's rows
  about an order's unit (a checklist, which refers to `order_unit`) can follow, or refuse a unit's
  removal (an `OrderRefused`, about the form's units unless its problem says otherwise).
- **Daily jobs** (`jobs.daily`, a `skip` collector in `src/lib/jobs/extensions.ts`): what a
  module does by itself once a day. `runDaily()` (`src/lib/server/jobs/daily.ts`) asks each
  organization's modules that are on, one organization after another, inside one request to
  `/_ops/daily` (a cron's, with `CRON_SECRET` or `OPS_TOKEN`; on Cloudflare the Worker's Cron
  Trigger, `scheduled()` in `cloudflare/entry.ts`, makes it inside the Durable Object). Each runs as
  the system (`asSystem(tenant, work)`, `src/lib/server/auth/system.ts`): `requireTenant()`,
  `inTenant()`, `currentTenant()`, `collect()`, `createOrders()` and `recordActivity()` work as in
  a member's request, and the log stores no user (shown as "Fieldworks (automatic)"). A job must be
  safe to repeat, makes its changes in transactions of its own, keeps mail out of them, and
  answers counts for the run's report (`{ "maintenance.orders": 3 }`). Maintenance's
  `server/automatic.ts` is the example.
- **Simulations for demos** (`simulation.run`, a `fail` collector in
  `src/lib/simulation/extensions.ts`): a module fed from outside makes its data up for an
  organization with a `simulation` row for it (the seed gives SHLTR its docks' and energy's; real
  tenants never have one). It contributes `contribute(simulationRun, simulated({ tick, reset }))`:
  `tick({ from, to, speed })` moves its data on over that interval of real time (the clock stays
  the real one; `speed`, 1× to 30×, makes more happen in it), through the module's own ingest path
  as a real feed would; `reset()` puts its data back in the demo's starting states. Both run as
  the system in the tenant. `runSimulations()` (`src/lib/server/simulation.ts`) ticks every
  running row over `(last_tick_at, now]`, at most 10 minutes of it, claiming the interval in a
  transaction first so overlapping callers never tick it twice; it's called by `POST /_ops/tick`
  (authorized like `/_ops/daily`), on Cloudflare the Worker's minute Cron Trigger, and the
  `<SimulationBar module="…">` (`src/lib/components/simulation/`) every 5 s while a page with a
  running simulation is open. The bar's remote functions (`simulation.remote.ts`): the state, live,
  for members (`null` without a row); play, pause, speed and reset for managers (a 404 without a
  row), logged on the subject `simulation`. The e2e tests start with the simulations paused
  (`global-setup.ts`), so the seeded states hold. The docks' `server/simulation.ts` is the example.
- **Form slots** (`defineFormSlot()`, e.g. the order form's `orders.form`) take a module's inputs
  into a core form. The module gives, besides its components at `slots/<point id>/`, the valibot
  object schema of its part as the default export of `form-parts/<point id>.ts`; the generator
  lists the schemas in `src/lib/extensions/form-parts.gen.ts`, and the form makes its `modules`
  field from them with `formPartsSchema("orders.form")` (`#lib/extensions/form-parts.ts`): each
  module's part optional, under `modules.<id>` (in camel case, `formPartKey()`: SvelteKit refuses
  field names that need quoting, so `partner-programme`'s is `modules.partnerProgramme`), static
  and exactly typed. So SvelteKit validates
  the parts with the form on the server, and the browser before submitting (the order form's
  `preflight(preflightParts(schema))`, which reports only the parts' issues). A component gets its
  part's fields as `fields: FormPartFields<typeof part>` (no cast), and the type check holds it to
  its schema (`formSlotContribution()` in `contributions.gen.ts`); `<ExtensionSlot>` takes the
  form's `modules` fields as `fields` and hands each module its part. The handler refuses a part
  of a module the tenant doesn't have (`refuseOffParts()`, `src/lib/server/forms.ts`), and the save
  hook gets the parts parsed and typed (`OrderSaving.form`); whether a module's part is required
  is the module's call there (materials takes an absent part as no lines). What the schema can't
  check (a material of the tenant's, stock) the save hook refuses.

## Modules

Optional modules (things a tenant can switch off) are folders `src/modules/<id>/`, each
self-contained: `module.ts` (its manifest, `defineModule()` from `#lib/modules/define.ts`: label,
description, `route`, icon, `nav`, `subjects`, `actions`, and `settings`, the route of the page
where it's set up, which its card on the settings page links to while it's on; it is in every tenant's
bundle, so it imports only messages, icons, types, `import()` loaders and its own small scripts),
`server/` (`index.ts` with `defineServerModule()`, `schema.ts`, `seed.ts` with `defineSeed()`, its
columns' SQL in `columns/`, its logic; server-only), `routes/` (its pages, in route groups, under
the module's own URL, `/<id>`: `+` files only), its components
in folders by feature like a core domain's (`ui/` for links and badges, `list/`, `form/`, `detail/`,
or a feature's own, e.g. the schedule's `board/`), `messages/<locale>/<section>.json` and
`tests/` (below). Its model, labels, display maps, domain rules and activity subjects stay at the
root: `module.ts` may only import its own files from the root (`./activity.ts`), and they need
each other. A remote file sits in a feature's folder when only that feature and its page use it
(invoices' `detail/draft.remote.ts`), else at the root next to `remote-functions.ts` (the
record's own, and those that several folders, slots, bulk actions or server hooks share; `slots/`,
`bulk-actions/` and `columns/` hold only their contributions). The folder name is the id
(`^[a-z][a-z0-9-]*$`), and is stored (`organization_module.module_id`, the activity log's
`module` subjects): renaming a module takes a migration that renames those
(`drizzle/0008_rename-invoicing-module.sql`). A module with tables also needs `pnpm db:generate --name add-<id>` and its
migration committed.

- `scripts/modules.ts` (its parts, each with a spec, are in `scripts/modules/`) links the folders in;
  `pnpm generate` runs it before `svelte-kit sync`, `vite.config.ts` runs it when it loads, and in
  dev it reruns when a module's files come or go. It writes the registries (`src/lib/modules/manifests.gen.ts`,
  `ids.gen.ts`, `src/lib/server/modules/hooks.gen.ts`,
  `src/lib/server/db/modules.gen.ts`, `module-schemas.gen.ts`, `module-seeds.gen.ts`,
  `src/lib/extensions/contributions.gen.ts`, `form-parts.gen.ts` and `src/lib/server/lists/columns.gen.ts`; gitignored), the route stubs (below)
  and the module entries of `pathPattern` in `project.inlang/settings.json`. It fails, listing
  everything wrong, when a module with routes has the id of a core route's first segment, a route
  file is outside a route group, a skeleton is of no page, a `(modules)` folder holds a file it
  didn't write, or message sections are missing in a language or not unique.
- **Dependencies**: `module.ts` may list `requires` (modules it can't work without) and `enhances`
  (modules it only adds to when they're on) as string-literal arrays, and `alwaysOn: true`; the
  generator reads them with a pattern, and `manifests.spec.ts` compares them with the runtime
  values. A module whose requirement is off is off everywhere (`effectiveModules()` in
  `loadTenant()`), and the registries (hooks, slots, bulk actions, seeds) run in dependency order.
  The settings page switches a module on together with its requirements and off together with its
  dependents (`setModules`, `changeModules()` in `#lib/modules/graph.ts`), and refuses a change
  that would turn off a module that's on (or being switched on) for want of a requirement; a stored
  module that's off already (a stale row) blocks nothing.
- **The sidebar**: a module's entry is in the sidebar's Modules group, unless its manifest says
  `nav: { after: "orders" }` (a core entry's id from `coreNavIds` in `#lib/modules/nav.ts`, or
  another module's id; a literal, read by the generator like `requires`): then it goes right after
  that entry (`placeNav()`), or in the Modules group while that entry isn't shown.
- **Routes under the module's id**: a module's `routes/` holds route groups only (`(app)`; a `+`
  file directly in `routes/` or a top-level folder that isn't a group is refused), and what's in a
  group is under the module's own route folder, which is its id, implied rather than written:
  `routes/<groups…>/<rest>` is the route `<groups…>/(modules)/<id>/<rest>`. So the contracts
  module's `routes/(app)/+page.svelte` is its list at `/contracts`, and
  `routes/(app)/[number]/+page.svelte` a contract's page at `/contracts/<number>`. The leading
  groups are all the leading segments in parentheses; a group further down is inside the module's
  folder. Two modules can't collide, and a module with routes can't have the id of a core route's
  first segment (`orders`, `login`).
- **Route stubs**: every `+` file of a module's `routes/` gets a stub in `src/routes`, in its
  module's folder in a `(modules)` group inside the file's leading groups: contracts'
  `routes/(app)/[number]/+page.svelte` → `src/routes/(app)/(modules)/contracts/[number]/+page.svelte`.
  They are real routes (`RouteId`, `resolve()`, the `(app)` layout, endpoints, SvelteKit's
  server-only guard), the URL is `/contracts/…`, and the core's route folders hold only core
  files. Every `(modules)` folder
  is the generator's (gitignored; it deletes and rewrites them), so never edit one, and core never
  uses the name.
- **Integration endpoints** (`routes/(api)/…/+server.ts`, e.g. the docks' `routes/(api)/ingest/+server.ts`
  at `/docks/ingest`): for systems outside the app, which post with a token of the module's
  (`Authorization: Bearer …`) instead of a session. The `(api)` group holds `+server.ts` files only
  (the generator refuses anything else there), `hooks.server.ts` lets requests to `/(api)/` route
  ids through without signing in, and their stubs guard each handler with `guardedIntegration()`
  (`#lib/server/modules/hooks.ts`): a missing, unknown or revoked token is a 401, a tenant without
  the module a 404, and the handler runs as the system in the token's tenant (`asSystem()`), so
  `inTenant()`, transactions and `recordActivity()` work as in a member's request. Tokens are the
  core's `integration_token` rows (hash only), made and revoked through
  `#lib/server/auth/integrations.ts` (`issueIntegrationToken()`, `revokeIntegrationToken()`,
  `integrationTokens()`) from the module's manager-only remote functions; a seed gives its demo
  tenant a known one with `seedIntegrationToken()` (`src/lib/server/db/seed/integrations.ts`).
- **Route ids include the group**: a module names its routes `/(app)/(modules)/contracts/[number]`
  everywhere a route id goes: `resolve()`, `RouteParams<…>`, the manifest's `route`, its activity
  subjects' `href`s.
- **The guard**: each `(modules)` group's generated `+layout.ts` 404s the tenants without the
  module that owns the route (`guardModuleRoute()` in `#lib/modules/route-guard.ts`: the module is
  the folder after `(modules)` in the route id, so the layout names no modules; it asks
  `getTenantModules`), so they get the app's own 404 page inside the app layout. It is a universal
  load, so a client-side navigation to a module's page asks the server for no `__data.json` (a
  cached query instead); on a direct visit it runs on the server, during SSR. It only keeps the
  pages away: the data is guarded on the server, by the module's remote functions (`moduleRemote()`)
  and by the stub of each server file (`+page.server.ts`, `+layout.server.ts`, `+server.ts`), which
  guards its `load`, `actions` and request handlers (`GET`, `POST`, …) before running the module's
  (`guarded()`, `guardedActions()`), since Kit runs those without the universal layout's load. A
  server load in a module's routes brings the `__data.json` round trip back, so prefer remote
  queries.
- **Slots, bulk actions and list columns are contributed by file**: a component at a slot is
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
  `extensionBulkActions(list)` (`src/lib/extensions/bulk-actions.svelte.ts`), which its action bar
  also offers in each row's menu, for that row alone (an action that makes no sense for one row
  says `row: false`; see `#lib/components/data-table/bulk-actions.ts`); both show only
  the contributions of the modules the tenant has, in registry order, and key a contribution by its
  id (`<module>/<point id>/<name>`). At a form slot, a module's components come with its part's
  schema, `form-parts/<point id>.ts` (the generator refuses either without the other; see "Extension points" above), and the page passes the form's fields:
  `<ExtensionSlot point={form} props={{ order }} {fields} />`.
- **Skeletons**: while a navigation waits for the next page's data, the office shows a skeleton of
  it, guessed from its route (`pageShape()` in `src/routes/(app)/page-skeleton.ts`: list, details,
  form). A module page that looks otherwise gets its own: `src/modules/<id>/skeletons/<path>/page.svelte`
  mirrors `routes/<path>/+page.svelte` (the schedule's `skeletons/(app)/page.svelte` is the one of
  its `routes/(app)/+page.svelte`, at `/schedule`; a contract's page would have
  `skeletons/(app)/[number]/page.svelte`). The
  generator lists a loader for each in `src/lib/modules/skeletons.gen.ts`
  (`load: () => import(…)`), and the office layout loads its tenant's after it mounts
  (`loadModuleSkeletons()`, in `onMount`) into a plain `Map` that `PageSkeleton` reads.
  So a tenant downloads only its modules' skeletons, and only once the office is open; until one is
  in, its page gets the guessed outline. Known issue (Svelte 5.57): in a dev build, a skeleton that
  arrives while a navigation is pending (a click within a split second of signing in) trips Svelte's
  dev-only "Batch has scheduled effects" invariant, whose throw froze the page;
  `patches/svelte@5.57.1.patch` makes it a console warning, and production builds skip the check.
  An opt-in e2e test reproduces it (`REPRO_SKELETONS=1 REPRO_CPU_RATE=1 pnpm vp test run --project
e2e src/tests/e2e/skeletons.repro.test.ts`; it counts page errors, and the race needs a dev build:
  retest without the patch after upgrading Svelte). To feel a slow database by hand,
  `DEV_REMOTE_DELAY_MS=<ms> pnpm dev` holds up each remote function call (`delayRemoteCalls` in
  `src/hooks.server.ts`).
- **The customer portal** (`src/routes/(customer)/portal`, for customers' contacts, see
  `docs/agents/tenancy.md`): a module adds to its pages through the slots in
  `src/lib/client/extensions.ts`, `client.home` (the home page, after the open orders: the condition
  module's units needing attention), `client.order` (`{ number }`, an order's page: checklists'
  results and the work order to print) and `client.unit` (`{ serialNumber }`, a unit's page: its
  inspection status). Their components read through the module's set for customers,
  `moduleRemote(id, "customer")`, whose handlers scope every query with `currentCustomer()` and the
  helpers of `#lib/server/auth/customer.ts` (checklists' and condition's `client/` folders are the
  examples). A module's own pages in the portal are its routes in the `(customer)` group:
  `routes/(customer)/<rest>` is the route `/(customer)/(modules)/<id>/<rest>`, at `/<id>/<rest>`, in
  the portal's shell and guarded like any module route (checklists'
  `routes/(customer)/portal/work-orders/[number]`, the printable work order; mind that a path that
  is also one of the module's `(app)` routes collides). Its manifest's `portal: { route, label,
icon }` puts one of them in the portal's navigation, after the portal's own entries, for the
  tenants that have the module: that's where the partner programme's bonus and wallet and a parts
  shop are (`/partner-programme/portal`, `/parts-shop/portal`). Use remote queries there: a module's server files (`+page.server.ts`, endpoints) are
  guarded by `requireModule()`, which refuses customers' contacts.
- **A slot owned by a module**: a module declares its points in its `api/extensions.ts` and renders
  them like core does: contracts declares `contracts.detail.side` (props
  `{ number: string; equipmentIds: number[] }`) and its contract page renders
  `<ExtensionSlot>` (`#lib/extensions/extension-slot.svelte`, which a module's page imports like a
  core page). Maintenance, which `enhances` contracts, contributes
  `slots/contracts.detail.side/plans.svelte`: it may import only contracts' `api/extensions.ts`, so
  it gets the covered units from the props (and checks them in its own queries), never from
  contracts' tables. A point of a module that's off has no contributions shown (its page is gone).
- **Columns in a core list** (`#lib/components/data-table/module-columns.ts`): a list that takes
  them names its point in its definition (`docs/agents/lists.md`), e.g. `listColumns =
defineListColumns("equipment.list")` in `#lib/equipment/extensions.ts`. A module contributes two
  files per list, which the generator requires together and checks like the others (point, kind,
  owner): `columns/<point id>.ts`, default export an array of `listColumn({ id, param, label, sort,
filter, optionLabel, cell })` (isomorphic; the id is namespaced, `maintenance.nextDue`; the cell
  takes `{ value }`), listed in `contributions.gen.ts` and loaded per tenant
  (`loadListColumns(point)`, `#lib/extensions/list-columns.ts`); and `server/columns/<point id>.ts`,
  default export an array of `columnSql(column, () => ({ value, sort, nullsLast, filter, facet }))`
  (`#lib/server/lists/column-sql.ts`; built per request, typed by the column it imports), listed in
  the server's `columns.gen.ts`. The merge is per tenant: the page merges the tenant's columns into
  the list (`extendList()`) before it reads the URL, and the server merges their SQL
  (`withModuleColumns()`) and checks the query against the merged list, so a tenant without the
  module gets neither the column nor its URL parameter, and a query naming it is a 400. Core's list
  types stay exact: the merged list has the list's own type, and a module column is typed where it's
  contributed. Sorting and set filters only (no grouping); see `docs/plans/maintenance-plans-implementation.md`.
- A module's `routes/` holds route files (`+` files) only; everything they use is in the module's own
  folders (`list/`, `form/`, `detail/`, `server/`, the root) and imported as `#modules/<id>/…`.
  A module's routes are under its own id (`routes/(app)/…` is `/contracts/…`); it never adds files
  to a core route. To add something to a core page, use a slot. Its pages type their params
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
  `src/tests/unit/modules/boundaries.spec.ts` checks. A module's tables reference core tables (composite tenant keys, columns from
  `#lib/server/db/columns.ts`) and the tables of the modules it `requires` in its `module.ts`,
  never the reverse; one migration stream in `drizzle/`, and `src/tests/unit/lib/server/db/modules.spec.ts`
  checks that no core table has a foreign key to a module table, and that a module's tables
  reference only core tables and those of modules it requires (`module-schemas.gen.ts` lists each
  module's schema for it). A module's tests are in its `tests/` folder, `tests/unit/` and `tests/e2e/`
  (`docs/agents/tests.md`); the generator and the boundary specs treat what is in it as tests, not as the module's code.
- **The `api/` folder**: what a module offers the modules that depend on it (its types, queries and
  services, and its extension points in `api/extensions.ts`, like invoices') is in `src/modules/<id>/api/`, and nothing else of
  it is public. A module imports another's files only as `#modules/<other>/api/…`, and only if it
  lists `<other>` in `requires`; for a module it only `enhances` it may import `api/extensions.ts`
  (the points its enhancements plug into) and types. `src/tests/unit/modules/boundaries.spec.ts` checks it (`apiImports`)
  with the graph from the manifests, so a module that needs another says so first.
- **Read tables, write through services**: a module may read any table it can import (a join to
  `order`), but changes only its own: `.insert()`, `.update()` and `.delete()` take its own
  tables (`foreignWrites` in `src/tests/unit/modules/boundaries.spec.ts`). A change to the core's records goes through the
  service the core offers, which holds the rules and the activity log entry, e.g.
  `setOrdersStatus()` (`src/lib/orders/server/order-changes.ts`), which the invoices module uses to mark an
  invoice's orders invoiced and completed again, `scheduleOrder(tx, plan)`
  (`src/lib/orders/server/scheduling.ts`), through which the schedule plans orders, and
  `createOrders(tx, drafts)` (`src/lib/orders/server/creation.ts`), through which maintenance turns
  due plans into orders. A module's own `api/` offers such services to the
  modules that require it.

Checklists, condition, contracts, docks, energy, invoices, maintenance, materials, the partner programme, the parts shop and the schedule are the modules
(`src/modules/checklists/`, `src/modules/condition/`, `src/modules/contracts/`, `src/modules/docks/`, `src/modules/energy/`, `src/modules/invoices/`,
`src/modules/maintenance/`, `src/modules/materials/`, `src/modules/schedule/`: look there for an
example of each part; the registries list them by id). Checklists holds the tenant's inspection
templates (points in groups, the equipment categories each is for) and the checklists on
inspection and maintenance orders, one per unit (`orders.units`, `orders.saving`), filled in on the
engineer portal (`portal.order`), shown on an order's and a unit's page, printed as the work order,
and a unit's inspection status in the equipment list (`server/checklists.ts`, `server/field.ts`).
The schedule is the one without tables of its own: a view of the
orders, which changes them through a core service and owns only its route, components and messages.
Maintenance (plans per unit, turned into orders) was the first built from scratch: look there for a
module's own server-side list with a bulk action (`list/due-list.ts`, `server/list-sql.ts`), a column
in a core list (`columns/`, `server/columns/`), a contribution to another module's slot
(`slots/contracts.detail.side/`) and records created through a core service (`server/orders.ts`).
Materials was core until it became a module: look there for a module whose tables core used to own
(order lines and the stock ledger), a cost in orders' prices (`orders.costs`), a part of the order
form, typed and validated by its schema and saved in its transaction (`slots/orders.form/`,
`form-parts/orders.form.ts`, `orders.saving`), stat cards on the dashboard
(`dashboard.stats`), a card on the engineer portal's order page (`portal.order`, with
`moduleRemote(id, "engineer")`), and seed steps in the middle of the core's generation (`during`).
The partner programme (`src/modules/partner-programme/`, SHLTR's Partner Bonus and wallet) requires
invoices: look there for a module that reads another's data through its `api/` (invoices'
`api/revenue.server.ts`, the paid invoices' lines less the settled credit notes', also as a
subquery for its own server-side list), changes it through its services (`api/credit-notes.server.ts`:
a cash bonus paid out as a standalone credit note, in the programme's transaction), refers to its
table with a foreign key (`api/schema.server.ts`) and seeds with its help (`api/seed.ts`),
a card on the customer's page (`customers.detail.side`), figures computed from the pure rules in
`model.ts` and frozen when a year closes, a ledger whose balance is its entries' sum, and a
hyphenated id's part of the order form (`modules.partnerProgramme`).
Condition (SHLTR Connect, "Onderdelenbeheer") keeps each unit's condition over time, and its
components' (`unit_condition`, `component`, `component_checkpoint`), and works out their status in
SQL (`server/status-sql.ts`, and `rolledUpStatus()`/`componentStatus()` in `model.ts` for the same
rules in code; a unit takes its worst component's): look there for a module that owns points other
modules answer (`api/extensions.ts`: checklists gives the inspection status, maintenance the next
visit, as SQL over `equipment`, `condition.signals`; checklists its completed checklists for the
service history, `condition.history`, and a unit's template points, `condition.checkpoints`;
materials the articles, `condition.articles`; the parts shop the points an article's product fixes,
`condition.articleCheckpoints`), for records that refer to another module's by id without a key (a
component's article and points, as it only enhances materials and checklists), for SQL repeated in
one statement that binds no parameters (`literal()`, `inLiterals()` in
`#lib/server/db/parameters.ts`, and subqueries correlated on the unit's own tenant), for a
server-side list whose rows are a left join (a row per component, and per unit without), and for a
contribution to a slot and a save hook of a module it enhances (the advice below a completed
checklist in the portal, `slots/checklists.field.checklist/`; the scores a completed checklist gives
the unit and its components, `checklists.completed`, with checklists' `checklistScore()`). Its seed
reads the tables of the modules it enhances through the seed's transaction (`tx.query`), and comes
`after` materials (`ModuleSeed.after`). Checklists and condition enhance each other: each adds to
the other where the other is on.
Docks (`src/modules/docks/`, SHLTR's Salvo dock time management) is the one fed from outside: look
there for an integration endpoint with its tokens (`routes/(api)/ingest/+server.ts`, the payload in
its `docs/salvo-events.md`), a live board (`query.live` on changes it announces itself with
`announceChange()`, as telemetry isn't logged), rules that act on time (`server/rules.ts`, after
every batch and in the daily job) and a simulation for the demo (`simulation.run`:
`server/simulation.ts` posts what the pure, stateless `server/scenario.ts` plans through the
feed's own path, `server/feed.ts`; a reset puts the docks in the mockup's states, `server/demo.ts`;
`scripts/docks-simulator.ts` still feeds a dev server from outside). Its board is drawn
(`board/dock-drawing.svelte`, an SVG whose door, beacon, truck and Wheel-Lok follow the live state).
Energy (`src/modules/energy/`, SHLTR's Energie module: a customer site's zones, consumers and
monitored doors) is fed from outside too, with aggregates per zone per 15 minutes rather than
events (`routes/(api)/ingest/+server.ts`, the format in its `docs/ingest.md`, checked by
`ingest/format.ts`): look there for a batch stored idempotently in one transaction with
`insertRows()` (a resent interval replaces its row, `server/ingest.ts`), alerts deduplicated by a
key and raised as the system (`server/evaluate.ts`), figures aggregated in SQL per period and
worked out with the pure rules of `model.ts` (`server/figures.ts`), an alert made into an order
through `createOrders()` (`server/alerts.ts`), a printable report (print CSS), a read-only page in
the customer portal (`routes/(customer)/portal/`, `client/`), a seam for a module that enhances
it (`api/extensions.ts`, `energy.door`), a simulator that shares the seed's simulation
(`node src/modules/energy/server/simulator.ts`) and a module's part in the demo's simulation
(`simulation.run`, `server/live-simulation.ts`: each tick posts the intervals since the latest
reading and the doors' events through the module's own ingest, `parseBatch()` and `storeBatch()`,
as a gateway would; reset posts the seed's yesterday and today again). Its site page is the
mockup's: a page banner (`#lib/components/hero-banner.svelte`, generic), the floor plan with the
live meter, door cards with the animated door, and the chart with what's still to measure
(`overview/`); the selection (`?scope=`) is a link that keeps the scroll position
(`data-sveltekit-reset="false"`), and the zone pages are linked from it. Managers set a site up in the office
(`server/setup.ts`, `setup/`, the page `/energy/<site>/setup`): an energy site for one of a
customer's sites, from the customer page's card (`customers.detail.side`) or the sites page, and
its zones, consumers and doors (zone and door codes unique per site, as the gateway names them; a
consumer's or door's unit one of the site's). Measurements aren't deleted with what they measure:
a zone, door or site with readings, door events or alerts can't be deleted (the refusal says so;
there's no archive). A new zone has no thresholds until a manager sets them or its first day of
readings gives it §2.5's defaults, as a nominal zone, in the batch's transaction
(`firstDayThreshold()` in `model.ts`, `server/thresholds.ts`). Docks enhances energy: its
`slots/energy.door/` shows the dock whose door the door's unit is (state, Wheel-Lok, plate, live
through `watchDocks`), linking to the board. Only SHLTR has docks, energy and the parts shop in
the demo (`shltrOnly` in the seed).
The parts shop (`src/modules/parts-shop/`, SHLTR's Onderdelen Shop) requires materials and the
partner programme and enhances checklists (which enhances it back): look there for a module that
writes another's records only through the services in its `api/` (the programme's
`api/wallet.server.ts`: `spendCredit()` and `giveBackCredit()`; materials' `api/stock.server.ts`:
`reserveStock()` and `releaseStock()`, and `api/lines.server.ts`: `addOrderLine()`), all in one
transaction with its own order (`server/orders.ts`), refers to their tables from its own through
their `api/tables.server.ts` (free of SvelteKit, for the seed), owns a collector another module
answers (`parts-shop.checkpoints`, the checklist points its products fix, by id without a key),
fills slots of a module it requires and of one it enhances (`partner-programme.client.wallet`,
`checklists.order.rejected`, `checklists.client.rejected`), has pages in both the office and the
customer portal, and seeds data that changes another module's draft (the programme's spends that
are its orders, `orderSpends`, and the materials' reservations, `movements`).
Extension points are added with the first module that needs them. Not there yet: several `nav`
entries per module, grouping by a module's column, module columns in other lists than equipment's,
module filters and row actions in tables, an `orders.created` event, `order.actions`-style slots,
slot options (order, roles), `settings.cards`, and a save hook for other records than orders.

- A module's seed has two steps (`src/lib/server/db/seed/module-seed.ts`), and may have steps
  `during` the core's generation (after the equipment, after the orders), with the tenant's faker
  there, for data the core used to make in the middle of its own (materials' catalog and lines):
  that keeps the demo data the same. `generate()` makes its
  data for a tenant right after the core's, with the same faker (so the demo data doesn't change
  with where the module's code lives), and may add to the core's draft (contracts adds call-out
  orders); `run()` inserts it. A module that adds nothing to the draft may draw from a faker of its
  own instead, seeded per tenant (`tenant.seed`), so the others' data can't change with it
  (invoices, maintenance). The draft's `profile` says whose business the demo tenant is
  (`fieldworks` for North and South, `shltr` for SHLTR, `src/lib/server/db/seed/shltr/`): a module
  with demo data of its own for SHLTR picks it by that (materials' parts shop, contracts' names).
  What a module does at runtime through hooks it does at seed time
  through collectors (`adjustPrices()`, `billableItems()`), which the seed of whoever consumes it
  asks without knowing the module, from `run()` (a tenant's `collect`), when every module has made
  its data: the invoices module's seed prices orders and bills fees through them.
- The page guard is a layout load that also runs on the server when a page is rendered there, so it
  also answers a form posted without JavaScript from a module's page in an organization without the
  module (the organization switcher on its 404 page, which posts to the page itself): a refused form
  is a 404 there, not its own status. Tests that tamper with such a form start from a page that
  exists.
- A core e2e test of something a module changes (a customer's revenue less what contracts include)
  can't import the module's helpers, and a module's e2e can't import another module's, so
  `src/tests/e2e/contracts-helpers.ts`, which works the contracts' effect on prices and billing out in SQL
  (which contract covers an order, the fees due), stays in the core's `src/tests/e2e/`; the e2e of contracts and
  invoices import it from there. A core test of what a module adds (the invoices module's bulk action on the
  orders list) is that module's e2e test, not the core's.
- Core specs test core with made-up modules (`src/tests/unit/lib/modules/fakes.ts`, mocked in as `manifests.gen.ts`
  or passed to the function as the registry); what a module does is tested in its own folder.
