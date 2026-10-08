# Feature folders and a plugin system for optional modules

Two linked questions: should code be grouped by feature (a `src/features/` folder), and how do we
turn the optional modules (contracts, invoicing) into plugins you install by adding one folder?

**Short answer.**

1. **No `src/features/` for the core.** The route folders already are the feature folders, and the
   core domains are too intertwined for separate feature folders to have real boundaries. Do one
   cheaper thing instead: replace `src/lib/components/<domain>/` + flat `src/lib/server/<domain>.ts`
   with **domain folders** `src/lib/<domain>/` (with a `server/` subfolder). Low priority, do it
   last.
2. **Yes to plugins, and they _are_ the feature folders.** Every optional module becomes one
   self-contained folder `src/modules/<id>/`, holding its pages, components, remote functions,
   server hooks, schema, seed, messages and tests. A small generator (run by Vite and by
   `pnpm generate`) links the folder into the app: thin route stubs in `src/routes`, typed
   registries, the inlang message list. Core declares every extension point as a typed interface.
   Modules implement those interfaces and never import each other.

So the design is the same on both sides. Core is organised by route, with shared domain code in
`src/lib/<domain>/`. Each optional feature is one vertical folder that plugs into core's extension
points.

---

## What's there today

The current module system is already a good start. Most of it can stay; what's missing is that the
modules still live in many places:

| Concern                                          | Where it is now                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Registry: slots, bulk actions, activity subjects | `src/lib/modules.ts` (static list; imports `#lib/components/{contracts,invoicing}/activity.js`)                 |
| Server hooks                                     | `src/lib/server/modules.ts` (`adjustPrices`, `tagOrders`, `orderSaved`, `billableItems`)                        |
| Rendering slots / bulk actions                   | `src/routes/(app)/module-slots.svelte`, `module-bulk-actions.svelte.ts`                                         |
| Guard                                            | `requireModule()` in `src/lib/server/session.ts`, per remote function and in `invoices/[number]/pdf/+server.ts` |
| Pages                                            | `src/routes/(app)/contracts/**`, `src/routes/(app)/invoices/**`                                                 |
| Shared UI **and domain rules**                   | `src/lib/components/contracts/` (`coverage.ts`, `billing.ts`), `src/lib/components/invoicing/` (`invoice.ts`)   |
| Server logic                                     | `src/lib/server/contracts.ts`, `src/lib/server/invoicing.ts`                                                    |
| Tables                                           | sections of `src/lib/server/db/schema.ts` (lines ~335 and ~486)                                                 |
| Enums                                            | sections of `src/lib/models.ts` (~148–198), activity verbs `issued/paid/voided` in `activityActions`            |
| Labels                                           | `src/lib/i18n/labels.ts` imports `SlaState`/`InvoiceState` from the modules' components (lines 1, 11)           |
| Messages                                         | `messages/*/contracts.json`, `invoices.json`, plus keys in `common.json`, `enum.json`, `activity.json`          |
| Seed                                             | sections of `src/lib/server/db/seed.ts` (~624–830, ~894–1100)                                                   |
| Module ids, again                                | `src/lib/server/db/create-organization-args.ts:13`                                                              |
| e2e                                              | `e2e/contracts.test.ts`, `e2e/invoices.test.ts`, contract pricing SQL in `e2e/app.ts:104–123`                   |

Adding a third module means editing about 12 core files. The direction of dependencies is mostly
right already: no core relation references a module table, and core pages only reach modules
through slots and hooks. The exceptions are `labels.ts`, `models.ts`, `seed.ts`, `e2e/app.ts`,
`create-organization-args.ts` and the shared message files.

## SvelteKit constraints (checked against `@sveltejs/kit` 3.0.0 in `node_modules`)

- **Remote functions can live anywhere** in the project. `remote_module_pattern = /[/.]remote\.[^/]+$/`
  applies to any file; files in `node_modules` count only if their package peer-depends on Kit
  (`src/exports/vite/utils.js:144–164`). The app already does this:
  `src/lib/components/contracts/coverage.remote.ts`, `components/data-table/views.remote.ts`.
- **Any `server/` directory outside `src/routes` is server-only**, as is any `*.server.*` file.
  This is new in Kit 3 and isn't limited to `$lib/server` (`src/exports/vite/plugins/guard.js:113–121`,
  `utils.js:195–196`). So `src/modules/contracts/server/` and `src/lib/orders/server/` are enforced
  server-only without extra setup. Inside `src/routes`, a `server/` folder is _not_ protected.
- **Routes come from one directory.** `kit.files.routes` takes a single path and is deprecated in
  favour of monorepos (`types/index.d.ts:1786–1790`). The manifest builder reads the filesystem
  directly, not through Vite (`src/core/sync/create_manifest_data/index.js:221–228`), so a Vite
  plugin can't add virtual routes. It does follow symlinked directories.
- **`./$types`** is resolved through `rootDirs` against `.svelte-kit/types/src/routes/...`, so it
  only works for files that physically sit in `src/routes`. Elsewhere, use `RouteParams<"/(app)/…">`
  from `$app/types`.
- **drizzle-kit** accepts an array of globs for `schema`, so the schema can be split across files
  (`drizzle.config.ts` names one file today).
- **Paraglide/inlang** compiles whatever files `project.inlang/settings.json` lists in
  `pathPattern`, and they don't have to be under `messages/`. Each message is a separate export, so
  a module's messages only end up in the chunks that use them.

---

# Part 1: grouping code by feature

## Verdict: no `src/features/` for the core

**1. The routes already are the feature folders.** `src/routes/(app)/orders/` holds the table,
columns, form, schema, URL helpers, remote functions and their tests. The CLAUDE.md rule ("put a
module next to the code that uses it, in the nearest folder that contains all of its users") _is_
feature-sliced colocation, using the folders SvelteKit makes you create anyway. A
`src/features/orders/` next to it would give every feature two homes: the route folder, which you
can't avoid, and the feature folder.

**2. Thin `+page` files cost more than they give.** If pages moved into `src/features/*` and
`src/routes` held one-line wrappers, every page would lose `./$types` (19 route files use it), the
route tree would exist twice, and every page would be one extra hop away. The only gain is a
different folder name.

**3. The core domains don't have real boundaries.** Orders use customers, equipment, engineers,
materials (order lines move stock in `src/lib/server/stock.ts`) and pricing. The dashboard,
schedule and engineer portal read all of them. The schema ties them together with composite
foreign keys and relations in both directions (`customerRelations → orders`,
`orderRelations → customer`). Feature folders for core domains would import each other
everywhere, and splitting `schema.ts` per domain would create import cycles between table
definitions. The boundaries would exist on paper only.

**4. The parts that really are separable already have a home:** the optional modules. Part 2 gives
them true vertical folders. That's where the "one folder per feature" instinct pays off.

## Do instead: domain folders in `src/lib` (small, mechanical, last)

There is one real smell. `src/lib/components/<domain>/` holds more than components:
`components/contracts/coverage.ts` and `billing.ts`, `components/invoicing/invoice.ts` and
`components/customers/countries.ts` are domain rules. Meanwhile `src/lib/server/` mixes
infrastructure (`auth.ts`, `mail.ts`, `db/`, `session.ts`, `table-query.ts`) with domain logic
(`orders.ts`, `stock.ts`, `pricing.ts`). Fix both by renaming:

```
src/lib/
  components/            generic UI only: ui/, data-table/, form/, activity/, page-header, detail-item
  customers/             customer-link.svelte, segment-badge.svelte, countries.ts, display.ts
  engineers/             engineer-link.svelte, active-badge.svelte, specialty-badge.svelte, display.ts
  equipment/             equipment-link.svelte, status-badge.svelte, warranty-badge.svelte, …
  materials/             material-link.svelte, stock-badge.svelte, display.ts
    server/stock.ts        ← src/lib/server/stock.ts (+ spec)
  orders/                order-link.svelte, status-/priority-badge, type-label, display.ts
    server/lines.ts        ← src/lib/server/orders.ts
    server/pricing.ts      ← src/lib/server/pricing.ts (+ spec)
  server/                infrastructure only: auth, db/, session, activity, bulk, table-query, mail,
                         modules (the extension points), invitation-mail
  models.ts, activity.ts, format.ts, schema.ts, roles.ts, members.ts, i18n/, themes/   (unchanged)
```

- Imports change from `#lib/components/orders/…` to `#lib/orders/…`, and from
  `#lib/server/stock.js` to `#lib/materials/server/stock.js`. That's about 70 files for the five
  core domains, plus about 30 for the three server files. It's a search-and-replace, one commit per
  domain.
- Server-only stays enforced: Kit 3 protects every `server/` folder outside `src/routes`.
- `schema.ts` stays one file: it's the core's data model and is read as a whole. `models.ts` stays
  too: once the module sections are gone it's about 180 lines and works as the domain glossary.
- Messages (`messages/<locale>/<section>.json`) and e2e (`e2e/<section>.test.ts`) are already per
  section. Leave them.

The cost is about a day; the benefit is that folder names say what's in them. It isn't urgent. Do
it after the modules have moved out, because contracts and invoicing leave `src/lib/components`
anyway, which makes this change smaller.

## Replacement for "Where files go" in CLAUDE.md

```md
## Where files go

Put a module next to the code that uses it, in the nearest folder that contains all of its users.

- **Used by one route** (components, `*.remote.ts`, helpers, their tests): in that route's folder,
  e.g. `src/routes/(app)/orders/orders-table.svelte`. Only `+`-prefixed files are routes.
- **Used by several routes under one folder**: in that folder, e.g.
  `src/routes/(app)/orders/orders.remote.ts`, imported relatively (`../orders.remote.js`).
- **A core domain's shared code** (links, badges, display maps, domain rules used across sections):
  in `src/lib/<domain>/` (`customers`, `equipment`, `engineers`, `materials`, `orders`), its
  server-only logic in `src/lib/<domain>/server/`, imported via `#lib/<domain>/...`.
- **Generic, domain-free code** (UI kit, data table, forms, formatting, themes): `src/lib/components/`
  and `src/lib/*.ts`. Infrastructure on the server (database, auth, session, activity log, mail, the
  modules' extension points): `src/lib/server/`.
- **An optional module** (something a tenant can switch off): everything of it in
  `src/modules/<id>/`, see "Modules". Core code never imports from `src/modules/`.

Any `server/` folder outside `src/routes` (and any `*.server.ts`) is server-only: SvelteKit refuses
to bundle it for the browser. Never put secrets or database code anywhere else.

When a module gains a user outside its folder, move it up to the nearest common folder; when it
loses users, move it down.
```

---

# Part 2: a plugin system for optional modules

## Naming: keep "module"

The owner says "plugin". The app, the UI ("Modules" in organization settings), the database
(`organization_module`), the activity log (subject type `module`, actions `module_enabled`) and
`requireModule()` all say "module". Renaming would mean a migration, rewriting stored activity rows
and two words for one thing. So: **the plugin system is the module system made self-contained.**
The folder is `src/modules/<id>/`, the API is `defineModule()`, and "plugin" stays a description,
not a name in the code.

## What a module folder contains

```
src/modules/contracts/
  module.ts                  manifest, client-safe and tiny (eagerly bundled): id, label, icon,
                             nav, slot/table loaders, activity subjects and verbs
  server/                    server-only (Kit 3 enforces it)
    index.ts                 defineServerModule(): the hooks it implements
    schema.ts                its tables; reference core tables, never the reverse
    seed.ts                  its demo data
    coverage.ts …            its server logic (← src/lib/server/contracts.ts)
  routes/(app)/contracts/    its pages, mirroring src/routes (linked in by stubs, see below)
    +page.svelte, [number]/+page.svelte, new/+page.svelte, contracts.remote.ts, columns.ts, …
  dashboard-cards.svelte     slot components, links, badges (← src/lib/components/contracts/)
  coverage.ts, billing.ts    client-safe rules (+ *.spec.ts next to them)
  coverage.remote.ts         remote functions used by its slots
  labels.ts                  its enum labels (see "Labels")
  messages/en/contracts.json messages/nl/contracts.json
  e2e/contracts.test.ts
```

"Installing" a module means adding the folder. If it has tables, also run
`pnpm db:generate --name add-<id>` and commit the migration. Then switch it on for an organization
in settings or with `org:create --modules`. Removing a module means deleting the folder plus a
migration that drops its tables.

## Discovery and linking: one generator

`scripts/modules.ts` is a plain Node script with no dependencies. The Vite config calls it at load
time, before the SvelteKit plugin syncs, and `pnpm generate` calls it before `svelte-kit sync`, so
`check`, `prepare` and editors see the output too. A small Vite plugin watches
`src/modules/*/{module.ts,routes/**}` in dev and reruns it. Everything it writes is gitignored,
like `src/lib/paraglide/`, except the one-line additions to `project.inlang/settings.json`.

For each folder `src/modules/<id>/` that contains a `module.ts`, it:

1. **Writes registries** next to the core code that reads them (`*.gen.ts`, gitignored):
   - `src/lib/modules.gen.ts`: `import contracts from "#modules/contracts/module.ts"; … export const
manifests = [contracts, invoicing] as const;`. This gives the literal `ModuleId` union.
   - `src/lib/server/modules.gen.ts`: the server halves (`#modules/<id>/server/index.ts`).
   - `src/lib/server/db/modules.gen.ts`: `export * from "#modules/<id>/server/schema.ts"` for each,
     merged into the `db` schema in `db/index.ts` so `db.query.contract` stays typed.
   - `src/lib/server/db/module-seeds.gen.ts`: the seeders, for `seed.ts`, which runs in plain Node.
2. **Writes route stubs** (see the next section) and the route-to-module map for the guard.
3. **Lists message files**: it rewrites the module entries of `pathPattern` in
   `project.inlang/settings.json` (core entries first, then modules in id order).
4. **Checks the rules**: folder name = `id` (`^[a-z][a-z0-9-]*$`); a module's route folders don't
   collide with core routes or another module's; message sections are unique.

Why a generator and not `import.meta.glob`? Globs work for the runtime registries, but give `string`
ids instead of a `ModuleId` union. They also don't work in the plain-Node scripts (`db:seed`,
`org:create`) or in drizzle-kit, and routes need generating anyway. One generator covers all of it.

`package.json` `imports` gets `"#modules/*": "./src/modules/*"` and `"#e2e/*": "./e2e/*"`.

## Routes: generated stubs (chosen) vs catch-all vs symlinks

| Option                                                                                     | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catch-all** `src/routes/(app)/[...path]/+page.svelte` that dispatches to module pages    | **No.** Module pages drop out of `RouteId`, so typed `resolve("/(app)/contracts/[number]")` (used in activity hrefs, nav, links) stops type-checking. You also lose `+server.ts` endpoints (the invoice PDF), nested layouts and error pages, and Kit's per-route code splitting and preloading.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Symlinks** `src/routes/(app)/contracts → ../../modules/contracts/routes/(app)/contracts` | **No** (tested on Kit 3.0.0, branch `symlink-routes-experiment`). Dev, HMR, build and serving work, and `./$types` can be made to resolve with per-module `rootDirs` (including a svelte-check-internal overlay path). But the server-only guard walks importers by real path, so it never reaches a symlinked route: a module page importing `#lib/server/…` or its own `server/` code builds without error and ships it to the browser (reproduced: the secret ends up in `build/client`). `resolve.preserveSymlinks` breaks dependency resolution under pnpm; specs in the linked folder run twice; relative imports out of the folder break for TypeScript; Windows needs Developer Mode and `core.symlinks`. |
| `kit.files.routes`                                                                         | **No.** It takes one directory and is deprecated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Monorepo packages                                                                          | **No.** Packages can export remote functions, but not routes. That's a lot of tooling for in-repo modules deployed together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Generated stubs**                                                                        | **Yes.** Every `+` file under `src/modules/<id>/routes/` gets a one-line twin at the same path under `src/routes/`. The routes are real, so `RouteId`, `resolve()`, `$types`, layouts, endpoints and code splitting all work as usual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Stubs look like this:

```svelte
<!-- src/routes/(app)/contracts/[number]/+page.svelte. Generated by scripts/modules.ts from
     src/modules/contracts/routes/(app)/contracts/[number]/+page.svelte. Don't edit. -->
<script lang="ts">
	import Page from "../../../../modules/contracts/routes/(app)/contracts/[number]/+page.svelte";
	import type { PageProps } from "./$types";

	let props: PageProps = $props();
</script>

<Page {...props} />
```

```ts
// src/routes/(app)/invoices/[number]/pdf/+server.ts, generated
export * from "../../../../../modules/invoicing/routes/(app)/invoices/[number]/pdf/+server.ts";
```

- `.svelte` route files (`+page`, `+layout`, `+error`) become a wrapper that spreads its props, so
  a layout's `children` pass through. `.ts` route files become `export *`.
- Each top-level folder the generator creates (`src/routes/(app)/contracts/`) gets its own
  `.gitignore` containing `*`. The folder ignores itself, the root `.gitignore` doesn't need a line
  per module, and the generator can recognise its own folders and delete stale ones.
- **Rule:** a module's pages live in top-level route folders of its own. It never adds files to a
  core folder. To add something to a core page, use a slot.
- Module pages type their params with `$app/types`, because their own `./$types` doesn't resolve
  (see "SvelteKit constraints"):
  `let { params }: { params: RouteParams<"/(app)/contracts/[number]"> } = $props();`.
  The stub's `PageProps` check makes svelte-check verify that the module page accepts what Kit
  passes it.
- Non-`+` files in a module's `routes/` (`columns.ts`, `contract-form.svelte`, `*.remote.ts`) stay
  where they are. Remote functions work from anywhere, and the stubs import pages that import
  these relatively.

### Guarding a module's routes per tenant

There are two layers, as now:

1. **Data (security):** every remote function and endpoint of a module starts with
   `requireModule("<id>")`. That doesn't change. It's what keeps South out of contracts even if it
   calls the remote endpoints directly.
2. **Pages (UX):** the generator also writes a `+layout.server.ts` into each module route root:
   ```ts
   // src/routes/(app)/contracts/+layout.server.ts, generated
   import { guardModule } from "#lib/server/modules.js";
   export const load = () => guardModule("contracts"); // error(404) unless locals.tenant has it
   ```
   That renders the app's own 404 page inside the app layout before the page renders. Today you
   get a page shell whose queries fail. If the module has its own `+layout.server.ts` at that level,
   the stub runs the guard first and then calls the module's `load`. It costs one data request when
   you navigate _into_ the section, and none inside it.
3. `loadTenant()` (`src/lib/server/session.ts`) filters `tenant.modules` by the registry, so a
   leftover `organization_module` row for a deleted module does nothing.

## The client manifest (`module.ts`)

Core (`src/lib/modules.ts`) declares the extension points and `defineModule`. A module fills them
in:

```ts
// src/modules/contracts/module.ts. Imports only messages, icons, types, `import()` loaders and
// its small subjects/labels file: this is in every tenant's bundle.
import FileCheckIcon from "@lucide/svelte/icons/file-check";

import { defineModule } from "#lib/modules.js";
import { m } from "#lib/paraglide/messages.js";

import { contractSubjects } from "./activity.ts";

export default defineModule({
	id: "contracts",
	label: m.contracts_module_name,
	description: m.contracts_module_description,
	icon: FileCheckIcon,
	nav: [
		{ group: "modules", label: m.contracts_nav, route: "/(app)/contracts", icon: FileCheckIcon },
	],
	slots: {
		"dashboard.cards": () => import("./dashboard-cards.svelte"),
		"order.side": () => import("./order-coverage.svelte"),
		"equipment.side": () => import("./equipment-coverage.svelte"),
	},
	tables: {
		orders: () => import("./orders-table.ts"), // columns, filters, row and bulk actions
	},
	subjects: contractSubjects,
	actions: {}, // activity verbs, e.g. invoicing: { issued: m.invoices_action_issued, … }
});
```

```ts
// src/lib/modules.ts (core): the catalogue of UI extension points
export interface Slots {
	"dashboard.cards": Record<string, never>;
	"order.side": { number: string };
	"order.actions": { number: string }; // buttons in the order page's header
	"equipment.side": { serialNumber: string };
	"customer.side": { code: string };
	"settings.cards": Record<string, never>; // a module's settings on the organization page
	"portal.job": { number: string }; // engineer portal, if a module ever needs it
}
export interface Tables {
	orders: OrderRow; // the row type each core table passes to modules
}
type Loader<T> = () => Promise<{ default: T }>;

export interface ModuleManifest<Id extends string = string> {
	id: Id;
	label: () => string; // message functions, read when shown (never at module scope)
	description: () => string;
	icon: Component;
	nav?: {
		group: "operations" | "records" | "modules";
		label: () => string;
		route: RouteId;
		icon: Component;
	}[];
	slots?: { [S in keyof Slots]?: Loader<Component<Slots[S]>> };
	tables?: { [T in keyof Tables]?: Loader<TableExtension<Tables[T]>> };
	subjects?: Record<string, SubjectType>;
	actions?: Record<string, Sentence>;
	/** Registry order, before the id; default 0. */
	order?: number;
}

export const defineModule = <const Id extends string>(manifest: ModuleManifest<Id>) => manifest;

export { manifests as modules } from "./modules.gen.ts";
export type ModuleId = (typeof manifests)[number]["id"];
```

- **Lazy loading:** everything except the manifest is behind an `import()`, so a tenant without
  the module never downloads its components, pages or remote calls. This is today's slot and bulk
  action approach, applied everywhere. Only the manifest is eager, which is why it may import
  nothing heavy. A boundaries spec checks that (see "Keeping modules honest").
- **Rendering:** `module-slots.svelte` keeps working with the new names, as
  `<ModuleSlots name="order.side" props={{ number }} />`. Wrap each module component in a
  `<svelte:boundary>` whose `failed` snippet renders nothing (and logs), so a broken module can't
  take down a core page.
- **Buttons in various places:** these are slots too (`order.actions`, `customer.actions`, …). A
  component can render a `Button`, open its own dialog and call its own remote functions, which is
  more flexible than a declarative button spec.
- **Nav:** `app-sidebar.svelte` builds the "Modules" group from `nav` entries
  (`resolve(item.route)`, typed because the stubs make the routes real) instead of `module.route`.

### Tables: columns, filters, row and bulk actions

The orders list is server-side (`src/lib/server/table-query.ts`), so a module column needs a server
half (SQL) and a client half (`ColumnDef`). They share the column id (namespaced `contracts.covered`)
so that URLs and saved views agree:

```ts
// src/modules/contracts/orders-table.ts (client, lazy)
export default {
	columns: [{ id: "contracts.covered", header: m.contracts_column_covered, cell: … }],
	bulkActions: [], // as today's invoicing `order-bulk-actions.ts`
	rowActions: [],
} satisfies TableExtension<OrderRow>;

// src/modules/contracts/server/index.ts (server)
tables: {
	orders: {
		columns: {
			"contracts.covered": {
				// A correlated subquery: selectable, sortable and filterable in SQL, in the tenant.
				select: sql<boolean>`exists (select 1 from ${contractEquipment} ce join ${contract} c
					on c.id = ce.contract_id and c.organization_id = ${order.organizationId}
					where ce.equipment_id = ${order.equipmentId} and …)`,
				filter: (values) => …,
				sort: …,
			},
		},
	},
},
```

Core merges enabled modules' columns into the `ServerTable` (`withModuleColumns(ordersTable,
"orders")`) and selects them into `row.modules["contracts.covered"]`. The client merges the lazy
column definitions the way `moduleBulkActions()` merges bulk actions today. A saved view that names
a column of a disabled module ignores it. Build this when the first module needs a column. Until
then, `bulkActions` (exists today) and `rowActions` are enough.

## The server half

### Typed hooks: one catalogue in core, implemented by modules

Keep today's approach: an interface of optional methods (`ServerModule` in
`src/lib/server/modules.ts`) and one core function per extension point that calls the enabled
modules (`priceOrders()`, `tagOrders()`). It's typed end to end, and you can follow it with
"go to definition", unlike string-keyed event buses. Grouping the hooks by core domain and naming
their kind makes the semantics explicit:

```ts
// src/lib/server/modules.ts (core)
export interface ServerModule {
	orders?: {
		/** Collector: price adjustments by order id. Batch; merged in registry order. */
		adjustPrices?(orders: PricedOrderFacts[]): Promise<Map<number, PriceAdjustment[]>>;
		/** Collector: badges by order id. */
		tag?(orders: OrderFacts[], now: Date): Promise<Map<number, OrderTag[]>>;
		/** Guard, inside the transaction: a refusal message, or undefined. */
		refuseChange?(tx: Transaction, change: OrderChange): Promise<string | undefined>;
		/** Event, inside the transaction: keep the module's own rows consistent. Throwing rolls back. */
		saved?(tx: Transaction, change: OrderChange): Promise<void>;
		/** Event, after commit: refresh queries, send mail. Errors are logged, never thrown. */
		committed?(change: OrderChange): void;
	};
	equipment?: { refuseChange?(…): …; committed?(…): void };
	customers?: { refuseDelete?(…): … };
	/** Things other modules bill for (contracts offers fees, invoicing collects them). */
	billing?: { billableItems?(customerId: number, period: BillingPeriod): Promise<BillableItem[]> };
	tables?: { [T in keyof Tables]?: ServerTableExtension };
}

export const defineServerModule = <S extends ServerModule>(id: ModuleId, hooks: S) => ({ id, ...hooks });
```

```ts
// src/modules/contracts/server/index.ts
export default defineServerModule("contracts", {
	orders: {
		adjustPrices: async (orders) => …, // ← today's contracts.adjustPrices
		tag: async (orders, now) => …,
		committed: ({ number }) => void getOrderCoverage(number).refresh(),
	},
	billing: { billableItems: async (customerId, period) => … },
});
```

The four kinds of hook, and their rules:

| Kind                                                                  | Runs                                                            | Order                                  | Errors                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| **Collector** (`adjustPrices`, `tag`, `billableItems`, table columns) | in parallel, on a batch (a page of rows at once)                | results merged in registry order       | throw: the request fails. A broken price must not quietly become a wrong total. |
| **Guard** (`refuseChange`, `refuseDelete`)                            | in the transaction, before the write, one after another         | first refusal wins: `invalid(message)` | throw: rolls back                                                               |
| **Event in transaction** (`saved`)                                    | in the transaction, after core's write and its `recordActivity` | registry order                         | throw: rolls back the whole change                                              |
| **Event after commit** (`committed`)                                  | after the outermost transaction commits, in the same request    | registry order                         | caught and logged                                                               |

"Registry order" means the manifest's `order` field, then the id, so it's deterministic.

After-commit needs a small addition to `drizzleQueued` (`src/lib/server/db/serialize.ts`): an
`AsyncLocalStorage` list of callbacks per outermost transaction, run once it resolves (outside the
queue, so they don't hold up other writers):

```ts
export function afterCommit(callback: () => void | Promise<void>) {
	const pending = callbacks.getStore();
	if (pending) pending.push(callback);
	else void callback(); // not in a transaction: now
}
```

Today's `orderSaved(number)` (`orders.remote.ts:465`) becomes `orders.committed`. The `invoiced`
check in `isEditableOrder` could become invoicing's `orders.refuseChange`. See "Where to draw the
line" for why it shouldn't, yet.

### All extension points are declared by core

Modules never import each other, not even types. If a module wants something from "any other
module", core declares that extension point (e.g. `billing.billableItems`, which only invoicing
reads and only contracts implements). Then deleting the contracts folder can't break invoicing's
type check, and vice versa. Declaration merging (modules adding their own extension points) is
deliberately left out: it would bring back the coupling the folders are meant to remove.

## Database

- **Schema per module:** `src/modules/<id>/server/schema.ts`. `drizzle.config.ts` uses
  `schema: ["./src/lib/server/db/schema.ts", "./src/modules/*/server/schema.ts"]`. `db/index.ts`
  and `migrations.spec.ts` merge in `db/modules.gen.ts`.
- **One migration stream** in `drizzle/`. Per-module streams would need separate journals and
  migration tables, and core migrations (renaming `equipment`, say) would have to be ordered
  against module migrations that reference them. All modules ship together, so there's nothing to
  gain. Tables exist for every tenant; switching a module on or off is data
  (`organization_module`), never schema.
- **Foreign keys point from module to core only.** Module tables reference core tables with the
  same composite tenant keys as today (`(organization_id, customer_id) → customer`), and module
  relations reference core tables. Core never gets a relation or foreign key to a module table.
  `refuseIfReferenced()` already turns "a module row still refers to this" into a clear refusal
  (`orders.remote.ts:498`, `equipment.remote.ts:262`). A `refuseDelete` guard can give a better
  message when a module wants one.
- **Table names:** leave `contract`, `contract_equipment`, `invoice`, `invoice_line` and
  `invoicing_settings` as they are; renaming costs a migration for nothing. New modules use their
  id as a prefix when the name isn't obviously theirs.
- **Moving the existing tables is a no-op.** Moving `contract`/`invoice` from `schema.ts` into
  module files must make `pnpm db:generate` produce _no_ migration. `migrations.spec.ts` proves it.
- **Seed:** each module has a `server/seed.ts`:
  `export default defineSeed({ after?: ModuleId[], run(ctx) })`. `ctx` holds the seeded tenants
  (with their `modules`), customers, equipment and orders, Faker, `insertAll`, and seed-time
  collectors that mirror the runtime hooks. Contracts' seed contributes the price adjustments and
  fees it implies, so invoicing's seed can bill them without knowing contracts. Today's
  `generateInvoices` (`seed.ts:924`) reaches into contract data directly. This is the fiddliest
  part of the migration.

## Translations

- Module messages live in `src/modules/<id>/messages/<locale>/<section>.json`, using the same rule
  as core: **the file name is the key prefix.** Invoicing keeps its `invoices_*` keys unchanged
  (section `invoices`, module id `invoicing`). Contracts keeps `contracts_*`.
- The module keys that sit in core files move into the module's file and get its prefix:
  `common_module_contracts` → `contracts_module_name`, `enum_contract_level_*` →
  `contracts_level_*`, `activity_subject_contract` → `contracts_activity_subject`,
  `activity_action_issued` → `invoices_action_issued`, and so on.
- `src/lib/i18n/messages.spec.ts` reads the file list from `settings.json` today. It should accept
  `./src/modules/<id>/messages/{locale}/<section>.json` too, check that sections are unique across
  core and modules, and check that the module entries match the folders on disk (so the generated
  list can't go stale).

### Labels

`labels.ts` keeps one static map for core kinds. Add a factory so modules own their kinds:

```ts
// src/lib/i18n/labels.ts
export function defineLabels<const L extends Record<string, Record<string, () => string>>>(labels: L) {
	return { label, labelOrValue, labelOptions, withLabels }; // the same API, bound to `labels`
}
export const { label, labelOptions, withLabels, labelOrValue } = defineLabels(coreLabels);

// src/modules/contracts/labels.ts
export const contractLabels = defineLabels({ contractLevel: { basic: m.contracts_level_basic, … } });
```

That removes the `labels.ts → modules` imports (lines 1 and 11).

### Activity log

- A module's `subjects` (already the case) and `actions` (its verbs) come from the manifest.
  `actionSentence()` reads **all** manifests' actions, not only the enabled ones, so the log still
  reads correctly after a module is switched off.
- `activityActions` (`models.ts`) keeps core's verbs. The type becomes
  `ActivityAction = CoreAction | ModuleAction`, where `ModuleAction` is derived from the registry.
  The `activity.action` column is a plain TypeScript enum in SQLite (there's no CHECK constraint),
  so new verbs need no migration.

## Tests

- **Unit and component tests** sit next to the code in the module folder. The existing globs
  (`src/**/*.spec.ts`, `src/**/*.svelte.spec.ts`) already pick them up. In `vite.config.ts`: the
  client project excludes `src/**/server/**` (instead of only `src/lib/server/**`), and
  `optimizeDeps.entries` adds `src/modules/**/*.svelte`.
- **e2e:** `src/modules/<id>/e2e/*.test.ts`, which imports helpers from `#e2e/app.ts`. Add the glob
  to the e2e project's `include` and **exclude it from the `server` project** (its
  `src/**/*.{test,spec}.ts` would otherwise run e2e files as unit tests). The contracts SQL in
  `e2e/app.ts:104–123` moves to `src/modules/contracts/e2e/helpers.ts`.
- **Each module's e2e covers three cases:** a tenant that has it (North); a tenant without it, where
  routes 404, the nav lacks it, the slots are empty and its remote queries 404
  (`e2e/contracts.test.ts:741–845` is the template); and tenant isolation.
- **Core keeps one test with every module switched off**, so core never needs a module to work.

## Keeping modules honest (type safety and boundaries)

- `defineModule` and `defineServerModule` check each module against core's interfaces. The
  generated `as const` registry makes `ModuleId` a literal union, so `requireModule("contrcts")`
  and a nav `route` that doesn't exist are type errors.
- The stubs make svelte-check verify that each module page accepts its route's `PageProps`.
- `src/modules/boundaries.spec.ts` scans imports, the way `messages.spec.ts` scans messages:
  - nothing outside `src/modules/` imports `#modules/…`, except the `*.gen.ts` registries;
  - no module imports another module;
  - `module.ts` imports only messages, icons, `#lib/modules`, types, `import()` loaders and its
    `activity.ts`/`labels.ts`.
- A schema spec checks that no core table has a foreign key to a module table
  (`getTableConfig(table).foreignKeys`).

## Where to draw the line

**Core** is what every tenant has, or what other things depend on: tenancy, auth and members, the
activity log, data tables and forms, customers, equipment, engineers, materials and stock, orders
and their lines, schedule, the engineer portal, the dashboard shell, the pricing pipeline, and the
catalogue of extension points.

**A module** is something a tenant can switch off without breaking anything else. It only _adds_,
and its data references core. Don't make always-on features into "plugins": they'd pay for the
indirection (lazy loading, registries, no direct imports) and get nothing back.

**One accepted leak: the `invoiced` order status.** It's core data (`orderStatuses`,
`isEditableOrder`, the status badge), but only invoicing sets it. Abstracting it into a generic
"locked by a module" status plus an `orders.refuseChange` guard means a data migration and wider
changes for a single consumer. Keep it, document it as "set by the invoicing module", and revisit if
a second module ever needs to lock orders.

## Migrating contracts and invoicing, in small mergeable steps

Each step leaves `pnpm check` and `pnpm test` green and can merge on its own.

1. **Untangle core from the modules, in place** (no moves). One commit each:
   a. `defineLabels()`, and move the contract and invoice label kinds next to their modules.
   b. Move the contract and invoice sections of `models.ts` into
   `src/lib/components/{contracts,invoicing}/model.ts` (`schema.ts` imports them from there for
   now).
   c. Move module message keys out of `common`/`enum`/`activity.json` into `contracts.json` and
   `invoices.json`, with the new keys.
   d. Activity verbs come from the module (`actions`); `activityActions` keeps core's.
   e. `create-organization-args.ts` and `settings.remote.ts` take the ids from the registry;
   `loadTenant()` filters unknown ids.
   f. Move the contract pricing SQL out of `e2e/app.ts`.
2. **Reshape the server hooks** (`ServerModule` grouped by domain; `committed` + `afterCommit()`
   replaces `orderSaved`). Small, and testable with the existing `modules.spec.ts` and
   `pricing.spec.ts`.
3. **Infrastructure with zero modules:** the generator and its Vite plugin, `pnpm generate`,
   `#modules`/`#e2e` aliases, the vitest globs, the drizzle schema glob, merging `db/modules.gen.ts`,
   the seed loader, `messages.spec`, the boundaries spec, `defineModule`. During the transition,
   `modules` = the old static list + `manifests`, so both kinds work side by side.
   _Done (see "Modules" in AGENTS.md), proven with a throwaway module. Differences from the text
   above: `defineModule()` lives in `src/lib/define-module.ts`, not `modules.ts`, so a `module.ts`
   can load without the registry that imports it (a cycle); it returns the manifest with `label` and
   `description` as getters, which is what `AppModule` already has. `module-ids.gen.ts` lists the ids for
   plain Node (the registry can't load there). The stubs repeat literal page options and name the
   other exports (`export *` makes Kit give up on static analysis), and a layout stub renders its
   `children` itself (Kit warns otherwise). `columns.ts` shares `organizationId()`/`createdAt()` with
   the module schemas. No `nav` or `order` field yet: `route` and `icon` are enough for the sidebar._
4. **Move contracts** to `src/modules/contracts/`. This is mostly `git mv` plus rewriting imports:
   `lib/components/contracts/*` → the module root, `lib/server/contracts.ts` → `server/`, its
   tables → `server/schema.ts` (`db:generate` must produce nothing), `routes/(app)/contracts/**` →
   `routes/(app)/contracts/**` (now stubs), its messages, its seed slice → `server/seed.ts`,
   `e2e/contracts.test.ts` → `e2e/`. Remote function URLs change with their file paths; that's
   harmless, but expect `moduleQueries` in its e2e to pick up the new names.
   _Done. Differences from the text above: `lib/server/contracts.ts` became `server/index.ts`
   (the hooks) and `server/contracts.ts` (`coverageOf()`, `overlappingCoverage()`, its number
   target); the files in `lib/components/contracts` sit at the module root, those of the pages
   stay next to them in `routes/(app)/contracts`. Numbering takes a module's own target:
   `nextNumber(tx, { format, table, column })` and `formatCode(format, …)`, with `contract` gone
   from `numberFormats`. The seed needed more than a move: contract terms depend on the faker's
   state after the core's data, and the call-outs add orders and change units, so a module seed has
   a `generate()` step in the tenant loop (with `previous`, for ids that continue across tenants)
   before its `run()`, and the collectors `adjustPrices()` and `billableItems()` that invoicing's
   seed asks instead of reaching into contract data; the seeded data is identical (compared
   with a frozen clock). The registries list the folders before the static list, so the order stays
   contracts, invoicing until invoicing moves. Core e2e tests of prices (customers, equipment
   detail) keep their SQL helper `e2e/contracts-helpers.ts` in core, since the boundaries spec
   forbids importing the module's._
5. **Move invoicing** the same way, including the PDF `+server.ts` and `/invoices/settings`.
   Invoicing's seed then bills contract fees through the seed collectors.
   _Done. Differences from the text above: `invoices.remote.ts` and `lib/server/invoicing.ts` were
   split as they moved (file-splits plan, A.1 and A.2): the remote functions into
   `invoices.remote.ts` (list, one invoice, creation), `invoice-status.remote.ts`,
   `[number]/draft.remote.ts` and `settings/settings.remote.ts`, with `refreshInvoice()` in
   `invoice-refresh.server.ts`; the server code into `server/billable.ts`, `server/invoices.ts`,
   `server/settings.ts` (apart because both of the others need it) and the hook in
   `server/index.ts`. The invoice number format is the module's (`invoiceNumberFormat` in
   `model.ts`, `invoiceNumbers` as the target of `nextNumber()`), with `invoice` gone from
   `numberFormats`. The seed makes the invoices in `run()`, not `generate()`: they follow from the
   draft's orders (kept by reference) and need every module's data for the collectors, which
   `generate()` can't promise whatever order the modules are in, so a tenant's `collect` is passed
   to `run()`; the seeded data is identical (compared with a frozen clock). The e2e SQL that
   spans both modules (the covered CTE, the fee references) is in `e2e/contracts-helpers.ts`, and
   the core tests of what invoicing adds (the bulk action on the orders list, the Dutch invoices)
   are in the module's `e2e/`._
6. **Remove the transition code** (the static list, `#lib/components/{contracts,invoicing}`) and
   update CLAUDE.md: the "Modules" section below, and the "Where files go" text from Part 1.
   _Done. The static list went with the move of invoicing (`modules`, `moduleIds` and the server
   registry are the generated ones), and `slotLoaders()` and `bulkActionLoaders()` take the
   registry as an optional argument, so the core's specs test the extension points with made-up
   modules (`src/lib/fake-modules.ts`, mocked in for `modules.gen.ts`) instead of the real ones.
   AGENTS.md describes the finished system. The "Where files go" text from Part 1 is used as far as
   it applies; the domain folders (step 8) are in it too._
7. **Add extension points when they're needed:** `order.actions` and the other action slots,
   `settings.cards`, row actions, module table columns and filters, guards. The interfaces above
   are the plan; build each when its first user arrives.
8. **Optional:** the Part 1 domain folders (`src/lib/<domain>/`).
   _Done. `src/lib/{customers,engineers,equipment,materials,orders}/` hold what was in
   `src/lib/components/<domain>/`, and the domain logic left `src/lib/server/` for
   `src/lib/<domain>/server/`: `stock.ts` (+ spec) and `materials.ts` in `materials/server/`,
   `equipment.ts` in `equipment/server/`, and in `orders/server/` the order lines (`orders.ts`,
   now `lines.ts`: `checkLines()` and `saveOrderLines()`), `order-changes.ts` and `pricing.ts`
   (+ spec). `assigneeProblem()` moved from the lines to `order-changes.ts`, next to
   `assignOrder()`: it has nothing to do with lines. `src/lib/server/` keeps the infrastructure.
   `components/display.spec.ts`, which checks every domain's option lists, became
   `src/lib/display.spec.ts`. A client component importing `#lib/materials/server/stock.js`
   fails the build with `server_only_import`, so Kit 3 does protect every `server/` folder outside
   `src/routes`. The "Where files go" text from Part 1 is in AGENTS.md. One commit per domain._

### CLAUDE.md: the module part of "Tenants and modules" becomes

```md
## Modules

Optional modules (things a tenant can switch off) live in `src/modules/<id>/`, each self-contained:
`module.ts` (its manifest, `defineModule()`: label, icon, nav, slots, table extensions, activity
subjects and verbs; client-safe and small, everything else behind `import()`), `server/` (hooks via
`defineServerModule()`, `schema.ts`, `seed.ts`, its logic), `routes/` (its pages, mirroring
`src/routes`), its components and remote functions, `messages/<locale>/<section>.json`, and `e2e/`.

- `scripts/modules.ts` (run by `pnpm dev`/`build` and `pnpm generate`) links the folders in:
  registries (`*.gen.ts`), route stubs in `src/routes` (self-gitignored, never edit them), a 404
  guard per module route root, and the message files in `project.inlang/settings.json`.
- Core declares every extension point: UI slots and tables in `#lib/modules.ts`, server hooks in
  `#lib/server/modules.ts` (collectors, guards, events in the transaction, `committed` after it).
  Core never imports a module; modules never import each other. A new kind of contribution gets a
  new extension point in core.
- Every remote function and endpoint of a module starts with `requireModule("<id>")`.
- Module tables reference core tables (composite tenant keys as usual), never the reverse; one
  migration stream in `drizzle/`.
- A module's pages live in route folders of their own; to add to a core page, use a slot.
```

---

## Priorities, sizes and risks

| #   | Step                                                                                       | Size                          | Why this order                                                          |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------- |
| 1   | Untangle core from the modules in place (labels, models, messages, verbs, ids, e2e helper) | M (2–3 days, 6 small PRs)     | Useful even if nothing else happens, and every later step depends on it |
| 2   | Reshape the server hooks, plus `afterCommit()`                                             | S (1 day)                     | Settles the server contract before the files move                       |
| 3   | Generator, registries, stubs, guard, config globs, specs, with zero modules                | M (2–3 days)                  | The riskiest new piece; prove it with nothing to move yet               |
| 4   | Move contracts                                                                             | M (1–2 days)                  | Smaller module, fewer outside touches                                   |
| 5   | Move invoicing (+ seed collectors)                                                         | M (2 days)                    | PDF endpoint, settings page, cross-module billing in the seed           |
| 6   | Remove the transition code, update CLAUDE.md                                               | S                             |                                                                         |
| 7   | New extension points, as needed                                                            | S each                        | YAGNI until a module asks                                               |
| 8   | Domain folders in `src/lib` (Part 1)                                                       | S–M (about 1 day, mechanical) | Nice to have; cheaper after 4–5                                         |

**Risks**

- **Generator lifecycle.** The stubs and `*.gen.ts` files must exist before `svelte-kit sync`,
  svelte-check and the editor read them. Mitigation: run the generator at the top of
  `vite.config.ts`, in `pnpm generate` (which `prepare`, `check` and CI already run), and in the
  dev watcher. Test a fresh clone with `pnpm install && pnpm check`.
- **Stub edge cases.** A layout's `children`, `+error.svelte`, page options exported from a
  module's `+page.ts` (`export *` hides them from Kit's static analysis, so it loads the module
  instead), and HMR through the wrapper. All are checkable in step 3 with a throwaway test module.
- **The generator edits a committed file** (`project.inlang/settings.json`). It must be
  deterministic, and `messages.spec` catches drift.
- **Seed untangling** (step 5) is the most intricate part: invoicing's seed prices orders the way
  the contracts module would.
- **Module bundle discipline.** The manifests are eager. If one grows (heavy imports in `module.ts`
  or `activity.ts`), every tenant pays for it. The boundaries spec guards this.
- **Scope creep.** The catalogue of extension points can grow without limit. Only add one when a
  module needs it, and keep core features in core.
