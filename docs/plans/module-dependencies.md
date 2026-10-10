# Module dependencies, core as modules, and extension points their owners declare

How the module system grows from "optional add-ons on top of core" to "core features are modules
too": modules that depend on each other, extension points that any module can declare, roles that
come with a module, and the first two core features (the schedule and the engineer portal) turned
into switchable modules.

Status: design, agreed in October 2026. Nothing in it is built yet.

## Goals and decisions

- **Direction: every feature is switchable except a small kernel.** A tenant composes its product
  from modules (e.g. a service business without inventory, or without field engineers). We get
  there in steps: first some of core becomes switchable, then more, one domain at a time.
- **The kernel** stays out of the module system: auth, tenants, the database, the activity log,
  server-side lists, i18n, the UI kit, the app shell and nav, the settings shell, and the
  extension machinery. Everything else is, eventually, a module.
- **First pilots: the schedule and the engineer portal.** Schedule tests services, nav and
  `requires` without data or roles of its own; the portal adds a role, a layout group, tables of
  its own and a contribution to a core page.
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
  grants nothing.

Already done before this design (October 2026): every remote function is made with a gated set
(`#lib/server/remote-functions.ts`, `moduleRemote()` for modules), module routes are generated into
`(modules)` route groups whose stubs guard every server entry point, and the dashboard lives in
`src/routes/(app)/(dashboard)/`.

## Today's coupling

Imports between the core sections (counted in October 2026) run both ways:

| Between            | Imports each way |
| ------------------ | ---------------- |
| customers ↔ orders | 5 / 1            |
| equipment ↔ orders | 5 / 4            |
| materials ↔ orders | 4 / 5            |
| engineers ↔ orders | 3 / 2            |

Plus equipment → customers, engineers, materials, and schedule, the portal and the dashboard →
orders and others. `requires` must be acyclic, so as domains are extracted every reverse direction
becomes a contribution to the other side's extension points (the customer page's orders card
becomes something orders adds to a customers slot), the way contracts already adds to the order
page. Likely layering once extracted: customers, engineers and materials at the bottom; equipment
on customers; orders on all four; schedule, the portal and the dashboard's cards on orders;
contracts and invoicing on top. The dashboard page itself stays in the kernel, made of slots.

Not every reverse direction has to become a slot. A page stays direct when what it shows belongs
to its own module or one it requires; it gets a slot when the thing shown belongs to a module that
depends on it (or enhances it).

## 1. Dependencies and switching on and off

**Manifest.** `defineModule()` gains:

- `requires: ModuleId[]`: hard dependencies. The module may import their public API (section 2)
  and reference their tables.
- `enhances: ModuleId[]`: soft. The module contributes to their extension points when both are on,
  and may import only their extension-point declarations and types.
- `alwaysOn?: true`: for extracted core domains that aren't switchable yet. Tenants can't switch
  them off, and no `organization_module` row is stored for them.
- `nav?: { after: string }`: where the module's sidebar entry goes (e.g. schedule after Orders);
  without it, at the end as today.

Core is an implicit requirement of every module and isn't listed.

**Generator.** Checks that every id exists and no module names itself, fails on a `requires` cycle
and prints it (cycles over `enhances` are allowed), and orders the registries by dependency, ties
broken by id. That order is used wherever registry order is used today: hooks, slots, seeds. The
seeds' own `after` goes away.

**Which modules are on.** `loadTenant()` starts from the stored rows plus the always-on modules,
then drops any module whose requirements aren't all on, repeating until nothing changes.
`tenant.modules` is that result. So even with inconsistent data (a migration, a hand edit) a module
never runs without what it requires, and a module's code may assume its requirements are on.

**Switching (settings).**

- Switching X on also switches on what X requires that's still off. The settings page says so up
  front ("also switches on Schedule"); every module that changes gets its own activity entry.
- Switching Y off while a module that requires Y is on: the page offers to switch the dependents
  off as well, after a confirmation. The server command takes the full list and refuses any change
  that would leave a module on without its requirements.
- Switching off keeps the module's data; switching back on brings it back.

**`enhances` at runtime** needs nothing extra: a contribution to B's extension points only takes
part when B is on, because B's points only exist then (section 3).

## 2. Public API and data

**A module's public API is its `api/` folder**, imported as `#modules/<id>/api/…`. Everything else
in the module is private.

- `api/*.ts`, `api/*.svelte`: what works on both sides: types, links, badges, labels, display maps,
  and `api/extensions.ts` with the module's extension points (section 3).
- `api/server/`: server-only.
  - **Services**: the only way another module changes this module's data. Plain functions that
    take the caller's transaction (`tx`), so they commit or roll back with the caller's own
    changes, and that keep the owner's rules: activity log, stock, numbering, the owner's hooks.
    They don't check access again: their callers are gated remote functions.
  - **`tables.ts`**: the tables dependents may read and join, re-exported from `server/schema.ts`.

**Import rules**, checked by the boundaries spec:

- A module imports another module's `api/` only if it requires that module; with `enhances`, only
  `api/extensions.ts` and types.
- Core imports no module, as today: core is the bottom of the graph.
- `#modules/<id>/…` outside `api/` stays reserved for the generated registries.

**Read-only is a spec check, not a type.** drizzle can't type a table as read-only, so the spec
flags any `.insert(…)`, `.update(…)` or `.delete(…)` in a module on a table it got from another
module's API.

**Core gets the same contract.** Modules may read core tables, but change them only through core
services in `#lib/<domain>/server/` (as `stock.ts` already works). The first step of the build
lists every place where today's modules write core tables (e.g. invoicing marking orders as
invoiced) and moves those writes into services; then the spec covers core tables too.

**Foreign keys.** A module's tables may reference the tables of modules it requires, as composite
tenant keys. `src/lib/server/db/modules.spec.ts` generalizes from "no core → module" to "only along
`requires`". Migrations stay one stream in `drizzle/`.

## 3. Extension points their owners declare

**Declaring.** An extension point is declared where its owner lives: a module's
`api/extensions.ts`, or core's `#lib/<domain>/extensions.ts`. Each is a typed value whose id starts
with the owner's id and is a string literal (the generator reads it without running the file):

```ts
export const detailSide = defineSlot<{ number: string }>("orders.detail.side");
export const listBulk = defineBulkTable<OrderBulkRow>("orders.list");
export const adjustPrices = defineCollector<PricedOrderFacts[], Map<number, PriceAdjustment[]>>(
	"orders.adjustPrices",
	{ onError: "fail" },
);
export const committed = defineEvent<OrderChange>("orders.committed"); // after commit
export const refuseDelete = defineVote<OrderFacts>("orders.refuseDelete"); // any refusal wins
```

- **Hook kinds**, each with a fixed way of running:
  - _collector_: every contributor is asked in parallel about a batch; answers merged in dependency
    order.
  - _event_: runs in dependency order once the transaction has committed (`afterCommit()`).
  - _vote_: every contributor is asked; any refusal wins (not "first answer wins").
- **Failure policy**, declared per point: `fail` (the request fails, e.g. prices) or `skip` (logged
  with the module's id, the contributor's answer left out, e.g. order badges). Events always log.
- Today's `SlotProps`, `ServerModule` and `BulkActionRows` (`#lib/modules/manifests.ts`,
  `#lib/server/modules/hooks.ts`) become such declarations in core's domain folders. New points are
  added when a module needs one, not ahead of time.

**Calling hooks.** The owner calls `collect(adjustPrices, orders)`, `emit(committed, change)` or
`vote(refuseDelete, order)` from the kernel's `#lib/server/extensions.ts`, which calls the
contributors that are on, in dependency order. Each hook keeps one call site in its owner's domain
function, as `priceOrders()` is today.

**Contributing.**

- **Slots, by file**: `src/modules/<id>/slots/<slot id>/<name>.svelte`, with options (order, roles)
  as literal exports in `<script module>`, read by the generator like page options.
- **Bulk actions, by file**: `src/modules/<id>/bulk-actions/<table id>.ts`, default export.
- **Hooks, in code**: `server/index.ts`,
  `defineServerModule("contracts", [contribute(adjustPrices, …), contribute(committed, …)])`; the
  declaration is imported from the owner's API, so the types follow it.
- Identity, labels, icon, `requires`/`enhances`, roles and activity subjects and verbs stay in
  `module.ts`.

**Generator.** Reads the declared ids from the `extensions.ts` files; for each contribution checks
that the point exists and that its owner is in the contributor's `requires` or `enhances`; writes
`extensions.gen.ts`, typed so that each entry is checked against its declaration (svelte-check
catches a component whose props don't fit its slot; the line names the component's path).

**Rendering.** `<ModuleSlots>` becomes the kernel's `<Slot point={detailSide} props={…} />`, with a
`<svelte:boundary>` per contribution (from the slot isolation work). Every contribution has an id,
`<module>/<slot id>/<name>`, for error reports and the inspector.

## 4. Roles

**The kernel keeps `owner`, `admin` and `member`**, the office roles. A module adds roles in its
manifest:

```ts
roles: {
	field_engineer: {
		label: m.portal_role_field_engineer,
		description: m.portal_role_field_engineer_description,
		office: false, // not let into the office app
		home: "/(field)/(modules)/my", // where these users land
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
  functions by role: `moduleRemote("portal", { role: "field_engineer" })`.
- **Landing.** Login and `hooks.server.ts` send a user to the `home` of their first effective role
  that has one, else the dashboard, instead of the hard-coded redirect to `/my`.
- **Members page.** Offers the kernel's roles and those of the modules that are on, with labels and
  descriptions from the manifests. Role changes are logged as today.
- **No effective role left** (e.g. a field engineer after the tenant switched the portal off):
  signing in still works and shows a short "you have no access in this organization" page instead
  of an error. Owners and admins see why on the members page.

## 5. The pilots

Schedule first (smaller: services, nav, `requires`), then the portal (roles, a layout group, its
own tables, a contribution to a core page).

**Both:**

- A migration switches both modules on for every existing organization, so no tenant loses a
  feature.
- Seed: North has both, South neither, so each module's e2e covers a tenant without it (as for
  contracts).
- `e2e/schedule.test.ts` and `e2e/portal.test.ts` move to the modules' `e2e/` folders, with tests
  for the tenant without the module.

**Schedule (`src/modules/schedule/`).**

- Owns the `/schedule` route and the board components; no tables. The planned time, engineer and
  `scheduled` status stay on the order: orders own that data, schedule is a view of it.
- Writes through a core service: the logic of `plan()` in `schedule.remote.ts` moves to
  `#lib/orders/server/scheduling.ts` (`scheduleOrder(tx, …)`, keeping the activity entry and the
  status change), which the order form uses too. The module's `scheduleOrder`/`moveOrder` remote
  functions become thin wrappers.
- Sidebar: `nav: { after: "orders" }`.

**Engineer portal (`src/modules/portal/`).**

- Owns the whole `(field)` layout group: its layout, error page and `/my`. Written as
  `routes/(field)/…` in the module and generated into `src/routes/(field)/(modules)/`. The
  generator must accept a module owning a group's root layout when core has no files in that group
  (today it refuses route files outside a folder of the module's own). If the module has a
  `+layout.server.ts` at the group root, the generated group guard runs before it in the same file.
- Role `field_engineer` (`office: false`, `home: "/(field)/(modules)/my"`). `forEngineers` and
  `requireEngineer()`/`currentEngineer()` leave the kernel for
  `moduleRemote("portal", { role: "field_engineer" })` and a portal helper that finds the linked
  engineer. The hard-coded redirects in `hooks.server.ts` and `login.remote.ts` go (section 4).
- Data: `order_note` and `order_signoff` move to the portal's schema (same tables, new owner). The
  link between a user account and an engineer (`engineer.user_id`) moves to a portal table,
  `engineer_account`, with a migration that copies it; without the portal it means nothing.
  Linking an account becomes the portal's contribution to a new `engineers.detail` slot.
- Writes through core services: start work, log hours, save material lines and complete become
  functions in `#lib/orders/server/` (`saveOrderLines()` exists; the other three move out of
  `portal.remote.ts`), keeping stock, activity and the `committed` hook.
- The order page's work report (notes, signature) becomes the portal's contribution to
  `orders.detail.side`; `getWorkReport` moves into the module.

## 6. Testing and the inspector

**Generator specs** (`scripts/modules/`): the graph (unknown or own id, a `requires` cycle with its
path, dependency order, `nav.after`), role ids unique, extension ids literal and prefixed with
their owner, every contribution aimed at an existing point whose owner is in `requires` or
`enhances`, and the typed registries it writes.

**Unit specs**, with a made-up graph in `src/lib/modules/fakes.ts`:

- which modules are on (following `requires`, always-on modules, stale rows) and effective roles;
- the settings command (switching on pulls in requirements; a switch-off that would break a
  dependent is refused);
- dispatch: `collect`/`emit`/`vote` follow dependency order, call only contributors that are on,
  include `enhances` contributors only when both modules are on, and follow each point's failure
  policy.

**Boundary specs** (`boundaries.spec.ts`, `modules.spec.ts`): imports only from `api/` and only
along `requires` (`enhances`: declarations and types only); no `insert`/`update`/`delete` on
another module's tables; foreign keys only along `requires`; each module's remote functions from
its own `moduleRemote` set. Each check also runs on made-up files, as the existing specs do.

**E2E.** Each pilot like contracts and invoicing: a tenant with the module, one without (404s, no
sidebar entry, empty slots, refused queries), and tenant isolation. New: the settings flow
(switching schedule on; switching off a module others depend on asks first), a field engineer with
the portal off gets the "no access" page, landing per role. The migration that switches the pilots
on is covered by `migrations.spec.ts` and a check that every seeded organization has them on.

**Inspector**, a dev-only page at `/dev/modules` (a 404 in production builds, which an e2e test
checks).

- Static data, written by the generator to `inspect.gen.json`: modules with `requires`, `enhances`
  and `alwaysOn`, roles, route ids, extension points with owner and kind, contributions with their
  options, each module's remote functions with their gate, tables with their foreign keys.
- Runtime data: the current tenant's effective modules and roles; a dev-only buffer of the last few
  hundred hook calls (point, tenant, contributors, duration, result or error), recorded by the
  kernel's `collect`/`emit`/`vote`; slot errors reported by the boundaries' `onerror`.
- Views: the dependency graph, a table per extension point with its contributors, a card per
  module, recent hook calls.

## Order of work

1. **Machinery**: the graph and switching on and off (section 1), `api/` folders and the boundary
   rules (section 2, including moving today's module writes to core tables into core services),
   extension points declared by their owners (section 3). Contracts and invoicing move to the new
   shapes (slots and bulk actions as files, hooks via `contribute()`).
2. **Roles** (section 4).
3. **Schedule pilot**.
4. **Portal pilot** (needs roles).
5. **Inspector**: can start once step 1 is merged.

Each step merges before the next one that needs it; within a step, independent parts can go to
parallel agents in their own worktrees.

## Not decided here

- Which domain to extract after the pilots, and when each extracted domain stops being always-on.
- Whether lists get module columns, filters and row actions (still deferred until a module needs
  them; see `table-query.md`).
- Versioned extension-point ids: not needed while every module lives in this repository; revisit if
  modules ever ship separately.
- How the tenant's data is enforced at the database level (Postgres row-level security vs
  `inTenant()`): a separate spike.
