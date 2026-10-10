# Domain folders: the domains' files leave `src/routes`

The proposal (phase 1) and, from the next section, the decisions the user took on it. Numbers come
from a script over the import graph of the checked-in files (2,714 import specifiers in `src`,
`e2e` and `scripts`). Where the text below still says "recommended" or "baseline" or lists
questions, the decisions here win.

## Decisions (final)

1. **Four barrels per domain** (a barrel exists when something outside the domain needs it):
   `#lib/<d>` (`index.ts`: plain TS, i.e. types, rules, display maps, list definitions, data),
   `#lib/<d>/components` (`components.ts`: every Svelte component something outside imports),
   `#lib/<d>/remote` (`remote.ts`: re-exports the domain's `*.remote.ts` files) and
   `#lib/<d>/server` (`server/index.ts`: server-only; only orders and materials, add one when
   something needs it). Every import from outside a domain goes through one of them, including the
   domain's own route files. The `*.remote.ts` files stay outside any `server/` folder.
2. **Exceptions to "through a barrel"**: `#lib/<d>/extensions.ts` (the generator and the modules'
   module-scope contributions need it directly, 5.4), and `e2e/` and `scripts/` (no Vite plugins), which
   import plain `.ts` files by relative path.
3. **The three shell files move into `src/lib`**: `extension-bulk-actions.svelte.ts` to
   `src/lib/extensions/bulk-actions.svelte.ts`, `filter-options.remote.ts` to
   `src/lib/components/data-table/filter-options.remote.ts`, `session.remote.ts` to
   `src/lib/auth/session.remote.ts` (imported by path, not through `#lib/auth`, to avoid a cycle
   through the database); the shell imports them from there.
4. **No renames**: `statuses`, `StatusBadge`, ... keep their names; a file that needs two same-named
   exports aliases them on import (`import { statuses as orderStatuses } from "#lib/orders"`). The
   barrels export components under their file's name; where two exports of one barrel would clash,
   the barrel aliases.
5. `settings`, `settings/members` and `activity` stay in routes; module roots aren't tidied beyond
   moving files out of `routes/`.

Consequences for the text below: ignore 5.3 (renames) and the question list (section 9); 4.1's
"remote functions by path" becomes the `/remote` barrel; rule 1 of 5.1 lists four barrels. A
`vi.mock("./x.remote.ts")` of the underlying file still intercepts imports through the barrel
(verified in the engineers commit).

## Decision and where the evidence disagrees with it

Every file in `src/routes/` that isn't a `+` file and belongs to orders, customers, equipment,
engineers or materials moves to `src/lib/<domain>/`, into subfolders by feature; the 24 non-route
files in `src/modules/{contracts,invoicing}/routes/` move into subfolders of their module. Imports
from outside a domain go through the domain's barrels.

**The evidence says three barrels, not two** (details in "Risks", section 6.1):

- All 44 imports of domain files from outside the domain (not counting the domain's own route
  files, nor `extensions.ts`) fall in three kinds: plain TS (display maps, `countries.ts`: 17),
  small leaf components (links, badges, labels, cards: 24), both (3). **None** imports a table, a
  form, a detail card or a remote function. Only the domain's own `+page` files and the components
  they compose use those.
- With one barrel (two in total, with `/server`), 12 importer files that want only a display map or `countries.ts` would
  also load the domain's 6 to 12 other components and 2 to 4 `*.remote.ts` modules. Those import
  `#lib/server/db/index.ts` (`$app/env/private`, throws without `DATABASE_URL`, opens a libsql
  client) and `#lib/server/auth` (better-auth). That breaks `src/lib/display.spec.ts` in the Node
  Vitest project and can never work in `e2e/` (no Vite plugins) or a plain-Node script.
- The cycle between the barrels (orders and materials show each other's links) is harmless only
  because the cross-domain edges are components; plain TS stays a leaf layer.

The move map below is the same for two or three barrels; only the `index.ts` files differ. Section
4 gives both. **Recommendation: three barrels, `#lib/<domain>` (plain TS), `#lib/<domain>/components`
(Svelte components), `#lib/<domain>/server`, and the remote functions imported by path, not
barrelled.** Open questions are at the end.

## 1. The folder scheme

The same in every domain (a folder exists only when it has files):

```
src/lib/<domain>/
  index.ts          barrel: plain TS (display maps, list definitions, data such as countries)
  components.ts     barrel: every Svelte component of the domain       (three-barrel design)
  extensions.ts     the domain's extension points; stays here (see 5.4), never in a barrel
  display.ts        display maps, options, domain rules (exists today)
  <x>.remote.ts     the record's remote functions: get, form options, create, update, delete
  ui/               small presentational pieces others reuse: links, badges, labels, cards, tags
  list/             list definition, columns, table, cells, bulk actions, the list's remote functions
  form/             new/edit form, its fields, valibot schema (+ spec), what only the edit page shows
  detail/           what only the detail page shows: cards, history, dialogs, their helpers and remotes
  server/           server-only: index.ts barrel, services, hooks, list-sql.ts (the `ListSql`)
```

Why these folders: they are the four things a section has (the list page, the new/edit pages, the
detail page, and pieces shared with other sections) plus the server half. A reader looking for "the
orders table" or "what the equipment page shows" finds it by the page it belongs to. `ui/` is the
only folder other domains look into (see 6.1); `list/`, `form/` and `detail/` are used by the
domain's own routes. The record's own `<x>.remote.ts` serves list, form and detail alike, so it sits
at the root (keeping today's names: `order.remote.ts`, `customers.remote.ts`, `engineers.remote.ts`,
`equipment.remote.ts`, `material.remote.ts`). Specs, `*.test-harness.svelte` files follow their
subject. `*-list.server.ts` becomes `server/list-sql.ts` (the folder already says "server"; the
`ordersSql()` etc. names stay). Folder names `ui`, `list`, `form`, `detail`, `server` don't collide
with the module generator's reserved folders (`routes`, `slots`, `bulk-actions`, `api`, `server`,
`messages`, `e2e`), so modules use the same subfolder names (section 2.2).

File counts (specs included): orders 36 (28 move: 20 from routes, 8 inside `lib`), customers 19 (16:
10 + 6), equipment 29 (25: 17 + 8), engineers 17 (16: 10 + 6), materials 27 (22: 18 + 4). That is 75
files from `src/routes` and 32 reshuffled inside `src/lib`; 224 import specifiers in 106 files
point at a moved file, 100 of them (in 33 files) from outside their domain, which become barrel
imports. Plus the 24 module files and 3 shell files (2.3).

## 2. The move map

### 2.1 Core domains (old to new; `routes/` is `src/routes/(app)/`, `lib/` is `src/lib/`)

Files not listed stay where they are: `lib/<domain>/display.ts`, `extensions.ts`, `countries.ts`,
and everything already in `lib/<domain>/server/` (`orders/server/{hooks,lines,order-changes,pricing}.ts`

- specs, `materials/server/{materials,stock}.ts` + spec, `equipment/server/equipment.ts`).

#### orders

| From                                                                                        | To                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `routes/orders/[number]/equipment-history-card.svelte`                                      | `lib/orders/detail/equipment-history-card.svelte` |
| `routes/orders/[number]/order-lines-card.svelte`                                            | `lib/orders/detail/order-lines-card.svelte`       |
| `routes/orders/[number]/work-report.remote.ts`                                              | `lib/orders/detail/work-report.remote.ts`         |
| `routes/orders/[number]/work-report.svelte`                                                 | `lib/orders/detail/work-report.svelte`            |
| `routes/orders/order-form.svelte`                                                           | `lib/orders/form/order-form.svelte`               |
| `routes/orders/order-lines-field.svelte`                                                    | `lib/orders/form/order-lines-field.svelte`        |
| `routes/orders/order-schema.ts` + `.spec.ts`                                                | `lib/orders/form/`                                |
| `routes/orders/bulk-actions.ts`                                                             | `lib/orders/list/bulk-actions.ts`                 |
| `routes/orders/columns.ts` + `columns.spec.ts`                                              | `lib/orders/list/`                                |
| `routes/orders/order-bulk.remote.ts`                                                        | `lib/orders/list/order-bulk.remote.ts`            |
| `routes/orders/order-list.remote.ts`                                                        | `lib/orders/list/order-list.remote.ts`            |
| `routes/orders/orders-list.ts`                                                              | `lib/orders/list/orders-list.ts`                  |
| `routes/orders/orders-table.svelte`                                                         | `lib/orders/list/orders-table.svelte`             |
| `routes/orders/status-cell.svelte`                                                          | `lib/orders/list/status-cell.svelte`              |
| `routes/orders/order.remote.ts`                                                             | `lib/orders/order.remote.ts`                      |
| `routes/orders/order-list.server.ts`                                                        | `lib/orders/server/list-sql.ts`                   |
| `routes/orders/order-tags.svelte` + `.svelte.spec.ts`                                       | `lib/orders/ui/`                                  |
| `lib/orders/{order-link,priority-badge,status-badge,type-label}.svelte` + `.svelte.spec.ts` | `lib/orders/ui/`                                  |

#### customers

| From                                                                                      | To                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| `routes/customers/customers.remote.ts`                                                    | `lib/customers/customers.remote.ts`           |
| `routes/customers/[code]/activity.remote.ts`                                              | `lib/customers/detail/activity.remote.ts`     |
| `routes/customers/[code]/recent-activity.svelte`                                          | `lib/customers/detail/recent-activity.svelte` |
| `routes/customers/customer-form.svelte`                                                   | `lib/customers/form/customer-form.svelte`     |
| `routes/customers/customer-schema.ts` + `.spec.ts`                                        | `lib/customers/form/`                         |
| `routes/customers/{bulk-actions,columns}.ts`, `columns.spec.ts`, `customers-table.svelte` | `lib/customers/list/`                         |
| `lib/customers/{customer-card,customer-link,segment-badge}.svelte` + `.svelte.spec.ts`    | `lib/customers/ui/`                           |

#### equipment

| From                                                                                                                                                         | To                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `routes/equipment/[serial]/service-history.ts` + `.spec.ts`                                                                                                  | `lib/equipment/detail/`                          |
| `routes/equipment/[serial]/service-history.remote.ts`                                                                                                        | `lib/equipment/detail/service-history.remote.ts` |
| `routes/equipment/[serial]/{service-stats,service-timeline}.svelte`                                                                                          | `lib/equipment/detail/`                          |
| `routes/equipment/equipment.remote.ts`                                                                                                                       | `lib/equipment/equipment.remote.ts`              |
| `routes/equipment/equipment-form.svelte`                                                                                                                     | `lib/equipment/form/equipment-form.svelte`       |
| `routes/equipment/equipment-schema.ts` + `.spec.ts`                                                                                                          | `lib/equipment/form/`                            |
| `routes/equipment/{bulk-actions,columns,equipment-list}.ts`, `columns.spec.ts`, `equipment-list.remote.ts`, `equipment-table.svelte`, `warranty-cell.svelte` | `lib/equipment/list/`                            |
| `routes/equipment/equipment-list.server.ts`                                                                                                                  | `lib/equipment/server/list-sql.ts`               |
| `lib/equipment/{category-label,equipment-link,status-badge,warranty-badge}.svelte` + `.svelte.spec.ts`                                                       | `lib/equipment/ui/`                              |

#### engineers

| From                                                                                      | To                                        |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| `routes/engineers/engineers.remote.ts`                                                    | `lib/engineers/engineers.remote.ts`       |
| `routes/engineers/[id]/edit/{account-card.svelte,account.remote.ts}`                      | `lib/engineers/form/` (the edit page's)   |
| `routes/engineers/engineer-form.svelte`                                                   | `lib/engineers/form/engineer-form.svelte` |
| `routes/engineers/engineer-schema.ts` + `.spec.ts`                                        | `lib/engineers/form/`                     |
| `routes/engineers/{bulk-actions,columns}.ts`, `columns.spec.ts`, `engineers-table.svelte` | `lib/engineers/list/`                     |
| `lib/engineers/{active-badge,engineer-link,specialty-badge}.svelte` + `.svelte.spec.ts`   | `lib/engineers/ui/`                       |

#### materials

| From                                                                                                                                                     | To                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `routes/materials/[sku]/{count-stock-dialog,receive-stock-dialog,stock-history}.svelte`                                                                  | `lib/materials/detail/`                   |
| `routes/materials/[sku]/stock-history.ts` + `.spec.ts`                                                                                                   | `lib/materials/detail/`                   |
| `routes/materials/[sku]/stock.remote.ts`                                                                                                                 | `lib/materials/detail/stock.remote.ts`    |
| `routes/materials/material.remote.ts`                                                                                                                    | `lib/materials/material.remote.ts`        |
| `routes/materials/material-form.svelte`                                                                                                                  | `lib/materials/form/material-form.svelte` |
| `routes/materials/material-schema.ts` + `.spec.ts`                                                                                                       | `lib/materials/form/`                     |
| `routes/materials/{bulk-actions,columns,materials-list}.ts`, `columns.spec.ts`, `material-list.remote.ts`, `materials-table.svelte`, `stock-cell.svelte` | `lib/materials/list/`                     |
| `routes/materials/material-list.server.ts`                                                                                                               | `lib/materials/server/list-sql.ts`        |
| `lib/materials/{material-link,stock-badge}.svelte` + `.svelte.spec.ts`                                                                                   | `lib/materials/ui/`                       |

The per-file list (every file and spec, 107 rows) is produced by the script that made these tables;
phase 2 does the moves with `git mv` from it.

Related moves inside `src/lib`:

- `src/lib/display.spec.ts` (checks all five domains' option lists against `models.ts`) splits into
  each domain's `display.spec.ts` (equipment and materials have one already; customers, engineers
  and orders get one). It imports `./display.ts` relatively, so no barrel is loaded in Node. The
  sharing helper (the `Option` type and the "has an icon" check) goes in a small
  `src/lib/display.test-support.ts` or is repeated: it is 20 lines.
- `src/lib/i18n/labels.ts` has `import type { StockLevel } from "#lib/materials/display.ts"`; it
  becomes `#lib/materials` (type-only, erased at compile time, no cycle at run time).

### 2.2 Modules: the 24 non-route files in `routes/` move into the module

Same subfolder names as the domains. Paths are inside `src/modules/<id>/`; routes keep only `+`
files. Nothing imports these files from outside `routes/` today, and the generator only reads `+`
files, so none of `scripts/modules/` changes (checked: `find.ts` collects `routeFiles` by the `+`
prefix, `check.ts` and `stubs.ts` only look at those).

#### contracts (8 files, from `routes/(app)/contracts/`)

| From                                                                         | To                                                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `bulk-actions.ts`, `columns.ts`, `columns.spec.ts`, `contracts-table.svelte` | `list/`                                                                                                                               |
| `contract-form.svelte`, `contract-schema.ts`, `contract-schema.spec.ts`      | `form/`                                                                                                                               |
| `contracts.remote.ts`                                                        | `contracts.remote.ts` (module root, next to `coverage.remote.ts`; its `../../../remote-functions.ts` becomes `./remote-functions.ts`) |

#### invoicing (16 files, from `routes/(app)/invoices/`)

| From                                                                                                                             | To                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bulk-actions.ts`, `columns.ts`, `columns.spec.ts`, `invoices-table.svelte`                                                      | `list/`                                                                                              |
| `billable-picker.svelte`, `invoice-schema.ts`, `invoice-schema.spec.ts`                                                          | `form/`                                                                                              |
| `[number]/confirm-dialog.svelte`, `[number]/draft-editor.svelte`, `[number]/invoice-document.svelte`, `[number]/draft.remote.ts` | `detail/`                                                                                            |
| `[number]/pdf/invoice-pdf.ts`                                                                                                    | `server/invoice-pdf.ts` (it is only used by `pdf/+server.ts`; the module's `server/` is server-only) |
| `invoice-refresh.server.ts`                                                                                                      | `server/invoice-refresh.ts`                                                                          |
| `invoices.remote.ts`, `invoice-status.remote.ts`, `settings/settings.remote.ts`                                                  | module root (`invoices.remote.ts`, `invoice-status.remote.ts`, `settings.remote.ts`)                 |

Optional, not proposed by default: tidy the module roots the same way (`contract-link`,
`level-badge`, `sla-badge`, `status-badge` + specs into `ui/`). The 24 files are the ask.

No barrel for modules (their `api/` is the public surface). Modules import the core through the
core's barrels like everybody else.

### 2.3 Shell files the moved code needs (decision needed, question 3)

Three files in the shell (`src/routes/(app)/`) are imported by domain code, which must not import
from `src/routes`:

| File                                                          | Used by                                       | Proposed new place                                                                                                                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extension-bulk-actions.svelte.ts`                            | `orders-table.svelte`                         | `src/lib/extensions/bulk-actions.svelte.ts`                                                                                                                                                            |
| `filter-options.remote.ts`                                    | `orders-table`, `equipment-table`             | `src/lib/components/data-table/filter-options.remote.ts` (next to `views.remote.ts`, which also reads the database)                                                                                    |
| `session.remote.ts` (`getCurrentTenant`, needed by the first) | shell, `extension-slot`, `settings.remote.ts` | `src/lib/auth/session.remote.ts`, imported by path (not in the `#lib/auth` barrel: `src/lib/server/auth/session.ts` imports `#lib/auth`, so a remote file in it would be a cycle through the database) |

Alternative that moves only the first two: the page calls `extensionBulkActions()` and passes the
actions to the table as a prop; `session.remote.ts` stays in the shell. The vi.mock paths in
`extension-slot.spec.ts` and `extension-slot.svelte.spec.ts` (`./session.remote.ts`) are the only
mocks affected by either choice.

## 3. What stays, and why

In `src/routes`:

- **App shell** `(app)/`: `app-header`, `app-sidebar`, `organization-switcher`, `user-menu`,
  `extension-slot.svelte` (+ spec, harnesses), `session.remote.ts` (unless the first option in 2.3 is
  taken), the layouts: cross-domain, they are the kernel.
- **Dashboard** `(app)/(dashboard)/`: cross-domain by nature (charts of orders, equipment, revenue,
  stock). It imports domains through their barrels (`orders-per-week-chart` uses orders' status
  display, etc.).
- **Auth pages** `login`, `invite/[id]`, `public-shell.svelte`, `error-view.svelte`, `layout.css`.
- **Schedule and the engineer portal** (`(app)/schedule`, `(field)`): stay until the plans move them
  into `src/modules/`. They consume the domains through barrels (`#lib/materials/server`,
  `#lib/orders/server`, `#lib/orders/components`, ...).
- **`settings` and `settings/members`**: stay. Reasons: single owner and single route area (the
  existing "used by one route" rule applies), they are organisation administration, not a domain;
  `#lib/auth` is infrastructure (roles, session, tenant) and putting administration UI in it would
  mix the kernel with a feature. `settings.remote.ts` also depends on `session.remote.ts`. Revisit
  when settings gets module cards (`settings.cards` is a planned extension point), at which point
  it could become a `src/lib/settings/` domain.
- **`activity`**: nothing to move (only `+page.svelte` in routes; the components are already in
  `src/lib/components/activity/` and `#lib/activity` is a barrel).

In modules: the `+` files of `routes/` (pages and endpoints), and everything else already outside
`routes/`.

## 4. Barrels

Style follows the existing ones (`src/lib/activity/index.ts`, `src/lib/server/lists/index.ts`,
`src/lib/components/ui/badge/index.ts`): `export *` for a plain `.ts` file that is public as a whole,
named `export { default as X }` for components. Component names carry the domain where the bare
name would collide in a file that uses two domains (`OrderStatusBadge`, `EquipmentStatusBadge`,
`OrderTypeLabel`, `OrderPriorityBadge`, `EquipmentCategoryLabel`, `EquipmentWarrantyBadge`; other
files keep their names). A barrel exports **what something outside the domain imports** (measured
from today's importers, listed here), nothing more: knip then keeps the barrels honest.

### 4.1 Recommended: three barrels

| Domain    | `#lib/<d>` (`index.ts`, plain TS)      | `#lib/<d>/components` (`components.ts`)                                                                                                                                  | `#lib/<d>/server` (`server/index.ts`)        | By path (remote functions)                             |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------ |
| orders    | `display.ts`, `list/orders-list.ts`    | `OrderLink`, `OrderStatusBadge`, `OrderPriorityBadge`, `OrderTypeLabel`, `OrderTags`, `OrdersTable`, `OrderForm`, `OrderLinesCard`, `EquipmentHistoryCard`, `WorkReport` | `lines.ts`, `order-changes.ts`, `pricing.ts` | `order.remote.ts`, `list/order-list.remote.ts`         |
| customers | `display.ts`, `countries.ts`           | `CustomerLink`, `CustomerCard`, `SegmentBadge`, `CustomersTable`, `CustomerForm`, `RecentActivity`                                                                       | none yet                                     | `customers.remote.ts`                                  |
| equipment | `display.ts`, `list/equipment-list.ts` | `EquipmentLink`, `EquipmentStatusBadge`, `EquipmentCategoryLabel`, `EquipmentWarrantyBadge`, `EquipmentTable`, `EquipmentForm`, `ServiceStats`, `ServiceTimeline`        | none yet                                     | `equipment.remote.ts`, `list/equipment-list.remote.ts` |
| engineers | `display.ts`                           | `EngineerLink`, `SpecialtyBadge`, `ActiveBadge`, `EngineersTable`, `EngineerForm`, `AccountCard`                                                                         | none yet                                     | `engineers.remote.ts`                                  |
| materials | `display.ts`, `list/materials-list.ts` | `MaterialLink`, `StockBadge`, `MaterialsTable`, `MaterialForm`, `StockHistory`, `ReceiveStockDialog`, `CountStockDialog`                                                 | `stock.ts`                                   | `material.remote.ts`, `list/material-list.remote.ts`   |

Example (`src/lib/orders/components.ts`):

```ts
export { default as EquipmentHistoryCard } from "./detail/equipment-history-card.svelte";
export { default as OrderLinesCard } from "./detail/order-lines-card.svelte";
export { default as WorkReport } from "./detail/work-report.svelte";
export { default as OrderForm } from "./form/order-form.svelte";
export { default as OrdersTable } from "./list/orders-table.svelte";
export { default as OrderLink } from "./ui/order-link.svelte";
export { default as OrderPriorityBadge } from "./ui/priority-badge.svelte";
export { default as OrderStatusBadge } from "./ui/status-badge.svelte";
export { default as OrderTags } from "./ui/order-tags.svelte";
export { default as OrderTypeLabel } from "./ui/type-label.svelte";
```

`src/lib/orders/index.ts`: `export * from "./display.ts"; export * from "./list/orders-list.ts";`
`src/lib/orders/server/index.ts`: `export * from "./lines.ts"; export * from "./order-changes.ts"; export * from "./pricing.ts";`

Server barrels exist for orders and materials only (the two with outside server users; `hooks.ts`,
`list-sql.ts`, `materials.ts`, `equipment.ts` are used only inside their domain). The others get
one when something outside needs it. Main barrels are only plain TS in the sense of "no
`.svelte` of the domain, no remote, no `server/`": `display.ts` imports lucide icon components from
`node_modules`, so a main barrel needs Vite's Svelte plugin; plain Node and `e2e/` can't load it (5.4).

Where remote functions belong, three-barrel design: **in no barrel; the domain's own route files
import them by path** (`import { getOrder } from "#lib/orders/order.remote.ts"`). Reasons: the audience
is the domain's `+page` files and its own components, no one else (0 of 44 outside imports);
importing one pulls the database and better-auth (6.1); the project already treats a remote file as
an entry identified by its file (`docs/plans/file-splits-and-cleanup.md` A.0, "no barrels"). A
barrel is technically safe (6.3), so the alternative is `#lib/<d>/components` exporting them too
(the Svelte-side surface), or a fourth `#lib/<d>/remote`.

### 4.2 Baseline: two barrels

`#lib/<d>` is the union of the first two columns plus the remote functions (`export * from
"./order.remote.ts"` etc.); `#lib/<d>/server` as above. Same move map.

## 5. Import rules and tooling

### 5.1 Rules (go in AGENTS.md, section 7)

1. Outside `src/lib/<d>/`, import the domain only through its barrels: `#lib/<d>`,
   `#lib/<d>/components`, `#lib/<d>/server`. Exceptions: `#lib/<d>/extensions.ts` (5.4), the
   `*.remote.ts` files (by path, only from the domain's own routes and files), and `e2e/` and
   `scripts/` (no Vite plugins: they import plain `.ts` files by path, as `e2e/customers.test.ts`
   already imports `countries.ts` by relative path).
2. Inside `src/lib/<d>/`, import siblings relatively and never the domain's own barrels (a barrel
   imports its files; the other way round is a cycle).
3. A domain imports another domain only through its barrels, and never reads such an import at module
   scope (outside function bodies and component instances): see 6.2.
4. `server/` files and `*.remote.ts` may import `#lib/<other>/server`; nothing that is browser code
   imports `server/`.
5. `src/routes/(app)/<domain>/` holds `+` files only. A module's `routes/` holds `+` files only.

### 5.2 Config

- `package.json` `imports`, `tsconfig.json` `paths` and `aliases` in `src/import-extensions.spec.ts`
  each list the barrels explicitly (the `#lib/*` wildcard maps to files, so a folder specifier needs
  its own exact entry, as `#lib/activity` has). Add, for each of the five domains:
  `"#lib/<d>": "./src/lib/<d>/index.ts"`, `"#lib/<d>/components": "./src/lib/<d>/components.ts"`,
  `"#lib/<d>/server": "./src/lib/<d>/server/index.ts"` (15 entries per file, 14 with the server
  barrels only for orders and materials). Exact keys beat the `#lib/*` pattern in Node and in Vite.
  In the spec, the barrel specifiers resolve to their `index.ts`/`components.ts`, as for the others.
- New spec `src/lib/domain-boundaries.spec.ts`, modelled on `src/modules/boundaries.spec.ts` (regex
  over the checked-in sources, plus made-up files showing it finds what it should): rule 1 (an
  import that resolves into `src/lib/<d>/` from outside is a barrel, `extensions.ts`, a remote file
  from an allowed importer, or from `e2e/`/`scripts/`), rule 2 (no own-barrel import inside a
  domain), rule 5 (no non-`+` file under `src/routes/(app)/<domain>/` or a module's `routes/`), the
  main barrel exports no `.svelte`, remote or `server/` file, and rule 3's module-scope check (an AST
  pass with `parseSync` from `vite-plus`, already used by `scripts/modules/routes.ts`: collect the
  bindings imported from another domain's barrels, flag a reference outside any function or class
  body).
- `knip.ts`: barrels are not entries, so an unused re-export is reported. If that proves noisy in the
  first commit, add the barrels to `entry` with a comment (knip then trusts whatever they export).
  The module route stubs' entry (`src/modules/*/routes/**/+*.{ts,svelte}`) keeps working; the moved
  files are reached from the `+` files. No other change.
- `vite.config.ts`: no change needed. The test globs are `src/**` based (the client project
  excludes `src/**/server/**`, none of the moved `*.svelte.spec.ts` are in a `server/` folder), and
  `optimizeDeps.entries` already lists `src/lib/**/*.svelte`, so the moved components are scanned
  for pre-bundling, which routes' components were not.
- `scripts/modules/`: no change. `extensions.ts` stays at `src/lib/<domain>/extensions.ts`, which
  `findPoints()` (`scripts/modules/extensions.ts`), the watcher (`pointFiles` in `watch.ts`) and the
  generated `contributions.gen.ts` hard-code. Optionally `check.ts` could report a non-`+` file in
  a module's `routes/` (rule 5); the spec covers it.

### 5.3 Renames while moving (question 4)

Display maps have bare names that read badly through a barrel: `statuses`, `priorities`, `types`
(orders), `statuses`, `categories` (equipment), `specialties` (engineers), `segments` (customers).
Proposed: `orderStatusDisplay`, `orderPriorityDisplay`, `orderTypeDisplay`, `equipmentStatusDisplay`,
`equipmentCategoryDisplay`, `specialtyDisplay`, `segmentDisplay` (like `stockLevelDisplay`, which
exists). 12 import sites. The `statusOptions` of orders and equipment collide only if one file imports
both; leave them.

### 5.4 Files that stay out of the barrels on purpose

- `extensions.ts` (`orders`, `equipment`; `dashboard` has one too): the generator reads and imports
  it by path, `contributions.gen.ts` imports it, and the modules' `server/index.ts` contribute to it
  at module scope (`defineServerModule(...)`). Through a barrel that is a cycle with module-scope
  reads: `hooks.gen.ts` (via `#lib/server/extensions.ts`) imports every module's `server/index.ts`,
  which would import the barrel, which would import `server/hooks.ts`, which imports
  `#lib/server/extensions.ts`.
- `countries.ts` and other plain `.ts` leaves that `e2e/` needs: by relative path from `e2e/`.

## 6. Risks, with evidence

### 6.1 What a barrel loads that its importer didn't load before (the three-barrel question)

Importing a name from a barrel evaluates every module the barrel re-exports, in dev, in Vitest and
in Node. Tree shaking helps only the production bundle, and only for modules with no module-scope
side effects (measured below, not assumed).

**Who would load more.** Counting from the import graph (non-spec, non-server files of each domain
after the move: orders 12 components / 4 remote modules, customers 6/2, equipment 9/3, engineers
6/2, materials 8/3):

| Importer (files, today)                                                                                                                                                                                | Uses today                        | Through one main barrel it also loads                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/display.spec.ts` (Node project, 5 domains)                                                                                                                                                    | five `display.ts`                 | 41 components, 14 remote modules, so the db client, `$app/env/private`, better-auth                  |
| `e2e/customers.test.ts` (e2e project: no Svelte plugin, no SvelteKit)                                                                                                                                  | `countries.ts`                    | everything: it can't load `.svelte` or `$app/*` at all                                               |
| `dashboard.remote.ts` (server)                                                                                                                                                                         | `materials/display.ts`            | 8 components, 3 remote modules (importing each other's db and auth)                                  |
| 7 components (`orders-per-week-chart`, `equipment-by-status-chart`, `service-stats`, `order-form`, `order-card`, `schedule-board`, `schedule-dialog`) and 2 pages (equipment detail, field portal job) | one display map or `countries.ts` | 6 to 12 components (tables, forms, with TanStack and the form fields) and 2 to 4 remote modules each |
| 24 import edges of links and badges (6 module files, dashboard, customers/engineers/materials/orders pages, field portal `work-card`, `recent-activity`, `service-timeline`, ...)                      | leaf `ui/` components             | the domain's table, form and detail components, and remote modules                                   |
| `src/lib/i18n/labels.ts`                                                                                                                                                                               | a type                            | nothing at run time (erased)                                                                         |

So 12 files (and `labels.ts`, type-only, at no cost) need only plain TS from a barrel that would also hold
components and remote functions. `display.spec.ts` is the real Node-project case; it has a cheap fix
(split it, 2.1) but the next cross-domain spec would hit the same thing. The `server/` side:
`schedule.remote.ts`, `invoice-status.remote.ts` (invoicing) and `portal.remote.ts` import
`order-changes.ts` or `lines.ts` today, which don't import `hooks.ts`; through `#lib/orders/server`
they would also load `hooks.ts`, so `#lib/server/extensions.ts`, `hooks.gen.ts` and every module's
`server/index.ts` (their `defineServerModule()` runs). The registry is a function for this reason
(`scripts/modules/registries.ts`: "one of them is always evaluated first"); the e2e suite exercises
it, but it is a change in evaluation order, so the orders commit runs everything.

**Import-time side effects in what would be barrelled:**

| File kind                    | Module-scope work                                                                                                                                                                                                                                                                                          | Runs newly where                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `*.remote.ts`                | `forMembers.query(...)`, `.form(...)` calls; on the server SvelteKit appends `init_remote_functions` (and in dev `await Promise.resolve()`); imports `#lib/server/db/index.ts`, which throws `"DATABASE_URL is not set"` if unset and opens a libsql client, and `#lib/server/auth` (better-auth instance) | any Node/SSR importer of a barrel that holds them |
| `*-list.ts`                  | `defineList({...})` builds valibot schemas; pure, no registry                                                                                                                                                                                                                                              | cheap everywhere                                  |
| `display.ts`                 | `labelOptions()`, `withLabels()` (lazy getters), icon imports from `@lucide/svelte` (Svelte components in `node_modules`)                                                                                                                                                                                  | cheap, but needs the Svelte plugin                |
| `columns.ts` (not barrelled) | `createAppColumnHelper()`, `column.columns([...])`, `$app/paths`                                                                                                                                                                                                                                           | only with the table                               |
| `*.svelte`                   | no registration; styles inject on mount                                                                                                                                                                                                                                                                    | cheap, but a Svelte compile in Node               |
| `extensions.ts`              | `defineSlot/defineCollector/...` build objects, no global registry, but the generator imports them at module scope                                                                                                                                                                                         | stays out                                         |
| `server/*`                   | functions only, but all import the db client                                                                                                                                                                                                                                                               | already server-only                               |

No message calls and no registrations at module scope in any of them (the "not at module scope" rule
holds). The only import-time effects that matter are the remote modules' (db client, auth, SvelteKit
registration) and the `DATABASE_URL` check.

**Recommendation: three barrels (main = plain TS, `/components`, `/server`), remote functions by
path.** Evidence for the split: 17 of 44 outside imports need no component at all, none needs a
table, form, detail card or remote function, and the 12 plain-TS importers above are spared the
components and the database entirely. Evidence for not splitting `/components`
further: `/components` still loads tables and forms for the 24 link/badge importers in dev and tests.
That costs module requests in dev (the field portal, a mobile page, would fetch `OrdersTable`, TanStack and
the data-table), and in production it depends on tree shaking of components (Svelte components have no
module-scope side effects beyond Svelte's own `disclose-version` import, as far as I can tell). It is unmeasured: **the first commit
(engineers) ends with `vp build` and a look at the chunks for the field portal and dashboard**. If
tables or forms leak into them, narrow `/components` to the `ui/` leaves (rename it `/ui`) and let the
domain's own routes import `list/`, `form/` and `detail/` components by path like the remote
functions: a change of the barrel files and ~30 route imports, not of the move map. With a main barrel
that also held components and remotes (two barrels), the same graph would instead load the db in
Node specs, which I'd consider a defect, not a cost.

### 6.2 Import cycles between the barrels

Real cross-domain edges after the move (non-route files only; `+` files stay in routes and are not
part of any barrel):

- Components: `orders -> {engineers (order-form: display), materials (order-lines-card: display,
MaterialLink)}`, `customers -> orders` (`recent-activity`: OrderLink, status badge, type label),
  `materials -> orders` (`stock-history`: OrderLink), `equipment -> {customers (columns: CustomerLink),
engineers, materials, orders}` (`service-timeline`, `service-stats`).
- Server (remote files, `server/`): `{customers,engineers,equipment,materials} -> orders/server`
  (`priceOrders()` in their remote functions), `orders/server -> materials/server` (`stock.ts`),
  `orders -> materials/server` (`order.remote.ts`).
- Plain TS (three-barrel design): no domain's main barrel imports another domain. A leaf layer.

The only barrel-level cycle is **orders <-> materials in `/components`** (`order-lines-card` shows
`MaterialLink`; `stock-history` shows `OrderLink`). The server barrels form a DAG (materials ->
orders/server -> materials/server). With two barrels the same cycle exists and there are more edges
through the remote files (`orders -> materials/server -> ...`).

A cycle is only a problem if some module reads another's export while it is still evaluating, i.e. at
module scope (`const x = other.y`, `defineList(... other.z)`, a decorator, `extends`). In a Svelte
component an import is read when the component renders, long after every module has evaluated; in
columns, `renderComponent(CustomerLink, ...)` is inside the `cell:` callbacks. I checked every
cross-domain import in the table above: none is read at module scope. What does _not_ fix it, as
you said: a barrel that imports another's barrel "only from function bodies": ES imports are hoisted,
the module graph still has the cycle, and evaluation order still depends on which barrel is entered first.
What does:

1. Make plain TS a leaf layer (above), so everything that is evaluated at module scope has no
   cross-domain imports at all. Then a cycle between component barrels is inert.
2. Enforce it with the AST check of 5.2 (cross-domain bindings referenced outside function bodies are
   an error) so the property survives edits.
3. If a real module-scope dependency between two domains ever appears, move the shared piece down
   into the plain-TS layer of the domain that owns it, or into `src/lib/` proper (as `models.ts`
   already is).
4. Production: Rolldown's circular-chunk warnings for orders <-> materials are possible; check them in
   the materials/orders commit's `vp build`.

### 6.3 Remote functions in `src/lib/<domain>/` and through a barrel

- Kit 3 allows `.remote.ts` anywhere: `remote_module_pattern = /[/.]remote\.[^/]+$/`
  (`@sveltejs/kit/src/exports/vite/utils.js:144`), not limited to `src/routes`. The project already
  has three outside routes (`src/lib/components/activity/activity.remote.ts`,
  `components/data-table/views.remote.ts`, `themes/theme.remote.ts`) and the modules' ones. The id of
  a function is the hash of the file's path (`hash(file)` in `plugins/remote.js`), so moving a file
  changes its id; nothing stores ids.
- They must not live under a `server/` folder: `server_only_directory_pattern = /\/server\//` is
  enforced everywhere but `src/routes` (`plugins/guard.js`), and a remote file is imported by the
  client. In `src/lib/<d>/` they sit in `list/`, `form/`, `detail/` or the root. Their imports of
  `#lib/server/*` and of `#lib/<other>/server` are fine: the client transform replaces the module
  with fetch stubs, so the guard never walks those imports (same as the remote files in routes now).
- Re-exporting through a barrel is safe because the barrel is not a remote module. The
  `init_remote_functions` loop that sets `fn.__.id` runs only in files matching the remote pattern;
  `docs/plans/file-splits-and-cleanup.md` A.0 is about _`.remote.ts` files_ re-exporting each other,
  which would overwrite ids. The client stub of a remote file exports plain consts, so `export *` works.
  Caveat: each remote file of the barrel is loaded when the barrel is (6.1), and two remote files
  exporting the same name would make `export *` ambiguous (the lists' `getOrders` vs
  `getCustomers` and so on are unique today). I haven't built it: the engineers commit proves
  `vp build` + dev with remote functions imported by path (recommended) and, if the barrel option is
  chosen, through the barrel.

### 6.4 `vi.mock` and specs

Mocks that point at moved files: **none**. Every `vi.mock` path is a generated registry, `#lib/server/db/index.ts`,
`$app/*`, or `./session.remote.ts` / `../coverage.remote.ts` / `../invoicing.remote.ts` (shell and
module roots, not moving; `session.remote.ts` moves only under the first option of 2.3, then two
specs change). The specs that move (`pricing`, `hooks`, `stock`, `columns`, `*-schema`,
`service-history`, `stock-history`, badges and links) import their subject relatively; the hooks,
pricing and stock specs keep their `server/` folder. Specs that cross domains: `display.spec.ts`
(split), `src/modules/*/server/index.spec.ts` (import `#lib/orders/extensions.ts`, unchanged),
`scripts/modules/*.spec.ts` (`extensions.ts` paths as text, unchanged).

### 6.5 Other

- **Module boundaries** (`src/modules/boundaries.spec.ts`): modules may import `#lib/...` freely; the
  barrels add no `#modules/` imports. `module.ts` may not statically import anything but
  messages, icons and `define.ts`: it imports no domain code today and still won't. Module slots and
  bulk actions use `#lib/orders/components`, `#lib/orders/server`, `#lib/orders/extensions.ts`.
- **Tenancy specs** (`remote-functions.spec.ts`) scan all of `src`/`e2e`/`scripts` by content, not by
  path: unaffected.
- **AST/regex specs that name the old paths**: `src/lib/server/lists/plan.ts` and
  `src/lib/server/db/schema.ts` mention `src/routes/(app)/orders/order-list.server.ts` and `(field)/my`
  in comments only; update the comments. `docs/upstream-bugs/*` mention old shell paths in copies of
  code; leave them.
- **knip**: see 5.2. **Formatting/lint**: `vp check` sorts imports, so each rewritten file is
  reformatted; run `vp check --fix` per commit.
- **Dev server**: moving routes' components under `src/lib` puts them in `optimizeDeps.entries`,
  which scans `src/lib/**/*.svelte` (an improvement).
- **Parallel agents**: route files and domain files overlap; do the phase 2 commits in one worktree,
  in order.

## 7. AGENTS.md, "Where files go" (draft)

> ## Where files go
>
> Put a module next to the code that uses it, in the nearest folder that contains all of its users,
> with one exception: **`src/routes` holds route files only**, the ones starting with `+`, plus the
> app shell, dashboard and auth pages' own components. Whatever belongs to a core domain lives in
> that domain's folder.
>
> - **A core domain's code** (`orders`, `customers`, `equipment`, `engineers`, `materials`): in
>   `src/lib/<domain>/`, in a folder by feature: `ui/` (links, badges, labels, cards that other
>   sections reuse), `list/` (the list definition, columns, table, bulk actions, the list's remote
>   functions), `form/` (the new/edit form, its schema), `detail/` (what the detail page shows), and
>   `server/` (server-only: services, hooks, the list's `ListSql` in `list-sql.ts`); at the root
>   `display.ts`, `extensions.ts` and the record's `<x>.remote.ts`. Specs and test harnesses sit next to
>   their subject. E.g. the orders table is `src/lib/orders/list/orders-table.svelte`, and its page
>   `src/routes/(app)/orders/+page.svelte` imports it.
> - **Barrels**: other code imports a domain only through `#lib/<domain>` (plain TS: display maps,
>   list definitions), `#lib/<domain>/components` (Svelte components) and `#lib/<domain>/server`
>   (server only), e.g. `import { OrderLink } from "#lib/orders/components"`. Exceptions: the domain's
>   `*.remote.ts` files, which its own routes import by path; `extensions.ts` (the generator reads it);
>   `e2e/` and `scripts/` (no Vite plugins), which import plain `.ts` files by path. Inside a domain,
>   import relatively, never through the domain's own barrel. A barrel exports what something outside
>   the domain imports, no more. Code that runs at module scope (list definitions, `withLabels()`,
>   constants) never reads an import from another domain: `src/lib/domain-boundaries.spec.ts` checks
>   this.
> - **Used by one route outside the domains** (the shell, dashboard, auth pages, schedule, the portal):
>   in that route's folder. **Used by several routes under one folder**: in that folder.
> - **Generic, domain-free code**: as before (`src/lib/components/`, `activity/`, `auth/`, `i18n/`,
>   `modules/`, `themes/`, `extensions/`, loose `src/lib/*.ts`; on the server `src/lib/server/...`).
> - **An optional module**: everything of it in `src/modules/<id>/`; its pages' `+` files in
>   `routes/`, everything else in `list/`, `form/`, `detail/`, `server/` (...) of the module itself. No
>   barrel (its `api/` is its public surface).
>
> Imports name a file by its real extension (unchanged). ... Any `server/` folder outside `src/routes`
> (and any `*.server.ts`) is server-only. A `*.remote.ts` file must not be under `server/` (the client
> imports it; SvelteKit replaces its body with stubs).

Other AGENTS.md edits: "Server-side lists" (the example paths become `src/lib/orders/list/` and
`src/lib/orders/server/list-sql.ts`; the third layer name), "Tenants and modules" paths
(`extensionBulkActions` and `getCurrentTenant`'s new files), "Activity log" (unchanged paths),
"Modules" (routes/ holds `+` files only).

## 8. Order of work (phase 2)

Each commit leaves the app working: `pnpm generate`, `pnpm run check`, `pnpm knip`, the unit tests of
what moved, and the section's e2e file; the full `pnpm test` at the end of each domain commit
(one e2e run at a time). `git mv` for every move, then fix imports, so history follows.

1. **Prep and plumbing.** Shell moves (2.3, per the decision), barrel aliases in `package.json`,
   `tsconfig.json`, `import-extensions.spec.ts`; `domain-boundaries.spec.ts` with the rules that hold
   today; split `src/lib/display.spec.ts`.
2. **Reshuffle `src/lib/<domain>/` into `ui/` and create the barrels** for all five (32 files; the
   `server/` barrels for orders and materials), and switch every cross-domain import (modules,
   dashboard, schedule, portal, other domains) to the barrels. Routes' own files still import by the
   old paths for now. After this the cross-domain imports never change again.
3. **engineers** (smallest: 10 files from routes, few outside importers). The pilot: ends with `vp
build` and the chunk check for the barrel question (6.1), the knip behaviour, and a dev-server
   run with a remote function by path.
4. **customers**, 5. **equipment**, 6. **materials**, 7. **orders** (last: most files, the orders <->
   materials cycle, the server barrel's evaluation order; `vp build` checked for circular warnings).
5. **Modules**: contracts (8) and invoicing (16), with their e2e.
6. **Docs**: AGENTS.md (7), the plans README row.

Per commit that moves a domain: `routes/(app)/<d>/` ends with `+` files only, the rule 5 check goes
on for it.

## 9. Questions for the user

1. **Two or three barrels?** The evidence supports three (6.1). Default: three, with `/components`
   as described; measure in the engineers commit and narrow it to `ui/` only if the field portal
   or dashboard chunks pull in tables.
2. **Remote functions**: by path from the domain's own routes (recommended), in `/components`, or a
   fourth `/remote` barrel?
3. **Shell files** used by domain tables (2.3): move `extension-bulk-actions`, `filter-options` and
   `session.remote.ts` into `src/lib` (recommended), or pass the extension actions to the tables as a
   prop (keeps `session.remote.ts` in the shell).
4. **Renames** of the bare display exports and the prefixed component names (5.3).
5. **settings/members stay** in the routes (3). Agreed?
6. Server barrels only for orders and materials, the rest when needed (4.1), or an `index.ts` in
   every domain's `server/` from the start?
7. Tidy the module roots into `ui/` as well (2.2, optional)?
