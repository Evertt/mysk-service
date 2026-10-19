# Architecture review

2026-10-18, at `802db03d` on `develop`. Whole codebase: `src/` is about 100k lines of non-test
TypeScript and Svelte. The review ran the exploration and assessment steps of
`improve-architecture`, `improve-file-structure` and `refactor`, with the `type-safety` and
Cursor team rules as lenses. It changed no code.

The conventions in `CLAUDE.md` and `docs/agents/*.md` are the recorded decisions here. Where a
finding touches one of them, the finding names it.

**Hot spots** (changes in the last 12 months × lines; bulk moves and reformats left out):
`server/db/schema.ts`, `server/db/seed/index.ts`, `(field)/my/portal.remote.ts`,
`data-table/data-table.svelte`, `data-table/list-definition.ts`, `models.ts`,
`service-worker/index.ts`, `customers/[code]/+page.svelte`, `activity/subjects.ts`,
`orders/[number]/+page.svelte`, `hooks.server.ts`, `server/lists/plan.ts`, `order.remote.ts`.
They decided what got read first, not what got covered.

---

## 1. Verdicts

| Axis           | Verdict                    | In one line                                                                                                                                                                                                                                                                        |
| -------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture   | **Systemic, at the seams** | The skeleton holds: tenancy, the gated remote sets, module boundaries, extension points and the list plan are deep and enforced by specs. But five decisions are each written out in 8 to 60 places across domains, modules and portals, and nothing checks that the copies agree. |
| File structure | **Localized**              | One real placement problem: the list kernel's browser-safe half sits inside the UI kit's `data-table/` folder. The rest are naming and documentation drift.                                                                                                                        |
| Code level     | **Significant**            | High copy counts, but much of it is deliberate (written-out updates, framework glue). What matters is the copies that have drifted apart: an untranslated message, a missing length limit, error toasts that only some modules show.                                               |

"Systemic" here doesn't mean the structure is rotting. It means the problems are cross-cutting:
each one only shows when you compare areas. Tackle two or three per session.

---

## 2. Cross-cutting findings

Each finding names the symptom it causes: **change amplification**, **cognitive load** or
**unknown unknowns**.

### X1. The order lifecycle is spread over seven writers and five rule sites

_Information leakage, back-door leakage. Unknown unknowns, change amplification._

Seven places write `order.status`, each with its own checks, completion-date rule, module
hook and log entry:

| Writer                        | File                                     | Asks the modules (`orders.saving`)?                                    | Completion date                            |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| `changeOrderStatus`           | `orders/server/order-changes.ts:77`      | yes                                                                    | `completedAt()`                            |
| `setOrdersStatus` (invoices)  | `order-changes.ts:111`                   | **no**: a comment claims "completed and invoiced are the same to them" | two hand-written updates                   |
| `scheduleOrder`               | `orders/server/scheduling.ts:43`         | yes                                                                    | not touched                                |
| `acceptOrder` / `rejectOrder` | `orders/server/acceptance.ts:69,90`      | yes                                                                    | not touched                                |
| `saveOrder` (the form)        | `orders/order.remote.ts:182`             | yes                                                                    | `completedAt()`                            |
| `setStatus` (engineer portal) | `routes/(field)/my/portal.remote.ts:216` | yes                                                                    | passed explicitly, not via `completedAt()` |
| `removeOrder`                 | `order-changes.ts:46`                    | yes (`status: null`)                                                   | –                                          |

Which change is allowed in which status is decided in five more places:

- `isEditableOrder` / `orderStatusChoices` in `models.ts:118,125`;
- `fieldActions` in `orders/field.ts`;
- the guards repeated in each writer above (`notEditable`, `acceptFirst`);
- the order page's buttons (`orders/[number]/+page.svelte:57-58`);
- the engineer portal's own status list (`portal.remote.ts:72`: `["scheduled", "in_progress"]`).

The modules also write out their own subsets of core's status lists:

- checklists `getsChecklists` (`checklists/model.ts:152`) is `openOrderStatuses` by value;
- maintenance `finishedStatuses` (`model.ts:83`);
- condition `plannedStatuses` (`server/status-sql.ts:28`);
- materials `stockHoldingStatuses` and its editability rule (`api/lines.server.ts:25`);
- two seeds use a `["completed", "invoiced"]` literal.

A new status, or a new rule ("cancelled orders release stock"), means visiting all of these.
The claim in `setOrdersStatus` holds only as long as materials' stock rule happens to agree
with it.

### X2. Live changes: every live query re-implements the subscription

_Shallow module, conjoined methods. Change amplification, unknown unknowns._

`server/changes.ts` exposes `watchChanges`, `changedAt`, `stop` and, through the db module,
`inThisRequest`. Callers must combine them correctly, and they do it by copying:

- `getRequestEvent().request.signal.addEventListener("abort", changes.stop, …)` appears in all
  9 `query.live` definitions;
- the `yield changedAt(…); for await (…) yield changedAt(…)` body is identical in 6 of them
  (activity, schedule, energy, docks and both portals);
- the "watch before the first answer" ordering and the `finally { changes.stop() }` exist only
  as comments repeated at the call sites.

On the client, the "refresh when it changes" effect (`seen` / `untrack(refresh)`) exists 8
times: `(field)/my/live.svelte.ts`, `(customer)/portal/live.svelte.ts`, three in energy, two in
schedule and `live-activity.svelte.ts`.

The record types each query watches are hand-written string arrays at 7 watchers, for example
`portalSubjects`, `boardSubjects` and energy's local `energySubjects`, which shares its name
with the manifest's record. Energy also announces `"energy_reading"`
(`energy/server/ingest.ts:164`), which no subject defines. A typo in any of these lists silently
never fires.

### X3. An activity subject's label is also its page's URL key, and nothing enforces that

_Back-door leakage. Unknown unknowns._

`subjects.ts` builds the links for orders, customers and equipment from the logged `label`:
`resolve("/(app)/orders/[number]", { number: label })`, and the same with `code` for customers
and `serial` for equipment. So every log call must pass the right field as the label. They do,
by hand, at about 60 sites:

- `order`: 14, plus one local `subjectOf` helper;
- `equipment`: 12, 8 of them as a parent;
- `customer`: 11, plus three separate `customerSubject` / `customerParent` helpers
  (`portal-access.remote.ts:126`, `partner-programme/server/partners.ts:51`,
  `parts-shop/server/orders.ts:82`);
- `bulkChange(…, { label: order.number })` repeats the rule once more.

`Subject.type`, `ActivityCard type=…` (12 pages) and `getSubjectActivity({ type })` are all plain
`string`. Docks reads the `activity` table directly (`docks/board/board.remote.ts:99-120`),
which also ties it to the storage format.

### X4. Who may see what: the customer portal has a scope module, the engineer portal has none

_Information leakage on a security decision. Change amplification, unknown unknowns._

The customer's scope is one module, `server/auth/customer.ts` (`ofCustomer`, `atSites`,
`customerOrders`), with 26 uses. The engineer's scope ("an order of the tenant's whose
`engineerId` is theirs") is written out at 8 sites:

- `portal.remote.ts:66,111`
- `places.remote.ts:85`
- `orders/server/field.ts:24`
- three modules: `materials/portal/field-materials.remote.ts:27`,
  `checklists/portal/field-checklists.remote.ts:35`, `condition/server/conditions.ts:157`
- `checklists/server/field.ts:64`

Core's `findEngineerOrder` exists, but the module queries don't use it (it takes an id; they
have a number).

The customer scope is also bypassed in places:

- `client.remote.ts:118-123` writes `ofCustomer`'s body out by hand;
- energy (`client/client-energy.remote.ts:21`) and the partner programme (`close.ts:136,167,236`,
  `partners.ts:34`) scope by `customerId` themselves;
- `equipment/server/qr.ts:62-109` re-implements contact, customer and site visibility. It has a
  reason: it runs before `currentCustomer()`.

### X5. The three portals each assemble the same records their own way

_Information leakage, temporal decomposition. Change amplification._

Nothing reads "an order with what was done on site" for all three portals:

- the order, its units and sites: the `found.units.map(…)` / `sites` derivation is verbatim in
  `order.remote.ts:63-73` and `portal.remote.ts:140-150`;
- the sign-off select (3) and its markup (3);
- notes: select (2) and markup (2);
- unit columns and `unitsWhere` (3);
- a location with its units (3);
- a unit's orders (3);
- a unit by serial number (3, plus 15 in modules, see D4).

The unit's one-line description has 5 shapes with fields in different orders, and two unused or
local helpers (`unitLine` in `equipment/display.ts:52`, `unitDetails` in `(customer)/portal/units.ts`).

The shells duplicate too:

- the error page (3 copies of `error-view.svelte`'s body);
- the `nameOrderTypes` block, with the same comment (3);
- sign-out: the remote (3) and the form markup (3);
- the header markup (2).

### X6. Drift between the four core domains

_Cognitive load._ The folder slots line up (`ui/`, `list/`, `form/`, `detail/`, `server/`); the
differences come from how the same decision gets made:

- **Deletes**: `removeOrder` and `removeEquipment` live in `server/`, while `removeCustomer` and
  `removeEngineer` are private in the record remote. After deleting, customers and engineers
  refresh the list; orders and equipment don't (`equipment.remote.ts:231`).
- **Lists**: orders and equipment are server-side lists; customers and engineers load every row
  into a client-side table. That's fine at today's sizes, but it's an unrecorded decision.
  Their bulk actions don't `.updates()` the list.
- **Live edits**: `ChangedElsewhere` appears on the order and customer pages and their edit
  pages only. This is documented. The equipment and engineer edit pages have no reload guard.
- **Naming**: `order.remote.ts` follows the documented `<record>.remote.ts`; the other three are
  plural (`customers.remote.ts`, …).

### X7. Modules drift from each other and from their declared interfaces

_Back-door leakage, information leakage. Unknown unknowns._

- **A manifest's `orderTypes` is not checked against what the module creates.** Condition
  (`server/automatic.ts:138`, `maintenance`) and energy (`server/alerts.ts:98`, `repair` /
  `survey`) create orders without declaring those types. So a tenant can hide those types
  (`requiredOrderTypes()`, `orders/server/types.ts:32`), and the module's automatic orders then
  get a hidden type. `createOrders` doesn't check.
- **Settings pages not in the manifest.** Invoices and maintenance have a settings page but no
  `settings:` entry in `module.ts`, so the settings page's module card doesn't link to them
  (condition, docks and energy do).
- **Condition restates checklists' inspection status.** The type
  (`condition/model.ts:40`, "as checklists has it"), the tones (`ui/inspection-badge.svelte`
  equals `checklists/display.ts:18-24`), the messages and the rank `case` SQL
  (`condition/server/list-sql.ts:44` equals `checklists/server/columns/equipment.list.ts:22`).
  Condition enhances checklists, so it may import checklists' `api/` types; it copies instead.
  Checklist kinds are restated 5 times, once in condition's `api/extensions.ts:47`.
- **Seeds reach into other modules.** Parts-shop's seed reads `checklist_template_item` as raw
  SQL (`parts-shop/server/seed.ts:274`) and has no `after` although it reads checklists' and
  materials' rows, so it relies on alphabetical registry order.
- **Two module families, two error behaviours.** In 23 sites, core, checklists, condition and
  maintenance wrap `submit()` in try/catch with an error toast. In 16 sites, energy, docks,
  parts-shop, the partner programme, materials and invoices don't, so a thrown submit (a 500, the
  network) shows no toast there.
- **Settings singletons.** The same singleton pattern (remote + `settingsOf` + page) appears in
  condition, maintenance and invoices; condition's and maintenance's differ only in comments
  and field markup.
- **Module copies of core lookups.** "Unit by serial or 404" appears 15 times, 13 of them in 6
  modules, because `equipment/server/index.ts` offers no lookup.

### X8. Time zone: "today" and "the day of a moment" are spelled out about 50 times

_Information leakage. Change amplification._

`CLAUDE.md` says to read a moment's day in `getTimeZone()`. `dates.ts` doesn't provide it, so:

- `Temporal.Now.plainDateISO(getTimeZone())` is written inline 36 times;
- there are 2 local `today()` helpers and 3 identical `dayOf()` helpers;
- "Monday of the week" is written 4 times, and "a day's first moment" 4 times plus 3 variants.

### X9. Lists: the client half of the protocol is copied into every list

_Shallow wiring. Change amplification._

The server half (`planList`) is deep. The client half is not:

- 7 pages repeat the same 4 lines (`urlListQuery`, `listQuery.current`, rows, facets of
  `whereOf(query)`);
- 6 tables repeat the `scrollPages` + `createAppTable({ serverSide, scroll, data, rowCount,
getRowId })` + `serverTableLoading` block;
- 7 remotes return `{ rows, rowCount, query, key: queryKey(input) }`, with the doc comments
  copied.

Where a list couldn't follow the copy, it went its own way:

- partners has no facets query and counts its levels in JS over all partners, ignoring the
  search (`partner-programme/overview.remote.ts:21-29`);
- the checklist assets list parses and writes its URL by hand (`assets/asset-list.svelte:43-61`,
  `selection.ts`);
- `unitFacets` repeats `plan.ts`'s facet counting (`orders/server/list-sql.ts:93-106`).

### X10. Tenancy helpers: small gaps that push callers to spell scopes out

_Low impact._

- `idInTenant(table, id: number)` takes only numbers, so member and invitation lookups write
  `and(eq(x.id, …), inTenant(x))` by hand (3).
- Correlated same-tenant conditions (`eq(a.organizationId, b.organizationId)`) are written 34
  times; condition has its own `sameTenant` helper. All of them are safe, just verbose.
- `tenantJoin(table, foreignKey: SQLiteColumn)` accepts any column as the key.

---

## 3. Deepening candidates

Ranked. Dependency categories follow `codebase-design`'s `DEEPENING.md`.

### C1. The order lifecycle module (from X1). Impact: High

- **Cluster:** `order-changes.ts`, `scheduling.ts`, `acceptance.ts`, `saveOrder` in
  `order.remote.ts`, `setStatus` in `(field)/my/portal.remote.ts`, `models.ts` (the status
  sets and `isEditableOrder` / `orderStatusChoices`), `orders/field.ts` (`fieldActions`), and the
  modules' status subsets.
- **Single responsibility:** decides whether an order may move from one status to another, and
  makes the move.
- **What it owns:**
  - the transition table per actor (office form, list, planner, acceptance, engineer, invoicing);
  - the completion-date rule;
  - whether the modules are asked (`saveOrderParts`) and the `OrderRefused` → `invalid` mapping;
  - the log entry (action, subject, `ignore`);
  - the named status sets the modules read (open, done, planned, holding work).
- **What stays out:**
  - field edits of the form (units, description, scheduling time) and creation
    (`createOrders`): another concern, which calls into the lifecycle;
  - pricing;
  - each module's own consequence of a status (stock, checklists), which stays behind
    `orders.saving`;
  - the UI, which reads the allowed transitions instead of re-deciding them.
- **Why they're coupled:** they share one invariant (which status can follow which, and what
  follows from it), and today that invariant lives in comments and in each writer's guard
  clauses.
- **Dependency category:** local-substitutable (libsql in the test suite).
- **Test impact:** tests at the lifecycle's interface, one per transition and actor, replace
  the status-related tests of `order-changes`, `acceptance`, `scheduling` and the portal's
  remote. The modules' save-hook tests stay.

### C2. The live changes module (from X2). Impact: Medium-High

- **Cluster:** `server/changes.ts`, `inThisRequest`, the 9 `query.live` definitions, the 8
  client watchers, and the 7 subject-type lists.
- **Single responsibility:** streams one tenant's changes, of the record types a live query
  shows, until the client goes away.
- **What it owns:**
  - the abort wiring and the watch-before-first-answer order;
  - `stop()` in `finally`;
  - the Cloudflare re-read (`inThisRequest`);
  - typed record types;
  - on the client, the "refresh when it changes" effect.
- **What stays out:**
  - what each live query reads, which the caller passes in;
  - announcing changes, which stays with `recordActivity`, plus the telemetry announcements of
    docks and energy.
- **Why they're coupled:** every live query uses the same four calls in the same order, and
  nothing enforces the order.
- **Dependency category:** in-process.
- **Test impact:** one spec at the new interface (abort, burst coalescing, SSR without resume)
  replaces the per-query behaviour that is now untested at 9 sites.

### C3. Activity subjects: how the log names a record (from X3). Impact: Medium

- **Cluster:** `Subject` in `server/activity/log.ts`, `subjects.ts`'s `href`s, about 60 inline
  subject literals, the customer-subject helpers, `bulkChange`'s `label`, and `ActivityCard` /
  `getSubjectActivity` type strings.
- **Single responsibility:** names a record in the log: its type, id, and the label its page is
  found by.
- **What it owns:**
  - one subject builder per type (core types and the modules' manifest subjects);
  - the "label is the URL key" rule;
  - a typed union of subject types, also used by C2's watch lists.
- **What stays out:** diffing (`recordActivity`), how fields read (`format.ts`), action verbs.
- **Why they're coupled:** a link breaks silently when one caller logs a different label.
- **Dependency category:** in-process.
- **Test impact:** a table test per subject type (builder → `subjectHref`) replaces nothing
  that exists today.

### C4. Portal access scopes (from X4). Impact: Medium (security)

- **Cluster:** `server/auth/customer.ts`; the 8 engineer-scope sites; `findEngineerOrder`; the
  customer-scope bypasses (energy, partner programme, `client.remote.ts`).
- **Single responsibility:** says which of the tenant's orders, units and sites a portal user
  may see.
- **What it owns:**
  - an engineer scope beside the customer scope (`engineerOrders(engineer)`, an order by number
    or id for the engineer);
  - the customer-scope helpers the bypasses should use.
- **What stays out:** the gates (`requireEngineer` / `requireCustomer`) and what each portal
  selects; `qr.ts`'s pre-session check may stay separate (it has a reason).
- **Why they're coupled:** one security rule, 8 spellings, 3 of them in modules.
- **Dependency category:** local-substitutable.
- **Test impact:** isolation tests at the scope interface replace the per-module tests that
  each prove "another engineer's order is a 404"; the per-portal e2e tamper tests stay.

### C5. The order's work record across portals (from X5). Impact: Medium; watch the scope

- **Cluster:** `getOrder`, `getMyOrder`, `getPortalOrder`, `work-report.remote.ts`, and the
  three sign-off and two notes renderings.
- **Single responsibility:** loads what was done on an order (its units at their sites, notes,
  sign-off) within the viewer's scope.
- **What it owns:** the shared select trees, the units → sites derivation, and the sign-off and
  notes reads.
- **What stays out:**
  - prices and tags, which only the office shows;
  - the request and its decision;
  - each portal's columns policy, which the caller passes in;
  - the layout.
- **Why they're coupled:** three readers of one record shape.
- **Dependency category:** local-substitutable.
- **Caution:** if the description needs "and prices and history", it is turning into a god
  object. Keep it to the work record, and let C4 supply the scope.
- **Test impact:** one query test per scope replaces the hand checks spread through the portal
  e2e files.

### C6. The server list view, the client half of lists (from X9). Impact: Low-Medium

- **Cluster:** `server-table.svelte.ts`, `table.svelte.ts`, `list-definition.ts` (`toListQuery`,
  `whereOf`, `queryKey`), the 7 list pages and the 6 server tables.
- **Single responsibility:** binds a list definition to its rows and facets queries and to the
  table.
- **What it owns:** reading the query from the URL, fetching rows and facets, scroll pages, the
  stale and loading state, and the result envelope `{ rows, rowCount, query, key }`.
- **What stays out:** columns, toolbar, bulk actions and SQL.
- **Dependency category:** in-process.
- **Test impact:** the `columns.spec.ts`-style checks stay; one harness test at the new
  interface replaces per-table loading checks.

---

## 4. File-structure findings

| ID  | Finding                                                                                                                                                                                                                                                                                                                                                                        | Paths                                                                  | Benefit / cost                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | The list kernel's browser-safe half lives in the UI kit. `list-definition.ts`, `ranges.ts`, `url-state.ts` and `module-columns.ts` sit among 64 `data-table/` files that also hold saved views' remotes and memory. `server/lists/` (4 files), `orders/server` and 7 module list folders import them. Understanding "lists" means two folders, one of them a component folder. | `src/lib/components/data-table/`, `src/lib/server/lists/`              | Medium benefit. A `src/lib/lists/` folder would mirror `server/lists/`. About 35 importers; `domain-boundaries.spec.ts` and `import-extensions.spec.ts` guard the move. |
| F2  | `src/lib/portal/` is the **engineer** portal's, while the URL `/portal` and `(customer)/portal` are the **customer's**. The modules mirror it (`portal/` is the engineer's, `client/` the customer's). A reader has to learn that "portal" means two things depending on where they look.                                                                                      | `src/lib/portal/`, `src/lib/client/`, `src/modules/*/{portal,client}/` | Low-Medium benefit; the slot ids (`portal.order`, `client.*`) are code, not stored. Moderate churn.                                                                     |
| F3  | `customer-facet.ts` (customers by code) sits in the generic `server/lists/`. The rule is "add a `server/index.ts` when something outside needs it"; this file went into infrastructure instead.                                                                                                                                                                                | `src/lib/server/lists/customer-facet.ts`                               | Low.                                                                                                                                                                    |
| F4  | Record remotes are named inconsistently: `order.remote.ts` against `customers.remote.ts`, `equipment.remote.ts` and `engineers.remote.ts` (`structure.md` documents `<record>.remote.ts`).                                                                                                                                                                                     | `src/lib/*/`                                                           | Low.                                                                                                                                                                    |
| F5  | The recorded decisions have drifted from the code: `structure.md` says "only orders has" a `server/index.ts` (equipment has one); `CLAUDE.md`'s gated-set list misses `forAnyRole`; 4 doc comments name files that moved (`orders-list.ts:14`, `equipment-list.ts:16`, `customers.remote.ts:54`, `equipment.remote.ts:28`).                                                    | docs + comments                                                        | Low cost, worth doing: these docs are the decision record.                                                                                                              |

Placement elsewhere is healthy: domain folders by feature, the module layout, barrels and
`server/` boundaries all hold and are spec-enforced.

---

## 5. DRY findings

Rule of three: two copies are a note. Counts are totals across the codebase (from searches,
±a few).

| ID  | Shape                                                                                                                                      | Copies                                                      | A shared piece exists?                                                               | Note                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| D1  | Activity subject literals (`{ type: "order", id, label: number }` …)                                                                       | ~60 for order, equipment and customer; 133 log calls in all | no                                                                                   | C3                                                                                                                |
| D2  | Live-query subscription body / abort line / client refresh effect                                                                          | 6 / 9 / 8                                                   | no                                                                                   | C2                                                                                                                |
| D3  | The engineer's order by number or id                                                                                                       | 8                                                           | `findEngineerOrder` (by id), bypassed                                                | C4                                                                                                                |
| D4  | Unit by serial number, else 404                                                                                                            | 15, plus 3 portal-scoped                                    | no core service                                                                      | each module also has its own not-found message                                                                    |
| D5  | Today in the user's zone / a moment's day / Monday / a day's first moment                                                                  | 36 (+2 helpers) / 15 (3 identical helpers) / 4 / 4          | no (`dates.ts`)                                                                      | X8                                                                                                                |
| D6  | Form submit → close → toast                                                                                                                | 39 (23 try/catch, 16 plain)                                 | `errorMessage()` only                                                                | the split changes behaviour, X7                                                                                   |
| D7  | Hand-written delete + `deleted` log in a transaction                                                                                       | 17, against 5 users of `deleteAndLog`                       | `deleteAndLog`, which opens its own transaction, so callers with checks can't use it | its interface is too narrow, not its callers wrong                                                                |
| D8  | Hand-written delete confirmation (`AlertDialog`)                                                                                           | 10, against 9 users of `DeleteDialog`                       | `DeleteDialog`, which has no state-driven mode for row menus                         | plus the row ellipsis menu ×6                                                                                     |
| D9  | Dialog footer (Close + ghost Cancel + `SubmitButton`)                                                                                      | 22                                                          | `FormActions` is for page forms only                                                 |                                                                                                                   |
| D10 | Inline empty-state paragraph                                                                                                               | 40                                                          | `Empty.*` for the big ones only                                                      |                                                                                                                   |
| D11 | One badge component per enum (display map or tone map)                                                                                     | 19                                                          | none                                                                                 |                                                                                                                   |
| D12 | `<h1>` page header bypassing `PageHeader`                                                                                                  | 19                                                          | `PageHeader`                                                                         | mostly in the portals; may be a deliberate look, unrecorded                                                       |
| D13 | Valibot blocks: numeric id `v.pipe(v.number(), v.integer(), v.minValue(1))` / customer code / `optionalText`                               | 17 (+10 without `minValue`) / 5 / 9 (5 named)               | `#lib/schema.ts` has none of them                                                    | `optionalText` drift: docks' copy shows valibot's untranslated default message; customers' site copy has no limit |
| D14 | Module settings singleton: remote, `settingsOf` and page                                                                                   | 3 each; `onOff` ×5                                          | no                                                                                   | X7                                                                                                                |
| D15 | Server list page lines / table block / result envelope                                                                                     | 7 / 6 / 7                                                   | no                                                                                   | C6                                                                                                                |
| D16 | Order + units + sites derivation, sign-off select and markup, notes, unit columns, location + units                                        | 2 / 3+3 / 2+2 / 3 / 3                                       | no                                                                                   | C5                                                                                                                |
| D17 | Unit one-line description                                                                                                                  | 5 shapes + 3 variants                                       | `unitLine`, `unitDetails`, both bypassed                                             | the fields come in different orders                                                                               |
| D18 | Customer reference check (`findFirst … idInTenant(customer, input.customerId)`) / customer by code, else 404                               | 7 / 4                                                       | no                                                                                   | 5 different "unknown customer" messages                                                                           |
| D19 | Core domains' record remotes: create / update / delete form / `removeX` / bulk body / form skeleton / detail header / new page / edit page | 3 / 3 / 4 (8) / 3 / 7 / 4 / 4 / 4 / 4                       | –                                                                                    | framework glue; abstracting it buys little                                                                        |
| D20 | `ListSql` `customer` column `filter: (codes) => inList(customer.code, codes)` and the equipment joins                                      | 5 / 4                                                       | `withEquipmentJoins` for core only                                                   |                                                                                                                   |
| D21 | Earlier or later of two instants                                                                                                           | 9                                                           | no                                                                                   | energy and docks                                                                                                  |
| D22 | Percent text / percent formatter                                                                                                           | 8 / 2                                                       | no (`format.ts`)                                                                     |                                                                                                                   |
| D23 | Seed: `new Faker({ locale: [nl, en] })` + seed / `clear` / today's midnight; energy's own chunker against `insertAll`                      | 8 / 10 / 5 / 1                                              | `insertAll`                                                                          | dev tooling; low priority                                                                                         |

**Notes (two copies):** docks' and energy's token settings (remote and card), their ingest
prologues (415/413/400) and their `customers.removingSite` voters; the condition and maintenance
daily-job skeletons; the customer select of the form options; the open-orders subquery in the
customers and engineers lists.

**Deliberate, not a finding:** "update + log with before/after" (40 sites). `server/records.ts`
says updates are written out so each names the fields it compares.

---

## 6. Type-safety findings

| ID  | Finding                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **No nominal ids, and real mix-ups.** 802 id annotations are plain `number` or `string`.                       | <ul><li>Energy uses `siteId` for an energy site (`setup.ts:309`, `figures.ts:340,504`) and for a customer site (`setup.ts:294`, `figures.ts:58`) in the same files, and passes `site.siteId` against `site.id` (`setup.ts:485-486`).</li><li>Docks' `doorId` is an equipment id (`docks/server/rules.ts:30-38`); energy's is `energyDoor.id`.</li><li>Equipment ids go by `units`, `unitIds` and `equipmentIds` (`creation.ts:24`, `units.ts:107`, `extensions.ts:35`).</li><li>`shopOrderLine.orderId` is a shop order; every other `orderId` is a core order.</li></ul> Drizzle's `.$type<…>()` on the id columns would brand them at the source and flow through `$inferSelect` and query results. |
| T2  | **Record types are free strings** where a union exists to be had.                                              | `Subject.type` (`log.ts:33`), `coreSubjectTypes: Record<string, …>`, the `watchChanges` type lists, `ActivityCard type`, `getSubjectActivity({ type })`, and `announceChange("energy_reading")`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T3  | **Unions restated by hand.**                                                                                   | <ul><li>`ChecklistKind` ×5</li><li>`InvoiceStatus` ×4 (`creditNoteStates` repeats the same values)</li><li>`InspectionStatus` in condition (also X7)</li><li>`ScoreBand` ×3</li><li>`"up" \| "down"` ×5</li><li>chart `bucket: "hour" \| "day"` ×4</li><li>order-status subsets in 7 module sites (X1)</li></ul>                                                                                                                                                                                                                                                                                                                                                                                      |
| T4  | **Valibot schemas restated as interfaces.**                                                                    | <ul><li>`PlanInput` (maintenance `server/plans.ts:26`)</li><li>`ProgrammeRules` / `Tier` / `CategoryRule` (partner `model.ts:60-77`)</li><li>`LineInput` (materials `server/lines.ts:19`)</li><li>`ConditionInput`, and `ComponentInput`, whose `materialId` is `null` against the schema's `""`</li></ul>                                                                                                                                                                                                                                                                                                                                                                                            |
| T5  | **Row shapes written by hand.** About 45 mirrors against about 15 derived types.                               | <ul><li>checklists' `Point` ×4</li><li>`Checkpoint` in two modules</li><li>"owner" `{ id; code }` ×4 named + 5 inline</li><li>`SessionFacts`, `DoorFigures`, `CreditableLine`, …</li></ul> Client files can't import the server schema, so derive from the query's return type (`Awaited<ReturnType<…>>`, already used 78 times) or export the shape from the module's `model.ts` once.                                                                                                                                                                                                                                                                                                               |
| T6  | **Switches without exhaustiveness** (Cursor rule).                                                             | <ul><li>1 of 16 switches has a `never` check (`docks/model.ts:231`).</li><li>12 have no default, among them `client-status.ts:35` over `OrderStatus`.</li><li>`noImplicitReturns` is off.</li></ul> The 101 `Record<Union, …>` maps already give exhaustiveness.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T7  | **Casts are concentrated, not spread.**                                                                        | <ul><li>14 of the 20 `as unknown as` are in the generic list and table kernel, which is acceptable for a generic kernel, but it is where the types are weakest.</li><li>`findFirst()!` in all 3 settings singletons.</li><li>`idInTenant`'s `number`-only id forces 3 hand-written scopes on string ids.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                    |
| T8  | **Inline imports:** none in type positions. The 2 dynamic imports (`nodemailer`, `$kit-client`) are justified. | –                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## 7. Looked at and fine

- **Gated remote sets** (`server/remote-functions.ts`): one file makes every remote function,
  the gate runs before the handler, and a spec forbids importing `$app/server` elsewhere.
- **Tenant scoping** (`inTenant`, `idInTenant`, `tenantJoin`, composite tenant foreign keys):
  used throughout; the bypasses in X10 are safe correlated conditions, not leaks.
- **Customer scope helpers** (`server/auth/customer.ts`): a small interface over a non-trivial
  rule (orders at a site through their units), with 26 uses.
- **Module boundaries:** no `lib` file imports a module, every module-to-module import goes
  through `api/`, and writes go through services; `boundaries.spec.ts` checks all of it.
- **Extension kernel** (`extensions/define.ts`, `server/extensions.ts`, the generator): typed
  points with one caller each and owner checks. That 21 of the 40 points have one contributor
  follows the documented "added with the first module that needs it" rule.
- **The list plan, server half** (`server/lists/plan.ts`): rows, counts, facets, groups and ids
  are written once for 7 lists; the `ListSql` type catches missing columns.
- **The activity log's write path** (`log.ts`: diff, normalize, `afterCommit` announce): deep.
  The leak in X3 is in how subjects are named, not in recording.
- **Database layer:** two migration streams held to the schema by a spec, the bound-parameter
  limit enforced at runtime, and an index for every foreign key.
- **i18n and formatting:** no stray `Intl` or `toLocaleString` outside `format.ts`; enum labels
  go through `label()`.
- **Schema enums:** 37 `text(…, { enum })` columns reuse the `as const` arrays; no literal enum
  arrays in schemas.
- **Import rules and barrels:** real extensions, file barrels, no folder imports; enforced by a
  spec.
- **Module graph** (`requires` / `enhances`, `effectiveModules`, `changeModules`): one place
  decides, and the generator compares the manifests with runtime values.
- **The core domains' folder layout:** the same slots in all four; the gaps (engineers has no
  `detail/` or `server/`) follow from size, not drift.

---

## 8. Coverage and gaps

**Compared member against member, as asked:**

| Group                                                                          | How                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The four core domains, folder by folder and file by file                       | I read `order.remote.ts`, `order-changes.ts`, `acceptance.ts`, `scheduling.ts`, `field.ts`, `hooks.ts`, half of `customers.remote.ts` and all four detail pages' structure; a sweep produced the slot matrix and the per-file comparison.       |
| The modules against each other and against the extension points                | Every module's manifest, remote sets, `api/`, contributions, seeds, slots and routes, plus all 40 extension points with their contributors (sweep). I checked the manifest and settings drift, `orderTypes` and the settings singletons myself. |
| Lists, activity log and live changes, tenancy: knowledge outside their modules | I read `changes.ts`, `log.ts`, `subjects.ts`, `session.ts`, `customer.ts`, `remote-functions.ts` and the list interface; sweeps traced all 133 log calls, 9 live queries, 7 lists and every bypass of the tenant helpers.                       |
| The three portals                                                              | I read `portal.remote.ts` in full, plus `client.remote.ts`'s outline and the shells' diffs; a sweep compared every record each portal renders and every query.                                                                                  |

**Not covered, or only mapped:**

- `src/service-worker/` (569 lines, a hot spot);
- the seed in depth;
- `themes/`;
- the shadcn UI kit (`components/ui/`, vendored);
- `cloudflare/`, `scripts/` and the generator;
- the tests themselves (their quality and coverage were not assessed; only counts);
- Svelte component internals beyond the patterns above.

**Method limits:**

- The counts come from searches (±a few) and the dependency map from a regex scan, not
  CodeGraph.
- No change-coupling analysis beyond churn.
- No checks or tests were run.
- No issue tracker is configured (`docs/agents/issue-tracker.md` doesn't exist), so
  `refactor`'s "planned and settled work" check was skipped.
- The sweeps ran read-only and wrote no scratch files.

**Not re-litigated:**

- written-out updates (`records.ts`);
- `ChangedElsewhere` on two record types (`database.md`);
- extension points added on demand (`modules.md`);
- core never importing modules.

---

## 9. Recommended first candidate

**C1, the order lifecycle.**

- It holds the most business rules: stock, invoicing, acceptance, the engineer's actions.
- It has the clearest change amplification: 7 writers, 5 rule sites and 7 module subsets.
- It has the worst unknown unknown: `setOrdersStatus` skips the modules on a promise kept only
  by a comment.
- It runs through the hottest files (`order.remote.ts`, `(field)/my/portal.remote.ts`,
  `models.ts`).
- Its dependencies are local-substitutable, so the new interface is testable with what the
  suite already has.

**C2, live changes,** is the cheap companion for the same or a later session: in-process, with
9 call sites that simplify mechanically. It is also where C3's typed subject union would pay
off first.

---

## 10. Since the review

**Done** (merged into `develop`):

- C1, the order lifecycle (`docs/plans/order-lifecycle.md`).
- C2 and C3, live changes and activity subjects (`docs/plans/live-changes-and-subjects.md`).
- D6 (`submitted()`), X7's `orderTypes` (`order-types.spec.ts`), D13 (`#lib/schema.ts`) and F5.
- C4, the engineer portal's scope (`docs/plans/engineer-scope.md`), with the customer portal's two
  bypasses moved onto `ofCustomer()`.

**To consider later:**

- **SvelteKit's own validation errors aren't translated.** A command or query given input its
  schema refuses throws SvelteKit's 400 "Bad Request", in English, and `errorMessage()`
  (`src/lib/utils.ts`) shows it in the toast. The app's pages send valid input, so a user meets it
  only through a bug or a tampered request. A `handleValidationError` in `src/hooks.server.ts`
  returning a translated generic message would fix it; it changes what
  `src/tests/unit/lib/server/harness/harness.spec.ts` expects of a refused argument. Left out of
  the drift fixes (2026-10-19, the user's decision): nothing in them made it reachable.
- **The customer site form's new limits** (contact name 120, access notes 500; D13) were checked
  only against local data (longest 23 and 67). A longer stored value in production would have to
  be shortened before that site can be saved again.
