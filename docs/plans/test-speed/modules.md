# Modules' e2e tests: what to keep, convert, merge or drop

Scope: the 52 e2e files of the optional modules (`src/modules/*/tests/e2e/*.test.ts`, 423 tests) and
their helpers. Durations are from `e2e-durations.txt` (inflated by load; files that ran twice show both).
Together the module files take **~2,390–2,460 s** of summed file time, about 46 % of all e2e file time
(~5,000–5,400 s). Per-test seconds are the file's time divided by its tests; each file also pays a
browser launch and a sign-in (~3–5 s) in `useApp()`'s `beforeAll`.

Classes: **keep-e2e** (needs browser + server), **keep-e2e (trim)** (keep the UI steps, drop the DB/log
asserts that a spec covers or should), **to-server-spec**, **to-server-spec + thin** (logic to a spec, a
one-step e2e smoke stays), **to-component-spec**, **duplicate** (named spec or test already covers it),
**low-value**, **merge**. A test.each row counts as its cases.

## What a server spec can do here (checked in the code)

- **Run server code as a tenant on a real, migrated SQLite** without HTTP: the module specs mock
  `#lib/server/db/index.ts` with a temp file DB migrated from `drizzle/`, insert North/South rows, and
  either run `asSystem(tenant, work)` (`partner-programme/tests/unit/server/programme.spec.ts`,
  `north()`/`south()`) or mock `$app/server`'s `getRequestEvent` to return `{ locals: { user, tenant } }`
  and switch `locals.tenant` (`checklists/tests/unit/server/templates.spec.ts`). Tampered ids are just
  arguments: `expect(await refusal(updateTemplate(id, …))).toBe(404)` under South.
- **Gates without a request**: `requireTenant()`/`requireMember()`/`requireModule()` answer from
  `asSystem`'s tenant (`src/lib/server/auth/system.ts`, `session.ts`), so `moduleRemote(id)`'s gate
  refuses a tenant without the module with a 404 in a spec. `requireEngineer()`/`requireCustomer()`
  read `getRequestEvent()` (fake it, as `src/tests/unit/lib/server/auth/customer.spec.ts` does).
- **Remote function handlers** can be reached by stubbing `$app/server`'s `query`/`form`/`command` as
  `remote-functions.spec.ts` does (`handlerOf(made)` is the gated handler: gate, then handler). Nothing
  does this with a DB yet; a reusable harness needs callable stand-ins whose results have
  `refresh()`/`set()` (handlers call `getTemplates().refresh()`), a stub of `requested()` (used by
  `refreshRequested()`), and the form's schema run by the harness (the stand-in skips SvelteKit's
  validation). Usually unnecessary: the modules' remote handlers are thin pass-throughs of the client's
  ids to `server/*.ts` functions, which are what to test.
- **No seeded-demo fixture for specs**: each module spec inserts its own few rows. The e2e template DB
  is built by `node src/lib/server/db/seed/index.ts` in `global-setup.ts`; a Vitest `globalSetup` for the
  server projects could build that once and let specs copy it, which would make "the seed's figures"
  checks (stock balances, call-outs) cheap.
- Already in place and duplicated by e2e again and again: `remote-functions.spec.ts` (moduleRemote 404
  before the handler; manager/engineer/customer sets; every module's remote functions made only with its
  own set), `src/tests/unit/lib/modules/route-guard.spec.ts` (module routes 404 without the module),
  `nav.spec.ts` (sidebar placement), `src/tests/unit/lib/server/lists/module-columns.spec.ts` (a module's
  list column refused for a tenant without it), `plan.spec.ts`/`list-definition.spec.ts`/`bulk.spec.ts`
  (list SQL, query schema rejections, bulk targets), `url-sync.svelte.spec.ts` (table state in the URL),
  `src/tests/unit/lib/server/jobs/daily.spec.ts` (cron token), `extension-slot.svelte.spec.ts`.

## What CLAUDE.md / docs/agents/tests.md require to stay covered

- "Every section's tests cover isolation: South can't see or change North's records, also by tampering
  with ids." Where a server spec covers the tampered ids (checklists, energy, docks, partner-programme,
  materials' stock), the e2e can keep **one** tampered form per module as the end-to-end proof that the
  client's hidden id reaches the scoped function. Where none exists (contracts, invoices, maintenance
  plans, condition components, schedule, parts-shop orders), write the spec before cutting the e2e.
- tests.md asks each module's e2e to cover "a tenant that hasn't [the module] (its pages and endpoints
  are 404s, the sidebar lacks it, the slots are empty, its remote queries are refused)". The pages, the
  sidebar and the remote queries are proven generically by the specs above; the e2e only adds value for
  **empty slots** (cheap, one visit). Dropping the per-module "queries are refused" replays needs that
  sentence in tests.md changed (and ideally one generic spec, pattern 1 below).

## checklists (7 files, 260 s)

Existing server specs are thorough: `tests/unit/server/templates.spec.ts` (create/unique name/update log/
categories/retire/restore/points add-move-edit-delete, and 404 for another tenant's template, point,
category) and `tests/unit/server/checklists.spec.ts` (drafts on orders, removing units, type change,
completing order, field fill rules, office fill rules, engineer's own orders only, another tenant's
refused, `yearStateSql`). The remote layer (`templates.remote.ts`) is a thin pass-through of the client's
ids to those functions. So most e2e logic checks are duplicates; what the e2e alone covers is wiring and UI.

### checklists.test.ts — 57.6 s, 10 tests (~5.5 s/test)

| Test                                                                                 | Class                      | Reason / target                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| finds the templates from the settings and the sidebar, with the categories they miss | keep-e2e                   | Navigation from settings + sidebar order; gap text. Thin.                                                                                                                                                                     |
| adds a template, with a name North doesn't have yet, lands on its page               | keep-e2e (trim)            | Redirect after form + issue display are UI; uniqueness/position/log are dup of templates.spec "names are unique…", "a new one goes last…". Drop the DB/log asserts.                                                           |
| gives it categories; one another template is for can't be ticked                     | keep-e2e (trim)            | Disabled checkbox is UI; saved categories/gaps dup of templates.spec "categories".                                                                                                                                            |
| adds points in groups, each last in its group                                        | merge                      | Placement is dup of templates.spec "a new point goes last…"; keep one add via the group button, fold into the move test.                                                                                                      |
| moves points within their group and into the next, and moves a group                 | duplicate (mostly)         | templates.spec "moving a point…", "moving a group…" incl. the log entries; keep one move click + disabled-edge check.                                                                                                         |
| edits a point into another group, and deletes one                                    | duplicate                  | templates.spec "editing a point's group…", "a deleted point…". Keep at most the delete-confirm dialog.                                                                                                                        |
| edits its details                                                                    | duplicate                  | templates.spec "an update logs what changed". Cut.                                                                                                                                                                            |
| retires it… until it's restored                                                      | keep-e2e (trim)            | Retired UI (no buttons, retired section, unit page offers none) is UI; DB/log asserts dup of templates.spec "retiring".                                                                                                       |
| a unit's page shows the template of its category                                     | keep-e2e                   | Cross-page link from equipment page slot. Cheap.                                                                                                                                                                              |
| a member sees the templates… but can't change them                                   | to-server-spec + keep thin | 403 for a member posting the manager forms: `forManagers` gate is covered by remote-functions.spec "asks for a manager only in the manager set"; the UI-hiding part stays. Re-sign-in costs ~4 s: could reuse a planner file. |

Savings: ~20 s (cut 3 tests, trim DB asserts that each add a `rows()` roundtrip and a `quiet()`).

### checklists.office.test.ts — 46.9 s, 7 tests (~6.7 s/test)

| Test                                                                                | Class                      | Reason / target                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shows each unit's checklist on the order's page, rejected points first              | keep-e2e (+component-spec) | Slot on the order page. The "rejected first" ordering is `model.spec` "rejected points come first"; the card itself could be a `*.svelte.spec.ts`.                                                                                                                            |
| its work order has the order, every checklist, room for signatures                  | keep-e2e                   | Print page composition; `loadWorkOrder` could get a server spec, but the page is the risk.                                                                                                                                                                                    |
| a unit's page shows the status of its latest inspection and its checklists per year | keep-e2e (trim)            | Visits 3 units (3 navigations); one unit + the dialog is enough; statuses are `model.spec` "a unit's inspection status".                                                                                                                                                      |
| the equipment list shows each unit's status, and filters and sorts by it            | to-server-spec             | 4 filtered visits + a sort: the module list column's SQL filter/sort (`server/columns/equipment.list.ts`, `inspection-sql.ts`) through `planList`/`withModuleColumns` as in `src/tests/unit/lib/server/lists/module-columns.spec.ts`. Keep one filtered visit as smoke. ~8 s. |
| a unit whose checklist has answers stays on the order                               | duplicate (mostly)         | checklists.spec "is refused, naming the units, once a point is answered". Expensive: opens a second signed-in context for Lev. The issue text on the form is the only UI part. ~10 s.                                                                                         |
| one without answers goes with its checklist; a unit put on gets one                 | duplicate                  | checklists.spec "takes their checklists along…", "a unit it gets later gets one…".                                                                                                                                                                                            |
| it stays an inspection while a checklist has answers                                | duplicate                  | checklists.spec "away from inspection… refuses answered ones".                                                                                                                                                                                                                |

Savings: ~25 s (the whole "order form" describe goes; equipment-list filters to a spec).

### checklists.portal.test.ts — 28.3 s, 7 tests (~4 s/test)

| Test                                                                           | Class                 | Reason / target                                                                                                                                                |
| ------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| has a checklist per unit with a template, to fill in once the job's started    | keep-e2e              | Phone layout, start job, fitsWidth.                                                                                                                            |
| each answer is saved as it's given, and is still there after a reload          | keep-e2e              | Autosave + reload: real browser/server.                                                                                                                        |
| another engineer's checklist, or another tenant's, can't be changed by its ids | duplicate             | checklists.spec "only on the engineer's own orders while in progress, in their tenant". 4 tampered commands. Keep one tamper (`answer`) as wiring proof. ~3 s. |
| completing the order is refused while a checklist isn't completed              | duplicate (thin keep) | checklists.spec "refuses completing it while a checklist isn't completed"; signature drawing is the UI. Merge with the completing test below.                  |
| a checklist completes once every point is answered…                            | keep-e2e (trim)       | The rejection message is UI; valid_until/log asserts are dup of checklists.spec.                                                                               |
| then the order completes with Lev's signature and the customer's               | keep-e2e              | Signature pads → PNG: browser only.                                                                                                                            |
| the office prints the work order, with every checklist and both signatures     | keep-e2e (overlap)    | Overlaps office "its work order has…"; keep here (fresh signatures, print media) and slim the office one.                                                      |

Savings: ~6 s.

### checklists.tenancy.test.ts — 41.3 s, 5 tests (~8 s/test)

| Test                                                               | Class                       | Reason / target                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| its pages load their data with remote queries                      | low-value                   | Exists only to record query URLs for the South replay below; 5 client-side navigations.                                                                                                                                                                                                                 |
| SHLTR's templates and points can't be read or changed by their ids | duplicate                   | templates.spec "another tenant's template is a 404, to read or change", "another tenant's category is a 404", "another tenant's point is a 404"; the remote handlers pass ids straight through. 8 tampered submits (each submit + quiet ≈ 1.5–2 s). Keep the 404 page visit + one tampered form. ~15 s. |
| (South) no sidebar entry, no set-up link, pages are 404s           | keep-e2e (thin) / duplicate | Route 404: `route-guard.spec.ts` "a (modules) group's guard refuses…"; sidebar: `nav.spec.ts`. One page visit is enough.                                                                                                                                                                                |
| (South) no card on a unit's page                                   | keep-e2e                    | Slot empty: cheap, one visit. Could merge into the test above.                                                                                                                                                                                                                                          |
| (South) North's remote queries are refused                         | duplicate                   | remote-functions.spec "moduleRemote refuses a tenant without the module, before the handler" + "makes a module's remote functions only with its own set".                                                                                                                                               |

Savings: ~25 s.

### checklists.orders-tenancy.test.ts — 22.6 s, 4 tests

| Test                                                                       | Class           | Reason / target                                                                                                                                                                         |
| -------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| its order's and unit's pages show its checklists, loaded by remote queries | low-value       | URL recording for the replay.                                                                                                                                                           |
| SHLTR's checklists can't be read, also by a tampered query                 | to-server-spec  | `loadWorkOrder(idInTenant…)`/`getOrderChecklists` handler with SHLTR's number under North → 404. No spec covers `server/work-order.ts`/`records.ts` reads yet. Keep the 404 page visit. |
| (South) no checklists on order/unit pages, no list column, work order 404  | keep-e2e (thin) | Slots empty + column ignored; the column part dup of module-columns.spec. Merge with checklists.tenancy's South tests (same tenant, same sign-in).                                      |
| (South) North's remote queries are refused                                 | duplicate       | remote-functions.spec moduleRemote.                                                                                                                                                     |

Savings: whole file → fold its one South test into checklists.tenancy: ~18 s.

### checklists.work-orders.test.ts — 45.8 s, 11 tests (~4 s/test)

| Test                                                                              | Class                     | Reason / target                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the sidebar's Work orders opens the page, with every asset and this year's badges | keep-e2e (trim)           | Navigation + badge rendering; the per-asset loop over ~40 badges is many round trips; the state is `yearStateSql` (checklists.spec "a unit's state this year, in SQL"). |
| loads more as it scrolls                                                          | keep-e2e                  | Infinite scroll.                                                                                                                                                        |
| searches the server by unit, serial number, component and customer                | to-server-spec            | `assetSql()` + `planList` search over component number/serial/customer (`server/assets.ts`): no spec. 4 searches × URL wait. ~4 s.                                      |
| keeps to a customer and to where they stand this year                             | to-server-spec            | Chip/customer filters of the same list SQL; keep one chip click as smoke. ~3 s.                                                                                         |
| a unit shows its checklist of this year and its history; selection in the URL     | keep-e2e                  | URL state, history, back button.                                                                                                                                        |
| a component shows only its points, with the score…                                | keep-e2e (+server-spec)   | Points of a component are `model.spec` "a component's points…"; panel UI stays.                                                                                         |
| Inspection 2026 makes an inspection order with its checklist, ready to plan       | to-server-spec + thin e2e | `server/start.ts` (order via `createOrders`, logged, checklist draft): no spec. Keep the click+toast.                                                                   |
| a second press opens the order it has                                             | to-server-spec            | Idempotence of start.ts. ~3 s.                                                                                                                                          |
| the office fills it in for the engineer… and completes it                         | keep-e2e (trim)           | Fill rules dup of checklists.spec "filling a checklist in, in the office"; the condition hook's score is condition's. Keep the UI flow, drop DB asserts.                |
| the templates are a click away, and lead back                                     | low-value                 | Two links; fold into the first test.                                                                                                                                    |
| on a phone, the list and the asset stack, without scrolling sideways              | keep-e2e                  | Layout.                                                                                                                                                                 |

Savings: ~12 s.

### checklists.work-orders-tenancy.test.ts — 17.5 s, 5 tests

| Test                                                                    | Class                      | Reason / target                                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| its page lists only its own assets, loaded by remote queries            | to-server-spec             | `assetSql` in North excludes SHLTR's (search by SHLTR serial = 0).                                                                |
| SHLTR's unit and its components can't be read, also by a tampered query | to-server-spec             | `assetView(serial)` under North with SHLTR's serial → 404; component of another tenant ignored.                                   |
| SHLTR's can't be started or filled in, also by tampered commands        | duplicate / to-server-spec | officeAnswer/officeComplete: checklists.spec "not once its order is closed, nor another tenant's"; startOrder: new start.ts spec. |
| (South) no entry, page is a 404                                         | duplicate                  | route-guard.spec + nav.spec.                                                                                                      |
| (South) North's remote queries are refused                              | duplicate                  | remote-functions.spec moduleRemote.                                                                                               |

Savings: whole file (~17 s) once start.ts/assetView get server specs.

**Checklists total: ~120 s of 260 s.**

## condition (6 files, 210 s)

Server specs are thin here: only `tests/unit/server/status-sql.spec.ts` (status in SQL = the pure
rules; one Connect row per component) plus `model.spec.ts`, `feed.spec.ts`, `form/schemas.spec.ts`.
`server/conditions.ts`, `server/components.ts`, `server/settings.ts`, `server/automatic.ts` and
`server/checklist-components.ts` have no spec, so most logic in these e2e files is **to-server-spec**
(new specs), not duplicate.

### condition.test.ts — 41.0 s, 9 tests (~4.5 s/test)

| Test                                                                         | Class                           | Reason / target                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| is in the sidebar after Equipment, and its tiles count the rows by status    | keep-e2e (trim)                 | Navigation + KPI rendering; the counts' SQL (`getConditionCounts`, `server/list-sql.ts`) → server spec.                                           |
| lists the rows worst first, the critical ones on top                         | to-server-spec                  | Default sort of the Connect list (`list-sql.ts` through `planList`); `list/columns.spec.ts` "the list is worst first" covers the definition only. |
| opens with its banner and how it works in four steps, and fits a phone       | to-component-spec / keep layout | Static copy → component spec; `fitsWidth` on phone stays e2e (reload costs ~2 s).                                                                 |
| a customer's chip shows its rows, its counts and its activity log            | keep-e2e (trim)                 | Chip → URL → table + dialog. The counts per customer and the feed's content (`server/feed.ts`) → server spec.                                     |
| only what needs attention, when asked                                        | to-server-spec                  | Status filter + tiles counting all: `list-sql.ts` + counts. Keep the URL param check as part of the chip test.                                    |
| sorts by condition, the lowest first                                         | to-server-spec                  | SQL sort; generic sort already in plan.spec.                                                                                                      |
| says what the statuses mean                                                  | to-component-spec               | Static legend text.                                                                                                                               |
| (elsewhere) a customer's page shows its units' activity log                  | keep-e2e                        | Slot on the customer page; feed contents → `server/feed.ts` spec.                                                                                 |
| the dashboard's tile counts the units that need attention, and links to them | keep-e2e                        | Dashboard slot + link.                                                                                                                            |

Savings: ~15 s.

### condition.automatic.test.ts — 13.4 s, 4 tests

| Test                                                 | Class                     | Reason / target                                                                                                                                    |
| ---------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| are off at first: the run plans nothing              | to-server-spec            | `server/automatic.ts` daily job under `asSystem` (pattern: `maintenance/tests/unit/server/automatic.spec.ts`).                                     |
| refuse critical at or above attention                | duplicate                 | `form/schemas.spec.ts` "the settings keep critical below attention".                                                                               |
| a manager turns automatic planning on                | to-server-spec + thin e2e | `server/settings.ts` save + log; keep the redirect.                                                                                                |
| plans each critical unit without an open order, once | to-server-spec            | The job's rules (critical, in care, no open order, idempotent, not in South) with `runDaily` → spec; the e2e only needs "last run: 0 orders" text. |

Savings: ~9 s (whole file to a spec + one smoke folded into condition.test).

### condition.components.test.ts — 42.3 s, 8 tests (~5 s/test)

| Test                                                                            | Class            | Reason / target                                                                                                                                         |
| ------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| are on its page with their articles, conditions and statuses                    | keep-e2e         | Slot on the unit page.                                                                                                                                  |
| one is added with an article, whose shop points check it unless told otherwise  | keep-e2e (trim)  | Pre-ticking the shop's points is client behaviour; numbering (`OC-4005`), position, checkpoints, log → server spec of `server/components.ts`.           |
| its name and points are changed                                                 | to-server-spec   | Update + checkpoints replace; no UI risk beyond the dialog already exercised.                                                                           |
| its condition is recorded as a correction, and its status and its unit's follow | keep-e2e (trim)  | Status recomputation is status-sql.spec; keep the dialog → card refresh.                                                                                |
| it's moved up among its unit's components                                       | to-server-spec   | Position swap in `components.ts`.                                                                                                                       |
| it's removed with its conditions, and logged                                    | to-server-spec   | Cascade + log. Keep the confirm dialog if wanted.                                                                                                       |
| a rejected point that checks a component suggests its article first             | to-server-spec   | `server/checklist-components.ts` suggestion ranking; the e2e adds a component and visits an order (~6 s).                                               |
| the customer portal's home shows a unit's components…                           | keep-e2e (merge) | Second signed-in context (~4 s); belongs with the portal tests (`src/tests/e2e/portal.test.ts` or condition.portal) that already sign in as a customer. |

Savings: ~18 s.

### condition.office.test.ts — 29.6 s, 8 tests (~3.7 s/test)

| Test                                                                  | Class                         | Reason / target                                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| has the condition and its status, filtered by status in the database  | to-server-spec (keep 1 visit) | Module column filter: `server/columns/equipment.list.ts` via `withModuleColumns`+`planList` (pattern: `module-columns.spec.ts`); status SQL = status-sql.spec. |
| sorts by condition, the lowest first, the units without one last      | to-server-spec                | Same; nulls-last is plan.spec "rows without a value come last both ways".                                                                                      |
| filters by the condition's band                                       | to-server-spec                | Band filter in the column SQL.                                                                                                                                 |
| says there's no condition yet                                         | merge                         | One wait; fold into the next.                                                                                                                                  |
| refuses a score over 100                                              | duplicate                     | `form/schemas.spec.ts` "a condition is a whole score from 0 to 100".                                                                                           |
| records a condition, which makes the unit critical, and logs it       | keep-e2e (trim)               | Card refresh is UI; insert fields + log → `server/conditions.ts` spec.                                                                                         |
| a newer condition takes its place, the older one stays in its history | merge                         | Fold into the test above (same dialog).                                                                                                                        |
| a unit's page shows the parts used on its completed orders            | keep-e2e                      | Cheap slot check.                                                                                                                                              |

Savings: ~15 s.

### condition.portal.test.ts — 18.7 s, 4 tests

| Test                                                                    | Class           | Reason / target                                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| asks for no condition while the unit's checklist is open                | keep-e2e        | Portal UI state.                                                                                                                                                                                                         |
| completing the checklist records the score its points work out to       | keep-e2e (trim) | The score rule (OK/(OK+NOK), N/A out; component over own points) → checklist-completed hook spec in `server/conditions.ts`/`index.ts`; it also opens an office context to add a component (~5 s) that a spec would seed. |
| his advice goes onto that condition                                     | keep-e2e        | Form in the portal, reload persists.                                                                                                                                                                                     |
| a unit that isn't on the order, or another engineer's order, is refused | to-server-spec  | 3 tampered submits + 3 reloads (~6 s): the field-condition handler's scoping (`portal/field-condition.remote.ts` → server function) with `requireEngineer` faked through `getRequestEvent`. No spec covers it.           |

Savings: ~8 s.

### condition.tenancy.test.ts — 64.5 s, 8 tests (~8 s/test)

| Test                                                                               | Class                      | Reason / target                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the Connect page lists North's units in care only, through remote queries          | low-value / to-server-spec | Mostly records URLs; "North's only" is plan.spec "never returns another tenant's rows" + a list-sql tenant case.                                                       |
| a condition for another tenant's unit is refused                                   | to-server-spec             | `recordCondition` by South's serial under North → 404.                                                                                                                 |
| another tenant's components can't be seen or changed by their ids                  | to-server-spec             | Edit/record/remove by SHLTR's component id → 404 in `components.ts`/`conditions.ts`; 3 tampered submits plus making a component first (~15 s). Keep one tamper in e2e. |
| its own component takes neither another tenant's article nor its checklist points  | to-server-spec             | Validation messages from `components.ts`; DOM surgery on a select (~6 s).                                                                                              |
| (South) no sidebar entry, pages are 404s                                           | duplicate (thin keep)      | route-guard.spec + nav.spec.                                                                                                                                           |
| (South) no card on a unit's page, nor a tile on the dashboard                      | keep-e2e                   | Empty slots (cheap); merge with the above.                                                                                                                             |
| (South) the equipment list has no condition columns, and refuses them in its query | duplicate                  | module-columns.spec "refuses a column the tenant doesn't have, or a value the column doesn't take".                                                                    |
| (South) North's remote queries are refused                                         | duplicate                  | remote-functions.spec moduleRemote.                                                                                                                                    |

Savings: ~40 s.

**Condition total: ~105 s of 210 s.** Needs new server specs for conditions/components/settings/automatic
(one seeded spec file each, or one `condition.spec.ts`), which is where most of the work is.

## contracts (3 files, 238 s; contracts.orders ran twice in the log: 107.9 s and 75.8 s on its retry)

Specs: pure `coverage.spec.ts` (coverage, what a contract includes, response time/SLA), `billing.spec.ts`,
`model.spec.ts`, `form/contract-schema.spec.ts`, `list/columns.spec.ts`, and `server/index.spec.ts` (the
refresh hook only). **`server/contracts.ts` (create/update/delete, overlap check, unit/customer of the
tenant, numbering) has no spec**: the tenancy file is the only place its rules are checked.

### contracts.test.ts — 51.0 s, 16 tests (~3 s/test)

| Test                                                              | Class             | Reason / target                                                                                                                                              |
| ----------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the sidebar lists the module and the list shows North's contracts | keep-e2e          | Smoke.                                                                                                                                                       |
| searching and filtering narrow the list                           | to-server-spec    | Contract list SQL (status computed from period, level filter) through `planList`; `list/columns.spec.ts` checks the definition only. Keep one filter click.  |
| sorting by monthly fee puts the highest first                     | duplicate         | plan.spec sorting; nothing contract-specific.                                                                                                                |
| an unknown contract is a 404                                      | low-value         | One visit; fold into the detail test.                                                                                                                        |
| a contract shows its customer and covered equipment               | keep-e2e          | Detail page.                                                                                                                                                 |
| a covered unit can't move to another customer                     | to-server-spec    | Contracts' equipment-save hook refusing the move (`server/index.ts` contribution) under a tenant; ~4 s.                                                      |
| creating a contract validates it first                            | duplicate         | `contract-schema.spec.ts` "the customer and both days… are required"; customer options count is a server query.                                              |
| choosing a level suggests its response time                       | to-component-spec | Client-side form behaviour (contract form component).                                                                                                        |
| a unit already covered in the same period is refused              | to-server-spec    | Overlap rule in `server/contracts.ts`.                                                                                                                       |
| changing the customer lists their units, none checked             | to-component-spec | Form behaviour; unit query per customer.                                                                                                                     |
| the period must run forwards                                      | duplicate         | schema spec (period).                                                                                                                                        |
| a new contract gets the next number and covers the chosen units   | keep-e2e (trim)   | Redirect + toast; numbering is `model.spec` "numbers contracts per year" + `numbering.spec.ts`; stored fields → spec.                                        |
| editing it saves the changes                                      | keep-e2e (trim)   | Edit round trip.                                                                                                                                             |
| deleting it removes it and its coverage, after which it's a 404   | to-server-spec    | Cascade in `deleteContract`; keep the confirm dialog in the edit test.                                                                                       |
| (dashboard part fails) the rest shows, with a notice              | keep-e2e          | Extension-slot error boundary in the real app; `extension-slot.svelte.spec.ts` may cover the boundary already: check, else keep one per app, not per module. |
| trying again shows its cards once its query answers               | keep-e2e          | Same.                                                                                                                                                        |

Savings: ~15 s.

### contracts.orders.test.ts — 107.9 s / 75.8 s, 16 tests (~5–7 s/test)

| Test                                                                              | Class                       | Reason / target                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an overdue call-out shows its contract, deadline and badge                        | keep-e2e                    | Order page slot + header badge.                                                                                                                                                                                                                         |
| one at risk says so                                                               | merge                       | Same page kind; one test can visit both orders, or drop: at-risk rule is `coverage.spec` "on track until a quarter of the time is left".                                                                                                                |
| the orders table shows the same badges                                            | to-server-spec + thin       | Two searches + first page scan (~8 s). The SLA column value in the list SQL → module-columns-style spec; keep one search.                                                                                                                               |
| the dashboard lists the call-outs at risk or overdue, most urgent first           | to-server-spec              | `getContractsOverview` ordering; keep the card visible.                                                                                                                                                                                                 |
| and the contracts ending in the next 60 days that weren't renewed                 | to-server-spec              | Same query; the "not renewed" rule is pure SQL.                                                                                                                                                                                                         |
| the dashboard's revenue takes off what contracts include                          | to-server-spec              | Dashboard revenue with the contracts' price contribution; pure part in coverage.spec.                                                                                                                                                                   |
| a covered order… on its page                                                      | keep-e2e                    | One rendering of the adjustment line is worth keeping.                                                                                                                                                                                                  |
| …in the orders list                                                               | to-server-spec              | The list total's SQL equals `priceOf()`: one spec comparing the list SQL, service history and recent activity totals for the same orders replaces three page visits (~15 s).                                                                            |
| …in the unit's service history                                                    | to-server-spec              | Same spec.                                                                                                                                                                                                                                              |
| …in the customer's recent activity                                                | to-server-spec              | Same spec.                                                                                                                                                                                                                                              |
| a standard contract includes the labour only                                      | duplicate                   | `coverage.spec` "what a contract includes"; another page visit.                                                                                                                                                                                         |
| a unit's page lists the contracts covering it, with their level and end           | keep-e2e                    | Slot. Cheap.                                                                                                                                                                                                                                            |
| a new call-out on a covered unit gets the contract's deadline, met once scheduled | keep-e2e (trim)             | Real create/edit/delete form flow; deadline rule is coverage.spec. ~10 s; the delete at the end is cleanup.                                                                                                                                             |
| with the module switched off, orders are priced in full and nothing of it shows   | keep-e2e (trim) / duplicate | Overlaps `src/tests/e2e/without-modules.test.ts` (switches every module off and checks core pages). The price-in-full part → spec of the pricing hook with the module off (`src/tests/unit/lib/orders/server/pricing.spec.ts` style). 6 visits (~10 s). |
| switched on again, it shows again                                                 | duplicate                   | without-modules.test "switching them back on". Needed only as cleanup for the test above.                                                                                                                                                               |
| in Dutch, the contracts and materials pages are translated                        | low-value                   | i18n of two modules' pages in a contracts file; `src/tests/e2e/i18n.test.ts` exists, and message completeness is a spec (`labels.spec.ts`, paraglide checks). ~8 s.                                                                                     |

Savings: ~55 s (of ~90).

### contracts.tenancy.test.ts — 79.2 s, 15 tests (~5 s/test)

| Test                                                                                   | Class                  | Reason / target                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (North) the cards load through the module's own queries                                | low-value              | URL recording for the replay.                                                                                                                                                                                                           |
| a contracts form left open in North is refused after switching to South elsewhere      | duplicate (borderline) | The gate reads the session's tenant on every call (remote-functions.spec "runs the gate before the handler, on every call"); the two-tab scenario costs ~12 s (it has a 60 s timeout). Keep one such scenario app-wide, not per module. |
| (South) the sidebar lacks the module and the contracts pages are 404s                  | duplicate (thin keep)  | route-guard.spec + nav.spec; 4 page visits → 1.                                                                                                                                                                                         |
| North's remote queries are refused                                                     | duplicate              | remote-functions.spec moduleRemote.                                                                                                                                                                                                     |
| orders, equipment and the dashboard show none of it, and its queries are refused       | keep-e2e (trim)        | Empty slots; the replay part is duplicate.                                                                                                                                                                                              |
| (South, enabled) enabling the module adds it to the sidebar                            | keep-e2e (merge)       | Settings toggle; also done in contracts.orders.                                                                                                                                                                                         |
| the list is empty and North's contracts are 404s                                       | to-server-spec         | `contractDetail` by North's number under South → 404.                                                                                                                                                                                   |
| the module's cards show South's (none), and North's orders and units stay out of reach | to-server-spec         | Coverage queries by North's ids under South → 404.                                                                                                                                                                                      |
| the form only offers South's customers                                                 | to-server-spec         | Customer options query in tenant (plan.spec-like).                                                                                                                                                                                      |
| a North unit is refused                                                                | to-server-spec         | `createContract` with another tenant's unit → issue "own customer".                                                                                                                                                                     |
| a North customer is refused                                                            | to-server-spec         | Same, customer → "Unknown customer". DOM surgery on the select.                                                                                                                                                                         |
| a new contract gets South's first number                                               | to-server-spec         | Numbering per tenant: `src/tests/unit/lib/server/numbering.spec.ts` covers `nextNumber` per tenant.                                                                                                                                     |
| saving with the id of a North contract is refused                                      | to-server-spec         | `updateContract(northId)` under South → 404, nothing changed.                                                                                                                                                                           |
| deleting with the id of a North contract is refused                                    | to-server-spec         | `deleteContract(northId)` → 404.                                                                                                                                                                                                        |
| deleting South's contract and disabling the module restores the seeded state           | low-value              | Cleanup for the file's own changes.                                                                                                                                                                                                     |

Savings: ~60 s. One `contracts.spec.ts` (seeded North/South, `getRequestEvent` faked as in
`templates.spec.ts`) covers the CRUD rules of contracts.test.ts and all of the tenancy file; the e2e keeps
one tampered save as the end-to-end proof.

**Contracts total: ~130 s of 238 s.**

## docks (3 files, ~104 s; docks.test and docks.simulation ran twice: 24.9/17.2 s and 38.2/24.0 s)

Very well specced: `server/ingest.spec.ts` (batch applying, idempotence, unknown docks incl. another
tenant's, door rules 40/60 min with one order per door, tokens: hash only, 401s, 404 without module,
can't revoke another's), `events.spec.ts` (batch format), `simulation.spec.ts` (reset states, no
overlap, leaves another tenant alone, tick through the feed), `scenario.spec.ts`, `docks.spec.ts`,
`model.spec.ts`, and `board/dock-drawing.svelte.spec.ts`. The e2e mostly proves the live board updates
and the endpoint's HTTP mapping (`routes/(api)/ingest/+server.ts`, whose `POST` a spec could call with a
`Request` and no server).

### docks.test.ts — 24.9 s, 7 tests

| Test                                                                    | Class                 | Reason / target                                                                                                                            |
| ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| shows Weggemans' docks as seeded: Laden, Bezet, Vrij and Storing        | keep-e2e              | The board page; the per-state rendering is dock-drawing.svelte.spec + model.spec "the state and the beacon".                               |
| the door timer counts up                                                | to-component-spec     | Client timer; a component spec with fake timers. ~2 s of polling.                                                                          |
| a batch from the feed changes the board live                            | keep-e2e              | The live query → board without reload: the core reason for the e2e.                                                                        |
| a door open an hour makes one breakdown order on the dock's door        | duplicate (thin keep) | ingest.spec "40 minutes: a notice once; 60: one breakdown order" + "at most one open such order per door"; keep the red band on the board. |
| fits a phone's screen                                                   | keep-e2e              | Layout.                                                                                                                                    |
| the customer's page lists its docks, and a manager adds and deletes one | keep-e2e (trim)       | Card on a core page; duplicate-code issue → server spec of the dock save (no spec covers it).                                              |
| a dock's door shows its use                                             | keep-e2e              | Slot on the unit page; cheap.                                                                                                              |

Savings: ~4 s.

### docks.simulation.test.ts — 38.2 s, 6 tests

| Test                                                                              | Class                      | Reason / target                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| is on SHLTR's board, paused, and the banner says the feed is simulated            | keep-e2e                   | Bar rendering; records the commands for the replays below.                                                                                                                                              |
| a manager plays it at 30×, and its ticks move the docks through the feed          | keep-e2e (trim)            | The open page driving ticks is browser+server; polls up to 30 s for sim events. The log assert → `src/tests/unit/lib/server/simulation.spec.ts`. Inherently slow (waits for real ticks).                |
| a reset puts the docks back in the mockup's states, without an order              | duplicate (mostly)         | `simulation.spec.ts` "reset puts the four docks in the mockup's states, without a notice or an order"; has a fixed `waitForTimeout(1000)`. Keep the board showing the four states (one loop).           |
| a planner, who's no manager, sees its state, without the controls, and is refused | to-server-spec             | 403 for a member: the core `#lib/server/simulation.ts` commands' manager gate (remote-functions.spec covers the set); opens a second context (~4 s). Keep "no controls" as a component spec of the bar. |
| North and South, without the module, can't drive SHLTR's                          | duplicate                  | remote-functions.spec moduleRemote/manager; simulation.spec "leaves another tenant's docks alone". Second context + org switch (~6 s).                                                                  |
| a tenant offered no simulation has no bar, and the commands are a 404             | to-server-spec + component | The 404 is the simulation commands' lookup; the bar's absence is a component case.                                                                                                                      |

Savings: ~15 s.

### docks.tenancy.test.ts — 40.8 s, 7 tests

| Test                                                                  | Class                 | Reason / target                                                                                                                                                                      |
| --------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a manager makes one, which the feed then takes, and revokes it        | keep-e2e (trim)       | Token UI (shown once). Hash/prefix asserts dup of ingest.spec "a token finds its tenant; only its hash is stored". Second context (~4 s) because the file signs in as North's admin. |
| a planner, who's no manager, can't manage them                        | to-server-spec        | 403 of the settings page/gate; second context.                                                                                                                                       |
| refuses a request without a valid token                               | duplicate             | ingest.spec "a missing, unknown, other module's or revoked token is a 401". Cheap (fetch only).                                                                                      |
| refuses a dock its token's tenant doesn't have, applies nothing       | duplicate             | ingest.spec "refuses a batch naming a dock the tenant doesn't have". The 422 body is the endpoint's: call `POST` from a spec.                                                        |
| refuses a batch that isn't valid                                      | duplicate             | events.spec "refuses anything that isn't exactly the format".                                                                                                                        |
| (North/South) its pages are 404s and the sidebar lacks it             | duplicate (thin keep) | route-guard.spec + nav.spec; 4 visits + org switch.                                                                                                                                  |
| its remote queries are refused, and the cards on core pages are empty | keep-e2e (trim)       | Empty slots stay; the replay is dup of remote-functions.spec.                                                                                                                        |

Savings: ~15 s; the file signs in as North's admin but needs SHLTR's owner/planner twice: `useApp({ user: shltrOwner })`
would drop one extra context.

**Docks total: ~34 s of 104 s.** Little to gain: the logic is already in specs; the e2e is about live updates.

## energy (8 files, 279 s)

Well specced: `server/setup.spec.ts` (site per customer site, tenant's own sites only, settings logged,
zone code unique, consumer/door in the site's zones and units only, edited only through its own site,
deleting refused while measured, thresholds after a day), `server/ingest.spec.ts` (storing, idempotent,
alerts once per hour / per door opening, thresholds off, tenancy of sites and codes, tokens 401/404),
`model.spec.ts`, `simulation.spec.ts`, `ingest/format.spec.ts`, `setup/setup-schema.spec.ts`,
`overview/scope.spec.ts`. The e2e tenancy and setup files repeat much of it through forms.

### energy.test.ts — 36.7 s, 9 tests (~4 s/test)

| Test                                                                         | Class                 | Reason / target                                                                    |
| ---------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| is reached from the sidebar through the sites, and shows the KPI tiles       | keep-e2e              | Navigation + tiles vs. DB.                                                         |
| shows the building by floor, the main meter, the doors and the comparison    | keep-e2e (+component) | Layout (bounding boxes) is browser; floor order is model.spec "stacks the floors". |
| narrows to a floor with its button or on the plan, and to a zone on the plan | keep-e2e              | URL scope + scroll position kept: browser behaviour.                               |
| compares this month with last month                                          | merge                 | One click; fold into the test above.                                               |
| fits a phone's screen                                                        | keep-e2e              | Layout.                                                                            |
| (zone page) shows its figures, its consumers with their units, and its doors | keep-e2e              | Page.                                                                              |
| of a zone the site doesn't have is a 404                                     | to-server-spec        | The zone loader's 404; cheap but a spec is cheaper.                                |
| (report) covers this month by default… and prints the report alone           | keep-e2e              | Print media.                                                                       |
| refuses a range of more than 92 days                                         | to-server-spec        | Report range validation (400).                                                     |

Savings: ~6 s.

### energy.alerts.test.ts — 17.3 s, 6 tests

| Test                                                                       | Class                 | Reason / target                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| over a zone's threshold raises an alert, which the open page shows at once | keep-e2e (trim)       | Live query is the point; "same batch again raises nothing" dup of ingest.spec "is idempotent".                                                                                                                                                            |
| a zone's alert becomes a survey order at the site's customer               | to-server-spec + thin | The alert → order rules (type survey, priority, no units, logged) in the alert command's server function: no spec. Keep the button → toast.                                                                                                               |
| the freezer's door open too long becomes a repair of its unit              | to-server-spec        | Polls `postBatch` every 5 s for up to 60 s (90 s timeout) until the door has been open long enough: worst-case very slow and flaky. Door alert = ingest.spec "a door's alert is once per opening"; door alert → repair order on its unit → same new spec. |
| an alert is resolved with Resolve                                          | keep-e2e              | Cheap UI.                                                                                                                                                                                                                                                 |
| (thresholds) a manager changes a zone's                                    | to-server-spec + thin | Save + log + "off raises nothing" (ingest.spec "a zone with its thresholds off raises nothing").                                                                                                                                                          |
| refuses a threshold that isn't a positive number                           | duplicate             | setup-schema / threshold schema spec.                                                                                                                                                                                                                     |

Savings: ~6 s typical, up to 60 s when the freezer poll waits.

### energy.overview.test.ts — 10.5 s, 4 tests

| Test                                                                                 | Class                    | Reason / target                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| show each door as its sensor last told: shut, open, open too long                    | to-component-spec + thin | The door card states (panel, leak, snowflake, overdue) are a component given a door's state; the state from events is model.spec "a door's openings". |
| an open dock door has the truck backing up to it                                     | to-component-spec        | Same component.                                                                                                                                       |
| (chart) measured up to the latest reading, the hour being measured, the rest to come | duplicate (mostly)       | overview/scope.spec "consumptionBars measures the past buckets…"; keep one chart render.                                                              |
| follows the selection, and is per day this month                                     | merge                    | Fold into energy.test's scope test (same page, same sign-in).                                                                                         |

Savings: whole file (~10 s) into energy.test + component specs.

### energy.portal.test.ts — 10.4 s, 3 tests

| Test                                                                    | Class          | Reason / target                                                                                                                                                                          |
| ----------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Riedel's contact reads their site's energy from the portal's navigation | keep-e2e       | Portal page, read-only.                                                                                                                                                                  |
| another customer's contact sees none of Riedel's sites                  | to-server-spec | `getClientEnergy` scoped by `atSites()`/`ofCustomer()` (`src/lib/server/auth/customer.ts`; `src/tests/unit/lib/server/auth/customer.spec.ts` covers the helpers). Second context (~4 s). |
| the office's energy pages aren't a contact's                            | duplicate      | moduleRemote role gate (remote-functions.spec "asks for a manager only…"; requireMember refuses contacts in session.spec).                                                               |

Savings: ~5 s.

### energy.setup.test.ts — 61.9 s, 10 tests (~6 s/test)

| Test                                                                                            | Class            | Reason / target                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| from the customer's page: Weggemans' Barneveld gets an energy site                              | keep-e2e (trim)  | Customer page card → setup; stored fields dup of setup.spec "is added for a customer site, named after it, and logged".                         |
| adds a zone, whose code is unique in the site                                                   | keep-e2e (trim)  | Dialog; uniqueness and "no thresholds" dup of setup.spec "a zone's code is unique… without thresholds".                                         |
| adds a consumer and a door that's a unit of the site: DOCK 05's door                            | keep-e2e (trim)  | Dialogs; stored values dup of setup.spec "a consumer and a door are in the site's zones".                                                       |
| the site's page shows it without any readings yet, in each scope and period                     | keep-e2e         | Empty-state rendering; real risk (division by zero etc.) but could be a server spec of the overview with no readings.                           |
| the gateway's batch names the new codes, and the settings page lists them                       | duplicate (thin) | ingest.spec "stores the readings and events"; keep the settings page listing.                                                                   |
| (deleting) is refused for a zone, a door and the site once they hold measurements               | duplicate        | setup.spec "is refused while readings, door events or alerts refer to it"; 3 dialogs (~6 s). Keep one.                                          |
| a consumer, which measures nothing, goes                                                        | duplicate        | setup.spec "goes, with the parts, while nothing was measured".                                                                                  |
| (dock on the door's card) shows DOCK 05's live state, Wheel-Lok and plate, linking to the board | keep-e2e         | Cross-module (docks api) on the page.                                                                                                           |
| isn't on a door whose unit is no dock's door                                                    | to-server-spec   | Overview's dock lookup returns none for a non-dock unit: docks.spec "is none for a leveller, a unit that's no dock's".                          |
| isn't there with the docks module off, and is back when it's on                                 | to-server-spec   | Two settings toggles + visits (~8 s) to show the energy overview asks docks' api only with the module on: a spec with a tenant without `docks`. |

Savings: ~25 s.

### energy.setup.tenancy.test.ts — 53.8 s, 5 tests (~11 s/test)

| Test                                                                                   | Class                 | Reason / target                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| set Bakkerij Tiel's site up, with a zone                                               | low-value             | Setup for the tampering below (captures the form). Overlaps energy.setup's first two tests.                                                                                |
| can't give a site another tenant's customer site                                       | duplicate             | setup.spec "is only for the tenant's own sites, and only its own are found".                                                                                               |
| can't give a door a unit of another site or tenant, nor a consumer another site's zone | duplicate             | setup.spec "a consumer and a door are in the site's zones, and units of the site only". 3 dialogs with injected options.                                                   |
| can't edit another site's zone through this one                                        | duplicate             | setup.spec "a consumer or door is edited only through its own site" (zone too? check: if not, add a zone case there).                                                      |
| (member) sees the site, but not its setup, and can't change it                         | to-server-spec + thin | 403 for a member posting a manager form: forManagers gate (remote-functions.spec); second context + no-JS form post (~10 s). Keep the "no Set up link" UI check elsewhere. |

Savings: whole file (~50 s) once one tampered form stays in energy.setup.

### energy.simulation.test.ts — 42.8 s, 4 tests (~11 s/test)

| Test                                                                              | Class                      | Reason / target                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a manager plays it, its ticks post the readings since the latest, reset and pause | keep-e2e (trim)            | The page driving ticks; waits for the backfill. The backfill/reset content (12 intervals × 7 zones, yesterday's 92+) → energy's `server/live-simulation.ts` spec (simulation.spec covers the generator only). |
| a planner sees its state, but can't drive it                                      | to-server-spec             | Manager gate on the simulation commands (core `#lib/server/simulation.ts`, as in docks.simulation): one core spec for both modules. Second context.                                                           |
| isn't on the page of a tenant offered none                                        | to-component-spec / server | Bar absent without a simulation row; third context in this file.                                                                                                                                              |
| (South) can't drive SHLTR's simulation, nor tick it                               | duplicate                  | remote-functions.spec moduleRemote + `simulation.spec.ts` tenancy.                                                                                                                                            |

Savings: ~20 s. The file signs in as North's admin and opens three SHLTR contexts: `useApp({ user: shltrOwner })`
would save two sign-ins (~8 s) even with no conversions.

### energy.tenancy.test.ts — 45.9 s, 6 tests (~7.5 s/test)

| Test                                                                          | Class                 | Reason / target                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| a manager makes one, which the feed then takes, and revokes it                | keep-e2e (trim)       | Token UI; overlaps docks.tenancy's same test (core `integrations.ts`): one e2e for the token UI app-wide is enough. |
| a planner, who's no manager, can't manage them nor change the thresholds      | to-server-spec + thin | 403 page + managers-only UI; second context.                                                                        |
| (feed) refuses a request without a valid token                                | duplicate             | ingest.spec "a docks token, a revoked one or none at all is a 401".                                                 |
| takes only its tenant's site and codes, and stores nothing of a refused batch | duplicate             | ingest.spec "tenancy" (3 tests); the 404/422 bodies are the endpoint's (callable from a spec).                      |
| (North/South) its pages are 404s and the sidebar lacks it                     | duplicate (thin keep) | 8 page visits + switch (~10 s): route-guard.spec + nav.spec. One visit is enough.                                   |
| its remote queries are refused                                                | duplicate             | remote-functions.spec moduleRemote.                                                                                 |

Savings: ~30 s.

**Energy total: ~150 s of 279 s.**

## invoices (4 files, 286 s)

Pure specs are good (`invoice.spec.ts`: amounts, VAT, status transitions, lines of an order incl.
adjustments; `credit-note.spec.ts`: crediting in full/part, never more than left, refusals, what's left to
pay, statuses, numbers; schemas, labels, activity sentences, PDF). **No spec runs `server/invoices.ts`,
`server/credit-notes.ts`, `server/settlement.ts` or `server/settings.ts` on a database**: drafting from
billable orders, issuing (dates, orders → invoiced, logged), voiding (orders back), paying, the
tenancy of customers/orders/lines/ids, receivables. The two big files are where that is checked today,
so most conversions here need one new seeded `invoices.spec.ts` (+ `credit-notes.spec.ts`), the highest-
value spec work in the modules.

### invoices.test.ts — 118.4 s, 23 tests (~5 s/test)

| Test                                                                                      | Class                         | Reason / target                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an order that isn't invoiced offers a new invoice for its customer                        | keep-e2e                      | Slot on the order page → link with `?customer=`.                                                                                                                                                                                                                     |
| the new invoice offers the customer's completed orders and this month's fees              | to-server-spec + thin         | `billable.ts` (billable.spec covers the modules' items only) + "completed, not on a non-void invoice" SQL. Keep the pre-checked boxes.                                                                                                                               |
| creating it makes a draft with the next number, priced like the orders' pages             | to-server-spec + thin         | Draft lines = `invoice.spec` "lines"; contract discount/fees = contracts' api; then visits **every** order's page to compare totals (N navigations, ~10 s): a spec comparing `createDraft` lines with the order-page price function. Keep create → redirect → badge. |
| a draft takes typed-in lines, and orders can come off and go back on                      | keep-e2e (trim)               | Add-line form + remove/add round trip on one page; stored values → spec.                                                                                                                                                                                             |
| issuing it dates it, fixes its due date and invoices its orders                           | to-server-spec + thin         | `issueInvoice`: issued_on/due_on/orders → invoiced. Keep the confirm dialog + badge.                                                                                                                                                                                 |
| a sent invoice's lines can't be removed, even through a draft's form                      | to-server-spec                | `removeLine` refuses a line of an issued invoice (tamper).                                                                                                                                                                                                           |
| its PDF downloads                                                                         | keep-e2e (cheap) / duplicate  | invoice-pdf.spec renders it; the route's headers could be a spec of `routes/[number]/pdf/+server.ts`. Cheap (request only).                                                                                                                                          |
| marking it paid records today                                                             | keep-e2e (trim)               | Confirm + badge + order card; paid_on → spec.                                                                                                                                                                                                                        |
| the activity log has what was done to it and its orders, on its page too                  | to-server-spec + thin         | Log entries/notes → spec (activity.spec covers the sentences); keep the card render.                                                                                                                                                                                 |
| voiding a sent invoice puts its orders back to completed, to bill again                   | to-server-spec + thin         | Makes and issues a second invoice (~10 s). `voidInvoice` rule → spec; keep "Voided: …" on the order card.                                                                                                                                                            |
| an invoiced order can't be edited or deleted                                              | keep-e2e                      | Core order page UI under the module's rule; cheap.                                                                                                                                                                                                                   |
| an order on a draft can't be deleted                                                      | to-server-spec                | Order delete refused by the module's hook ("such as an invoice"); the hook is server code.                                                                                                                                                                           |
| (South) South's invoice has no contract fees                                              | to-server-spec                | `billable.spec` "billable items come from each module that is on" covers module-off; the leftOut order setup is needed later only.                                                                                                                                   |
| changing the invoicing settings logs the change                                           | to-server-spec + thin         | `server/settings.ts` save + log; the activity feed rendering is core (activity.test). Saves twice (~6 s).                                                                                                                                                            |
| a North customer is refused                                                               | to-server-spec                | `createDraft` with another tenant's customer → "Unknown customer".                                                                                                                                                                                                   |
| North's invoices are 404s, their PDFs too                                                 | to-server-spec (keep 1 visit) | Detail by number in tenant → 404; activity by id in tenant: `feed.spec.ts`/`log.spec.ts`.                                                                                                                                                                            |
| a North order can't be added to South's draft                                             | to-server-spec                | `addOrders` with another tenant's order → issue.                                                                                                                                                                                                                     |
| issuing North's draft by its id is refused                                                | to-server-spec                | `issueInvoice(northId)` under South → 404.                                                                                                                                                                                                                           |
| voiding North's draft by its id is refused                                                | to-server-spec                | Same for void. Keep one of the two as the e2e tamper.                                                                                                                                                                                                                |
| (module off) opened client-side, the invoice's page loads its data through remote queries | low-value                     | URL recording.                                                                                                                                                                                                                                                       |
| its pages, PDFs and queries are 404s                                                      | duplicate (thin keep)         | route-guard.spec + remote-functions.spec; the PDF `+server.ts` 404 → spec (it calls `requireModule`). 4 visits.                                                                                                                                                      |
| and nothing of it shows on the core's pages                                               | keep-e2e                      | Empty slots (cheap). Overlaps without-modules.test.                                                                                                                                                                                                                  |
| switched on again, it shows again                                                         | duplicate                     | without-modules.test "switching them back on"; needed as cleanup.                                                                                                                                                                                                    |

Savings: ~65 s.

### credit-notes.test.ts — 102.5 s, 15 tests (~7 s/test)

| Test                                                                                 | Class                 | Reason / target                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a paid invoice is credited in part: a draft against the line, at the invoice's rate  | keep-e2e (trim)       | Credit form (removing the input's max shows the server refuses too: that refusal = credit-note.spec "never more than is left of a line"). Stored lines → spec.                               |
| issued and settled: refunded, while the invoice stays paid                           | to-server-spec + thin | `server/credit-notes.ts` issue/settle, invoice untouched; "what's left" = credit-note.spec. Keep the invoice card numbers once.                                                              |
| the activity log has the credit note's life, on the invoice's card too               | to-server-spec        | Log entries on credit note and parent invoice.                                                                                                                                               |
| its PDF downloads                                                                    | duplicate             | invoice-pdf.spec "a credit note's PDF"; headers → route spec. Cheap.                                                                                                                         |
| a sent invoice credited in full is paid by its credit note                           | to-server-spec + thin | `settlement.ts` (credited in full → invoice paid, note logged): no DB spec. "Nothing to credit" page stays.                                                                                  |
| an invoice with credit notes can't be voided                                         | to-server-spec        | `voidInvoice` refusal.                                                                                                                                                                       |
| a standalone credit note: typed in, more lines on its draft, issued to refund        | keep-e2e (trim)       | Standalone form + add-line; amounts = credit-note.spec "a standalone credit note's line".                                                                                                    |
| the credit notes' list shows North's, and the invoices' list what's credited         | to-server-spec        | List SQL (credited column) + status filter; `loadAllRows()` on the invoices list (~5 s).                                                                                                     |
| the dashboard owes what's left to pay, and what's to refund                          | to-server-spec        | Receivables query = credit-note.spec "what's left to pay" summed: re-implemented in the test in SQL. Keep the card visible. Overlaps invoices.list "the dashboard adds up…".                 |
| in Dutch, it's a creditnota                                                          | low-value             | `labels.spec.ts`/`activity.spec.ts` "reads them in Dutch" + invoice-pdf.spec "reads in Dutch"; one cookie + visit.                                                                           |
| (South) North's credit notes are 404s, their PDFs too                                | to-server-spec        | Also makes a North draft first (~5 s). Lookup by number in tenant.                                                                                                                           |
| issuing or voiding North's draft by its id is refused                                | to-server-spec        | 2 tampered dialogs + a South draft made through the form.                                                                                                                                    |
| a North line can't be removed from South's draft, nor a North invoice credited       | to-server-spec        | 3 tampered forms (~8 s): removeLine / createCreditNote(invoiceId) / lineId of another invoice ("Only the invoice's own lines" = credit-note.spec "refuses a line that isn't the invoice's"). |
| (module off) opened client-side, the credit notes' pages load through remote queries | low-value             | URL recording.                                                                                                                                                                               |
| its pages, PDFs and queries are 404s                                                 | duplicate             | Same as invoices.test's; toggles the module off and on again (~8 s). Keep the module-off check in one invoices file only.                                                                    |

Savings: ~65 s.

### invoices.list.test.ts — 30.1 s, 6 tests

| Test                                                                              | Class                      | Reason / target                                                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the sidebar lists the module and the list shows North's invoices                  | keep-e2e                   | Smoke; overlaps invoices.test's start: merge.                                                                                                                           |
| the customer filter lists the customers with invoices, found by name or code      | to-server-spec + thin      | Facet query counts (`plan.spec` "counts each value…" generic) for the invoices list; keep the filter UI once.                                                           |
| the dashboard's link lists the overdue invoices                                   | keep-e2e (trim)            | Dashboard link → URL filter; the overdue filter = list/columns.spec "the status filter tells overdue…".                                                                 |
| the dashboard adds up what's outstanding and overdue, with VAT, less credit notes | duplicate / to-server-spec | Same as credit-notes "the dashboard owes…": keep one, as a receivables spec.                                                                                            |
| selected invoices are marked paid, except those that aren't sent                  | keep-e2e (trim)            | Bulk bar + dialog's "1 of 2" + toast; skip logic = bulk.spec "skips what the change refuses" + invoice.spec statuses. `loadAllRows()` is slow: filter the list instead. |
| (Dutch) the invoices read in Dutch                                                | low-value                  | Labels spec + i18n.test.                                                                                                                                                |

Savings: ~12 s.

### orders.bulk.test.ts — 35.1 s, 3 tests (~12 s/test)

| Test                                                                                 | Class                    | Reason / target                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| creating an invoice from two completed orders of one customer opens the draft        | keep-e2e (trim)          | Bulk action → redirect; stored lines/log → spec of `bulk.remote.ts`'s server function.                                                                                                       |
| a completed order's row menu creates an invoice for it alone; others' don't offer it | keep-e2e (trim)          | Row menu availability is the action's `available()` (`bulk-actions/orders.list.ts`): a unit spec; keep the create from the menu.                                                             |
| orders of several customers can't be invoiced together                               | to-component-spec / unit | The disabled reason is computed on the client from the selection: unit-test the action definition (`src/tests/unit/lib/components/data-table/bulk-action-bar.svelte.spec.ts` pattern). ~8 s. |

Savings: ~12 s.

**Invoices total: ~155 s of 286 s.**

## maintenance (3 files, 198 s; maintenance.tenancy ran twice: 88.2 s and 74.0 s)

Specs: `server/automatic.spec.ts` (off until turned on, orders of plans due within lead time once, next
only after the last is finished, logged as the system, emails only when wanted, stays in its tenant),
`model.spec.ts` (advanceDueDate, due ranges, dueForAutomaticOrder), `form/plan-schema.spec.ts`,
`list/columns.spec.ts`; core `src/tests/unit/lib/server/jobs/daily.spec.ts` covers the cron token.
**`server/plans.ts` (CRUD, pause, per-contract bulk add, tenant checks), `server/orders.ts` (orders from
selected plans, advancing the plan, the order-delete hook) and `server/list-sql.ts` have no spec.**

### maintenance.test.ts — 56.8 s, 11 tests (~5 s/test)

| Test                                                                                            | Class                 | Reason / target                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| a plan is added on the unit's page, and logged against the unit                                 | keep-e2e (trim)       | Card + dialog + overdue badge; stored fields/log → `plans.ts` spec. The extra visit for the activity card (~2 s) can go.                  |
| it's edited, paused and resumed, each logged                                                    | to-server-spec + thin | Log diffs → spec; keep pause → "Paused" badge.                                                                                            |
| shows the active plans due within 30 days by default, and the overdue ones on request           | to-server-spec        | Due list SQL ranges (`list-sql.ts` with `planList`); model.spec covers the ranges' dates only. Keep one select change.                    |
| fits a phone's screen, the toolbar's actions wrapping                                           | keep-e2e              | Layout.                                                                                                                                   |
| finds the plan by its unit's serial number                                                      | merge                 | One visit; fold into the due-list test.                                                                                                   |
| creates an order for each selected plan, and moves each plan on one interval                    | keep-e2e (trim)       | Bulk bar flow; the order fields, plan advance and log → `orders.ts` spec (`createOrders` + `advanceDueDate`).                             |
| deleting the order later doesn't move the plan back                                             | to-server-spec        | The order-delete hook clears `last_order_id`; delete through the order page (~4 s).                                                       |
| the dashboard counts the plans overdue and due within 30 days                                   | keep-e2e (trim)       | Dashboard slot + link to `?due=overdue`; counts → overview query spec.                                                                    |
| the equipment list sorts by the next maintenance                                                | to-server-spec        | Module column SQL (`next-due-sql.ts`, `server/columns/equipment.list.ts`) via withModuleColumns + planList (module-columns.spec pattern). |
| and filters by it: overdue, or no plan                                                          | to-server-spec        | Same; `none` = plan.spec "keeps the rows without a value by `none`".                                                                      |
| a contract's page lists its covered units' plans, and adds one to each covered unit without one | keep-e2e (trim)       | Cross-module card on the contract page; per-unit result → spec.                                                                           |

Savings: ~20 s.

### maintenance.automatic.test.ts — 53.1 s, 8 tests (~6.5 s/test)

| Test                                                         | Class                 | Reason / target                                                                                                                                                           |
| ------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the daily run needs the cron's token                         | duplicate             | `daily.spec.ts` "never without a token set", "with the cron secret or the ops token".                                                                                     |
| are off at first: the run makes no orders                    | duplicate             | automatic.spec "does nothing while the tenant hasn't turned automatic orders on".                                                                                         |
| a manager turns them on, on the module's settings page       | keep-e2e (trim)       | Settings page + redirect; stored/log → `server/settings.ts` spec.                                                                                                         |
| the run makes the orders of the plans that are due, once     | duplicate             | automatic.spec "makes the orders of the plans due within the lead time, once" + "stays in its tenant".                                                                    |
| the orders and the plans are logged as made automatically    | duplicate (thin keep) | automatic.spec "logs the orders and the plans as the system's"; "Fieldworks (automatic)" in the feed is core (`feed.spec.ts`). Keep "last run" text on the settings page. |
| with reminders on, the customer of a new order gets an email | duplicate (mostly)    | automatic.spec "emails the customers only when the tenant wants it"; the Dutch-fallback subject is the one extra: add to the spec. ~8 s.                                  |
| turned off again, the run makes no orders                    | duplicate             | automatic.spec "does nothing while…".                                                                                                                                     |
| only a manager may change the settings                       | to-server-spec + thin | 403 = forManagers gate (remote-functions.spec); re-signs in as the planner (~4 s). Keep the managers-only text if anywhere.                                               |

Savings: ~40 s (keep one e2e: turn on in the settings, run the daily job, see an order).

### maintenance.tenancy.test.ts — 88.2 s / 74.0 s, 10 tests (~8 s/test)

| Test                                                                                 | Class                 | Reason / target                                                                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| its pages load their data with remote queries                                        | low-value             | URL recording.                                                                                                                                         |
| a new plan for another tenant's unit is refused                                      | to-server-spec        | `createPlan` with South's unit under North → 404. Keep as the file's one tamper.                                                                       |
| (South) no sidebar entry, its page is a 404                                          | duplicate (thin keep) | route-guard.spec + nav.spec.                                                                                                                           |
| no card on a unit's page or on the dashboard                                         | keep-e2e              | Empty slots; cheap; merge with the above.                                                                                                              |
| the equipment list has no Next maintenance column, and ignores its URL parameter     | duplicate             | module-columns.spec "adds nothing for a tenant without such modules", "refuses a column the tenant doesn't have".                                      |
| North's remote queries are refused                                                   | duplicate             | remote-functions.spec moduleRemote.                                                                                                                    |
| switched on, it's in the sidebar after Equipment, and a unit gets a plan             | duplicate / low-value | Sidebar order = nav.spec "a module goes after the entry it names"; enabling = without-modules.test. Setup for the tamper below.                        |
| switched off, its page is gone but the plans are kept, and they're back when it's on | to-server-spec + thin | Two toggles (~10 s); data kept across disable → module settings spec (`src/tests/unit/lib/server/modules/*`); logged module_enabled/disabled likewise. |
| North can't change South's plan by its id                                            | to-server-spec        | updatePlan/pausePlan/deletePlan with South's id → 404: 3 tampers + 2 org switches (~15 s).                                                             |
| switched off again, South is as it was                                               | low-value             | Cleanup.                                                                                                                                               |

Savings: ~65 s (keep: pages+empty slots for South in one test, one tampered create).

**Maintenance total: ~125 s of 198 s.**

## materials (6 files, 412 s) — the biggest module, and materials.test.ts is the suite's 2nd-longest file

Specs: `server/stock.spec.ts` is thorough (moveStock: balance, never below zero, another tenant's
untouched; heldLines; **moveOrderStock**: quote takes nothing, scheduling takes, cancelling returns and
reopening takes, removing lines of a cancelled order, deleting returns with the note, ledger-based,
shortage refused saying what the order can have; stockChanges; stockLevelSql), `lines.spec.ts`
(logging lines), `costs.spec.ts`, `api/stock.spec.ts`, `form/material-schema.spec.ts` (new material,
receiving, counting), `form-parts/orders.form.spec.ts` (lines: material + quantity > 0, two decimals),
`list/columns.spec.ts`, `display.spec.ts`, `model.spec.ts` ("pieces are counted whole").
**`server/materials.ts` (create/update/delete, unique name in any case, unit change refused when used
or when the history has part pieces, SKU numbering) and `server/list-sql.ts` have no DB spec.** Much of
materials.test.ts re-tests the generic data table, which `orders.list.test.ts`, `equipment.list.test.ts`,
`url-sync.svelte.spec.ts`, `list-definition.spec.ts`, `plan.spec.ts` and `bulk.spec.ts` already cover.

### materials.test.ts — 213.8 s, 41 tests (~5.2 s/test)

| Test                                                                                                            | Class                         | Reason / target                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every material's stock is the sum of its movements                                                              | to-server-spec                | Pure DB check on the seed; no browser at all. A seed spec (`src/tests/unit/lib/server/db/seed/*`).                                                                                                                                                                                |
| the list shows North's materials by name, 50 at a time as it scrolls                                            | keep-e2e                      | Smoke of the list.                                                                                                                                                                                                                                                                |
| a list shorter than a page of rows has nothing more to load                                                     | duplicate                     | equipment.list/orders.list paging tests; plan.spec paging.                                                                                                                                                                                                                        |
| malformed query refused with a 400 (test.each ×4: stockLevel bogus, unknown filter, string for list, page size) | duplicate                     | `list-definition.spec.ts` "rejects unknown filters…", "rejects values of the wrong type or not in the set", "rejects pages and page sizes out of range"; the same e2e exists in orders.list and equipment.list. 4 page loads + tamper (~20 s).                                    |
| …in the filters' counts                                                                                         | duplicate                     | Same; orders.list/equipment.list "in the filters' counts".                                                                                                                                                                                                                        |
| …while the list works as before once the request is right                                                       | duplicate                     | Same.                                                                                                                                                                                                                                                                             |
| searching finds materials by SKU and by name                                                                    | to-server-spec                | `list-sql.ts` search columns (list/columns.spec "the search finds materials by name and SKU" covers the definition).                                                                                                                                                              |
| filtering by unit shows only those                                                                              | to-server-spec                | plan.spec filters; materials-specific nothing.                                                                                                                                                                                                                                    |
| filtering by stock level shows the low and out of stock ones                                                    | to-server-spec                | stockLevelSql is specced (stock.spec); the filter wiring via planList.                                                                                                                                                                                                            |
| the dashboard counts the low and out of stock ones, and links to them                                           | keep-e2e (trim)               | Dashboard tile → URL; count → the dashboard query spec.                                                                                                                                                                                                                           |
| the list keeps its sorting and filters in the URL, through reloads and back                                     | duplicate                     | url-sync.svelte.spec ("filtering goes into the URL, each change as a history entry", "going back… takes the table back", "invalid parameters are ignored"); SSR-on-reload in orders.list "a link with filters and sorting opens the list that way". ~15 s, the longest test here. |
| the server sorts by stock level                                                                                 | to-server-spec                | stock.spec "stockLevelSql says what stockLevel() says" + a sort via planList.                                                                                                                                                                                                     |
| sorting by unit price puts the most expensive first                                                             | duplicate                     | plan.spec sorting.                                                                                                                                                                                                                                                                |
| sorting by usage puts the busiest first, whose page lists its orders                                            | keep-e2e (trim)               | Navigation to the detail; usage count SQL → spec.                                                                                                                                                                                                                                 |
| its stock history lists every movement, newest first, with the orders                                           | keep-e2e                      | Detail card; balances = stock.spec "balances count back from the current stock".                                                                                                                                                                                                  |
| a material that's used on orders can't be deleted                                                               | to-server-spec                | `deleteMaterial` refusal.                                                                                                                                                                                                                                                         |
| nor can its unit change                                                                                         | to-server-spec                | `updateMaterial` unit refusal.                                                                                                                                                                                                                                                    |
| creating a material validates it first                                                                          | duplicate                     | material-schema.spec "an empty form says what's missing", "the opening stock… isn't below zero". The browser's own `:invalid` check is the only UI bit.                                                                                                                           |
| a name that's taken (in any case) is refused                                                                    | to-server-spec                | Unique name in `materials.ts`.                                                                                                                                                                                                                                                    |
| a new material gets the next SKU                                                                                | keep-e2e (trim)               | Create → redirect → page; SKU = numbering.spec; opening balance movement → spec.                                                                                                                                                                                                  |
| editing it saves the changes, incl. the unit while unused, but not the stock                                    | keep-e2e (trim)               | Edit round trip.                                                                                                                                                                                                                                                                  |
| receiving stock adds it, with a note                                                                            | keep-e2e (trim)               | Dialog → toast → history row; movement = stock.spec.                                                                                                                                                                                                                              |
| receiving needs a quantity                                                                                      | duplicate                     | material-schema.spec "receiving stock… needs more than nothing".                                                                                                                                                                                                                  |
| a count records the difference as an adjustment, with the reason                                                | keep-e2e (trim)               | Dialog shows "Records −2.75 m." (client); the two refusals = schema spec + a "that's the stock already" rule → spec.                                                                                                                                                              |
| counting nothing left is fine, but never below zero                                                             | duplicate                     | material-schema.spec "needs a reason and a count that isn't negative"; stock.spec.                                                                                                                                                                                                |
| pieces are only received whole, and a history in part pieces keeps its unit                                     | to-server-spec                | Unit change refused for part-piece history (`materials.ts`); whole pieces = model.spec. Two pages (~6 s).                                                                                                                                                                         |
| selecting all the loaded materials acts on exactly the filtered ones                                            | duplicate                     | equipment.list "selecting all the loaded units acts on exactly the filtered ones" + bulk.spec "takes the ids matching a list's search and filters, of the tenant only"; creates a material first (~10 s).                                                                         |
| a bulk delete with a malformed target is refused with a 400                                                     | duplicate                     | equipment.list "a bulk action with a malformed target is refused with a 400" + bulk.spec "are refused when malformed".                                                                                                                                                            |
| an unknown SKU is a 404                                                                                         | low-value                     | Two visits; fold into the South 404 test.                                                                                                                                                                                                                                         |
| (South) switching organization shows South's materials                                                          | keep-e2e                      | Switch + list smoke.                                                                                                                                                                                                                                                              |
| the filters count South's materials only                                                                        | duplicate                     | plan.spec "counts each value…" + "never returns another tenant's rows".                                                                                                                                                                                                           |
| North's own SKU is a 404                                                                                        | to-server-spec (keep 1 visit) | Detail by SKU in tenant.                                                                                                                                                                                                                                                          |
| a SKU both have shows South's material                                                                          | to-server-spec                | Lookup by SKU is per tenant; usage/history per tenant. ~3 s.                                                                                                                                                                                                                      |
| receiving or counting stock with the id of a North material is refused                                          | duplicate                     | stock.spec "doesn't touch another tenant's material"; 2 tampered dialogs.                                                                                                                                                                                                         |
| saving with the id of a North material is refused                                                               | to-server-spec                | `updateMaterial(northId)` under South → 404. Keep this one as the file's e2e tamper.                                                                                                                                                                                              |
| deleting with the id of a North material is refused                                                             | to-server-spec                | `deleteMaterial(northId)` → 404.                                                                                                                                                                                                                                                  |
| a new material gets South's next SKU, and may use a name only North has                                         | to-server-spec                | Per-tenant SKU (numbering.spec) and per-tenant name uniqueness.                                                                                                                                                                                                                   |
| deleting it removes only South's, after which it's a 404                                                        | to-server-spec                | Delete cascade of movements.                                                                                                                                                                                                                                                      |

Savings: ~120 s of 214 (the 4+2 malformed-query tests, URL-state test, select-all/bulk-400 and the
South tampering are the bulk). Splitting the remainder in two files (list / detail+stock) would also cut the
wall clock, since this file alone sets a lane's length.

### materials.orders.test.ts — 61.2 s, 12 tests (~5 s/test)

| Test                                                                                | Class                 | Reason / target                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the order lines took their materials from stock, except quotes' and cancelled ones' | to-server-spec        | Seed consistency check, no browser.                                                                                                                               |
| a new order gets its material lines                                                 | keep-e2e (trim)       | The order form's materials part end to end; the movements = stock.spec "scheduling it takes them".                                                                |
| editing it saves the changes                                                        | keep-e2e (trim)       | "The same lines take no more stock" = stock.spec "moving on from scheduled takes nothing more".                                                                   |
| the lines are checked in the browser, before anything is sent                       | keep-e2e              | Client validation without a POST: browser-only.                                                                                                                   |
| the server checks the lines too, when the browser doesn't                           | duplicate             | orders.form.spec "each line needs a material and a quantity above zero"; the no-JS post is the form's.                                                            |
| lines take decimals in kilos, metres and litres, but whole pieces                   | duplicate (thin)      | model.spec "pieces are counted whole"; the `step=1` attribute is a component check.                                                                               |
| changing a line's quantity takes or returns the difference                          | duplicate             | stock.spec stockChanges "a changed quantity consumes or returns the difference" + moveOrderStock.                                                                 |
| taking more than is in stock is refused, naming the material and what's available   | duplicate (thin keep) | stock.spec "refuses a shortage, saying what the order can have"; keep one issue shown on the form.                                                                |
| removing a line returns its material                                                | duplicate             | stock.spec "new lines consume, removed lines return".                                                                                                             |
| cancelling it returns its materials, and reopening it takes them again              | duplicate             | stock.spec "cancelling returns what it held, and reopening takes it again". 2 form saves (~6 s).                                                                  |
| deleting it removes it and returns its materials, after which it's a 404            | keep-e2e (trim)       | The "page doesn't ask for the deleted order" check is real client behaviour; the stock part = stock.spec "deleting an order returns what it took, with the note". |
| a quote's lines take no stock, so deleting it returns none                          | duplicate             | stock.spec "a quote's lines take nothing". Creates + deletes an order (~6 s).                                                                                     |

Savings: ~35 s.

### materials.inline.test.ts — 19.3 s, 1 test

| Test                                                                    | Class            | Reason / target                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| is refused when its materials aren't in stock, and the status goes back | keep-e2e (merge) | Inline status change → toast → status reverts: client+server. One test pays a whole file's browser + sign-in (~5 s): move it into materials.orders.test.ts. The refusal itself = stock.spec shortage. |

Savings: ~6 s (file overhead).

### materials.portal.test.ts — 9.4 s, 3 tests

| Test                                                                            | Class           | Reason / target                                                                                                             |
| ------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| a job that hasn't started shows its materials, without a form                   | keep-e2e        | Portal UI.                                                                                                                  |
| once started, a material used comes out of stock, the same way as in the office | keep-e2e (trim) | Portal form; stock/shortage = stock.spec.                                                                                   |
| the line is logged against the order, by them                                   | duplicate       | lines.spec "logs added, removed and changed materials against the order" (by the engineer's user: add the user case there). |

Savings: ~2 s. Cheap file; fine as is.

### materials.ranges.test.ts — 67.6 s, 11 tests (~6 s/test)

| Test                                                                       | Class              | Reason / target                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| at most 10 in stock, from the Filter menu                                  | duplicate (mostly) | The range filter UI is core's (`orders.ranges.test.ts`, 257 s, `equipment.ranges.test.ts`); keep at most one materials range click.                                                                                                                                                                              |
| links combine ranges with each other and the other filters                 | to-server-spec     | 6 page loads (~10 s): plan.spec ranges ("numbers keep both ends", "several values keep the rows in any of them", "the rows, the count and the ids agree, with the other filters") + list-definition.spec "money is in euros in the URL and in cents in the query"; materials' `used` SQL in list-sql → one spec. |
| takes no more ranges than the list does: Add is off until one comes off    | duplicate          | Component behaviour of the range filter (core); list-definition.spec "cuts a filter's values where there are more than the list takes".                                                                                                                                                                          |
| a malformed range in the list's query is refused with a 400 (test.each ×7) | duplicate          | list-definition.spec "range filters… leaves out what isn't a range", "always passes the schema", "rejects values of the wrong type". 7 page loads (~35 s).                                                                                                                                                       |
| (South) count South's materials only                                       | duplicate          | plan.spec "never returns another tenant's rows".                                                                                                                                                                                                                                                                 |

Savings: ~60 s (the whole file but one smoke).

### materials.tenancy.test.ts — 40.7 s, 7 tests (~6 s/test)

(Despite its name, it's "module switched off in South"; cross-tenant isolation is in materials.test.ts.)

| Test                                                                                      | Class                 | Reason / target                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an owner switches materials off in settings                                               | keep-e2e (merge)      | Settings toggle; overlaps without-modules.test.                                                                                                                                                                  |
| the sidebar has no Materials, and its pages are 404s                                      | duplicate (thin keep) | route-guard.spec + nav.spec; 4 visits.                                                                                                                                                                           |
| the materials list's query is refused                                                     | duplicate             | remote-functions.spec moduleRemote.                                                                                                                                                                              |
| the dashboard has no low-stock tile                                                       | keep-e2e              | Empty slot, cheap.                                                                                                                                                                                               |
| an order costs its labour, on its page and in the list                                    | to-server-spec        | Pricing without the module: `src/tests/unit/lib/orders/server/pricing.spec.ts` + costs.spec with the module off.                                                                                                 |
| the order form has no materials, and a tampered part of it stores none                    | to-server-spec + thin | The form-slot refusal for a module that's off (`extensions.spec.ts` "a module's point isn't dispatched while its owner is off" covers dispatch, not the message); then creates/cancels/deletes an order (~10 s). |
| switching materials on again… brings back its pages, and its orders' materials and prices | duplicate             | without-modules.test "switching them back on brings back what South had".                                                                                                                                        |

Savings: ~25 s.

**Materials total: ~250 s of 412 s.**

## partner-programme (4 files, 209 s)

`server/programme.spec.ts` is the model for this whole report: a migrated temp DB with North and South,
`asSystem(tenant, …)` as `north()`/`south()`, covering figures from paid invoices by category (not void,
unpaid, next year's or South's), SQL = TS for the list, classification saved and logged, closing a year
once and only after it's over, choosing credit once into the wallet, the wallet never overspent, expiry
in the daily job once, credit notes off the revenue by settlement day, cash bonus paid by a draft credit
note once. `model.spec.ts` covers levels, figures, categories, the year cycle and the wallet replay.
What's not specced: accepting a partner (`accepted_by`, log), saving the rules (log), the manager gate
(generic), the portal's queries scoped to the contact's customer.

### partners.test.ts — 86.5 s, 8 tests (~11 s/test)

| Test                                                                        | Class                 | Reason / target                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lists the partners, from the sidebar                                        | keep-e2e              | List + dashboard card.                                                                                                                                                                                                                                                                                                                                                                    |
| shows a partner's figures on its customer page, as its paid invoices add up | keep-e2e (trim)       | The card shows `figuresOf` (programme.spec "count its paid invoices…"); keep one figure, not four.                                                                                                                                                                                                                                                                                        |
| accepts a customer into the programme                                       | keep-e2e (trim)       | Button → toast → card; accepted_on/by + log → spec.                                                                                                                                                                                                                                                                                                                                       |
| classifies an order's revenue in the order form                             | duplicate (thin keep) | programme.spec "follow the order form's classification, saved with the order and logged" incl. back to defaults = no row. Keep one save through the form-part (form slot wiring). Two order saves (~8 s).                                                                                                                                                                                 |
| only a manager may change the rules, close a year or accept a partner       | to-server-spec + thin | Captures 3 forms, clears cookies, signs in as planner, 4 visits, 3 no-JS posts, signs back in as admin (~20 s, the longest here). The 403s = the module's manager set (remote-functions.spec "asks for a manager only in the manager set"); the hidden buttons → a planner check folded into a planner-signed-in file, or component specs of the card/rules form with `canManage: false`. |
| edits a year's rules                                                        | keep-e2e (trim)       | Rules form (percent/euros → cents) is a form round trip; log + "this year's as they were" → spec of the rules save.                                                                                                                                                                                                                                                                       |
| closes last year after a preview, and records a partner's choice of credit  | keep-e2e (trim)       | Preview + confirm + choice dialog on the card; frozen figures/wallet = programme.spec "freezes each partner's figures, once" + "lets the partner choose credit once".                                                                                                                                                                                                                     |
| (daily job) expires credit past its date, once                              | duplicate             | programme.spec "expires credit past its date in the daily job, once"; `runDailyJobs()` over HTTP.                                                                                                                                                                                                                                                                                         |

Savings: ~35 s.

### partners.credit-notes.test.ts — 47.8 s, 3 tests (~16 s/test)

| Test                                                                                               | Class            | Reason / target                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (North) a credit note on a partner's paid invoice is taken off its Partner Omzet once it's settled | duplicate (thin) | programme.spec "credit notes are taken off the revenue by the day they're settled" + "…in SQL alike". Goes through the whole credit-note form, issue, settle (invoices' e2e covers those flows). Keep the card refresh only if wanted. ~15 s. |
| (SHLTR) a partner's cash bonus is paid out with a credit note: Weggemans', as seeded               | keep-e2e (cheap) | One page; but clears cookies and signs in again as SHLTR's owner (~4 s): `useApp({ user: users.shltrOwner })` for this describe in a file of its own, or merge into partners.portal.                                                          |
| chosen, the office makes its credit note: a draft for the cash, linked to the year                 | keep-e2e (trim)  | Card buttons → draft → issue/settle; the draft's line/source/log = programme.spec "pay out a cash bonus: a draft for the cash, linked to the year, once". The fixture insert is fine.                                                         |

Savings: ~20 s.

### partners.portal.test.ts — 41.0 s, 5 tests (~8 s/test)

| Test                                                                               | Class                 | Reason / target                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reads this year's bonus and the wallet on the home page and the Partner bonus page | keep-e2e              | Portal pages, tabs, phone width: real UI. Long (~12 s) but each step is UI.                                                                                                       |
| chooses its closed year's bonus once, after a step that says it's for good         | keep-e2e (trim)       | Two tabs racing is a real scenario; the refusal = programme.spec "lets the partner choose credit once". Two extra contexts (~8 s): the second tab could be a direct command call. |
| (chose cash) reads the credit note that paid it out                                | keep-e2e (merge)      | Third context for Weggemans; cheap page check. Could be a component spec of the closed-year row.                                                                                  |
| (not a partner) sees no bonus and no credit                                        | to-server-spec + thin | `getClientPartner` for a non-partner customer → not-partner; fourth context.                                                                                                      |
| the portal's remote functions are no office member's                               | duplicate             | moduleRemote("…", "customer") = remote-functions.spec "the customer set… asks for a customer's contact"; fifth context.                                                           |

Savings: ~12 s (mostly contexts).

### partners.tenancy.test.ts — 33.9 s, 5 tests (~7 s/test)

| Test                                                                               | Class                 | Reason / target                                                                                                      |
| ---------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| its pages load their data with remote queries                                      | low-value             | URL recording.                                                                                                       |
| a customer is looked up in the tenant: a code it doesn't have is a 404             | to-server-spec        | `getPartnerCard` lookup by code in tenant.                                                                           |
| another tenant's order has no classification to read                               | to-server-spec        | `getOrderClassification` by SHLTR's id under North → 404 (programme.spec has the save, not the tenancy of the read). |
| (South) its pages are 404s, the sidebar lacks it and the customer page has no card | duplicate (thin keep) | route-guard.spec + nav.spec; keep the empty card.                                                                    |
| its remote queries are refused                                                     | duplicate             | remote-functions.spec moduleRemote.                                                                                  |

Savings: ~25 s (fold the South empty-card check into partners.test.ts, which already signs in as North's
admin and could switch to South at its end).

**Partner programme total: ~90 s of 209 s.**

## parts-shop (3 files, 97 s)

Specs: `model.spec.ts` (checkout totals excl. VAT on credit, never above the credit, refusals: empty
cart, on request, not payable, unknown product, more than in stock, quantities 1–99; stock state;
numbering; status transitions). Related: materials' `api/stock.spec.ts` ("a shop order's stock is set
aside with the order's number in the note, and released again", "can't take more than there is", "only
the tenant's own material's"), partner-programme's wallet replay in `model.spec.ts`/`programme.spec.ts`.
**No DB spec of `server/orders.ts`** (place: spend + reserve in one transaction; cancel: reversal +
release; customer scoping of the portal's queries).

### shop.test.ts — 23.4 s, 5 tests

| Test                                                                               | Class           | Reason / target                                                                                                                      |
| ---------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| browses the catalogue by category and search, with stock and checklist points      | keep-e2e        | Client-side search/category filtering, phone width.                                                                                  |
| checks out with parts credit: the balance after, the order and its stock set aside | keep-e2e (trim) | The checkout flow; wallet/movement rows → `server/orders.ts` spec.                                                                   |
| is refused an order above the credit available                                     | keep-e2e (trim) | Disabled button + server message; the rule = model.spec "refuses a total above the credit available".                                |
| is refused a product on request, also in a tampered cart                           | duplicate       | model.spec "refuses… what's on request"; the tampered submit proves the server re-checks: keep if one tamper per module is the rule. |
| (office) confirms an order, and cancels it: its credit and stock come back         | keep-e2e (trim) | Office flow in a second context; reversal/release → spec (api/stock.spec + wallet replay cover the parts).                           |

Savings: ~4 s. The file is already lean.

### shop.checklists.test.ts — 12.2 s, 3 tests

| Test                                                                       | Class             | Reason / target                                                       |
| -------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| suggests the part it needs on the order's page, which adds it to the order | keep-e2e          | Cross-module card + action.                                           |
| can't be added to an invoiced order                                        | to-component-spec | No button for an invoiced order: the card's `canAdd`; one page visit. |
| is to order in the shop in the customer portal, for a partner with credit  | keep-e2e          | Portal link → cart prefilled (client state across pages).             |

Savings: ~2 s. Overlaps condition.components "a rejected point that checks a component suggests its article first" (same suggestion card): pick one owner.

### shop.tenancy.test.ts — 60.9 s, 6 tests (~10 s/test)

| Test                                                                                          | Class                 | Reason / target                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| the office's pages load their data with remote queries                                        | low-value             | URL recording.                                                                                                                                       |
| another customer's shop order is a 404 in the portal, also by a tampered number               | to-server-spec        | Portal order lookup scoped by `ofCustomer()`; the 403 for the office query from a contact = remote-functions.spec moduleRemote role. Second context. |
| Riedel's order query, tampered to another number, is a 404                                    | to-server-spec        | Same lookup; third context.                                                                                                                          |
| the portal's remote functions are no office member's                                          | duplicate             | remote-functions.spec "the customer set… asks for a customer's contact"; fourth context.                                                             |
| (contact whose customer isn't a partner, tenant without the module) has no shop in the portal | duplicate (thin keep) | route-guard.spec for the portal route; nav link absence is cheap. Fifth context.                                                                     |
| (North/South) its pages are 404s, the sidebar lacks it and its remote queries are refused     | duplicate             | route-guard.spec + nav.spec + moduleRemote; sixth context and org switch, 6 visits + 6 fetches.                                                      |

Savings: ~45 s. Five extra signed-in contexts (~4 s each) are most of this file's time.

**Parts-shop total: ~50 s of 97 s.**

## schedule (5 files, 164 s)

Specs are client-side only: `board/board.spec.ts` (grouping, rows, load, backlog order, planning moves),
`calendar/calendar.spec.ts` (URL view, periods, six-week month, cells "+N more", by day in the zone),
`form/schedule-schema.spec.ts`. The server rules live in core `src/lib/orders/server/scheduling.ts`
(`scheduleOrder`, imported as `planOrder`): **no spec** checks "only open orders", "the tenant's own
order", "the tenant's own active engineer", "a quote without an engineer stays a quote", "scheduled takes
stock". The board's queries (`getSchedule`, `getScheduleMonth` in `schedule.remote.ts`) aren't specced
either. This module is mostly UI (drag and drop, live board, URL views), so most of it stays e2e.

### schedule.test.ts — 36.3 s, 13 tests (~2.8 s/test: already cheap)

| Test                                                                                    | Class             | Reason / target                                                                                     |
| --------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| North has the schedule, right after Orders in the sidebar                               | duplicate         | nav.spec "a module goes after the entry it names"; the DB assert is seed data.                      |
| the week shows North's engineers and this week's orders, with today highlighted         | keep-e2e (trim)   | Board render; backlog order = board.spec "the backlog is most urgent first".                        |
| its band has the title, the week's orders in a pill and the view switch, phone-wide too | keep-e2e          | Layout; phone reload.                                                                               |
| the row of days stays at the top of the board, above the cards, when it scrolls         | keep-e2e          | Sticky header geometry: browser only.                                                               |
| the page itself doesn't scroll: nothing hangs below the board                           | keep-e2e (merge)  | Layout; cheap, fold into the band test.                                                             |
| the week is in the URL, and can be paged through                                        | keep-e2e (trim)   | URL paging; "any day stands for its week" = calendar.spec.                                          |
| the dialog lists the engineers who service the order's first unit first                 | to-component-spec | Option grouping by specialty is the dialog's (board.ts) given the engineers: a component/unit spec. |
| a backlog order is scheduled through the dialog                                         | keep-e2e (trim)   | Dialog → board; the stock taken on scheduling = materials stock.spec.                               |
| going back closes the dialog, and going forward opens it again                          | keep-e2e          | History/shallow routing: browser only.                                                              |
| dragging an order to another engineer and day keeps its time                            | keep-e2e          | Drag and drop. "Keeps its time" = board.spec "moving an order within the week".                     |
| a backlog order dropped on Unassigned gets a date at 9:00 but no engineer               | keep-e2e (trim)   | Drag; "a quote stays a quote" → scheduling.ts spec.                                                 |
| orders that aren't open can't be scheduled                                              | to-server-spec    | `scheduleOrder` refuses a completed order: no spec.                                                 |
| planned for another week, the board goes there, and back without the dialog             | keep-e2e          | Navigation after submit.                                                                            |

Savings: ~6 s.

### schedule.calendar.test.ts — 25.6 s, 7 tests

| Test                                                                                          | Class                    | Reason / target                                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| is six weeks from a Monday, with each day's orders, the days around it muted and today marked | keep-e2e (trim)          | Render; the six weeks and the "+N more" rule = calendar.spec "has six weeks…", "a cell lists what fits, and how many more". The per-day loop over 42 cells is in-page (cheap). |
| an order shows its time, customer and type, in its type's colour, and opens its page          | to-component-spec + thin | Entry attributes = a component spec of the month cell; the click-through stays.                                                                                                |
| pages through the months, back to today's, and keeps the view on a reload                     | keep-e2e (trim)          | URL paging; periods = calendar.spec "paging goes a whole period back or forth".                                                                                                |
| +N more opens the day, with all its orders                                                    | keep-e2e                 | Link → day view.                                                                                                                                                               |
| (switching views) keeps the period: another month's first week and day, or today in this one  | keep-e2e (trim)          | = calendar.spec "another view shows today if the period has it, else the period's first day"; keep one switch round trip.                                                      |
| an order planned in the day view shows on its day in the month                                | keep-e2e                 | Cross-view flow.                                                                                                                                                               |
| on a phone, the month is a list of its days with orders                                       | keep-e2e                 | Layout.                                                                                                                                                                        |

Savings: ~5 s.

### schedule.live.test.ts — 24.6 s, 2 tests

| Test                                                                 | Class    | Reason / target                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an open board shows what another dispatcher plans, without reloading | keep-e2e | Live query across two tabs: the point of e2e.                                                                                                                                     |
| moves made in quick succession stay where they were dropped          | keep-e2e | Race between a move's answer and a live refresh; has a fixed `waitForTimeout(5_000)` after the routes' 2 s delays: could wait for the last `getSchedule` response instead (~4 s). |

Savings: ~4 s (the fixed wait), no conversions.

### schedule.live-worker.test.ts — 14.2 s, 1 test

| Test                                                                             | Class    | Reason / target                                                                                              |
| -------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| with the service worker, an open board still shows another dispatcher's planning | keep-e2e | Service worker + live event: only e2e can check it. Its own file because it needs `serviceWorkers: "allow"`. |

Savings: 0.

### schedule.tenancy.test.ts — 63.1 s, 10 tests (~6 s/test)

| Test                                                                               | Class                 | Reason / target                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a drag on a board left open in North is refused after switching to South elsewhere | keep-e2e (borderline) | The optimistic move undone with a toast on a 404 is client behaviour worth one e2e; the 404 itself = moduleRemote gate. Second tab + org switch (~10 s). Same scenario as contracts.tenancy's "form left open": keep one of the two app-wide. |
| so is the schedule dialog on that board                                            | duplicate             | Same gate, through a form.                                                                                                                                                                                                                    |
| South's sidebar has no Schedule, and its pages are 404s                            | duplicate (thin keep) | route-guard.spec + nav.spec; 4 visits → 1.                                                                                                                                                                                                    |
| North's schedule queries are refused, the week's and the month's                   | duplicate             | remote-functions.spec moduleRemote.                                                                                                                                                                                                           |
| an owner switches it on in settings, and it comes right after Orders               | duplicate             | nav.spec + without-modules.test; module_enabled log = module settings.                                                                                                                                                                        |
| switching organization shows South's engineers and orders only                     | to-server-spec        | `getSchedule` under South returns only South's engineers, orders, backlog.                                                                                                                                                                    |
| South's month shows South's orders on its days, and none of North's                | to-server-spec        | `getScheduleMonth` likewise.                                                                                                                                                                                                                  |
| scheduling North's order by its id is refused                                      | to-server-spec        | `scheduleOrder` with another tenant's id → 404. Keep as the module's one e2e tamper.                                                                                                                                                          |
| North's engineers and inactive engineers can't be assigned                         | to-server-spec        | "Unknown engineer" / "is no longer active" from `scheduleOrder`; 2 dialogs with injected options.                                                                                                                                             |
| switching it off again hides it, and keeps the orders' plans                       | duplicate / low-value | Cleanup; plans kept = data untouched by a module toggle.                                                                                                                                                                                      |

Savings: ~40 s. One `scheduling.spec.ts` (core `src/tests/unit/lib/orders/server/`) on a seeded North/South
DB covers the refusals of schedule.test and this file.

**Schedule total: ~55 s of 164 s.**

## Summary

### Totals per class (423 tests; rows with a compound class counted once, by their first class)

| Class             | Tests                              | Notes                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| keep-e2e          | 81                                 | Real UI: navigation, layout/phone, live queries, drag and drop, print, service worker, signatures.                                                                                                                                                                      |
| keep-e2e (trim)   | 67                                 | Keep the clicks; drop DB/log assertions that belong in a spec (each `rows()`/`value()` is cheap, but the extra visits and dialogs aren't).                                                                                                                              |
| to-server-spec    | 100 (+22 with a thin e2e left)     | ~45 of them need a **new** seeded spec (invoices, contracts, maintenance plans, condition, schedule's `scheduling.ts`, parts-shop orders, materials CRUD, checklists start/assets).                                                                                     |
| duplicate         | 92 (+15 keeping a one-visit smoke) | Mostly of module server specs, `remote-functions.spec`, `route-guard.spec`, `nav.spec`, `module-columns.spec`, `list-definition.spec`, `plan.spec`, `bulk.spec`, `url-sync.svelte.spec`, and of core e2e (orders.list, equipment.list, orders.ranges, without-modules). |
| to-component-spec | 10 (+2)                            | Door cards, legends, timers, range filter's "full", dialog option grouping, disabled bulk action.                                                                                                                                                                       |
| low-value         | 18                                 | Mostly "its pages load their data with remote queries" (URL recording), cleanups, i18n spot checks.                                                                                                                                                                     |
| merge             | 7                                  | One-click tests and single-test files (materials.inline) that pay their own setup.                                                                                                                                                                                      |

### Estimated savings per module (summed file seconds)

| Module            | Files  | Now          | Saved                | Main sources                                                  |
| ----------------- | ------ | ------------ | -------------------- | ------------------------------------------------------------- |
| materials         | 6      | 412 s        | ~250 s               | generic list re-tests, stock.spec duplicates, ranges file     |
| invoices          | 4      | 286 s        | ~155 s               | needs invoices/credit-notes server specs                      |
| energy            | 8      | 279 s        | ~150 s               | setup.tenancy duplicate of setup.spec, simulation contexts    |
| contracts         | 3      | 238 s        | ~130 s               | needs contracts.spec; price-agrees-everywhere visits          |
| maintenance       | 3      | 198 s        | ~125 s               | automatic duplicates, tenancy toggles + tampers               |
| checklists        | 7      | 260 s        | ~120 s               | templates/checklists specs exist; two tenancy files fold away |
| condition         | 6      | 210 s        | ~105 s               | needs specs for components/conditions/automatic               |
| partner-programme | 4      | 209 s        | ~90 s                | programme.spec exists; manager-gate test; contexts            |
| schedule          | 5      | 164 s        | ~55 s                | needs `scheduling.ts` spec; mostly real UI                    |
| parts-shop        | 3      | 97 s         | ~50 s                | tenancy file's five extra contexts                            |
| docks             | 3      | 104 s        | ~34 s                | already lean; logic in specs                                  |
| **Total**         | **52** | **~2,450 s** | **~1,260 s (~51 %)** |                                                               |

Wall clock: lanes run files in parallel, so the gain in wall time is smaller than the summed seconds,
except where a long file sets a lane's length: materials.test.ts (214 s, 2nd longest in the suite),
invoices.test.ts (118 s), contracts.orders (108 s), credit-notes (103 s). Cutting or splitting those
shortens the run directly.

### Top 10 conversions by seconds saved per hour of work

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                | Saves                        | Work   | s/h  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------ | ---- |
| 1   | Drop materials' re-tests of the generic data table: the 6 malformed-query tests, URL-state/back/forward, short list, price sort, select-all, bulk-400 and South facet count in materials.test; the 7 malformed ranges, "Add is off" and South count in materials.ranges (covered by list-definition/url-sync/plan/bulk specs and orders.list/equipment.list/orders.ranges e2e). Keep one range smoke. | ~110 s                       | 1 h    | ~110 |
| 2   | materials.orders: drop the 6 duplicates of `stock.spec.ts` (quantity change, removal, cancel/reopen, quote, server line check, whole pieces); move materials.inline's one test into it.                                                                                                                                                                                                               | ~40 s                        | 0.5 h  | ~80  |
| 3   | maintenance.automatic: drop the 5 duplicates of `automatic.spec.ts`/`daily.spec.ts`; add the Dutch-fallback mail subject to automatic.spec. Keep "turn on → run → an order".                                                                                                                                                                                                                          | ~35 s                        | 0.5 h  | ~70  |
| 4   | checklists.office's "order form" describe (3 duplicates of checklists.spec, incl. a second signed-in context) and checklists.tenancy's 8-tamper test down to one tamper (templates.spec covers all 404s).                                                                                                                                                                                             | ~35 s                        | 0.5 h  | ~70  |
| 5   | Delete energy.setup.tenancy.test.ts (duplicate of setup.spec: tenant's sites, units/zones of the site, editing through its own site; manager gate generic); keep one tampered form in energy.setup.                                                                                                                                                                                                   | ~50 s                        | 0.75 h | ~65  |
| 6   | Docks/energy feed and token duplicates (401s, unknown docks/codes, invalid batch: ingest.spec + events.spec) and the duplicated token UI test (keep one, in docks or energy).                                                                                                                                                                                                                         | ~30 s                        | 0.5 h  | ~60  |
| 7   | One generic spec: for every module, import its remote functions with `$app/server` stubbed and call each under `asSystem(tenant without the module)` → 404 before the handler. Then drop the "pages load through remote queries" recordings and "remote queries are refused" replays from ~11 tenancy files and collapse South's 404 page loops to one visit (tests.md sentence to update).           | ~120 s                       | 2 h    | ~60  |
| 8   | Session cache: sign each demo user in once per lane (e.g. sessions inserted into the template DB in `global-setup.ts`, or a cached `storageState` per user per lane) and have `useApp()`/`signedInPage()` start signed in. The modules alone do ~52 file sign-ins, 27 `signedInPage()`, 5 `clearCookies()`+`signIn()`. (Keep the UI sign-in in auth.test.)                                            | ~150–200 s (more suite-wide) | 3 h    | ~55  |
| 9   | partners.test's "only a manager may…" (re-signs in twice, 3 no-JS posts: manager set is generic) + its daily-job duplicate + partners.credit-notes' North test (programme.spec "credit notes are taken off the revenue…").                                                                                                                                                                            | ~45 s                        | 1 h    | ~45  |
| 10  | contracts: write `contracts.spec.ts` (create/update/delete, overlap, tenant's customer/unit, North's id under South, numbering) like templates.spec; then cut contracts.tenancy to one tamper + empty slots and drop 5 CRUD-rule tests of contracts.test.                                                                                                                                             | ~75 s                        | 3 h    | ~25  |

Next in line (larger absolute, more work): invoices + credit notes server specs (~130 s, ~6 h, and the
most valuable coverage gap: money rules only checked through e2e today), maintenance `plans.ts`/`orders.ts`
spec (~70 s, 3 h), condition components/conditions/automatic specs (~60 s, 3 h), core
`scheduling.ts` spec for schedule (~35 s, 2 h).

### Patterns

1. **Every module's tenancy file is the same template**, and most of it is generic: (a) navigate
   client-side to record remote query URLs (5–8 s, only to feed (d)); (b) tamper with 3–8 hidden ids in
   forms, each a dialog + DOM edit + `app.submit()` + `quiet()` (1.5–2 s each); (c) switch to South and
   load every module route for a 404 (4–8 visits); (d) replay the recorded URLs. (a), (c) and (d) are
   proven by `remote-functions.spec`, `route-guard.spec` and `nav.spec`; (b) by the module's server
   spec where one exists. One generic module-gate spec (top-10 #7) plus one tamper and one
   empty-slots visit per module would replace ~11 files' worth of steps.
2. **Module on/off toggles** through the settings page appear in 8 files (contracts ×2, invoices ×2,
   maintenance, materials, schedule, energy.setup), each disable + enable ~8–10 s, often only to undo
   itself. `without-modules.test.ts` already switches all modules off and on and checks core pages.
3. **Extra sign-ins**: 27 `signedInPage()` contexts, 5 `clearCookies()`+`signIn()`, 16
   `switchOrganization()`. Several files sign in as North's admin but work as SHLTR's people
   (energy.simulation opens 3 SHLTR contexts, docks.tenancy 2, parts-shop.tenancy 5): choosing the
   file's main actor in `useApp({ user })` saves a context each.
4. **`quiet()` after every submit**: 133 `app.submit()` calls in module files, each ending with at least
   500 ms of network silence (`network.ts` `quietFor`), plus toasts and polls. Fewer submits (pattern 1)
   is the lever; shortening `quietFor` is possible but risks flakiness.
5. **Fixed waits / slow polls**: energy.alerts' freezer test re-posts every 5 s for up to 60 s
   (90 s timeout); schedule.live `waitForTimeout(5_000)`; docks.simulation `waitForTimeout(1000)`.
6. **E2E re-implements server logic in SQL to compare** (dashboard receivables, partner figures,
   inspection statuses, year states, call-out SLAs): when the test's SQL and the app agree, a spec
   comparing the app's function with the pure model function is cheaper and doesn't drift.
7. **Seed-consistency checks in e2e** (materials "every stock is the sum of its movements", materials.orders
   "lines took their materials from stock"): no browser needed; a seed spec, or `global-setup.ts`
   asserting it once per run.
8. **"Total agrees everywhere"** style tests (contracts.orders: order page, list, service history, customer
   activity; invoices: every order's page vs. the draft) cost a navigation per place; one spec comparing
   the query functions' totals covers it, with one page visit left.
9. **i18n spot checks** in module files (contracts.orders "in Dutch", invoices.list, credit-notes "creditnota")
   duplicate the labels/activity/PDF specs that already render Dutch; `src/tests/e2e/i18n.test.ts` owns
   the cookie path.
