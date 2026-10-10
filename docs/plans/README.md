# Refactoring plans

Three plans from a clean-up and planning pass (October 2026). Nothing in them is implemented yet.

| Plan                                                             | Covers                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [feature-folders-and-plugins.md](feature-folders-and-plugins.md) | Whether to group code by feature (`src/features/`), and a plugin system for the optional modules |
| [table-query.md](table-query.md)                                 | The server-side tables: `tableParams` as a typed object, one list definition per table           |
| [file-splits-and-cleanup.md](file-splits-and-cleanup.md)         | Files over ~300 lines, repeated code, names, dead code, placement                                |
| [domain-folders.md](domain-folders.md)                           | The core domains' files leave `src/routes` for `src/lib/<domain>/`, with barrels (done)          |

## The decisions in short

- **No `src/features/` for the core.** The route folders already are the feature folders, and the
  core domains are too intertwined for feature folders to have real boundaries. Optionally, later:
  domain folders `src/lib/<domain>/` (with `server/`) instead of `src/lib/components/<domain>/` plus
  flat `src/lib/server/*.ts`.
- **Optional modules become self-contained folders**, `src/modules/<id>/`. A generator links each
  folder into the app (route stubs, typed registries, message files). Core declares every extension
  point as a typed interface. Modules never import each other, and core never imports a module.
  The name stays "module".
- **Table queries take a typed object**, validated by a valibot schema generated from one list
  definition per table. The URL grammar only does URL ↔ table state. Saved views keep storing URL
  strings. The join chain, counts, facets and bulk ids are written once per table.
- **Split the long remote files** by responsibility (list / record / bulk). Each split updates its
  importers' paths rather than re-exporting, because remote functions are identified by their file.
  Add a few shared helpers: tenant-scoped lookups and joins, numbering, bulk changes, roles,
  breadcrumbs and stat cards.

## How the plans fit together

Where they overlap:

- **List queries.** The cleanup plan moves each list's query code into its own file
  (`order-list.remote.ts`, …) unchanged; the table-query plan then reshapes that file. Splits first.
- **Module files.** Contracts' and invoicing's long files (`invoices.remote.ts`, `invoicing.ts`,
  their seed sections) are split _as part of_ moving them into `src/modules/`, not before.
- **Seed.** Splitting `seed.ts` into a `seed/` folder (cleanup) with separate contracts and
  invoicing files makes the per-module seeds (plugins) a move instead of an untangling. Do the split
  first.
- **Data table.** `data-table.svelte`'s split waits for the table-query changes (`grouping.ts`, the
  `groups` prop).
- **Module table columns** (plugins, "Tables") must fit the typed list definitions (table-query):
  module columns are namespaced (`contracts.covered`) and merged into a list's definition and SQL
  per tenant. That needs some design work. It's deferred until a module needs a column.
- **Entity links and badges** live together per entity, whether in `#lib/components/<entity>/` (now,
  with the CLAUDE.md exception the cleanup plan proposes) or in `#lib/<domain>/` (later).

## Order of work

Each phase merges before the next. Within a phase, the items touch different files and can go to
parallel agents in their own worktrees.

1. **Foundations** (parallel) ✅ done
   - Cleanup batch 0: one `Transaction` type, the tenant helpers (`idInTenant`, `tenantJoin`, …),
     numbering, roles, `bulkChange`/`deleteAndLog`/`refuse`, pricing SQL, the shared components
     (breadcrumbs, stat card, submit button), default column header, dead code.
   - Plugins step 1: untangle core from contracts and invoicing in place (labels, models, messages,
     activity verbs, module ids, e2e helper).
   - Table-query steps 1–2: the list definition module and the typed planner, beside the old ones.
2. **Sections** (parallel) ✅ done: cleanup batch 1 for orders, materials + equipment, customers +
   engineers, schedule/members/portal/dashboard, activity, seed and e2e support. Contracts and
   invoicing get only the shared helpers here.
3. **Typed table queries** ✅ done: table-query steps 3–6 (orders, equipment, materials, then remove the
   string path), then cleanup batch 2 (the data-table split).
4. **Modules** ✅ done: plugins steps 2–6 (server hooks and `afterCommit()`, the generator with
   zero modules, move contracts, move invoicing, remove the transition code).
5. **Optional** ✅ done: domain folders in `src/lib`, splitting the largest e2e files (orders,
   equipment, contracts; invoicing only in two), `knip` (`pnpm knip`), and one rule for import
   extensions (a file is imported by its real extension, checked by `src/import-extensions.spec.ts`).

All phases are done. Plugins step 7 (new extension points) stays as planned: add one when a
module needs it.

## Next: module dependencies

[module-dependencies.md](module-dependencies.md) (design, October 2026): modules that depend on
each other, extension points declared by their owners, roles that come with a module, and the
schedule and engineer portal as the first core features turned into switchable modules. Not built
yet.

Implementation plans, one per step of its order of work:

1. [module-dependencies-1-machinery.md](module-dependencies-1-machinery.md) ✅ done: the dependency graph,
   switching on and off, `api/` boundaries and extension points declared by their owners.
2. Roles, 3. the schedule pilot, 4. the portal pilot, 5. the inspector: written once step 1 is merged.

Carried from step 1 into the later plans (from its reviews):

- **Schedule plan** (the first module with `requires`): the e2e for the settings page's dependency
  prompts and a tampered refusal; decide and test whether a stale `organization_module` row may
  block unrelated switches (`changeModules()` checks the whole resulting set); the refusal messages
  for an empty or always-on submission and a refusal shown inside the switch-off dialog; the
  generator refusing an `alwaysOn` module that requires a switchable one; `org:create --modules`
  checking requirements (through `changeModules()`).
- **Merging the held `deferred-dashboard-slots` branch** (dashboard module cards rendered in the
  browser): port its `deferred` option from `module-slots.svelte` to `<ExtensionSlot>`.
- **Later, when they bite:** `foreignWrites` missing tables imported through
  `#lib/server/db/modules.gen.ts`; renaming `src/lib/server/modules/hooks.ts` (now only route
  guards) to avoid two `hooks.ts`; settling `vote`'s semantics with the first real vote; the
  generator's manifest and point readers matching inside comments or skipping annotated
  declarations.

## Worth weighing before phase 4 (decided: built)

The generator (route stubs, `*.gen.ts` registries, the 404 guard per module) is the largest new
piece of infrastructure in these plans. It pays off once there are more than the two current
modules. Plugins steps 1–2 give most of the decoupling without it. If no third module is expected
soon, do steps 1–2 and leave the generator until one is.
