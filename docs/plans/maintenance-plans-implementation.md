# Maintenance plans module — Implementation Plan

**Goal:** the optional module `src/modules/maintenance/` as `maintenance-plans.md` specifies it:
plans per unit, a server-side due list with a "Create orders" bulk action, a card on a unit's page,
a dashboard card, a card on a contract's page, a sidebar entry after Equipment, and a "Next
maintenance" column in the core's equipment list. Along the way the module system gains the parts
the spec's §3 names: a core service for creating orders, module columns in a core list, a slot owned
by a module, and a module's own server-side list.

**Spec:** [`maintenance-plans.md`](maintenance-plans.md) (approved by delegation: built as written,
the open points decided below). Builds on [module-dependencies.md](module-dependencies.md) and its
steps 1 and 3 (done).

## Decisions

Where the spec leaves something open, or where building it as written doesn't work.

1. **`last_order_id` with "set null" needs a column of its own for the tenant.** SQLite's `ON DELETE
SET NULL` nulls every column of the foreign key, and `organization_id` is `NOT NULL`, so a
   composite key `(organization_id, last_order_id)` with set null would make deleting the order
   fail. The plan gets a nullable `last_order_organization_id` beside `last_order_id`; the key is
   `(last_order_organization_id, last_order_id)` → `order (organization_id, id)` on delete set null,
   and a `CHECK (last_order_organization_id is null or last_order_organization_id = organization_id)`
   keeps the reference in the plan's own tenant. The module writes both together.
2. **A plan remembers the day of the month it falls on** (`anchor_day`, 1–31). "The next step comes
   from the plan's original day" (31 January → 28/29 February → 31 March) can't be worked out from
   `next_due_on` alone once it's clamped to a short month. `anchor_day` is the day of the due date
   the office last set (creating or editing the plan); advancing never changes it.
3. **Due ranges are horizons.** The due list's range filter (`?due=`) has the values `overdue`
   (before today), `30-days` (before today + 30 days, overdue included; the default) and `90-days`
   (likewise); "every plan" is no filter (`?due=`). It's a single choice in the toolbar, kept in the
   list's URL like any filter. The list shows active plans only, whatever the range: paused plans
   aren't due (they show, marked, on the unit's card).
4. **The equipment column's filter values are disjoint**: `overdue` (earliest active due date before
   today), `soon` (from today to 30 days ahead) and `none` (no active plan). Its sort puts units
   without a plan last in both directions.
5. **The dashboard card** shows two numbers, overdue and "due within 30 days" (not yet overdue, due
   before today + 30 days; the spec's "this month" read as the next 30 days, the due list's default
   range). Overdue links to `/maintenance?due=overdue`, the other to `/maintenance` (the default
   range, which includes the overdue ones).
6. **`createOrders(tx, drafts)`** (`#lib/orders/server/creation.ts`, exported from
   `#lib/orders/server/index.ts`): a draft is the order's fields without number and tenant;
   `status` defaults to `quote` and `priority` to `normal`, as the order form starts. It checks the
   references (customer, unit of that customer, engineer) with `invalid(message)`, so a form shows
   it and a bulk command skips the record with the reason; numbers each with `nextNumber()`; inserts
   it; and logs `created`. Lines stay out of it: core's form saves them with `saveOrderLines()`
   right after, as before. Core's create path in `order.remote.ts` swaps its `nextNumber` + insert
   for `createOrders()` and no longer logs `created` itself (the update path is untouched). One
   visible change: a new order's `created` entry now comes before its lines' entries instead of
   after.
   **Deviation: it doesn't call `orderCommitted()`.** The spec says to do "whatever core does after
   an order is created (`orderCommitted()` after commit)", but core's create never emitted it (only
   the update path does). Built as written, it broke the orders e2e: `orders.committed` has the
   modules refresh their queries about the order (contracts' coverage, invoicing's card), which for
   a new order are on no page yet; the refreshed queries stayed in the client and failed with a 404
   once the test deleted the order. So `createOrders()` does what core's create did, and a module that
   needs to hear about new orders gets an `orders.created` event (not built: none does yet).
7. **Module columns** (the design is below, under "Module columns"): a contribution is two files,
   `columns/<point id>.ts` (the column's definition and cell, isomorphic, loaded per tenant like a
   slot's component) and `server/columns/<point id>.ts` (its SQL, server-only, in a static server
   registry). The generator requires both. The column's id is namespaced (`maintenance.nextDue`)
   and the merge refuses one that doesn't start with its module's id. A column may also say what a
   row counts under in its filter (`facet`), so its `FacetedFilter` shows counts like the list's own
   (without it every option would read 0).
8. **`ExtensionSlot` moves to `src/lib/extensions/extension-slot.svelte`.** The contracts page (a
   module's route file) now renders a slot too, and a module doesn't import from `src/routes`; the
   component is the extension machinery's, not the app shell's.
9. **Contracts' slot props** are `{ number: string; equipmentIds: number[] }` as the spec says; the
   maintenance card loads the plans of those units with its own query, which checks the ids are the
   tenant's units. Its bulk add takes the ids from the props too (re-checked on the server), so
   maintenance never reads contracts' tables.
10. **Seed**: the module's own faker, seeded per tenant with a fixed number, in `generate()` (which
    has the draft's units); nothing is drawn from the shared faker, so core, contracts and invoicing
    don't change. Verified by seeding main and the branch with a fixed clock and comparing dumps of
    every business table (`organization_module` differs by North's `maintenance` row only).
11. **Activity**: a plan's `parent` is its unit, so plan entries also show on the unit's activity
    card. Pausing and resuming are `updated` (field `paused`), as the spec says. "Create orders"
    logs, per plan, the order's `created` (by `createOrders()`) and the plan's `updated` with
    `nextDueOn` and `lastOrder`, the order's number rather than its id (the log has no reference
    type for orders, and an id would read as a bare number).
12. **Permissions**: everything is `moduleRemote("maintenance")` (any office member), as the spec says.
13. **The contract card's bulk add** takes a description, a type and an interval, as the spec says;
    the first visit is due one interval from today (on today's day of the month). Units that already
    have a plan (of any kind) are left as they are.
14. **"Create orders" runs per plan** (`bulkChange()`, a transaction each), like the other bulk
    actions: a plan that's paused meanwhile (or picked by a tampered id) is skipped with its reason,
    the others go ahead. A plan that isn't the tenant's counts as missing.
15. **The due list's range** is a select in the toolbar, not a faceted filter (it's one choice). As
    the list has a default filter, the toolbar's Reset is always offered; it brings back the default.

## Module columns

The design the spec's §3.2 asks for, kept to sort and a `oneOf` filter.

- **The point**: core declares `defineListColumns("equipment.list")` in
  `#lib/equipment/extensions.ts` (kind `columns`, read by the generator like the other kinds), and
  names it in the list's definition: `defineList({ columns, defaults, moduleColumns: listColumns })`.
- **The definition part**, `src/modules/<id>/columns/equipment.list.ts`, default export an array of
  `listColumn({ id: "maintenance.nextDue", param: "next-maintenance", label, sort: true,
filter: oneOf([...]), optionLabel, cell })` (`#lib/components/data-table/module-columns.ts`).
  `cell` is a component that takes `{ value }`.
- **The SQL part**, `src/modules/<id>/server/columns/equipment.list.ts`, default export an array of
  `columnSql(column, () => ({ value, sort, nullsLast, filter, facet }))`
  (`#lib/server/lists/column-sql.ts`), typed by the column it imports: `filter` gets that column's
  filter values, `value` is what the cell shows. The parts are built per request (a function), as
  `inTenant()` reads the request: the first version built them when the file loaded, which the
  unit spec caught. The SQL is a correlated subquery or anything else over the list's joined tables,
  tenant-scoped.
- **Merging**, per tenant: `extendList(list, columns)` (`list-definition.ts`) makes a list with the
  module columns added, cached per set of columns, so its URL spec and schemas include them. On the
  client the page loads the tenant's contributions (`loadListColumns(point)`,
  `#lib/extensions/list-columns.ts`, from `contributions.gen.ts` and `getCurrentTenant()`), merges
  them before reading the URL, and the table adds their TanStack columns
  (`withModuleTableColumns()`, before the row actions) and filters. On the server
  `withModuleColumns(listSql)` (`#lib/server/lists/module-columns.ts`, in the core's
  `equipmentSql()`) adds the tenant's columns' SQL and swaps in the merged list. It's imported by
  its path, not through the lists barrel: it imports the registry, which imports the modules'
  column files, which import `columnSql()` from the barrel. In one file with `columnSql()` that was
  a cycle, which the production build resolved but Vitest's module runner (and so the dev server)
  didn't. A tenant without the module gets the list as
  it was: no column, and `?next-maintenance=` is a parameter the table doesn't read.
- **Types**: the merged list and SQL keep the core's types (`List<C>`, `ListSql<C>`); module columns
  are runtime additions the core's code never names. A column is typed at its contribution.
- **Strictness**: a list that names a point accepts, at the remote function's boundary, filters and
  sorts on namespaced ids (`<module>.<name>`) of a generic shape; `planList()` then checks the query
  strictly against the tenant's merged list (`list.strict`), a 400 when it names a column the tenant
  doesn't have or a value the column doesn't take. Everything that plans the list (rows, facets,
  bulk targets matching a filter) goes through `planList()`.
- **Values and counts**: the rows query adds each row's module values with
  `moduleValues(listSql, ids)` (one query for the page's ids, only when the tenant has module
  columns), as `row.moduleValues`; the facets query adds `moduleFacets(listSql)`.
- **Not there yet** (left out on purpose, see "What's still missing" at the end): grouping by a
  module column, a module column in another list (a second list only needs
  `defineListColumns()` + `moduleColumns:` + `withModuleColumns()` + `moduleValues()` + the page's
  `extendList()` + the table's `withModuleTableColumns()`), and default visibility or position (they
  go before the row actions, in registry order).

## Global constraints

AGENTS.md as written: imports by real extension; barrels from outside a domain; every text a
message in en and nl; `inTenant()` everywhere; `recordActivity()` in the transaction; the module
writes only its own table (orders through `createOrders()`); tests in `tests/` folders. Each task
ends with a commit. Only the files a task touches are tested while working; the coordinator runs the
full suite, `pnpm run check` and `pnpm knip`.

## Tasks

### 1. `createOrders()` in core

- `src/lib/orders/server/creation.ts` (new): `OrderDraft`, `createOrders(tx, drafts)`,
  `orderDraftProblems(drafts)` (the reference checks, also usable by a form).
- `src/lib/orders/server/index.ts`: export it.
- `src/lib/orders/order.remote.ts`: the create branch of `saveOrder()` calls `createOrders()`; the
  activity entry is logged there only for updates.
- Test: `src/tests/unit/lib/orders/server/creation.spec.ts` (in-memory database, like
  `bulk.spec.ts`): numbers in sequence per tenant, logs `created`, emits `committed` after commit,
  refuses another tenant's customer, a unit of another customer, another tenant's engineer.
  Orders e2e (`src/tests/e2e/orders.test.ts`) still passes.

### 2. Module columns

- `#lib/extensions/define.ts`: `ListColumnsPoint`, `defineListColumns()`, `ColumnsContribution`,
  `columnsContribution()`.
- `#lib/components/data-table/list-definition.ts`: `moduleColumns` in `ListDef`, `point` and
  `strict` on `List`, the namespaced boundary schemas, `extendList()`.
- `#lib/components/data-table/module-columns.ts` (new): `ModuleListColumn`, `listColumn()`,
  `moduleTableColumns()`, `withModuleTableColumns()`.
- `#lib/server/lists/module-columns.ts` (new): `columnSql()`, `withModuleColumns()`,
  `moduleValues()`; `plan.ts` checks strictly for a list with a point.
- `#lib/extensions/list-columns.ts` (new): `loadListColumns(point)`.
- Generator (`scripts/modules/`): `columns` kind; `columnFiles`/`serverColumnFiles` in `find.ts`;
  pairing and owner checks in `extensions.ts`; `columnContributions` in `contributions.gen.ts`;
  `src/lib/server/lists/columns.gen.ts` (server registry) in `registries.ts`; `watch.ts` inputs.
- Equipment: the point in `extensions.ts`, `moduleColumns` in `equipment-list.ts`,
  `withModuleColumns()` in `server/list-sql.ts`, `moduleValues` in the rows query, the page merges
  the tenant's columns, the table adds them and their filters.
- Tests: generator specs (`scripts/modules/extensions.spec.ts`, `find`/`registries` as needed);
  `src/tests/unit/lib/components/data-table/list-definition.spec.ts` (extendList: strict schemas,
  URL spec, prefix refusal, cache); `src/tests/unit/lib/server/lists/module-columns.spec.ts`
  (merge per tenant, strict check in `planList()`, values); the equipment `columns.spec.ts` with a
  made-up module column from `#unit/lib/modules/fakes.ts` (table and merged list agree on the URL).

### 3. A slot owned by a module

- Move `src/routes/(app)/extension-slot.svelte` (and its spec and harnesses) to
  `src/lib/extensions/`; update the three core pages.
- `src/modules/contracts/api/extensions.ts`: `detailSide = defineSlot<{ number: string;
equipmentIds: number[] }>("contracts.detail.side")`; the contract page renders it.
- Test: generator spec for a module-owned slot contributed by an enhancing module (and refused for
  one that neither requires nor enhances); contracts e2e still passes.

### 4. The module: data, manifest, seed

- `module.ts` (`enhances: ["contracts"]`, `nav: { after: "equipment" }`, subjects), `activity.ts`,
  `model.ts` (order types, due ranges, `advanceDueDate()`), `server/schema.ts`, migration
  `add-maintenance`, `server/seed.ts`, `server/index.ts` if needed, messages, `remote-functions.ts`.
- Tests: `tests/unit/model.spec.ts` (advancing, end of month, anchor day; due ranges);
  `migrations.spec.ts` and `modules.spec.ts` stay green; seed dump compared with main.

### 5. Plans on a unit's page

- `plans.remote.ts` (unit's plans, create, update, pause, delete), `form/plan-schema.ts`,
  `form/plan-dialog.svelte`, `slots/equipment.detail.side/plans.svelte`.
- Tests: `tests/unit/form/plan-schema.spec.ts`; e2e (`tests/e2e/maintenance.test.ts`).

### 6. The due list and "Create orders"

- `list/due-list.ts` (definition), `server/list-sql.ts` (`ListSql`), `list/due-list.remote.ts`
  (rows, bulk create), `list/columns.ts`, `list/due-table.svelte`, `list/bulk-actions.ts`,
  `routes/(app)/maintenance/+page.svelte`, `server/orders.ts` (plans → drafts → `createOrders()`,
  advance, log).
- Tests: `tests/unit/list/columns.spec.ts` (table and list agree on the URL); e2e.

### 7. The equipment column, the dashboard card, the contract card

- `columns/equipment.list.ts`, `server/columns/equipment.list.ts`, `ui/next-due.svelte`;
  `slots/dashboard.cards/maintenance.svelte`; `slots/contracts.detail.side/plans.svelte` with the
  bulk add.
- Tests: e2e (North: sort and filter the column, the dashboard counts, the contract card's bulk
  add; South: none of it, the URL parameter ignored, the remote functions refused; tenant
  isolation; switching off and on keeps the plans).

### 8. Documentation

AGENTS.md: module columns, slots owned by a module, `createOrders()`, `ExtensionSlot`'s new place,
maintenance as an example module, the "Not there yet" list. This plan's closing section.

## Progress

All eight tasks are done. Where the build differs from the task list above:

- Task 1 (`7d92a3e`), corrected in `b7c0876`: `createOrders()` doesn't emit `orders.committed`
  (decision 6). Its spec is `src/tests/unit/lib/orders/server/creation.spec.ts`.
- Task 2 (`41e236f`, `b7c0876`): the server half is two files, `column-sql.ts` (`columnSql()`,
  `moduleValues()`, `moduleFacets()`, in the barrel) and `module-columns.ts` (`withModuleColumns()`,
  by path); the table helper is `module-table-columns.ts`; the generator's server registry is
  rendered by `renderColumnSql()` in `scripts/modules/extensions.ts`. Specs:
  `src/tests/unit/lib/components/data-table/module-columns.spec.ts`,
  `src/tests/unit/lib/server/lists/module-columns.spec.ts`, the equipment `columns.spec.ts`, and the
  generator's `extensions.spec.ts`. Made-up columns are in `#unit/lib/modules/fakes.ts`.
- Task 3 (`8c14c13`): the generator's owner check for a module-owned point was already covered by
  `extensions.spec.ts` ("a module contributes to … those of the modules it requires or enhances").
- Task 4 (`4a73dd6`): `labels.ts` holds the ranges' and buckets' names; no `server/index.ts` (the
  module contributes no hooks). Migration `drizzle/0004_add-maintenance.sql`.
- Tasks 5–7 (`418fbb1`): the record's remote file is `plans.remote.ts` (the unit card, the contract
  card and their forms), the dashboard's `overview.remote.ts`; the shared cell is `ui/next-due.svelte`;
  a plan's row on the unit card is `detail/plan-row.svelte`; the bulk add's dialog is
  `form/covered-plans-dialog.svelte`.
- e2e (`a628b17`): `tests/e2e/maintenance.test.ts` (North) and `maintenance.tenancy.test.ts`
  (South, switching, isolation). The contracts e2e now polls for the contract page's badges after
  saving: the page waits for the modules' cards, maintenance's among them.
- Task 8: AGENTS.md ("Tenants and modules", "Modules", "Server-side lists").

Seed check: main and the branch seeded with a fixed clock (`Date` replaced by a preload) and every
business table dumped the same way: the only differences are North's `maintenance` row in
`organization_module` and a demo user's random id; 42 plans (6 overdue, 3 paused) for North.

## Looking back

**What the module system gained.**

- A core service for creating records that modules call: `createOrders()`. Core's own form goes
  through it, so the rules (references, numbering, the log) are in one place.
- A new kind of extension point, columns in a server-side list, contributed by file in two halves
  and checked by the generator like slots and bulk actions. A tenant's list is merged from the
  modules it has, on both sides, without loosening the core's types: the merged list keeps the
  list's own type, and the remote query's strictness moved from the boundary schema to
  `planList()`, against the tenant's list.
- A slot owned by a module, with the generator's owner check and the `enhances` import rule doing
  real work for the first time (maintenance may import only contracts' `api/extensions.ts`, and
  gets its data through props).
- A module's own server-side list with a bulk action: `defineList()`, `ListSql`, `planList()` and
  `bulkChange()` worked from a module without changes.
- `nav: { after: "equipment" }`, a module after a core entry other than Orders.

**What was awkward.**

- Module columns touch many layers for one column: definition, URL spec, table columns, toolbar
  filter, SQL, values, facets, two generated registries, and a page that must merge before it
  reads the URL. Each piece is small, but a second list will need the same five edits (point,
  `moduleColumns:`, `withModuleColumns()`, `moduleValues()`/`moduleFacets()`, page and table).
- The server's registry of column SQL is imported statically, so its files load with the core's
  list SQL; that made an import cycle through the lists barrel, which only Vitest's module runner
  tripped over. The fix (import `withModuleColumns()` by path) is a rule to remember.
- SQL that reads the tenant can't be built when a file loads, so a column's SQL is a factory; easy
  to get wrong, and only a spec shows it.
- Composite tenant keys and `on delete set null` don't mix in SQLite: the plan's last order needed a
  tenant column of its own and a check.
- `orders.committed` turned out to mean "refresh what the client shows of this order", not "an
  order was saved": announcing new orders through it broke the orders e2e.
- A page that renders the modules' cards waits for them (async SSR and navigation), so e2e tests
  that read the page right after a navigation need to poll; the contracts test did, now. One run of
  the equipment e2e under load logged a Svelte async error on deleting a unit from its page
  (`Cannot read properties of null (reading 'async_deriveds')`); it didn't happen again in three
  more runs.

**What's still missing.**

- Grouping by a module's column; filter kinds other than a fixed set for module columns; module
  columns in the orders and materials lists (only `equipment.list` is a point); their default
  visibility, position and the column menu's order.
- An `orders.created` event, if a module needs to hear about new orders.
- Module filters and row actions on core tables, `order.actions`-style slots, slot options.
- A way for the generator to check that a column's two halves describe the same columns (it checks
  that both files exist; the server finds a column's definition through its SQL's import, the
  client through the definition file, and a mismatch is a 400 at runtime).
- From the spec's "not in this version": automatic order creation, running-hour intervals,
  checklists, templates, reminders, planning the created orders.
