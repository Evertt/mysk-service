# Feature folders and a plugin system for optional modules

Two linked questions: should code be grouped by feature (a `src/features/` folder), and how do we
turn the optional modules (then contracts and invoicing) into plugins you install by adding one
folder?

Status: built. Every step of the migration below is done, and AGENTS.md ("Where files go",
"Tenants and modules", "Modules") describes the system as it is. The `_Done…_` notes in the
migration steps say what was built differently from the plan. The module system has grown since
(modules that depend on each other, extension points that modules declare, core features turned
into modules): see [module-dependencies.md](module-dependencies.md).

**Short answer.**

1. **No `src/features/` for the core.** The core domains are too intertwined for separate feature
   folders to have real boundaries. Instead, each core domain has a **domain folder**
   `src/lib/<domain>/` (`customers`, `engineers`, `equipment`, `orders`), split by feature (`ui/`,
   `list/`, `form/`, `detail/`, `server/`) and imported from outside through its barrels, and
   `src/routes` holds route files only (see [domain-folders.md](domain-folders.md)).
2. **Yes to plugins, and they _are_ the feature folders.** Every optional module is one
   self-contained folder `src/modules/<id>/`, holding its pages, components, remote functions,
   server hooks, schema, seed, messages and tests. A generator (`scripts/modules.ts`, run by Vite
   and by `pnpm generate`) links the folder into the app: route stubs in `src/routes`, typed
   registries, the inlang message list. Extension points are typed values declared by their owner
   (core, or a module), and modules contribute to them. Core never imports a module; a module
   imports another only through its `api/` folder, and only one it `requires` or `enhances`.

So the design is the same on both sides. Core's pages are in `src/routes`, composed from the domain
folders in `src/lib/<domain>/`. Each optional feature is one vertical folder that plugs into its
owners' extension points.

---

## What was there before (October 2026)

The starting point, before the migration below: a module system that worked, but whose modules
lived in many places. None of these places holds module code any more; the paths are those of the
time.

| Concern                                          | Where it was                                                                                                    |
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

Adding a third module meant editing about 12 core files. The direction of dependencies was mostly
right already: no core relation referenced a module table, and core pages only reached modules
through slots and hooks. The exceptions were `labels.ts`, `models.ts`, `seed.ts`, `e2e/app.ts`,
`create-organization-args.ts` and the shared message files.

## SvelteKit constraints (checked against `@sveltejs/kit` 3.0.0 in `node_modules`)

- **Remote functions can live anywhere** in the project. `remote_module_pattern = /[/.]remote\.[^/]+$/`
  applies to any file; files in `node_modules` count only if their package peer-depends on Kit
  (`src/exports/vite/utils.js:144–164`). The app relies on it throughout:
  `src/modules/contracts/coverage.remote.ts`, `src/lib/orders/order.remote.ts`,
  `src/lib/components/data-table/views.remote.ts`.
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
- **drizzle-kit** accepts an array of globs for `schema`, so the schema can be split across files:
  `drizzle.config.ts` names the core's `schema.ts` and `./src/modules/*/server/schema.ts`.
- **Paraglide/inlang** compiles whatever files `project.inlang/settings.json` lists in
  `pathPattern`, and they don't have to be under `messages/`. Each message is a separate export, so
  a module's messages only end up in the chunks that use them.

---

# Part 1: grouping code by feature

## Verdict: no `src/features/` for the core

**1. Pages stay in `src/routes`, as real `+page` files.** If pages moved into `src/features/*` and
`src/routes` held one-line wrappers, every page would lose `./$types`, the route tree would exist
twice, and every page would be one extra hop away. The only gain would be a different folder name.
So a page is a `+page.svelte` in `src/routes/(app)/<domain>/` that composes its domain's pieces.

**2. The core domains don't have real boundaries.** Orders use customers, equipment and engineers,
and pricing. The dashboard and the engineer portal read all of them. The schema ties them together
with composite foreign keys and relations in both directions (`customerRelations → orders`,
`orderRelations → customer`). Feature folders with hard boundaries for core domains would import
each other everywhere, and splitting `schema.ts` per domain would create import cycles between table
definitions. The boundaries would exist on paper only.

**3. The parts that really are separable have a home of their own:** the optional modules. Part 2
gives them true vertical folders. That's where the "one folder per feature" instinct pays off. Two
core domains have since become modules after all (the schedule, and materials with its stock),
once the extension points they needed existed; see
[module-dependencies.md](module-dependencies.md).

## What was built instead: domain folders in `src/lib`

This plan first argued that the route folders were the feature folders, and proposed only to move
the domains' shared code (links, badges, display maps, domain rules) from
`src/lib/components/<domain>/` and the flat `src/lib/server/<domain>.ts` files into
`src/lib/<domain>/`. That was done (step 8 below), and then taken further
([domain-folders.md](domain-folders.md)): every file of a core domain that isn't a `+` file left
`src/routes` for its domain folder, split by the page it belongs to.

```
src/lib/<domain>/          customers, engineers, equipment, orders
  index.ts                 barrel: plain TS (display maps, list definitions, data)
  components.ts            barrel: the Svelte components something outside imports
  remotes.ts               barrel: re-exports the domain's *.remote.ts files
  extensions.ts            the domain's extension points (imported as itself, never via a barrel)
  display.ts               display maps, options, domain rules
  <record>.remote.ts       the record's own remote functions: get, form options, create, update, delete
  ui/                      links, badges, labels, cards, tags that other sections reuse
  list/                    list definition, columns, table, cells, bulk actions, the list's remotes
  form/                    the new/edit form, its fields and valibot schema
  detail/                  what only the detail page shows: cards, history, dialogs, their remotes
  server/                  server-only: services, hooks, the list's `ListSql` (`list-sql.ts`),
                           and `index.ts`, a barrel (only orders has one)
src/lib/dashboard/, src/lib/portal/   only `extensions.ts`: the slots on those pages
src/lib/components/, activity/, auth/, extensions/, i18n/, modules/, themes/   generic code
src/lib/server/            infrastructure only: auth/, db/, activity/, lists/, mail/, modules/,
                           extensions.ts, forms.ts, records.ts, numbering.ts, remote-functions.ts
src/routes/                route files, plus the files of the app shell, the dashboard, the auth
                           pages and the engineer portal, which belong to no core domain
```

- Code outside a domain imports it through its barrels, by file (`#lib/orders/components.ts`);
  inside a domain, siblings are imported relatively. `extensions.ts`, the tests and `scripts/` are
  the exceptions. `src/tests/unit/lib/domain-boundaries.spec.ts` checks it, and that a domain's
  route folder and a module's `routes/` hold `+` files only.
- Server-only stays enforced: Kit 3 protects every `server/` folder outside `src/routes` (a client
  component importing one fails the build with `server_only_import`).
- `schema.ts` stays one file for the core: it's the core's data model and is read as a whole. The
  modules' tables are in their own `server/schema.ts`. `models.ts` stays too, as the core's domain
  glossary (enums, `activityActions`).
- Messages stay per section (`messages/<locale>/<section>.json`). Tests are never next to their
  subject: the core's are in `src/tests/unit/` (mirroring `src/`) and `src/tests/e2e/`.

The rules are in AGENTS.md, "Where files go", which replaced the draft this section used to
propose.

---

# Part 2: a plugin system for optional modules

## Naming: keep "module"

The owner says "plugin". The app, the UI ("Modules" in organization settings), the database
(`organization_module`), the activity log (subject type `module`, actions `module_enabled` and
`module_disabled`) and `requireModule()` (`src/lib/server/auth/session.ts`) all say "module".
Renaming would mean a migration, rewriting stored activity rows and two words for one thing. So:
**the plugin system is the module system made self-contained.** The folder is `src/modules/<id>/`,
the API is `defineModule()`, and "plugin" stays a description, not a name in the code.

## What a module folder contains

The contracts module, with the parts other modules have that it doesn't:

```
src/modules/contracts/
  module.ts                  its manifest, defineModule(): id, label, description, route, icon,
                             activity subjects and verbs, requires/enhances/alwaysOn, nav.after;
                             in every tenant's bundle, so small
  activity.ts, labels.ts     its activity subjects and its enum labels (module.ts imports these)
  model.ts, display.ts       its types and enums, display maps
  coverage.ts                client-safe rules
  remote-functions.ts        moduleRemote("contracts"): the set its remote functions are made with
  contracts.remote.ts        the record's own remote functions
  coverage.remote.ts         remote functions that its slots and server hooks share
  ui/                        links and badges (contract-link.svelte, status-badge.svelte, …)
  list/, form/               the list page's and the form's pieces (a module may add detail/)
  api/extensions.ts          the extension points it owns (contracts.detail.side), for others
  slots/<point id>/          its components at others' slots, one file each:
                             dashboard.cards/contracts.svelte, orders.detail.side/coverage.svelte, …
  server/                    server-only (Kit 3 enforces it)
    index.ts                 defineServerModule(): its contributions to hooks
    schema.ts                its tables; they reference core tables, never the reverse
    seed.ts                  defineSeed(): its demo data
    contracts.ts, billing.ts its server logic
  routes/(app)/              its pages, by route group, under its id (linked in by stubs, see
    +page.svelte, [number]/+page.svelte, new/+page.svelte    below): /contracts, /contracts/…
  messages/en/contracts.json messages/nl/contracts.json
  tests/unit/, tests/e2e/    its specs (mirroring its folders) and end-to-end tests
```

Other modules add `bulk-actions/<point id>.ts` (invoices' `orders.list.ts`), `columns/<point id>.ts`
with `server/columns/<point id>.ts` (maintenance's `equipment.list.ts`), `form-parts/<point id>.ts`
(materials' `orders.form.ts`), `skeletons/` (the schedule's) and other files in `api/` (materials'
`api/seed.ts`: types for the seeds of the modules that enhance it).

A module's `routes/` holds route groups only, and its pages are under its id, which the folder
doesn't repeat: contracts' list is `routes/(app)/+page.svelte`, a contract
`routes/(app)/[number]/+page.svelte`, linked in as `src/routes/(app)/(modules)/contracts/…`, the
URLs `/contracts` and `/contracts/<number>`. See "Modules" in `AGENTS.md`.

"Installing" a module means adding the folder. If it has tables, also run
`pnpm db:generate --name add-<id>` and commit the migration. Then switch it on for an organization
in settings or with `org:create --modules`. Removing a module means deleting the folder plus a
migration that drops its tables. The id is stored (`organization_module.module_id`, the activity
log's `module` subjects), so renaming a module takes a migration too
(`drizzle/0008_rename-invoicing-module.sql`).

## Discovery and linking: one generator

`scripts/modules.ts` is a plain Node script that imports no app code and no packages besides the
parser of Vite+; its parts, each with a spec, are in `scripts/modules/`. The Vite config calls it
at load time, before the SvelteKit plugin syncs, and `pnpm generate` calls it before
`svelte-kit sync`, so `check`, `prepare` and editors see the output too. In dev, a small Vite plugin
(`modulesPlugin()`, `scripts/modules/watch.ts`) reruns it when a module's files come or go, and
when a `module.ts`, a route script or a file that declares extension points changes. Everything it
writes is gitignored, like `src/lib/paraglide/`, except the module entries in
`project.inlang/settings.json`. It writes a file only when its content changes.

For each folder `src/modules/<id>/` that contains a `module.ts`, it:

1. **Writes registries** next to the core code that reads them (`*.gen.ts`, gitignored), in
   dependency order (every module after the ones it `requires`, otherwise by id):
   - `src/lib/modules/manifests.gen.ts`: `import contractsModule from
"#modules/contracts/module.ts"; … export const manifests = [contractsModule, …] as const;`,
     which `#lib/modules/manifests.ts` reads.
   - `src/lib/modules/ids.gen.ts`: the ids and the graph (`requires`, `enhances`, `alwaysOn`,
     `nav.after`), for code that can't load the manifests (plain Node, the tenant loader). This
     gives the literal `ModuleId` union (`#lib/modules/ids.ts`).
   - `src/lib/server/modules/hooks.gen.ts`: the server halves (`#modules/<id>/server/index.ts`).
   - `src/lib/server/db/modules.gen.ts`: `export * from "#modules/<id>/server/schema.ts"` for each,
     merged into the `db` schema in `db/index.ts` so `db.query.contract` stays typed;
     `module-schemas.gen.ts`, each module's schema by id, for the foreign-key spec.
   - `src/lib/server/db/module-seeds.gen.ts`: the seeders, for the seed, which runs in plain Node.
   - `src/lib/extensions/contributions.gen.ts`: the contributions by file (slots, bulk actions,
     list columns), each held to its point's types; `form-parts.gen.ts`, the schemas of the
     modules' parts of core forms; `src/lib/server/lists/columns.gen.ts`, the list columns' SQL.
   - `src/lib/modules/skeletons.gen.ts`: a loader for each module page's own skeleton.
2. **Writes route stubs** (see the next section) and each `(modules)` group's guard.
3. **Lists message files**: it rewrites the module entries of `pathPattern` in
   `project.inlang/settings.json` (core entries first, then modules in id order).
4. **Checks the rules**, and stops with the full list of what's wrong: folder name = `id`
   (`^[a-z][a-z0-9-]*$`); the `requires` and `enhances` ids exist, and `requires` has no cycle; a
   module's route files are in route groups; a module with routes has an id that's not the first
   URL segment of a core route (two modules can't collide: each has its own folder); a skeleton is
   a page's; a `(modules)` folder holds only what it wrote; message sections are in every language
   and unique; an extension point's id starts with its owner's and is unique; a contribution names
   an existing point of its kind whose owner is core, the module itself, or a module it requires or
   enhances.

Why a generator and not `import.meta.glob`? Globs work for the runtime registries, but give `string`
ids instead of a `ModuleId` union. They also don't work in the plain-Node scripts (`db:seed`,
`org:create`) or in drizzle-kit, and routes need generating anyway. One generator covers all of it.

`package.json` `imports` has `"#modules/*": "./src/modules/*"`, and for the tests
`"#unit/*": "./src/tests/unit/*"` and `"#e2e/*": "./src/tests/e2e/*"`.

## Routes: generated stubs (chosen) vs catch-all vs symlinks

| Option                                                                                   | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catch-all** `src/routes/(app)/[...path]/+page.svelte` that dispatches to module pages  | **No.** Module pages drop out of `RouteId`, so typed `resolve("/(app)/(modules)/contracts/[number]")` (used in activity hrefs, nav, links) stops type-checking. You also lose `+server.ts` endpoints (the invoice PDF), nested layouts and error pages, and Kit's per-route code splitting and preloading.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Symlinks** `src/routes/(app)/(modules)/contracts → src/modules/contracts/routes/(app)` | **No** (tested on Kit 3.0.0, branch `symlink-routes-experiment`). Dev, HMR, build and serving work, and `./$types` can be made to resolve with per-module `rootDirs` (including a svelte-check-internal overlay path). But the server-only guard walks importers by real path, so it never reaches a symlinked route: a module page importing `#lib/server/…` or its own `server/` code builds without error and ships it to the browser (reproduced: the secret ends up in `build/client`). `resolve.preserveSymlinks` breaks dependency resolution under pnpm; specs in the linked folder run twice; relative imports out of the folder break for TypeScript; Windows needs Developer Mode and `core.symlinks`. |
| `kit.files.routes`                                                                       | **No.** It takes one directory and is deprecated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Monorepo packages                                                                        | **No.** Packages can export remote functions, but not routes. That's a lot of tooling for in-repo modules deployed together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Generated stubs**                                                                      | **Yes.** Every `+` file under `src/modules/<id>/routes/<groups>/` gets a small twin under `src/routes/<groups>/(modules)/<id>/`. The routes are real, so `RouteId`, `resolve()`, `$types`, layouts, endpoints and code splitting all work as usual.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Stubs look like this:

```svelte
<!-- src/routes/(app)/(modules)/contracts/[number]/+page.svelte -->
<!-- Generated by scripts/modules.ts from src/modules/contracts/routes/(app)/[number]/+page.svelte. Don't edit. -->
<script lang="ts">
	import type { PageProps } from "./$types";

	import Route from "#modules/contracts/routes/(app)/[number]/+page.svelte";

	let props: PageProps = $props();
</script>

<Route {...props} />
```

```ts
// src/routes/(app)/(modules)/invoices/[number]/pdf/+server.ts
// Generated by scripts/modules.ts from src/modules/invoices/routes/(app)/[number]/pdf/+server.ts. Don't edit.
import type { RequestEvent } from "./$types";

import { guarded } from "#lib/server/modules/hooks.ts";
import { GET as moduleGET } from "#modules/invoices/routes/(app)/[number]/pdf/+server.ts";

export const GET = guarded<RequestEvent, ReturnType<typeof moduleGET>>("invoices", moduleGET);
```

- `.svelte` route files (`+page`, `+layout`, `+error`) become a wrapper that spreads its props, so
  a layout's `children` pass through. A `.ts` route file re-exports what the module's exports,
  and a server file's (`+page.server.ts`, `+layout.server.ts`, `+server.ts`) guards each of its
  `load`, `actions` and request handlers (see the next section).
- Every `(modules)` folder is the generator's: the root `.gitignore` ignores them all
  (`/src/routes/**/(modules)/`), the generator deletes and rewrites them, and core never uses the
  name.
- **Rule:** a module's pages live in its own folder, named after its id, inside a `(modules)`
  group. It never adds files to a core folder. To add something to a core page, use a slot.
- Module pages type their params with `$app/types`, because their own `./$types` doesn't resolve
  (see "SvelteKit constraints"):
  `let { params }: { params: RouteParams<"/(app)/(modules)/contracts/[number]"> } = $props();`.
  The stub's `PageProps` check makes svelte-check verify that the module page accepts what Kit
  passes it.
- A module's `routes/` holds route files (`+` files) only. What they use (`list/`, `form/`,
  `detail/`, remote functions) is in the module's own folders, imported as `#modules/<id>/…`.

### Guarding a module's routes per tenant

Three things keep a tenant out of a module it doesn't have:

1. **Data (security):** a module's remote functions are made with its own set,
   `moduleRemote("<id>")` (`#lib/server/remote-functions.ts`), which refuses tenants without the
   module with a 404 on every call; its server files' stubs guard their `load`, `actions` and
   request handlers the same way (`guarded()`, `guardedActions()`). It's what keeps South out of
   contracts even if it calls the endpoints directly.
2. **Pages (UX):** the generator writes a universal `+layout.ts` into each `(modules)` group:
   ```ts
   // src/routes/(app)/(modules)/+layout.ts, generated
   import { guardModuleRoute } from "#lib/modules/route-guard.ts";
   export const load = async ({ route }) => {
   	await guardModuleRoute(route.id); // error(404) unless the tenant has the route's module
   };
   ```
   The module is the segment after `(modules)` in the route id, so no list of modules ships with
   it. The tenant's modules come from a cached remote query (`getTenantModules`), so the guard
   runs on the server while it renders a page and in the browser on a navigation, without asking
   the server for `__data.json`. A tenant without the module gets the app's own 404 page inside the
   app layout, instead of a page shell whose queries fail.
3. `loadTenant()` (`src/lib/server/auth/session.ts`) keeps only the modules that are on and whose
   requirements are (`effectiveModules()`), so a leftover `organization_module` row for a deleted
   module does nothing.

## The client manifest (`module.ts`)

A module's manifest says who it is and where it stands; what it adds to other pages and logic is
not in it (see "Extension points" below). `defineModule()` is in `src/lib/modules/define.ts`, apart
from the registry (`src/lib/modules/manifests.ts`, which imports every `module.ts`), so a
`module.ts` can load without coming back round to itself:

```ts
// src/modules/contracts/module.ts. Imports only messages, icons, types, `import()` loaders and
// its own small files: this is in every tenant's bundle.
import FileCheckIcon from "@lucide/svelte/icons/file-check";

import { defineModule } from "#lib/modules/define.ts";

import { contractSubjects } from "./activity.ts";

export default defineModule({
	id: "contracts",
	label: m.contracts_module_name,
	description: m.contracts_module_description,
	route: "/(app)/(modules)/contracts",
	icon: FileCheckIcon,
	subjects: contractSubjects,
	// Materials only for the seed: the call-outs it makes get material lines.
	enhances: ["invoices", "materials"],
});
```

```ts
// src/lib/modules/manifests.ts (core), shortened
interface ModuleParts {
	route: RouteId; // the module's section, for `resolve()` and the sidebar
	icon: Component;
	subjects?: Record<string, SubjectType>; // how the activity log reads its records
	actions?: Record<string, Sentence>; // its activity verbs, e.g. invoices' `issued`
	requires?: readonly ModuleId[]; // literals: the generator reads them with a pattern
	enhances?: readonly ModuleId[];
	alwaysOn?: true;
	nav?: { after: CoreNavId | ModuleId }; // where its sidebar entry goes
}
export interface ModuleManifest<Id extends string = string> extends ModuleParts {
	id: Id;
	label: () => string; // message functions, read when shown (never at module scope)
	description: () => string;
}
```

`defineModule()` returns the manifest with `label` and `description` as getters, which is what the
registry's `AppModule` has. The registry lists the modules in dependency order; there is no `order`
field.

- **Lazy loading:** everything except the manifest is behind an `import()` (the registries list a
  contribution's component as a loader), so a tenant without the module never downloads its
  components, pages or remote calls. Only the manifest is eager, which is why it may import
  nothing heavy. The boundaries spec checks that (see "Keeping modules honest").
- **Nav:** `app-sidebar.svelte` builds the sidebar's "Modules" group from the modules' `route`,
  `icon` and `label`; a module whose manifest says `nav: { after: "orders" }` goes right after
  that entry instead (`placeNav()`, `#lib/modules/nav.ts`). One entry per module.

### Extension points, declared by their owners

An extension point is a typed value declared with `#lib/extensions/define.ts` by its owner: core in
`src/lib/<domain>/extensions.ts` (and `src/lib/dashboard/extensions.ts`,
`src/lib/portal/extensions.ts` for those pages), a module in its `api/extensions.ts`. The id starts
with the owner's id and is a string literal, so the generator reads it without running the file:

```ts
// src/lib/orders/extensions.ts (core), some of them
export const detailSide = defineSlot<{ number: string }>("orders.detail.side");
export const list = defineBulkTable<OrderBulkRow>("orders.list");
export const form = defineFormSlot<{ order: { id: number } | undefined }>("orders.form");
export const committed = defineEvent<OrderChange>("orders.committed");
export const saving = defineSaveHook<OrderSaving, OrderProblem>("orders.saving");
```

The points that exist: the slots `dashboard.cards`, `dashboard.stats`, `orders.detail.side`,
`equipment.detail.side`, `portal.order` and contracts' `contracts.detail.side`; the form slot
`orders.form`; the bulk table `orders.list`; the list columns `equipment.list`
(`defineListColumns()`); the hooks `orders.costs`, `orders.adjustPrices`, `orders.tag`,
`orders.committed`, `orders.saving` and invoices' `invoices.billableItems`. A point is added when a
module needs one.

A module contributes by file, except to hooks (see "The server half"):

- a component at a slot: `slots/<point id>/<name>.svelte` (contracts'
  `slots/orders.detail.side/coverage.svelte`);
- bulk actions: the default export of `bulk-actions/<point id>.ts`, an array of `BulkAction`s;
- a part of a core form: components at `slots/<point id>/` with the part's valibot schema as the
  default export of `form-parts/<point id>.ts`;
- columns in a core list: `columns/<point id>.ts` and `server/columns/<point id>.ts` (see
  "Tables").

The generator lists them in `src/lib/extensions/contributions.gen.ts` with `slotContribution()`,
`bulkContribution()`, `formSlotContribution()` and `columnsContribution()`, which hold each to its
point's types, so svelte-check refuses a component whose props don't fit its slot.

- **Rendering:** the owner's page renders a slot with
  `<ExtensionSlot point={detailSide} props={{ number }} />`
  (`src/lib/extensions/extension-slot.svelte`), which shows the contributions of the tenant's
  modules in registry order, each in a `<svelte:boundary>` of its own whose `failed` snippet shows a
  notice (and logs), so a broken module can't take down a core page. A table gets its contributed
  bulk actions with `extensionBulkActions(list)` (`src/lib/extensions/bulk-actions.svelte.ts`).
- **Buttons in various places** would be slots too (`order.actions`, `customer.actions`, …): a
  component can render a `Button`, open its own dialog and call its own remote functions, which is
  more flexible than a declarative button spec. None of these slots exists yet.

### Tables: columns, filters, row and bulk actions

Bulk actions are contributed by file (above): invoices adds "Create invoice" to the orders list's
selection with `bulk-actions/orders.list.ts`.

Module columns exist in one core list so far, the equipment list (maintenance's next due date).
The list is server-side, so a module column has a client half and a server half, which share the
column id (namespaced, `maintenance.nextDue`) so that URLs and saved views agree:

- `columns/equipment.list.ts` (isomorphic): the default export is an array of
  `listColumn({ id, param, label, sort, filter, optionLabel, cell })`, listed in
  `contributions.gen.ts` and loaded per tenant (`loadListColumns(point)`,
  `#lib/extensions/list-columns.ts`).
- `server/columns/equipment.list.ts`: the default export is an array of
  `columnSql(column, () => ({ value, sort, nullsLast, filter, facet }))`
  (`#lib/server/lists/column-sql.ts`), listed in `src/lib/server/lists/columns.gen.ts`.

The list names its point in its definition (`defineList({ moduleColumns: listColumns })`). The
page merges the tenant's columns into the list (`extendList()`) before it reads the URL, and the
server merges their SQL (`withModuleColumns()`) and checks the query against the merged list, so a
tenant without the module gets neither the column nor its URL parameter (the lenient URL drops it,
and a remote query naming it is a 400). Sorting and set filters only; see "Server-side lists" in
AGENTS.md and `maintenance-plans-implementation.md`. Not built yet: module columns in other lists,
grouping by a module's column, module filters without a column, and row actions.

## The server half

### Hooks: points declared by their owners, contributed in code

Hooks are extension points like the slots: each is declared by its owner (above) and has a kind
that fixes how it runs. A module contributes in its `server/index.ts`, importing the point from its
owner, so the types follow the declaration:

```ts
// src/modules/contracts/server/index.ts, shortened
import { adjustPrices, committed, tag } from "#lib/orders/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { billableItems } from "#modules/invoices/api/extensions.ts";

export default defineServerModule("contracts", [
	contribute(adjustPrices, async (orders) => …), // Map<order id, PriceAdjustment[]>
	contribute(tag, async ({ orders, now }) => …),
	contribute(committed, ({ number }) => void getOrderCoverage(number).refresh()),
	contribute(billableItems, async (input) => …),
]);
```

The owner calls a point through the kernel, `src/lib/server/extensions.ts`, for the modules that
are on, in registry order: `collect()`, `emit()`, `vote()` or `save()`. Each point has one caller
in its owner's domain (`priceOrders()`, `tagOrders()`, `orderCommitted()` and `saveOrderParts()` in
`src/lib/orders/server/`, `offeredItems()` in invoices' `server/billable.ts`), so you can follow it
with "go to definition", unlike a string-keyed event bus.

The kinds, and their rules:

| Kind                                                                   | Runs                                                                 | Order                                            | Errors                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Collector** (`orders.costs`, `adjustPrices`, `tag`, `billableItems`) | in parallel, on a batch (a page of rows at once)                     | answers in registry order                        | per point: `fail` (the request fails: a broken price must not quietly become a wrong total) or `skip` (logged, answer left out) |
| **Event after commit** (`orders.committed`)                            | after the outermost transaction commits, in the same request         | registry order                                   | caught and logged                                                                                                               |
| **Vote** (none declared yet)                                           | every contributor is asked                                           | any refusal wins                                 | throw: fails the request                                                                                                        |
| **Save hook** (`orders.saving`)                                        | in the owner's transaction (the input carries it), one after another | registry order; the first problems stop the rest | problems: the owner refuses the change (`OrderRefused`), rolling the transaction back                                           |

"Registry order" is dependency order (every module after the ones it requires), otherwise by id, so
it's deterministic.

The plan's guards (`refuseChange`, `refuseDelete`) became the vote kind, which no point uses yet;
its "event in the transaction" (`saved`) became the save hook, which materials uses to save its
order lines and move stock with the order (`saveOrderParts()` is called by every change to an
order's status, its form's save and its deletion).

After-commit is `afterCommit()` in `drizzleQueued` (`src/lib/server/db/serialize.ts`): an
`AsyncLocalStorage` list of callbacks per outermost transaction, run once it resolves (outside the
queue, so they don't hold up other writers); outside a transaction, a callback runs at once.
The old `orderSaved(number)` became `orders.committed`. The `invoiced` check in `isEditableOrder`
stayed in core; see "Where to draw the line".

### Who may declare a point

The plan was that core declares every extension point and modules never import each other, not
even types. That held until a module needed another: invoices declares `invoices.billableItems`
(contracts offers its fees there) and contracts declares `contracts.detail.side` (maintenance shows
a contract's plans there). A module now declares its points in its `api/extensions.ts`, and may
import another module's `api/` only along its `requires`, or only `api/extensions.ts` and types
along its `enhances`. Core still never imports a module. See
[module-dependencies.md](module-dependencies.md), sections 2 and 3.

## Database

- **Schema per module:** `src/modules/<id>/server/schema.ts`. `drizzle.config.ts` uses
  `schema: ["./src/lib/server/db/schema.ts", "./src/modules/*/server/schema.ts"]`. `db/index.ts`
  and `migrations.spec.ts` merge in `db/modules.gen.ts`.
- **One migration stream** in `drizzle/`. Per-module streams would need separate journals and
  migration tables, and core migrations (renaming `equipment`, say) would have to be ordered
  against module migrations that reference them. All modules ship together, so there's nothing to
  gain. Tables exist for every tenant; switching a module on or off is data
  (`organization_module`), never schema. A data migration switches a module on for the existing
  organizations when a core feature becomes one (`0003_enable-schedule.sql`,
  `0005_enable-materials.sql`).
- **Foreign keys point from module to core, or to a module it requires.** Module tables reference
  core tables with the same composite tenant keys as core's (`(organization_id, customer_id) →
customer`, columns from `#lib/server/db/columns.ts`), and module relations reference core tables.
  Core never gets a relation or foreign key to a module table.
  `src/tests/unit/lib/server/db/modules.spec.ts` checks both, with each module's schema from
  `module-schemas.gen.ts`. `refuseIfReferenced()` (`src/lib/server/db/errors.ts`) turns "a module
  row still refers to this" into a clear refusal (deleting an order or a unit, and
  `deleteAndLog()`).
- **Table names:** `contract`, `contract_equipment`, `invoice`, `invoice_line` and
  `invoicing_settings` kept their names when they moved, and so did `material`, `order_line` and
  `stock_movement` when materials became a module; renaming costs a migration for nothing. New
  modules use their id as a prefix when the name isn't obviously theirs (`maintenance_plan`).
- **Moving the existing tables was a no-op.** Moving `contract`/`invoice` from `schema.ts` into
  module files made `pnpm db:generate` produce _no_ migration; `migrations.spec.ts` fails while the
  schema has changes no migration makes.
- **Seed:** each module has a `server/seed.ts`, `export default defineSeed({ … })`
  (`src/lib/server/db/seed/module-seed.ts`), run for the tenants that have the module, in
  dependency order. `generate(draft, previous)` makes its data for a tenant right after the core's,
  with the same faker (so the demo data doesn't change with where the module's code lives), and may
  add to the core's draft (contracts adds call-out orders); `run(context)` inserts it; `clear(tx)`
  empties its tables. A module whose data the core used to make in the middle of its own
  (materials) also has steps `during` the core's generation. Seed-time collectors mirror the
  runtime hooks (`costs()`, `adjustPrices()`, `billableItems()`): contracts answers with the price
  adjustments and fees it implies, and invoices' seed asks a tenant's `collect` in `run()` and
  bills them without knowing contracts. This was the fiddliest part of the migration.

## Translations

- Module messages live in `src/modules/<id>/messages/<locale>/<section>.json`, using the same rule
  as core: **the file name is the key prefix.** The sections are `contracts`, `invoices`,
  `maintenance`, `materials` and `schedule`, each its module's id.
- The module keys that sat in core files moved into the module's file and got its prefix:
  `common_module_contracts` → `contracts_module_name`, `enum_contract_level_*` →
  `contracts_level_*`, `activity_subject_contract` → `contracts_activity_subject`,
  `activity_action_issued` → `invoices_action_issued`, and so on.
- `src/tests/unit/lib/i18n/messages.spec.ts` reads the file list from `settings.json`, accepts the
  modules' `./src/modules/<id>/messages/{locale}/<section>.json`, checks that sections are unique
  across core and modules, and that the module entries match the folders on disk (so the generated
  list can't go stale). The generator checks the sections too, before it writes the list.

### Labels

`labels.ts` keeps one static map for core kinds, and a factory lets modules own their kinds:

```ts
// src/lib/i18n/labels.ts
export function defineLabels<L extends Record<string, Record<string, () => string>>>(labels: L) {
	… // the same API, bound to `labels`
}
export const { hasLabel, label, labelOrValue, withLabels, labelOptions } = defineLabels(coreLabels);

// src/modules/contracts/labels.ts
export const contractLabels = defineLabels({ contractLevel: { basic: m.contracts_level_basic, … } });
```

So `labels.ts` imports no module.

### Activity log

- A module's `subjects` and `actions` (its verbs) come from the manifest. `actionSentence()`
  (`src/lib/activity/subjects.ts`) reads **all** manifests' actions, not only the enabled ones, so
  the log still reads correctly after a module is switched off.
- `activityActions` (`models.ts`) keeps core's verbs:
  `ActivityAction = CoreActivityAction | ModuleAction`, where `ModuleAction` is derived from the
  registry (`#lib/modules/manifests.ts`). The `activity.action` column is a plain TypeScript enum in
  SQLite (there's no CHECK constraint), so new verbs need no migration.

## Tests

- **Tests are never next to their subject.** A module's specs are in
  `src/modules/<id>/tests/unit/`, mirroring the module's folders (`server/billing.ts` is tested by
  `tests/unit/server/billing.spec.ts`), and its end-to-end tests in `src/modules/<id>/tests/e2e/`,
  importing the core's helpers as `#e2e/app.ts`. The core's are in `src/tests/unit/` and
  `src/tests/e2e/`. The generator and the boundary specs treat what's in a module's `tests/` as
  tests, not as the module's code.
- `vite.config.ts` names both kinds of folder in each Vitest project: the Node projects take
  `src/tests/unit/**` and `src/modules/*/tests/unit/**` (and `scripts/**/*.spec.ts`), the browser
  project their `*.svelte.spec.ts` minus any `server/` folder, the `e2e` project
  `src/tests/e2e/**/*.test.ts` and `src/modules/*/tests/e2e/**/*.test.ts`.
  `optimizeDeps.entries` adds `src/modules/**/*.svelte` and `src/modules/*/module.ts`.
- **Each module's e2e covers three cases:** a tenant that has it (North); a tenant without it, where
  routes 404, the nav lacks it, the slots are empty and its remote queries are refused; and tenant
  isolation. In the seed, North has every module and South only invoices and materials.
- Core specs test core with made-up modules (`src/tests/unit/lib/modules/fakes.ts`, mocked in as
  `manifests.gen.ts` or passed as the registry). The plan's core e2e test "with every module
  switched off" doesn't exist: South has two modules, and a module's absence is covered by each
  module's own e2e.
- A core e2e test of something a module changes can't import the module's helpers, so
  `src/tests/e2e/contracts-helpers.ts` (the contracts' effect on prices and billing, in SQL) stays
  in core, and the e2e of contracts and invoices import it from there.

## Keeping modules honest (type safety and boundaries)

- `defineModule` and `defineServerModule` check each module against core's types. The generated
  `as const` registries make `ModuleId` a literal union, so `requireModule("contrcts")` and a
  manifest `route` that doesn't exist are type errors; `contributions.gen.ts` holds each
  contribution to its point's types.
- The stubs make svelte-check verify that each module page accepts its route's `PageProps`.
- `src/tests/unit/modules/boundaries.spec.ts` scans imports and writes, with the graph from the
  manifests:
  - nothing outside `src/modules/` imports `#modules/…`, except what the generator writes (the
    registries and the route stubs);
  - a module imports another module only as `#modules/<other>/api/…`, and only one it `requires`;
    for one it `enhances`, only `api/extensions.ts` and types (`apiImports`);
  - a module's `.insert()`, `.update()` and `.delete()` take only its own tables (`foreignWrites`);
  - `module.ts` imports only messages, icons, `#lib/modules/define.ts`, types, `import()` loaders
    and its own small files at the root (`activity.ts`, `labels.ts`), and no remote functions.
- `src/tests/unit/lib/server/db/modules.spec.ts` checks that no core table has a foreign key to a
  module table, and that a module's tables reference only core tables and those of modules it
  requires (`getTableConfig(table).foreignKeys`).
- `src/tests/unit/lib/domain-boundaries.spec.ts` checks that a module's `routes/` holds `+` files
  only.

## Where to draw the line

**Core** is what every tenant has, or what other things depend on: tenancy, auth and members, the
activity log, data tables and forms, customers, equipment, engineers, orders, the engineer portal,
the dashboard shell, the pricing pipeline, and the extension points core owns.

**A module** is something a tenant can switch off without breaking anything else. It only _adds_,
and its data references core (or a module it requires). Don't make always-on features into
"plugins": they'd pay for the indirection (lazy loading, registries, no direct imports) and get
nothing back. This line has moved since: [module-dependencies.md](module-dependencies.md) sets the
direction "every feature is switchable except a small kernel", and the schedule and materials (with
its stock and order lines) became modules once the extension points they needed existed.

**One accepted leak: the `invoiced` order status.** It's core data (`orderStatuses`,
`isEditableOrder` in `src/lib/models.ts`, the status badge), but only the invoices module sets it,
through the core service `setOrdersStatus()` (`src/lib/orders/server/order-changes.ts`).
Abstracting it into a generic "locked by a module" status plus a vote on order changes means a data
migration and wider changes for a single consumer. It stays, documented as set by the invoices
module, until a second module needs to lock orders.

## Migrating contracts and invoicing, in small mergeable steps

All eight steps are done; step 7 goes on, one extension point at a time. The steps are kept as
history: the plan text of each, then a `_Done…_` note that says what was built differently, with
the paths of the time and, where a file has moved since, where it is now.

Each step left `pnpm check` and `pnpm test` green and merged on its own.

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
   _Done. The models are now each module's `model.ts`, the labels its `labels.ts`._
2. **Reshape the server hooks** (`ServerModule` grouped by domain; `committed` + `afterCommit()`
   replaces `orderSaved`). Small, and testable with the existing `modules.spec.ts` and
   `pricing.spec.ts`.
   _Done. The interface of optional methods grouped by domain was replaced later by extension
   points declared by their owners and contributed with `contribute()` (module-dependencies, step
   1; see "The server half"). `afterCommit()` and `orders.committed` stayed._
3. **Infrastructure with zero modules:** the generator and its Vite plugin, `pnpm generate`,
   `#modules`/`#e2e` aliases, the vitest globs, the drizzle schema glob, merging `db/modules.gen.ts`,
   the seed loader, `messages.spec`, the boundaries spec, `defineModule`. During the transition,
   `modules` = the old static list + `manifests`, so both kinds work side by side.
   _Done (see "Modules" in AGENTS.md), proven with a throwaway module. Differences from the text
   above: `defineModule()` lived in `src/lib/define-module.ts` (now `src/lib/modules/define.ts`),
   not in the registry, so a `module.ts` can load without the registry that imports it (a cycle);
   it returns the manifest with `label` and `description` as getters, which is what `AppModule`
   already has. `module-ids.gen.ts` (now `src/lib/modules/ids.gen.ts`) lists the ids for plain Node
   (the registry can't load there). The stubs repeat literal page options and name the other
   exports (`export *` makes Kit give up on static analysis), and a layout stub renders its
   `children` itself (Kit warns otherwise). `src/lib/server/db/columns.ts` shares
   `organizationId()`/`createdAt()` with the module schemas. No `nav` or `order` field: `route` and
   `icon` were enough for the sidebar. `nav: { after }` came later with the schedule module, and the
   registry order became dependency order, not an `order` field._
4. **Move contracts** to `src/modules/contracts/`. This is mostly `git mv` plus rewriting imports:
   `lib/components/contracts/*` → the module root, `lib/server/contracts.ts` → `server/`, its
   tables → `server/schema.ts` (`db:generate` must produce nothing), `src/routes/(app)/contracts/**`
   → the module's `routes/(app)/**` (linked back in as stubs, `src/routes/(app)/(modules)/contracts/`,
   so the URLs stay `/contracts/…`), its messages, its seed slice → `server/seed.ts`,
   `e2e/contracts.test.ts` → `e2e/`. Remote function URLs change with their file paths; that's
   harmless, but expect `moduleQueries` in its e2e to pick up the new names.
   _Done. Differences from the text above: `lib/server/contracts.ts` became `server/index.ts`
   (the hooks) and `server/contracts.ts` (`coverageOf()`, `overlappingCoverage()`, its number
   target); the files in `lib/components/contracts` sit at the module root (links and badges later
   moved to `ui/`), and the pages' own helpers in the module's folders by feature (`list/`,
   `form/`): its `routes/` holds route files only. Numbering takes a module's own target:
   `nextNumber(tx, { format, table, column })` and `formatCode(format, …)`, with `contract` gone
   from `numberFormats`. The seed needed more than a move: contract terms depend on the faker's
   state after the core's data, and the call-outs add orders and change units, so a module seed has
   a `generate()` step in the tenant loop (with `previous`, for ids that continue across tenants)
   before its `run()`, and the collectors `adjustPrices()` and `billableItems()` that invoicing's
   seed asks instead of reaching into contract data; the seeded data is identical (compared
   with a frozen clock). The registries list the folders before the static list, so the order stays
   contracts, invoicing until invoicing moves. Core e2e tests of prices (customers, equipment
   detail) keep their SQL helper `e2e/contracts-helpers.ts` (now
   `src/tests/e2e/contracts-helpers.ts`) in core, since the boundaries spec forbids importing the
   module's. The module's e2e tests are now in `tests/e2e/`._
5. **Move invoicing** the same way, including the PDF `+server.ts` and `/invoices/settings`.
   Invoicing's seed then bills contract fees through the seed collectors.
   _Done. Differences from the text above: `invoices.remote.ts` and `lib/server/invoicing.ts` were
   split as they moved (file-splits plan, A.1 and A.2): the remote functions into
   `invoices.remote.ts` (list, one invoice, creation), `invoice-status.remote.ts`,
   `[number]/draft.remote.ts` (now `detail/draft.remote.ts`) and `settings/settings.remote.ts` (now
   `settings.remote.ts`, at the module's root), with `refreshInvoice()` in
   `invoice-refresh.server.ts` (now `server/invoice-refresh.ts`); the server code into
   `server/billable.ts`, `server/invoices.ts`, `server/settings.ts` (apart because both of the
   others need it) and the hook in `server/index.ts`. The invoice number format is the module's
   (`invoiceNumberFormat` in `model.ts`, `invoiceNumbers` as the target of `nextNumber()`), with
   `invoice` gone from `numberFormats`. The seed makes the invoices in `run()`, not `generate()`:
   they follow from the draft's orders (kept by reference) and need every module's data for the
   collectors, which `generate()` can't promise whatever order the modules are in, so a tenant's
   `collect` is passed to `run()`; the seeded data is identical (compared with a frozen clock). The
   e2e SQL that spans both modules (the covered CTE, the fee references) is in
   `e2e/contracts-helpers.ts` (now `src/tests/e2e/`), and the core tests of what invoicing adds
   (the bulk action on the orders list, the Dutch invoices) are in the module's e2e folder (now
   `tests/e2e/`). The module, then `invoicing`, has since been renamed `invoices`, the name its
   route and its message section already had (`drizzle/0008_rename-invoicing-module.sql` renames
   the stored id)._
6. **Remove the transition code** (the static list, `#lib/components/{contracts,invoicing}`) and
   update CLAUDE.md: the "Modules" section below, and the "Where files go" text from Part 1.
   _Done. The static list went with the move of invoicing (`modules`, `moduleIds` and the server
   registry are the generated ones), and `slotLoaders()` and `bulkActionLoaders()` took the
   registry as an optional argument, so the core's specs test the extension points with made-up
   modules (`src/lib/fake-modules.ts`, now `src/tests/unit/lib/modules/fakes.ts`, mocked in for the
   generated manifests, now `manifests.gen.ts`) instead of the real ones. The loaders have since
   given way to the contributions by file (`contributions.gen.ts`, `<ExtensionSlot>`,
   `extensionBulkActions()`). AGENTS.md describes the finished system._
7. **Add extension points when they're needed:** `order.actions` and the other action slots,
   `settings.cards`, row actions, module table columns and filters, guards. Build each when its
   first user arrives.
   _Going on. Came with their first users: module columns in the equipment list (sorting and set
   filters) and contracts' slot `contracts.detail.side` (maintenance); the collector
   `orders.costs`, the save hook `orders.saving`, the form slot `orders.form` with its parts'
   schemas, and the slots `dashboard.stats` and `portal.order` (materials). Not built:
   `order.actions` and the other action slots, `settings.cards`, row actions, module filters
   without a column, module columns in other lists, and a point of the vote kind (the plan's
   guards)._
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
   `src/routes`. One commit per domain. Since then: the domains' files left `src/routes` too
   ([domain-folders.md](domain-folders.md)); materials became a module, so its stock, materials and
   order lines are in `src/modules/materials/server/` (`stock.ts`, `materials.ts`, `lines.ts` with
   `checkLines()` and `saveLines()`); the specs moved to `src/tests/unit/` (the display spec's
   checks to each domain's `display.spec.ts`, sharing `src/tests/unit/lib/display.test-support.ts`)._

### AGENTS.md: the "Modules" section

The text this plan proposed for CLAUDE.md was replaced by AGENTS.md's "Modules" section, which
describes the system as built and grew with it. In short:

```md
## Modules

Optional modules (things a tenant can switch off) are folders `src/modules/<id>/`, each
self-contained: `module.ts` (its manifest, `defineModule()` from `#lib/modules/define.ts`: label,
description, `route`, icon, `nav`, `subjects`, `actions`, `requires`/`enhances`/`alwaysOn`; in
every tenant's bundle, so small), `server/` (`index.ts` with `defineServerModule()`, `schema.ts`,
`seed.ts` with `defineSeed()`, its logic), `routes/` (its pages, by route group, under its id:
`routes/(app)/+page.svelte` is `/<id>`), its components in folders by feature, its contributions
by file (`slots/`, `bulk-actions/`, `columns/`, `form-parts/`), `api/` (what other modules may
use), `messages/<locale>/<section>.json` and `tests/`.

- `scripts/modules.ts` (run by Vite and `pnpm generate`) links the folders in: registries
  (`*.gen.ts`), route stubs in `src/routes/<groups>/(modules)/<id>/` (every `(modules)` folder is
  gitignored and the generator's: never edit them), a universal 404 guard per `(modules)` group,
  and the message files in `project.inlang/settings.json`.
- Extension points are declared by their owners (`#lib/extensions/define.ts`): core's in
  `#lib/<domain>/extensions.ts`, a module's in its `api/extensions.ts`. Modules contribute by
  file, and to hooks in `server/index.ts` with `contribute()`; the owner calls them through
  `#lib/server/extensions.ts` (`collect()`, `emit()`, `vote()`, `save()`).
- Core never imports a module; a module imports another's `api/` only along its `requires` (only
  `api/extensions.ts` and types along `enhances`), and writes only its own tables.
- Every remote function of a module is made with its own set, `moduleRemote("<id>")`, and every
  server file of it is guarded by its stub: both refuse tenants without the module.
- Module tables reference core tables (composite tenant keys as usual) and those of the modules
  they require, never the reverse; one migration stream in `drizzle/`.
- A module's pages live in its own folder, named after its id, inside a `(modules)` group; to add
  to a core page, use a slot.
```

---

## Priorities, sizes and risks

As planned before the build; every step is done (step 7 goes on as needed).

| #   | Step                                                                                       | Size                          | Why this order                                                          | Status   |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------- | -------- |
| 1   | Untangle core from the modules in place (labels, models, messages, verbs, ids, e2e helper) | M (2–3 days, 6 small PRs)     | Useful even if nothing else happens, and every later step depends on it | done     |
| 2   | Reshape the server hooks, plus `afterCommit()`                                             | S (1 day)                     | Settles the server contract before the files move                       | done     |
| 3   | Generator, registries, stubs, guard, config globs, specs, with zero modules                | M (2–3 days)                  | The riskiest new piece; prove it with nothing to move yet               | done     |
| 4   | Move contracts                                                                             | M (1–2 days)                  | Smaller module, fewer outside touches                                   | done     |
| 5   | Move invoicing (+ seed collectors)                                                         | M (2 days)                    | PDF endpoint, settings page, cross-module billing in the seed           | done     |
| 6   | Remove the transition code, update CLAUDE.md                                               | S                             |                                                                         | done     |
| 7   | New extension points, as needed                                                            | S each                        | YAGNI until a module asks                                               | going on |
| 8   | Domain folders in `src/lib` (Part 1)                                                       | S–M (about 1 day, mechanical) | Nice to have; cheaper after 4–5                                         | done     |

**Risks**, as weighed before the build, with what became of them:

- **Generator lifecycle.** The stubs and `*.gen.ts` files must exist before `svelte-kit sync`,
  svelte-check and the editor read them. Mitigation, as built: the generator runs at the top of
  `vite.config.ts`, in `pnpm generate` (which `prepare`, `check` and CI run), and in the dev
  watcher. Test a fresh clone with `pnpm install && pnpm check`.
- **Stub edge cases.** A layout's `children`, `+error.svelte`, page options exported from a
  module's `+page.ts` (`export *` hides them from Kit's static analysis, so it loads the module
  instead), and HMR through the wrapper. Checked in step 3 with a throwaway test module: the stubs
  repeat literal page options and name the other exports.
- **The generator edits a committed file** (`project.inlang/settings.json`). It is deterministic,
  and `messages.spec.ts` catches drift.
- **Seed untangling** (step 5) was the most intricate part: invoicing's seed prices orders the way
  the contracts module would, through the seed collectors.
- **Module bundle discipline.** The manifests are eager. If one grows (heavy imports in `module.ts`
  or `activity.ts`), every tenant pays for it. The boundaries spec guards this.
- **Scope creep.** The catalogue of extension points can grow without limit. Only add one when a
  module needs it.
