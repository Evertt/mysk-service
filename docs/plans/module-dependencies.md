# Module dependencies, core as modules, and extension points their owners declare

How the module system grows from "optional add-ons on top of core" to "core features are modules
too": modules that depend on each other, extension points that any module can declare, roles that
come with a module, and the first core features (the schedule and the engineer portal) turned
into switchable modules.

Status: design agreed in October 2026, partly built.

- **Built:** the dependency graph and switching on and off (section 1), the `api/` folders and the
  boundary rules (section 2, except `api/server/`), extension points declared by their owners
  (section 3, except slot options), all in
  [module-dependencies-1-machinery.md](module-dependencies-1-machinery.md); the schedule pilot
  (section 5, [module-dependencies-3-schedule.md](module-dependencies-3-schedule.md)). Materials
  became a module too, which this design didn't plan
  ([module-dependencies-4-materials.md](module-dependencies-4-materials.md)), and maintenance was
  built as a new module on the same machinery.
- **Not built:** roles declared by modules (section 4), the engineer portal as a module (section
  5), the inspector (section 6), slot options (order, roles; section 3), and a module's
  `api/server/` with services and `tables.ts` for its dependents (section 2): no module `requires`
  another yet, and none is `alwaysOn`.

AGENTS.md ("Tenants and modules", "Modules") describes what's built. The sections below say, where
it differs, how it was built.

## Goals and decisions

- **Direction: every feature is switchable except a small kernel.** A tenant composes its product
  from modules (e.g. a service business without inventory, or without field engineers). We get
  there in steps: first some of core becomes switchable, then more, one domain at a time.
- **The kernel** stays out of the module system: auth, tenants, the database, the activity log,
  server-side lists, i18n, the UI kit, the app shell and nav, the settings shell, and the
  extension machinery. Everything else is, eventually, a module.
- **First pilots: the schedule and the engineer portal.** Schedule tests services, nav and
  `requires` without data or roles of its own; the portal adds a role, pages outside the office
  with a layout of their own, tables of its own and a contribution to a core page. The schedule is
  built, with no `requires`: it needs only core. The portal waits for roles. Materials came second
  instead, with tables of its own that core used to read and write.
- **Extract one domain at a time from a built-in core.** Build the machinery first; until a domain
  is extracted it is part of "core", which every module implicitly requires and which declares its
  extension points the same way modules do. Not chosen: turning every domain into a module at
  once (one huge refactor that has to break every cycle before anything is switchable), and pnpm
  workspace packages (SvelteKit can't take routes from packages anyway, and the boundary spec
  enforces the same rules more cheaply).
- **Data: read tables, write through services.** A module may read and join the tables of modules
  it requires; every change to another module's data goes through that module's server functions,
  which keep its rules.
- **Modules declare roles.** Roles are not only the kernel's; a role of a switched-off module
  grants nothing. Not built yet (section 4).

Already done before this design (October 2026): every remote function is made with a gated set
(`#lib/server/remote-functions.ts`, `moduleRemote()` for modules), module routes are generated into
`(modules)` route groups whose stubs guard every server entry point, and the dashboard lives in
`src/routes/(app)/(dashboard)/`.

## The coupling at the start

Imports between the core sections, counted in October 2026, before materials and the schedule
became modules, ran both ways:

| Between            | Imports each way |
| ------------------ | ---------------- |
| customers ↔ orders | 5 / 1            |
| equipment ↔ orders | 5 / 4            |
| materials ↔ orders | 4 / 5            |
| engineers ↔ orders | 3 / 2            |

Plus equipment → customers, engineers, materials, and schedule, the portal and the dashboard →
orders and others. `requires` must be acyclic, so as domains are extracted every reverse direction
becomes a contribution to the other side's extension points (the customer page's orders card
becomes something orders adds to a customers slot), the way contracts adds to the order page.
That is how materials left: its order lines are its part of the order form (`orders.form`), its
costs a collector on orders' prices (`orders.costs`), its stock cards slots on the dashboard
(`dashboard.stats`) and the engineer portal's order page (`portal.order`). Likely layering once
the rest is extracted: customers and engineers at the bottom; equipment on customers; orders on
those three; the portal and the dashboard's cards on orders; contracts, invoices, maintenance,
materials and the schedule on top. The dashboard page itself stays in the kernel, made of slots.

Not every reverse direction has to become a slot. A page stays direct when what it shows belongs
to its own module or one it requires; it gets a slot when the thing shown belongs to a module that
depends on it (or enhances it).

## 1. Dependencies and switching on and off

Built as designed.

**Manifest.** `defineModule()` (`#lib/modules/define.ts`, typed by `ModuleManifest` in
`#lib/modules/manifests.ts`) takes:

- `requires: ModuleId[]`: hard dependencies. The module may import their public API (section 2)
  and reference their tables.
- `enhances: ModuleId[]`: soft. The module contributes to their extension points when both are on,
  and may import only their extension-point declarations and types (contracts enhances invoices
  and materials, maintenance enhances contracts).
- `alwaysOn?: true`: for extracted core domains that aren't switchable yet. Tenants can't switch
  them off, and no `organization_module` row is stored for them.
- `nav?: { after: CoreNavId | ModuleId }`: where the module's sidebar entry goes (the schedule
  after Orders, `coreNavIds` and `placeNav()` in `#lib/modules/nav.ts`); without it, or while that
  entry isn't shown, in the Modules group.

All four are literals, which the generator reads from `module.ts` with a pattern;
`src/tests/unit/lib/modules/manifests.spec.ts` compares them with the runtime values. Core is an
implicit requirement of every module and isn't listed.

**Generator.** Checks that every id exists and no module names itself, fails on a `requires` cycle
and prints it (cycles over `enhances` are allowed), and orders the registries by dependency, ties
broken by id (`scripts/modules/graph.ts`). That order is used wherever registry order is used:
hooks, slots, bulk actions, seeds. Seeds have no `after` of their own.

**Which modules are on.** `loadTenant()` starts from the stored rows plus the always-on modules,
then drops any module whose requirements aren't all on, repeating until nothing changes
(`effectiveModules()` in `#lib/modules/graph.ts`). `tenant.modules` is that result. So even with
inconsistent data (a migration, a hand edit) a module never runs without what it requires, and a
module's code may assume its requirements are on.

**Switching (settings).**

- Switching X on also switches on what X requires that's still off. The settings page's module
  card says so up front ("Also switches on Schedule"); every module that changes gets its own
  activity entry.
- Switching Y off while a module that requires Y is on: the page offers to switch the dependents
  off as well, after a confirmation. The server command (`setModules`, `changeModules()` in
  `#lib/modules/graph.ts`) takes the full list and refuses any change that would leave a module on
  without its requirements, or switch off an always-on one; a stored module that's off already (a
  stale row) blocks nothing.
- Switching off keeps the module's data; switching back on brings it back.

**`enhances` at runtime** needs nothing extra: a contribution to B's extension points only takes
part when B is on, because B's points are only dispatched then (section 3).

## 2. Public API and data

**A module's public API is its `api/` folder**, imported as `#modules/<id>/api/…`. Everything else
in the module is private.

- `api/*.ts`, `api/*.svelte`: what works on both sides: types, links, badges, labels, display maps,
  and `api/extensions.ts` with the module's extension points (section 3). Built so far:
  `api/extensions.ts` in contracts (`contracts.detail.side`) and invoices
  (`invoices.billableItems`), and materials' `api/seed.ts` (types for the seeds of the modules that
  enhance it).
- `api/server/`: server-only. Not built yet: no module requires another, so none offers services
  or tables to its dependents.
  - **Services**: the only way another module changes this module's data. Plain functions that
    take the caller's transaction (`tx`), so they commit or roll back with the caller's own
    changes, and that keep the owner's rules: activity log, stock, numbering, the owner's hooks.
    They don't check access again: their callers are gated remote functions.
  - **`tables.ts`**: the tables dependents may read and join, re-exported from `server/schema.ts`.

**Import rules**, checked by `src/tests/unit/modules/boundaries.spec.ts` (`apiImports`), with the
graph from the manifests:

- A module imports another module's `api/` only if it requires that module; with `enhances`, only
  `api/extensions.ts` and types.
- Core imports no module: core is the bottom of the graph.
- `#modules/<id>/…` outside `api/` is for the module's own files, its route files and the
  generated registries and stubs.

**Read-only is a spec check, not a type.** drizzle can't type a table as read-only, so the spec
(`foreignWrites`) flags any `.insert(…)`, `.update(…)` or `.delete(…)` in a module on a table that
isn't its own, the core's included.

**Core gets the same contract.** Modules may read core tables, but change them only through core
services in `#lib/<domain>/server/`: `setOrdersStatus()` (`order-changes.ts`), through which
invoices marks an invoice's orders invoiced and completed again; `scheduleOrder(tx, plan)`
(`scheduling.ts`), through which the schedule plans orders; and `createOrders(tx, drafts)`
(`creation.ts`), through which maintenance turns due plans into orders.

**Foreign keys.** A module's tables may reference the tables of modules it requires, as composite
tenant keys. `src/tests/unit/lib/server/db/modules.spec.ts` checks "no core → module" and "a
module → core or a module it requires", with each module's schema from `module-schemas.gen.ts`.
Migrations stay one stream in `drizzle/`.

## 3. Extension points their owners declare

Built, except slot options.

**Declaring.** An extension point is declared where its owner lives: a module's
`api/extensions.ts`, or core's `#lib/<domain>/extensions.ts` (also `#lib/dashboard/extensions.ts`
and `#lib/portal/extensions.ts` for those pages), with the functions of `#lib/extensions/define.ts`.
Each is a typed value whose id starts with the owner's id and is a string literal (the generator
reads it without running the file):

```ts
// src/lib/orders/extensions.ts, some of them
export const detailSide = defineSlot<{ number: string }>("orders.detail.side");
export const list = defineBulkTable<OrderBulkRow>("orders.list");
export const adjustPrices = defineCollector<PricedOrderFacts[], Map<number, PriceAdjustment[]>>(
	"orders.adjustPrices",
	{ onError: "fail" },
);
export const committed = defineEvent<OrderChange>("orders.committed"); // after commit
export const saving = defineSaveHook<OrderSaving, OrderProblem>("orders.saving");
export const form = defineFormSlot<{ order: { id: number } | undefined }>("orders.form");
```

Besides slots and bulk tables there are form slots (`defineFormSlot()`, a module's inputs in a
core form, with the schema of its part) and list columns (`defineListColumns()`, a module's columns
in a core server-side list), both added with materials and maintenance.

- **Hook kinds**, each with a fixed way of running (`#lib/server/extensions.ts`):
  - _collector_: every contributor is asked in parallel about a batch; answers come back in
    dependency order.
  - _event_: runs in dependency order once the transaction has committed (`afterCommit()`).
  - _vote_: every contributor is asked; any refusal wins (not "first answer wins"). No point of
    this kind is declared yet.
  - _save hook_ (added with materials): each contributor saves its part of a change in the owner's
    transaction, one after another; the first that answers problems stops the rest, and the owner
    refuses the change, rolling the transaction back (`orders.saving`).
- **Failure policy**, declared per collector: `fail` (the request fails, e.g. prices) or `skip`
  (logged with the module's id, the contributor's answer left out, e.g. order badges). Events
  always log.
- The old `SlotProps`, `ServerModule` and `BulkActionRows` became such declarations in core's
  domain folders. New points are added when a module needs one, not ahead of time.

**Calling hooks.** The owner calls `collect(adjustPrices, orders)`, `emit(committed, change)`,
`vote(point, input)` or `save(saving, input)` from the kernel's `#lib/server/extensions.ts`, which
calls the contributors that are on, in dependency order. Each hook keeps one call site in its
owner's domain function: `priceOrders()`, `tagOrders()`, `orderCommitted()` and `saveOrderParts()`
in `src/lib/orders/server/`, `offeredItems()` in invoices' `server/billable.ts`.

**Contributing.**

- **Slots, by file**: `src/modules/<id>/slots/<point id>/<name>.svelte`. Options (order, roles) as
  literal exports in `<script module>`, read by the generator like page options, are not built:
  contributions show in registry order, to everyone who sees the page.
- **Bulk actions, by file**: `src/modules/<id>/bulk-actions/<point id>.ts`, default export.
- **Form parts, by file**: components at `slots/<point id>/` and the part's schema as the default
  export of `form-parts/<point id>.ts`.
- **List columns, by file**: `columns/<point id>.ts` and `server/columns/<point id>.ts`.
- **Hooks, in code**: `server/index.ts`,
  `defineServerModule("contracts", [contribute(adjustPrices, …), contribute(committed, …)])`; the
  declaration is imported from the owner (`#lib/orders/extensions.ts`, or another module's
  `api/extensions.ts`), so the types follow it.
- Identity, labels, icon, `requires`/`enhances`, nav and activity subjects and verbs stay in
  `module.ts`.

**Generator.** Reads the declared ids from the `extensions.ts` files; for each contribution checks
that the point exists, is of the contribution's kind, and that its owner is core, the module
itself, or a module in the contributor's `requires` or `enhances`; writes
`src/lib/extensions/contributions.gen.ts` (and `form-parts.gen.ts`, and the columns' SQL in
`src/lib/server/lists/columns.gen.ts`), typed so that each entry is checked against its
declaration (svelte-check catches a component whose props don't fit its slot; the line names the
component's path).

**Rendering.** The old `<ModuleSlots>` became the kernel's
`<ExtensionSlot point={detailSide} props={…} />` (`src/lib/extensions/extension-slot.svelte`), with
a `<svelte:boundary>` per contribution, whose failed state shows a notice. Every contribution has an
id, `<module>/<point id>/<name>`, for error reports.

## 4. Roles

Not built. Today the roles are the core's (`memberRoles` in `src/lib/auth/roles.ts`: `owner`,
`admin`, `member` and `engineer`), a field engineer is recognised by `isFieldEngineer()`, and
`moduleRemote(id, role)` takes one of the core's (`"member"`, `"manager"`, `"engineer"`). The
design:

**The kernel keeps `owner`, `admin` and `member`**, the office roles. A module adds roles in its
manifest:

```ts
roles: {
	field_engineer: {
		label: m.portal_role_field_engineer,
		description: m.portal_role_field_engineer_description,
		office: false, // not let into the office app
		home: "/(modules)/engineer-portal", // where these users land (a route id)
	},
},
```

The generator checks that role ids are unique across the kernel and the modules. Members keep
their roles in better-auth's `member.role` (several per member). To check in the build: whether
better-auth's organization plugin needs the role names in its config; if so, the generator passes
them on.

**Effective roles** are the stored roles that belong to the kernel or to a module that's on;
`loadTenant()` works them out next to the modules. A role of a switched-off module stays stored
but grants nothing, and comes back with the module.

**Where roles act:**

- **Gates.** `forMembers` (the office) refuses users whose effective roles are all `office: false`
  (what `isFieldEngineer()` does today, read from the declarations). A module gates its own
  functions by role: `moduleRemote("engineer-portal", { role: "field_engineer" })`.
- **Landing.** `hooks.server.ts` and the sign-in (`src/lib/auth/session.remote.ts`) send a user to
  the `home` of their first effective role that has one, else the dashboard, instead of the
  hard-coded redirect to `/my`.
- **Members page.** Offers the kernel's roles and those of the modules that are on, with labels and
  descriptions from the manifests. Role changes are logged as today.
- **No effective role left** (e.g. a field engineer after the tenant switched the portal off):
  signing in still works and shows a short "you have no access in this organization" page instead
  of an error. Owners and admins see why on the members page.

## 5. The pilots

Schedule first (smaller: services, nav), then the portal (roles, pages outside the
office with a layout of their own, its own tables, a contribution to a core page). The schedule is
built; the portal is not.

**Both:**

- A migration switches the module on for every existing organization, so no tenant loses a
  feature (the schedule's is `drizzle/0003_enable-schedule.sql`).
- Seed: North has both, South neither, so each module's e2e covers a tenant without it (as for
  contracts). South has invoices and materials, and no other module.
- The core e2e files move to the modules' `tests/e2e/` folders, with tests for the tenant without
  the module: the schedule's are in `src/modules/schedule/tests/e2e/`; the portal's are still
  `src/tests/e2e/portal.test.ts`.

**Schedule (`src/modules/schedule/`). Built.**

- Owns the `/schedule` route (`routes/(app)/+page.svelte`, linked in as
  `src/routes/(app)/(modules)/schedule/+page.svelte`), the board components (`board/`), its form,
  messages, skeleton and e2e; no tables, no `server/`, no seed. The planned time, engineer and
  `scheduled` status stay on the order: orders own that data, schedule is a view of it.
- Writes through a core service: the logic of `plan()` moved to
  `#lib/orders/server/scheduling.ts` (`scheduleOrder(tx, plan)`, keeping the activity entry and
  the status change). The module's `scheduleOrder` form and `moveOrder` command
  (`schedule.remote.ts`, made with `moduleRemote("schedule")`) are thin wrappers.
- Sidebar: `nav: { after: "orders" }`.
- It has no `requires`, so the e2e of the settings page's dependency prompts waits for the first
  module that has one.

**Engineer portal (`src/modules/engineer-portal/`). Not built:** the portal is still core, in
`src/routes/(field)/my/` (URL `/my`), with its remote functions in `portal.remote.ts` made with
`forEngineers`, and materials adds its material lines to its order page through the slot
`portal.order` (`#lib/portal/extensions.ts`). The design:

- Its pages are under its id, like every module's, but outside the office: not in a route group,
  so they get the root layout only, not the office shell. `routes/+page.svelte` in the module is
  linked in as `src/routes/(modules)/engineer-portal/+page.svelte`, the URL `/engineer-portal`;
  an order is `routes/orders/[number]/+page.svelte`, `/engineer-portal/orders/…`. Its own layout
  (the phone-sized shell the `(field)` group has today) is `routes/+layout.svelte`, the error page
  `routes/+error.svelte`. The core's `(field)` group and `/my` go.
- The generator allows this first: today a module's route files must be in a route group
  (`routes/(app)/…`, linked into `src/routes/(app)/(modules)/<id>/`), and a file directly in
  `routes/` is refused. A file outside a group is linked into the root `(modules)` group,
  `src/routes/(modules)/<id>/`, which gets the same generated universal guard (`+layout.ts`,
  `guardModuleRoute()` in `#lib/modules/route-guard.ts`) as `src/routes/(app)/(modules)/`, so a
  tenant without the portal gets a 404 there too; its server files keep their own guarded stubs.
- Role `field_engineer` (`office: false`, `home: "/(modules)/engineer-portal"`), so these users
  land in the portal and aren't let into the office. `forEngineers` and
  `requireEngineer()`/`currentEngineer()` leave the kernel for
  `moduleRemote("engineer-portal", { role: "field_engineer" })` and a portal helper that finds the
  linked engineer. The hard-coded redirects to `/my` in `hooks.server.ts` and
  `src/lib/auth/session.remote.ts` go (section 4).
- Data: `order_note` and `order_signoff` move to the portal's schema (same tables, new owner). The
  link between a user account and an engineer (`engineer.user_id`) moves to a portal table,
  `engineer_account`, with a migration that copies it; without the portal it means nothing.
  Linking an account becomes the portal's contribution to a new `engineers.detail` slot.
- Writes through core services: start work, log hours and complete become functions in
  `#lib/orders/server/` (they are in `portal.remote.ts` today; `findEngineerOrder()` in
  `#lib/orders/server/field.ts`, which the portal and materials share, is there already), keeping
  activity and the `committed` hook. Material lines are materials' already
  (`src/modules/materials/portal/`, `saveLines()`).
- The order page's work report (notes, signature) becomes the portal's contribution to
  `orders.detail.side`; `getWorkReport` (`src/lib/orders/detail/work-report.remote.ts`) moves into
  the module.

## 6. Testing and the inspector

**Generator specs** (`scripts/modules/*.spec.ts`), built: the graph (unknown or own id, a
`requires` cycle with its path, dependency order, `nav.after`), extension ids literal and prefixed
with their owner, every contribution aimed at an existing point whose owner is in `requires` or
`enhances`, and the typed registries it writes. Role ids unique: with roles.

**Unit specs**, with a made-up graph in `src/tests/unit/lib/modules/fakes.ts`, built:

- which modules are on (following `requires`, always-on modules, stale rows), in
  `src/tests/unit/lib/modules/graph.spec.ts`; effective roles: with roles;
- the settings command (switching on pulls in requirements; a switch-off that would break a
  dependent is refused);
- dispatch (`src/tests/unit/lib/server/extensions.spec.ts`): `collect`/`emit`/`vote`/`save` follow
  dependency order, call only contributors that are on, include `enhances` contributors only when
  both modules are on, and follow each point's failure policy.

**Boundary specs** (`src/tests/unit/modules/boundaries.spec.ts`,
`src/tests/unit/lib/server/db/modules.spec.ts`), built: imports only from `api/` and only along
`requires` (`enhances`: declarations and types only); no `insert`/`update`/`delete` on another
module's tables or the core's; foreign keys only along `requires`. Each check also runs on made-up
files, as the other specs do. A check that each module's remote functions come from its own
`moduleRemote` set isn't there; `remote-functions.spec.ts` checks that only
`#lib/server/remote-functions.ts` imports `query`, `form` and `command` from `$app/server`.

**E2E.** Each module like contracts and invoices: a tenant with the module, one without (404s, no
sidebar entry, empty slots, refused queries), and tenant isolation; the schedule's are built,
including switching it on in settings. Not built yet: switching off a module others depend on (it
asks first) and a tampered refusal of an unmet requirement or an always-on module, which wait for
the first module with `requires` or `alwaysOn`; a field engineer with the portal off getting the
"no access" page, and landing per role, which wait for roles and the portal. The migration that
switches the schedule on is covered by `migrations.spec.ts`.

**Inspector**, not built: a dev-only page at `/dev/modules` (a 404 in production builds, which an
e2e test checks).

- Static data, written by the generator to `inspect.gen.json`: modules with `requires`, `enhances`
  and `alwaysOn`, roles, route ids, extension points with owner and kind, contributions with their
  options, each module's remote functions with their gate, tables with their foreign keys.
- Runtime data: the current tenant's effective modules and roles; a dev-only buffer of the last few
  hundred hook calls (point, tenant, contributors, duration, result or error), recorded by the
  kernel's `collect`/`emit`/`vote`/`save`; slot errors reported by the boundaries' `onerror`.
- Views: the dependency graph, a table per extension point with its contributors, a card per
  module, recent hook calls.

## Order of work

1. **Machinery**: the graph and switching on and off (section 1), `api/` folders and the boundary
   rules (section 2, including moving today's module writes to core tables into core services),
   extension points declared by their owners (section 3). Contracts and invoicing move to the new
   shapes (slots and bulk actions as files, hooks via `contribute()`). Done.
2. **Roles** (section 4). Not started.
3. **Schedule pilot**. Done.
4. **Portal pilot** (needs roles). Not started. Materials as a module took this place in the order
   of work ([module-dependencies-4-materials.md](module-dependencies-4-materials.md), done).
5. **Inspector**: can start once step 1 is merged. Not started.

Each step merges before the next one that needs it; within a step, independent parts can go to
parallel agents in their own worktrees.

## Not decided here

- Which domain to extract next, now that the schedule and materials are modules, and when each
  extracted domain stops being always-on.
- Whether lists get module filters (without a column), row actions and grouping by a module's
  column. Module columns exist, with sorting and set filters, in the equipment list only (see
  "Server-side lists" in AGENTS.md); the rest is deferred until a module needs it.
- Versioned extension-point ids: not needed while every module lives in this repository; revisit if
  modules ever ship separately.
- How the tenant's data is enforced at the database level (Postgres row-level security vs
  `inTenant()`): a separate spike.
