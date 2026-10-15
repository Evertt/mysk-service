# Refactoring plans

The plans of the clean-up and planning passes of October 2026, and what became of them. The first
three came from one pass and are built (see "Order of work"); the rest are listed with their
status.

| Plan                                                             | Covers                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [feature-folders-and-plugins.md](feature-folders-and-plugins.md) | No `src/features/`; domain folders; the optional modules as self-contained folders (built)                     |
| [table-query.md](table-query.md)                                 | The server-side tables: `tableParams` as a typed object, one list definition per table (built, but step 7)     |
| [file-splits-and-cleanup.md](file-splits-and-cleanup.md)         | Files over ~300 lines, repeated code, names, dead code, placement (done in phases 1–3 below)                   |
| [domain-folders.md](domain-folders.md)                           | The core domains' files leave `src/routes` for `src/lib/<domain>/`, with barrels (done)                        |
| [module-dependencies.md](module-dependencies.md)                 | Modules that depend on each other, points their owners declare, roles, core features as modules (partly built) |
| [maintenance-plans.md](maintenance-plans.md)                     | The maintenance module, the first built from scratch (built)                                                   |
| [module-form-schemas.md](module-form-schemas.md)                 | Typed, validated parts of a core form that modules add (built)                                                 |
| [table-columns.md](table-columns.md)                             | Remembered columns, the last view, stable column widths (built; the rationale)                                 |
| [test-subject-imports.md](test-subject-imports.md)               | Spike: tests importing their subject's folder relatively (shims + Vite plugin); not adopted                    |
| [service-worker-swr.md](service-worker-swr.md)                   | A service worker answering remote queries stale-while-revalidate, and keeping the build's files                |
| [hide-unavailable-modules.md](hide-unavailable-modules.md)       | To do: hide which modules exist from tenants without them (route manifest, manifests, precache)                |
| [table-wishes.md](table-wishes.md)                               | Wishes: row actions from bulk actions, inline editing, infinite scroll, click to filter                        |

## The decisions in short

- **No `src/features/` for the core.** The core domains are too intertwined for feature folders to
  have real boundaries. Instead, each core domain has a domain folder `src/lib/<domain>/`, split by
  feature (`ui/`, `list/`, `form/`, `detail/`, `server/`) and imported through its barrels, and
  `src/routes` holds route files only ([domain-folders.md](domain-folders.md)).
- **Optional modules are self-contained folders**, `src/modules/<id>/`. A generator links each
  folder into the app (route stubs, typed registries, message files). Extension points are typed
  values declared by their owner: core in `#lib/<domain>/extensions.ts`, a module in its
  `api/extensions.ts`. Core never imports a module; a module imports another only through its
  `api/`, along `requires` (or only its extension points and types, along `enhances`). The name
  stays "module".
- **Table queries take a typed object**, validated by a valibot schema generated from one list
  definition per table. The URL grammar only does URL ↔ table state. Saved views keep storing URL
  strings. The join chain, counts, facets and bulk ids are written once per table.
- **Split the long remote files** by responsibility (list / record / bulk). Each split updates its
  importers' paths rather than re-exporting, because remote functions are identified by their file.
  Add a few shared helpers: tenant-scoped lookups and joins, numbering, bulk changes, roles,
  breadcrumbs and stat cards.

## How the plans fit together

Where they overlapped, which set the order of work below (all of it is done):

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
  module columns are namespaced and merged into a list's definition and SQL per tenant. Built when
  the first module needed one: maintenance's `maintenance.nextDue` in the equipment list (see
  [maintenance-plans-implementation.md](maintenance-plans-implementation.md)).
- **Entity links and badges** live together per entity: in `#lib/<domain>/ui/` for a core domain,
  in a module's `ui/` for its records.

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
   extensions (a file is imported by its real extension, checked by
   `src/tests/unit/import-extensions.spec.ts`).

All phases are done. Plugins step 7 (new extension points) stays as planned: add one when a
module needs it.

## Next: module dependencies

[module-dependencies.md](module-dependencies.md) (design, October 2026): modules that depend on
each other, extension points declared by their owners, roles that come with a module, and the
schedule and engineer portal as the first core features turned into switchable modules. Built: the
machinery and the schedule, and materials as a module besides. Not built: roles, the portal as a
module, the inspector and slot options.

Implementation plans, one per step of its order of work:

1. [module-dependencies-1-machinery.md](module-dependencies-1-machinery.md) ✅ done: the dependency graph,
   switching on and off, `api/` boundaries and extension points declared by their owners.
2. Roles: not written yet (the portal pilot needs it; the schedule doesn't).
3. [module-dependencies-3-schedule.md](module-dependencies-3-schedule.md) ✅ done: the planning
   board as the optional module `src/modules/schedule/`, writing orders through a core scheduling
   service; `nav: { after }`; and the switching fixes carried from step 1.
4. [module-dependencies-4-materials.md](module-dependencies-4-materials.md) ✅ done (merged from
   branch `materials-module`): the core materials domain as the optional module
   `src/modules/materials/`, with the extension points it needed (`orders.costs`, the save hook
   `orders.saving`, the form slot `orders.form`, `dashboard.stats`, `portal.order`). Its last
   section weighs what the module system gained against what got more indirect.
5. The portal pilot (after roles), 6. the inspector: not written yet.

Carried from step 1 into the later plans (from its reviews):

- **For the first plan with a real `requires` or `alwaysOn` module** (carried by steps 3 and 4:
  neither the schedule nor materials has one, so their specs use the made-up graph): the e2e of the settings page's
  dependency prompts (switching on names what it also switches on; switching off asks first), and of
  a tampered refusal for an unmet requirement or an always-on module.
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

## Maintenance plans

[maintenance-plans.md](maintenance-plans.md) (design) and
[maintenance-plans-implementation.md](maintenance-plans-implementation.md) (done): the first module
built from scratch, which added module columns in core lists, slots owned by a module and the core's
`createOrders()`.
