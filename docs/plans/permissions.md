# Permissions: one way to ask who may read or change a record

Plan of 21 October 2026. Design only: nothing here is built yet. Line numbers are from `develop` at
`eeb84a3e`.

## Why

`getRecordChangedAt` (`src/lib/components/activity/activity.remote.ts:204`) is
`forAnyRole.query.batch`. Any signed-in member of the tenant can ask when any record changed:
field engineers, customers' contacts and the system all can, for any `LoggedType` and any id. That
includes records their role may not see and records of modules the tenant has switched off. It only
answers a timestamp, but the gap is general. The gated sets (`src/lib/server/remote-functions.ts:104-142`)
decide who may _call_ a function. Nothing can answer "may this user read record `{ type, id }`?",
which every record-generic function needs: the change feeds, the activity log and the catch-up
query. Each of those decides it by hand today, or doesn't decide it at all.

## 1. The current model

Access is decided in three layers, and a loosely gated fourth.

**Gates (per call).** The roles are `owner, admin, member, engineer, customer`
(`src/lib/auth/roles.ts:11`), several per member. `isManager` (`:36`), `isFieldEngineer` (`:44`)
and `isCustomerContact` (`:52`) pick the stronger role. The gates are in
`src/lib/server/auth/session.ts`:

- `requireTenant` (`:119`) and `requireMember` (`:133`, which refuses engineers and contacts);
- `requireEngineer` (`:146`) and `requireCustomer` (`:171`), each once per request;
- `requireModule` (`:241`), `requireRole` (`:248`) and `requireManager` (`:257`).

The sets wrap them (`forMembers`, `forManagers`, `forEngineers`, `forCustomers`, `forAnyRole`,
`forUsers`, `forDevelopers`, `forAnyone`, `remote-functions.ts:104-111`), and so does
`moduleRemote(id, role)` (`:129`). The page guard is `handleGuard` (`src/hooks.server.ts:142`),
which works from `shellOf(roles).owns(routeId)` (`src/lib/auth/shells.ts:28-49`). Module pages and
routes have `guardModuleRoute` (`src/lib/modules/route-guard.ts:32`) and the `guarded()` stubs
(`src/lib/server/modules/hooks.ts:30`). None of these knows a record.

**Record scopes (SQL conditions).**

- _Tenant:_ `inTenant`, `idInTenant`, `idsInTenant`, `tenantJoin` and `sameTenant`
  (`session.ts:197-230`), enforced by `hand-written.spec.ts:50-90`.
- _Engineer:_ `engineerOrders()` and `engineerOrder(ref)` (`src/lib/server/auth/engineer.ts:32,38`),
  with the engineer's id read only there (`engineer-scope.spec.ts`).
- _Customer:_ `ofCustomer`, `atSites` and `customerOrders` (`src/lib/server/auth/customer.ts:27,34,45`).
  An order is at a site through its units.
- _Audience policies:_ what each audience sees is declared once each. The work record's
  `audiences` (`src/lib/orders/server/work-record.ts:60-66`) has the scope makers `officeOrder`,
  `officeOrders`, `engineerWork`, `customerWork` and `printedWorkOrder` (`:86-105`). The units'
  `audiences` (`src/lib/equipment/server/units.ts:43-47`) has `officeUnits`, `engineerUnits` and
  `customerUnits` (`:69-84`) and `seenBy` (`:143`).
- _Lists:_ each list has its "rows the current user may see" slot, `ListSql.scope`
  (`src/lib/server/lists/plan.ts:126`), but only the tenant ever goes in it.

**Status and action rules (TS).** These are `orderTransitions`, `can()`, `mayEditOrder`,
`mayDeleteOrder`, `statusChoices` and `fieldActions` (`src/lib/orders/lifecycle.ts:69-174`). They
are enforced by `transitionOrder` and `beginOrderChange` (`src/lib/orders/server/lifecycle.ts:75,176`).
The modules have their own: invoices' `canChange`, `isEditable` and `canCredit`
(`src/modules/invoices/invoice.ts:49-59`, `credit-note.ts:40`), and checklists' `Filler`
(`src/modules/checklists/server/field.ts:45-91`). `canManage()`
(`src/lib/auth/can-manage.ts:11`) only hides controls. `OrderActor` (`lifecycle.ts:44`) names five
actors, but only `engineer` has any effect (`server/lifecycle.ts:85,288`).

**Feeds and the log (the gap).**

- The bus (`src/lib/server/changes.ts:49-108`) is keyed by organization only.
- `watchTenantChanges` (`activity.remote.ts:184`) sends every change of every type, modules' that
  are off included, to every office member.
- `watchFieldChanges` (`src/routes/(field)/my/portal.remote.ts:112`) filters by hand in
  `fieldChanges()` (`src/routes/(field)/my/changes.server.ts:17-46`): own orders, every unit.
- `watchMyWork` (`portal.remote.ts:104`) and `watchPortal` (`src/routes/(customer)/portal/client.remote.ts:235`)
  are tenant-wide timestamps.
- The log's readers (`getActivity`, `countNewActivity`, `getSubjectActivity`, `getRecentActivity`
  and `getActivityFilters`, `activity.remote.ts:72-176`) are `forMembers` plus `inTenant`. Only
  `getSubjectActivity` 404s a module that's off (`:128-132`), by hand, because no function maps a
  subject type to its module.
- Notifications have two audiences, `office` and `engineer` (`src/lib/notifications/extensions.ts:20`).
  The engineer's rules use `engineerActivity()`, which is `json_extract` on `activity.changes`
  (`engineer.ts:61-75`). The tray links an order only if it's still theirs, a fourth hand-written
  check (`src/routes/(field)/notifications.remote.ts:39-44`).
- Hover cards load the record's own batch query (`getOrder`, …), so they're as gated as that query
  (`src/lib/components/record-link/record-link.svelte:50`).

**The subject model.** A subject is `{ type, id, label }` with an optional parent
(`src/lib/server/activity/log.ts:34-40`). There are 15 core types
(`src/lib/activity/subjects.ts:171-317`) and about 30 modules' types (each module's `activity.ts`,
through `module.ts`'s `subjects`). Nothing maps a type to its table or its module. Some types have
no row: `module`, `order_type`, `*_settings`, `simulation`. Parts (`order_line`, `checklist`,
`unitCondition`, `invoice_line`, …) are logged with their parent, and `about(type, id)`
(`activity.remote.ts:37`) matches either.

### Inconsistencies the survey found

1. **One rule, several places.**
   - Which orders an engineer may know of has four versions: `engineerOrders()`,
     `engineerActivity()`, `fieldChanges()` and the tray's link check. They differ in what they
     leak: the tray keeps the user and the changes of an order taken off the engineer, while the
     feed drops them.
   - Whether a contact sees a unit or location is decided twice: `customer.ts` (SQL), and
     `customerSees` in `src/lib/equipment/server/qr.ts:64-110` (written by hand, with an explicit
     organization id). `seesSite` (`customer.ts:38`) has no caller.
   - Who's a manager: `isManager` (`roles.ts:36`) vs `canShareViews`
     (`src/lib/components/data-table/views.ts:20`, the literal `"owner" || "admin"`).
   - "Own or shared" for saved views is written three times (`views.remote.ts:61-70,96-110`,
     `table-memory.remote.ts:79`).
   - Which orders an engineer sees by status is three rules: `getMyWork` (`portal.remote.ts:59,65`),
     `myOpenOrders` (`places.remote.ts:36`) and `getMyOrder` (none).
2. **Gaps.**
   - `getRecordChangedAt`: any role, any type, any id, modules that are off included.
   - The log readers and `watchTenantChanges` include the records of modules that are off.
   - `watchMyWork` and `watchPortal` tell an engineer or a contact when _any_ order of the tenant
     changed.
   - `hand-written.spec.ts:249-270` (units by audience) covers `src/routes/(field|customer)/**` but
     not `src/modules/*/{portal,client}/`.
   - `printedWorkOrder(where, unitsAt)` (`work-record.ts:104`) takes a `where` from its caller, and
     the customer's "done orders only" lives in that caller
     (`src/modules/checklists/client/client-checklists.remote.ts:78-85`).
3. **Rules that exist only as SQL.**
   - Site visibility through units (`customerOrders`) and `engineerActivity`'s JSON.
   - The notification rules, `aboutTheirRecord` included (`src/lib/server/notifications/rules.ts:49`).
   - Maintenance's list scope `paused = false` (`src/modules/maintenance/server/list-sql.ts:68`).
4. **Rules that exist only as TS.** These are `orderTransitions`, `fieldActions`, `canCredit`,
   `seesSite` and `canShareViews`. A list can't ask "the orders I may start".

## 2. Requirements

1. **One question, by subject.** "May the current user read (or change) `{ type, id }`?". The
   subject is what `getRecordChangedAt`, the change feeds, the activity log and `onRecordChange()`
   already speak (`TenantChange`, `src/lib/activity/feed.ts:23`).
2. **Batch-friendly.** Many subjects take one statement per subject type, not per subject, so
   `getRecordChangedAt` (a `query.batch`) and a feed's burst stay a handful of queries. Values go
   through `inList()` (the 100-bind limit).
3. **Tenant-scoped,** always, by the existing helpers.
4. **Module-aware.** A record of a module the tenant lacks is a 404 to a single read, and absent
   from a batch or a feed, exactly as if it didn't exist. One function knows a type's module.
5. **Audience-aware.** The office member, the manager, the field engineer and the customer's contact
   each have their own rule per type, and the system its own. Deny by default: a type with no rule
   for an audience isn't readable by it.
6. **The SQL is the rule.** The answer is a condition on the type's table, so a list's `scope`, a
   join or a correlated subquery can use the same rule that answers `mayRead()`. A TS predicate on
   loaded rows would be a second copy.

## 3. Reuse

The audience scopes that exist become the system's rules. The system adds no copies of them.

| Existing scope                                                                  | Becomes                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `inTenant(table)` (`session.ts:197`)                                            | the office's rule for almost every type                       |
| `engineerOrders()` (`engineer.ts:32`)                                           | `order`'s engineer rule (the id stays read only in that file) |
| `customerOrders(access)` (`customer.ts:45`)                                     | `order`'s customer rule                                       |
| `officeUnits()`/`engineerUnits()`/`customerUnits()` `.units` (`units.ts:69-84`) | `equipment`'s rules                                           |
| the same scopes' `.sites`                                                       | `site`'s rules, and `location`'s (by its site)                |
| `ofCustomer(access, table)` (`customer.ts:27`)                                  | the customer rule of every modules' customer-owned type       |
| `isManager(roles)` (`roles.ts:36`)                                              | the manager rule (`canShareViews` goes)                       |

The direction matters. The registry _calls_ these helpers. Then the scope makers that wrap them
take their `where` from the registry: `officeOrder`, `engineerWork` and `customerWork`
(`work-record.ts:86-99`), the unit scopes, and `fieldChanges()`. After that, one condition decides
both "may this contact read order 12?" and "which orders does `getPortalOrders` list?". The
audience _columns_ (what each audience sees of a row: the two `audiences` tables) stay where they
are. They answer "what of it", and this plan answers "which".

## 4. Two shapes, and libraries

### Shape A: a registry of per-type rules returning SQL

Each subject type declares, per audience, a condition on its table. Core declares its own types.
A module contributes its own through an extension point, the way `notificationRules` works
(`src/lib/notifications/extensions.ts`, `contribute(notificationRules, …)` in a module's
`server/index.ts`). A module that's off contributes nothing, so its types are unknown, and unknown
is not found.

```ts
// core: src/lib/server/access/core.ts
order: rows(order, order.id, {
  office: () => inTenant(order),
  engineer: () => engineerOrders(),
  customer: ({ access }) => customerOrders(access),
}),
checklist: partOf("order", checklist, checklist.orderId),   // in the checklists module
order_type: tenantWide({ office: true }, { change: "manager" }),
```

- _Batching:_ group by type, then run `select id from <table> where inList(id, ids) and <rule>`,
  one statement per type.
- _Lists and joins:_ `visible(type)` hands out the rule itself.
- _Cost:_ small, and shaped like what the codebase already does: `audiences` tables, branded
  scopes, and SQL helpers named by what they pick.

### Shape B: a capability object per request

At the gate, build `ability = abilityFor(viewer)` from rules such as
`can("read", "order", { engineerId: me })`, and ask `ability.can("read", subject)`. This is
CASL's model.

- _Pros:_ one object to pass around. It can be serialized to the client
  (`packRules`) to drive `canManage()`-style UI.
- _Cons:_
  - Its checks run on _loaded_ objects. `can("read", order12)` needs order 12's row, and for a
    site-limited contact its units' sites, so a batch of 40 subjects of 6 types needs those rows
    fetched first, by queries that are themselves the scopes.
  - Turning its conditions into SQL needs an interpreter from its Mongo-style conditions to drizzle.
  - The conditions can't say `exists (order_unit ⋈ equipment where site in …)` without inventing
    relation syntax.

  So B means the rules exist twice (conditions and the scopes), which is what requirement 6
  forbids.

### Shape C, rejected early: denormalized audience on the log

`recordActivity` would stamp each entry with its record's `customerId` and `engineerId`, and the
feeds and log would filter on the entry. Notifications half-do this already (`engineerActivity()`
reads `changes.engineerId`). It goes stale on every reassignment and says nothing about the record
itself, so `getRecordChangedAt` and record reads would still need A. It stays a possible
_optimization_ for the log, later.

### Libraries

| Library                | Fit with SQL-level scoping on drizzle/SQLite, on Workers                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CASL (`@casl/ability`) | No drizzle adapter. `rulesToAST` plus a hand-written `toDrizzleWhere` is the documented route (a course lesson, not a package). `@ucast/sql` is `1.0.0-alpha`, and has no drizzle target and no `exists` over a join. The rules would be a second copy of `engineerOrders()`/`customerOrders()`.                      |
| Cerbos                 | `@cerbos/orm-drizzle` turns a query plan into drizzle SQL, `exists` included, which is the right idea. But it needs a policy decision point: a sidecar (none on Workers or a Durable Object), or `@cerbos/embedded` with bundles from Cerbos Hub. The policies are YAML, a second language, and a copy of the scopes. |
| Casbin                 | Stores policies; drizzle-adapter loads them from the database. No query filtering.                                                                                                                                                                                                                                    |
| Oso, OpenFGA, SpiceDB  | Hosted or separate services, with relationship data synced out of our database. Out of proportion for four audiences.                                                                                                                                                                                                 |

None fits. The rules _are_ SQL relations already (an order is the engineer's by `engineerId`, a
contact's by its units' sites), and drizzle is the "utility" that expresses them. A library would
add a DSL and a translation layer between our scopes and our database.

### Recommendation

**Shape A.** It takes one piece of B: the viewer is resolved once per request, from the gate that
admitted it. The result is a small home-grown module (~200 lines) on drizzle, built from the
scopes that exist. No library fits.

## 5. Interface

New folder `src/lib/server/access/`, server-only, exported through `#lib/server/access/index.ts`.

### The viewer

```ts
/** Who is asking, as the gate that admitted the request saw them. */
export type Viewer =
	| { audience: "office"; manager: boolean }
	| { audience: "engineer" } // the id stays in auth/engineer.ts
	| { audience: "customer"; access: CustomerAccess }
	| { audience: "system" };

export const viewer: () => Promise<Viewer>; // perRequest()
```

The gate names the audience. `remoteSet(gate, audience)` gives:

| Set                         | Audience                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `forMembers`, `forManagers` | `office` (`manager` from `isManager(roles)`)                                |
| `forEngineers`              | `engineer`                                                                  |
| `forCustomers`              | `customer`                                                                  |
| `moduleRemote(id, role)`    | its role's audience                                                         |
| `forAnyRole`                | `shellOf(roles).name`, since the stronger role wins, as the page guard does |
| `asSystem`                  | `system`                                                                    |

An office member linked to an engineer, calling a `forEngineers` function on `/my`, is the engineer
audience there. On `getRecordChangedAt` (`forAnyRole`) they're office, which reads more, and they're
entitled to it.

### The rules

```ts
/** A subject type's rules: which of its records each audience may read, and change. */
interface AccessRule {
	/** The records `viewer` may read, as a condition on the type's table; `undefined`: none. */
	read(viewer: Viewer): Promise<Condition | undefined>;
	/** The same for a change; defaults to `read` for the office, to none for the portals. */
	change?(viewer: Viewer): Promise<Condition | undefined>;
	/** How a batch of ids is checked against a condition (see below). */
	check: (ids: string[], where: Condition) => Promise<Set<string>>;
}

type Condition = SQL | "all"; // "all": every record of the tenant, no query needed
```

There are three makers, so no entry is written by hand:

- **`rows(table, idColumn, byAudience, options?)`** is a type with a row of its own (`order`,
  `customer`, `equipment`, `site`, `location`, `engineer`, `invoice`, `contract`, …). It checks
  with `select id where inList(idColumn, ids) and <condition> and inTenant(table)`. An office
  rule of `() => inTenant(table)` becomes `"all"`, so the office's feed costs no query.
- **`partOf(parentType, table, parentColumn)`** is a part: its rule is its parent's, through
  `exists`. This covers `order_line`, `checklist`, `invoice_line`, `credit_note_line`,
  `unitCondition` and `component`.
- **`tenantWide(byAudience, options?)`** is a type without a row (`module`, `order_type`,
  `*_settings`, `simulation`, `integration_token`). The answer is the audience's yes or no, and
  `{ change: "manager" }` for the settings.

Core's entries live in `src/lib/server/access/core.ts`. A module's go in
`src/modules/<id>/server/access.ts` and are contributed in its `server/index.ts`:
`contribute(accessRules, () => checklistAccess)`, a collector declared in
`src/lib/server/access/extensions.ts`. `collectNow(accessRules, …, tenant.modules)` asks only the
modules that are on (`src/lib/server/extensions.ts:152-267`). So "a record of an off module is a
404" needs no type-to-module map: the type has no rule.

### The questions

```ts
/** Whether the viewer may read the record (and the tenant has its module). */
mayRead(subject: Subject): Promise<boolean>;
/** The same, or the 404 with core's message (`m.common_error_not_found()`). */
readOrNotFound(subject: Subject): Promise<void>;
/** Of `subjects`, those the viewer may read, as `type/id` keys: one statement per type. */
readable(subjects: readonly Subject[]): Promise<Set<string>>;
/** The viewer's condition on the type's table, for a list's `scope`, a join or a subquery. */
visible(type: LoggedType, for?: "read" | "change"): Promise<SQL | undefined>;
/** Change: the same three (`mayChange`, `changeOrNotFound`, `changeable`). */
```

Status rules stay in `lifecycle.ts`. `mayChange("order", 12)` says the record is yours to touch;
`can("start", status)` says the move is allowed now. `findEngineerOrder()`
(`src/lib/orders/server/field.ts:13`) composes both: `visible("order", "change")` plus
`fieldActions`.

### How the consumers use it

- **`getRecordChangedAt`** stays `forAnyRole.query.batch`. The batch resolver becomes
  `const ok = await readable(subjects)`, and the per-item answer is
  `ok.has(key(s)) ? recordChangedAt(…) : 0`. An unreadable record answers 0, like a record that
  never changed, so the answer reveals nothing.
- **The change feeds** become one presenter, `feedFor(viewer)`, in `src/lib/server/live.ts`:
  `readable(batch)` filters a burst, and an audience table says what each audience hears of a
  change:

  ```ts
  const hears = {
  	office: { name: true, action: "full" },
  	engineer: { name: false, action: "gone" },
  	customer: { name: false, action: "gone" },
  };
  ```

  This is the same pattern as the work record's `audiences`.
  - `watchTenantChanges` stops sending the records of modules that are off.
  - `fieldChanges()` (`changes.server.ts`) is deleted. Its rule (own orders, every unit) is now
    `order`'s and `equipment`'s engineer rules.
  - `watchFieldChanges` becomes `liveFeed(types, feedFor)`, and the customer portal can get the
    same feed. That retires the tenant-wide `watchPortal` and `watchMyWork` timestamps (portal
    pages switch to `refreshOnRecordChange()`).
  - **`watchSchedule`**'s move can then go ahead: the board subscribes to its types on the office
    feed (`onAnyChange` filtered by `boardTypes`, or a new `onTypeChange(types)`), trusting the feed
    to send only what the viewer may read. That is why it waited.

- **`getSubjectActivity`**: `await readOrNotFound({ type, id })` replaces the hand-written module
  check (`activity.remote.ts:128-132`). The log's list readers (`getActivity`, `getRecentActivity`,
  `countNewActivity`, `getActivityFilters`) drop the entries whose type has no rule for the viewer
  (modules that are off). The office keeps entries of deleted records: their types' office rule is
  `"all"`.
- **Previews and hover cards** keep loading the record's own batch query (`getOrder`,
  `getCustomer`, …). Those queries build their `where` from `visible(type)`, so a card and a page
  agree. No preview gate of its own.
- **Notifications:** the engineer tray's link check (`notifications.remote.ts:39-44`) becomes
  `readable()`. The rules stay SQL on `activity`; `aboutTheirOrder` (`engineer.ts:73`) uses
  `visible("order")` in its `exists`.
- **The QR code:** `customerSees` (`qr.ts:64-110`) becomes `mayRead()` for the code's
  unit or location, with the code's tenant's viewer (the scan may come before it's their current
  tenant, so this is the one caller that builds a viewer for another tenant: `viewerIn(organizationId)`).

## 6. Enforcement

**The gated sets stay.** They answer a different and cheaper question before any query: may this
person call this function at all (role, shell, module). They gain one parameter, the audience they
admit, which `viewer()` reads. No set is folded into the registry, and none is added.
`forAnyRole` becomes acceptable for record-generic functions _because_ they ask the registry.

**The guard spec**, `src/tests/unit/lib/server/access.spec.ts`:

1. _Every logged type has a rule._ `everyLoggedType()` (core plus every module's `subjects`) equals
   the union of core's entries and every module's `accessRules`. A module's rules cover only its own
   types.
2. _Record-generic code asks the registry._ A file that imports `recordChangedAt`, `liveFeed`,
   `watchEvery` or the `activity` table, or whose remote functions take a `v.picklist(loggedTypes)`
   input, also imports `#lib/server/access`. There's an allow-list for the infrastructure (`log.ts`,
   `changes.ts`, `live.ts`, `feed.ts`'s `present`, `notifications/`).
3. _No hand-written module check._ `subjectTypes(allModules)` or `in subjectTypes(` in a
   `*.remote.ts` is refused.
4. _Portals never scope by tenant alone._ In engineer- and customer-gated files (`src/routes/(field)/**`,
   `src/routes/(customer)/**`, `src/modules/*/{portal,client}/**`), `inTenant(` and `idInTenant(`
   on a table that has a rule are refused. They read through `visible()` or the audience scopes.
   This generalizes `engineer-scope.spec.ts` from `order` to every type, and closes the units
   spec's gap for modules' portal files.
5. _No second contact lookup._ `.from(portalContact)` outside `src/lib/server/auth/` and
   `portal-access` is refused (it catches `customerSees`).
6. _Managers by one function._ A literal `"owner"`/`"admin"` comparison outside `roles.ts` and
   `members.ts` is refused (it catches `canShareViews`).

**A behaviour spec**, `src/tests/unit/lib/server/access/matrix.spec.ts`, runs on the seeded
database. For each type with a rule, and each audience, it checks:

- North's record is readable by North's audiences per the rule;
- South's id is not readable;
- another engineer's order and another customer's order are not readable;
- a site-limited contact sees only their sites' records;
- a type of a module that's off is not readable.

It also covers `getRecordChangedAt` asked by an engineer and by a contact (the gap that started
this).

**The kit's entry**, under "Permissions" in `docs/agents/kit.md`:

> **Who may read or change a record** is `#lib/server/access`. Ask with:
>
> - `await mayRead(subject)`, or `await readOrNotFound(subject)` for its 404;
> - `await readable(subjects)` for a batch;
> - `await visible(type)` for the viewer's condition on its table: a list's `scope`, a join;
> - `mayChange` and friends for a change.
>
> Each subject type's rule per audience is one entry: core's in `src/lib/server/access/core.ts`, a
> module's in its `server/access.ts` (`contribute(accessRules, …)`). An entry is made with `rows()`,
> `partOf()` or `tenantWide()` from the audience scopes (`engineerOrders()`, `customerOrders()`,
> `customerUnits()`, …). A function that takes a subject, reads the log or feeds changes asks it;
> `access.spec.ts` refuses one that doesn't. The gated sets still decide who may _call_ a function;
> this decides which _records_ they reach.

`tenancy.md` gets a pointer to the same paragraph, and `AGENTS.md`'s Tenancy section one line.

## 7. Migration

Each step is one session on its own branch. Steps 3 to 6 can run in parallel once 1 and 2 are
merged (they touch different files).

**1. The module and core's rules.** Every type gets a rule, and step 7's guards start in warn mode.

- New: `src/lib/server/access/{index,viewer,rules,core,extensions}.ts`. `viewer()` comes from the
  admitted audience; `rows`, `partOf` and `tenantWide`, with `"all"` short-circuiting; `mayRead`,
  `readOrNotFound`, `readable` and `visible`.
- `src/lib/server/remote-functions.ts`: `remoteSet(gate, audience)` records the audience for the
  request (a `locals` field, like `perRequest`). `src/lib/server/auth/system.ts`: the system's
  audience.
- New: `src/tests/unit/lib/server/access.spec.ts`, rule 1 only, with core's types, and
  `access/matrix.spec.ts` for core's types.
- Done when every core type has a rule and the matrix passes.

**2. The modules' rules.** For each of the 10 modules with `subjects`: a new
`src/modules/<id>/server/access.ts`, contributed in `server/index.ts`, plus its rows in the matrix.
Rule 1 then covers modules too. Possibly one session per two or three modules: checklists,
condition and materials (parts of orders and units); invoices and contracts; energy, docks,
parts-shop, partner-programme and maintenance.

**3. `getRecordChangedAt` and the log.**

- `src/lib/components/activity/activity.remote.ts`: `getRecordChangedAt` through `readable()`;
  `getSubjectActivity` through `readOrNotFound()` (the module check goes); the list readers skip
  types without a rule.
- `src/tests/unit/lib/components/activity/server/activity.spec.ts`: an engineer asks for another's
  order, a contact for an office-only record, anyone for a module that's off; all answer 0.
- Guard rules 2 and 3 switch on.

**4. One feed presenter.**

- `src/lib/server/live.ts`: `feedFor(viewer)` and the `hears` table.
- `activity.remote.ts` (`watchTenantChanges`) and `src/routes/(field)/my/portal.remote.ts`
  (`watchFieldChanges`); delete `src/routes/(field)/my/changes.server.ts`.
- Tests: `src/tests/unit/routes/(field)/my/portal.spec.ts`, `src/tests/unit/lib/server/live.spec.ts`.
- Then, as its own session: `watchSchedule` onto the office feed
  (`src/modules/schedule/schedule.remote.ts`, `board/schedule-board.svelte`,
  `calendar/month-view.svelte`), with `onTypeChange()` in
  `src/lib/components/activity/change-feed.svelte.ts` if the owner wants it.

**5. Portals' reads through the registry.**

- `src/lib/orders/server/work-record.ts`: the scope makers take `visible("order")`;
  `printedWorkOrder` takes a viewer instead of a `where`, so the customer's done-only rule moves
  into the `order` rule or a named scope.
- `src/lib/equipment/server/units.ts`: `customerUnits` and the other unit scopes from the
  `equipment` and `site` rules.
- `src/lib/equipment/server/qr.ts`: `customerSees` goes, replaced by `mayRead`, with
  `viewerIn(organizationId)`.
- `src/routes/(field)/notifications.remote.ts`: the link check goes, replaced by `readable`.
- `engineer.ts`'s `engineerActivity()`: its `exists` from `visible("order")`.
- Decision 2: the engineer's `site` rule, and `units.ts`'s engineer audience reading `onSite` only
  at those sites (`audience-reads.spec.ts` and `src/tests/unit/routes/(field)/my/portal.spec.ts`
  cover it). Decision 7: the named status sets for the engineer's lists.
- Guard rules 4 and 5 switch on. This is the session most likely to find a portal query that
  disagrees with its rule. Stop and ask the owner then, don't pick.

**6. Change rules and the manager.**

- `findEngineerOrder()` on `visible("order", "change")`.
- Saved views' "own or shared" as the `saved_view` rule (`src/lib/components/data-table/views.remote.ts`,
  `table-memory.remote.ts`); `canShareViews` (`views.ts:20`) goes, in favour of `isManager`.
- `tenantWide(…, { change: "manager" })` for the settings types.
- Guard rule 6 switches on.

**7. Docs and the portal feed.**

- `docs/agents/kit.md` (the entry above), `tenancy.md`, `AGENTS.md`.
- The customer portal's feed (decision 6): `watchPortalChanges` (`forCustomers`,
  `liveFeed(types, feedFor)`) in `client.remote.ts`, `provideChangeFeed` in
  `src/routes/(customer)/+layout.svelte`, and its four pages (`portal/+page.svelte`,
  `orders/+page.svelte`, `orders/[number]/+page.svelte`, `equipment/[serial]/+page.svelte`) on
  `refreshOnRecordChange()`. `watchPortal` goes. The engineer portal's `watchMyWork`
  (`my/+page.svelte`, `my/[number]/+page.svelte`, `notification-bell.svelte`) moves the same way.
  Small once step 4 is in: the rules and the presenter exist.

## Decisions

The owner's answers of 21 October 2026. Decisions 2, 5 and 7 were recommended in the plan and then
agreed by the owner.

1. **A hybrid user's audience is the gate's.** A `forEngineers` call is the engineer's, even for an
   office member. On `forAnyRole`, the stronger role decides (`shellOf(roles)`).
2. **Engineers keep reading every unit and location, but a site's on-site details only at their own
   orders' sites.**
   - _For tenant-wide (today's):_ the QR code is the product. An engineer on site scans the
     neighbouring door that's also broken, or a colleague's unit, and needs its page and history.
     Narrowing the units would 404 those scans. The engineers are the tenant's own staff, and a
     unit's name, serial and owner aren't sensitive.
   - _For narrowing:_ least privilege, and engineers may be subcontractors. The real exposure isn't
     the units but the site's `onSite` columns (`src/lib/customers/server/site-columns.ts:21-34`):
     contact names, phone numbers and email, and `accessNotes`, which is where key-safe and alarm
     codes end up. Today any engineer can read those for every site by typing serials into
     `/my/equipment/[serial]`.
   - _So:_
     - `equipment` and `location` stay tenant-wide for engineers, and `customer` too (the owner's
       name, as a unit's page shows it).
     - The engineer's `site` rule becomes "a site of one of their orders": a site with a unit on
       one of their orders, or the customer's only site for an order without units. These are the
       sites the work record finds (`work-record.ts`, "Sites").
     - The units' engineer audience (`units.ts:45`) reads `onSite` columns where the site passes
       that rule, and `address` elsewhere, per row, by a `case when` on the rule. This is the one
       place a row rule picks columns. `UnitOf<"engineer">`'s site then has the on-site keys as
       optional.

     Step 5 builds it.
3. **Entries of an off module disappear from every screen and stay in the database.** The log's
   readers filter them out (step 3), and nothing deletes them: switching the module back on shows
   them again.
4. **`member`, `invitation`, `portal_contact` and `integration_token` are for managers.** Their
   office read rule is `manager` (step 1), so the log, the feed and the filters hide them from other
   office members.
5. **An unreadable record answers 0, and the batch is not refused.**
   - The batch is `query.batch`, gathered from every component on the page that follows a record.
     One subject failing the check would fail the catch-up of all the others.
   - That happens in normal use, not only under tampering: an engineer is taken off an order while
     its page is open, or a record is deleted or its module switched off.
   - 0 already means "not changed since the server started", so it tells the asker nothing: no
     probing whether an id exists.
   - The page's own query is gated again on its next refresh and gives the 404 with the right
     message, which is where a refusal belongs.
6. **The customer portal gets a feed,** in step 7. It's small: one live query, the layout and four
   pages, all on parts steps 1 and 4 build.
7. **The engineer's `order` rule stays "assigned to me", in any status. The views name their status
   sets.**
   - Reading is the record question, and an engineer has a reason to open their order in every
     status:
     - a quote just planned for them;
     - work in progress;
     - a done order of the last ten (`getMyWork`);
     - a cancelled one their bell just told them about (`orders.cancelled`).
   - An order awaiting acceptance has no engineer, so it never matches.
   - A status condition in the rule would make those pages 404 and drop their feed entries.
   - What _changes_ with the status is the field work: `fieldActions` already decides that, and
     `findEngineerOrder()` composes the two (step 6).
   - The three lists' filters are views, not permissions. They get named sets beside the others in
     `src/lib/models.ts`, e.g. `engineerWorkStatuses` for `getMyWork` and `openOrderStatuses`, which
     `myOpenOrders` already uses. Then the difference between "today's work" and "open orders at
     this place" is visible and deliberate. It's a small change, in step 5's session
     (`portal.remote.ts:59,65`, `places.remote.ts:36`).

## Progress

Status of 21 October 2026. Steps 1 to 7 are built on the branch `permissions-access-registry`
(from `permissions-design`). Steps 1 and 2 were reviewed and the review's findings fixed; steps 3 to 7
were built by parallel sessions and merged, then reviewed, and that review's findings were fixed on
`access-review-fixes-3-7` (decision 24). None of it has run in e2e yet. The log's readers,
`getRecordChangedAt`, the feeds, the portals' work-record and unit scopes, the QR codes, the tray and
the saved views ask the registry.

**Built**

- `src/lib/server/access/`: `viewer.ts` (the audience a gate admits, `admitAs()`/`viewer()`),
  `rules.ts` (the makers `rows`, `partOf`, `tenantWide`), `core.ts` (the 15 core types), `index.ts`
  (`mayRead`, `readOrNotFound`, `readable`, `mayChange`, `changeOrNotFound`, `changeable`, `visible`).
- `remoteSet(gate, admits)`: every gated set names its audience (`forAnyRole`, `forUsers`,
  `forDevelopers` and `forAnyone` say `"by-role"`: the stronger role decides).
- `src/lib/access/extensions.ts`: the `access.rules` collector. Every module with `subjects` contributes
  its rules from `server/access.ts` (all 10 do).
- Guard `src/tests/unit/lib/server/access.spec.ts` (rule 1 of section 6, core and every module);
  `access/matrix.spec.ts` for the core; one `tests/unit/server/access.spec.ts` per module; shared
  helpers in `src/tests/unit/lib/server/access/support.ts`.

- Step 3: `getRecordChangedAt` answers 0 for what the viewer may not read (the batch is not refused);
  `getSubjectActivity` asks `readable()` (decision 13); the log's list readers keep only `readableTypes()` (new in
  `index.ts`: the type names the viewer's audience has a read rule for, modules that are off and the
  manager-only types for non-managers left out). Guard rules 2 and 3 are on in `access.spec.ts`, with an
  `infrastructure` allow-list that gives a reason per file.
- Step 5 (the portals): the work record's and the units' scopes take their conditions from the
  registry (`visible()`), the engineer's `site` rule is narrowed to the sites of their orders
  (`engineerSites()`), a scanned code's reach for a contact is answered by the `location` and
  `equipment` rules, the tray's order links and the engineer's order activity read through the
  registry, and guard rules 4 and 5 (no tenant-only scoping in portal files, one contact lookup)
  are on in `access.spec.ts`.
- Step 6 (the hand-written checks): `saved_view`'s own-or-shared rule answers who sees and changes
  a view (`canShareViews` is gone), the members page's invitations read through the `invitation`
  rule, `findEngineerOrder()` is built on the `order` change rule, and guard rule 6 (no literal
  `owner`/`admin` comparison outside the files that own roles) is on.
- Step 4: `feedFor(viewer)` and the `hears` table in `src/lib/server/live.ts` present each shell's feed
  (`readable()` filters a burst; the office hears the name and the full action, an engineer or customer
  neither). `watchTenantChanges` and `watchFieldChanges` use it; `src/routes/(field)/my/changes.server.ts`
  is deleted. `watchSchedule` is untouched.

**Decisions made while building** (beyond the owner's answers above)

1. **The point is declared in `src/lib/access/extensions.ts`**, not `src/lib/server/access/`: the
   generator only scans `src/lib/<domain>/extensions.ts`.
2. **Modules import the makers from `#lib/server/access/rules.ts`**, not the barrel: the barrel pulls
   in the extension kernel, which imports the modules, a cycle.
3. **`AccessRule.read`/`change` take the registry's lookup as a second argument**, so a part can ask its
   parent's rule without a global. `change` is required (the makers fill it), not optional.
4. **`readable()`/`changeable()` and `"all"`.** `readable()` answers an `"all"` rule without a query, for a
   feed's or the log's own-tenant subjects (its comment says so); `mayRead()`, `mayChange()` and
   `changeable()` always check the record against its table, so another tenant's id is never readable.
5. **`partOf(parentType, table, parentColumn, narrowedBy?)`**: a part may be narrowed by an audience's
   own condition on the part.
6. **Ids are plain integers** for an integer id column (`/^[1-9]\d{0,14}$/`); `"1e3"`, `" 12"` and the
   like are not ids.
7. **The system audience reads and changes everything of its tenant** unless an entry says otherwise.
8. **`saved_view`'s own-or-shared rule is in step 1**, not step 6 (it was needed for every type to have a
   rule): the office reads its own and shared views; it changes its own, and a manager the shared ones.
   Step 6 made `views.remote.ts` ask it, in place of its three hand-written copies.
9. **`order_line` is the office's only.** Its activity subject id is the material's, not the line's, so
   an engineer rule "lines on my orders" would open that material's line on every order. Engineers see
   their lines through the order. (Review finding A1.) Fixing it properly would mean logging the line
   under its own id, which the log's readers and `about()` would then have to follow.
10. **Four rules narrower than the plan's "a part follows its parent", kept on the owner's word:**
    - an engineer reads only their own `engineer` record (`engineerSelf()` in `auth/engineer.ts`);
    - a customer's contact reads an order's checklists once completed (drafts are the office's);
    - an engineer reads a unit's conditions and components only for units on their own orders;
    - a customer's contact reads only the current year's `partner_programme_year` row.

    Each matches what its portal reads today, so none widens access.

11. **Today's portal behaviour kept where a rule could have been wider or narrower** (from the module
    sessions): parts-shop orders ignore a contact's site limits (`ofCustomer` only); customers read
    energy thresholds through the zone and site (the portal's figures include them); a customer may
    change their own partner bonus year while the choice is unmade. Invoices, credit notes, contracts,
    docks, maintenance and the energy consumers and alerts are the office's only.
12. **Engineers read every `customer`** (decision 2 above: the owner's name on a unit's page).
13. **Step 3's answers for other tenants and deleted records.** `getSubjectActivity` asks `readable()`,
    which trusts a rule that reads the type whole (`"all"`, the office's), so a deleted record's history
    stays and another tenant's id answers an empty list (the activity query is the tenant's), as before.
    A type that is unknown, of a module that is off, or not the viewer's to read is a 404.
    `getRecordChangedAt` is keyed by the tenant, so another tenant's id answers 0.
14. **Step 4: a change that leaves an engineer's scope is dropped from their feed** (an order taken off
    them is no longer `readable()`); the open page gets its 404 on the next refresh, and the bell's tray
    still keeps the entry. **The deletion of an order is not announced to an engineer or a contact**, because a
    deleted row can't be checked against their order condition; the office still hears it. **The
    deletion of a unit is announced to an engineer** (step 5 made their `equipment` rule `"all"`, which
    `readable()` trusts without a query: `(field)/my/portal.spec.ts` fixes it); a contact's, whose
    `equipment` rule has a condition, is not.
15. **Step 4: a change announced for its type only (no id) goes to the office alone**, and only if the
    viewer can read the type at all (`visible(type)`).
16. **Step 4: revoked access is told once (decision 14's exception).** When a change takes a record
    off someone who knew it (today: an order off its engineer), that person's feed gets one
    `access_revoked` change (`ACCESS_REVOKED`): the type and id, no name of who did it, so it reveals
    nothing they didn't know. No one else hears it (the office hears the change as usual), and after
    it the record is unreadable, so the open page's next refresh is a 404 and later changes are
    dropped. `recordActivity` derives it from the entry's before side (`changes.engineerId`) and
    carries it on the in-memory bus event (`Change.revokedFrom`, `{ audience, id }`); the bus keeps
    it when a later change to the record replaces the pending one in a batch, so a burst can't lose
    it. Another audience's revocation (a contact's site, step 5's narrowing) adds an `audience` there;
    a customer who loses sight of a unit is deliberately not told yet. An engineer who was offline
    (or whose feed was reconnecting) misses the notice, and the catch-up answers 0 for the order they
    lost: so a page that followed a record through an earlier stream looks again when the catch-up
    after a reconnect answers 0 (`ChangeFeed`), and its query says 404; a first load needs no look.

17. **The team is the managers' to see, everywhere.** `getMembers` (the members page) is `forManagers`,
    and the settings page shows its team card to managers only (its list reads through `visible("member")`,
    so none for the others). Decision 4 stands as it was: `member`, `invitation`, `portal_contact` and
    `integration_token` are manager-only, in the log, the feed and the pages. (A planner used to see the
    team read-only; the owner chose to take that away.)
18. **A contact limited to some sites reads a checklist only for a unit at those sites** (it is of an order
    and of one of its units; the order is visible by any one of its units). The `checklist` rule narrows
    the part by the unit's site, as the portal's own query does (decision 10's second item).
19. **Customer-level records aren't site-limited.** Shop orders, the partner account, the bonus years and
    the wallet are the customer's, not a site's: a site-limited contact reads all of their customer's
    (decision 11 stands, now as a rule, not an open point; written in `docs/agents/tenancy.md`). Narrowing
    shop orders to those the contact placed (`placedBy`) is expressible with `narrowedBy` if it's wanted.
20. **`order_line` stays the office's only (decision 9), and the screen is unaffected.** The engineer's
    materials card reads its lines through the order's scope (`findEngineerOrder`), not the registry, and a
    line's change is also announced as an update of its order, so the page stays live. The log subject's
    key is the real issue (the material's id, while the line's identity is the pair order and material):
    when engineers get a log, re-key the subject to a composite id; the registry shouldn't judge parts by a
    parent the feed doesn't carry.

21. **Step 7: both portals' pages are on their shell's feed.** `watchPortal` and `watchMyWork` are gone.
    `watchPortalChanges` (`forCustomers`, `liveFeed(["order", "customer", "site", "equipment",
"location"], feedFor())`) is the customer portal's, opened in `(customer)/+layout.svelte`; the
    engineer's `watchFieldChanges` now carries `order`, `customer`, `site` and `equipment` (it had the
    first and last). Record pages follow their record with `refreshOnRecordChange()` (the order
    page: the order and its customer; the customer portal's order and unit pages: the order or
    unit). What isn't keyed by an id on the page (a list, a bell, the units and sites an order
    shows, a unit's orders) uses the type-level subscription: `refreshOnActivity(refresh, { types })`
    (`live-activity.svelte.ts` gained the `types` option and takes `{ delay, types }`), one refresh
    for a burst. The engineer's list and bell refresh on any change they hear, `ACCESS_REVOKED`
    included, so an order taken from them leaves their list at once.
22. **The engineer's order page** refreshes on its order through `refreshOnRecordChange()`, which skips
    `ACCESS_REVOKED`, and on any `equipment`/`site` change through `onAnyChange()`, which stops once
    the notice has come (`revoked`), so nothing refreshes it into a 404 before the notice's toast and
    `goto("/my")`.
23. **Known loss against the old timestamps:** the deletion of an order is not told to an engineer or a
    contact (decision 14), so a list or bell learns of it at the next change they hear, not at once.
    Before, any change of the type refreshed them.

24. **The review's fixes (steps 3 to 7), the choices that aren't obvious.**
    - The engineer's `engineerSites()` writes the tenant and the engineer in as constants
      (`literal()`), not bound: `siteColumnsWhere()` repeats it behind ten columns, which bound came to
      96 values in a unit's read (a Durable Object takes 100) and now 26. The meaning is the same; a
      spec (`bind-counts.spec.ts`) keeps the margin.
    - `readableTypes()` keeps counting a type with a conditional rule (`saved_view`) as readable: only
      shared views are ever logged, so none of its entries names a private view, and dropping the type
      would hide the shared views' entries from the office.
    - The log's user filter lists only users with an entry the viewer reads (`ofReadableTypes()`).
    - A revocation is merged onto a later change only on a per-record watch (`watchEvery`).
    - `feedFor()` recognises the person of a revocation by audience (`isThem()`, exhaustive).
    - The portals' order lists read through `visibleOrNone("order")`; `orderNamed(ref)` is the one
      condition for an order named by id or number.
    - Guards: the files that read `live()` for a timestamp or a count are on the `infrastructure` list
      with a reason (they name no record); rule 4's `tenantOnly` allows a number of occurrences per
      file; `code()` strips comments with a scanner that leaves strings alone.
    - Left to the owner and unchanged: the status lists `engineerWorkStatuses` and `plannedStatuses`
      (`src/modules/condition/server/status-sql.ts`) are two lists; five specs mock the registry barrel
      by hand.

**Open / for the steps to come**

- Guard rules 1 to 6 are all on in `access.spec.ts`. A few files are on its allow-lists (`infrastructure`,
  `tenantOnly`, `roleOwners`) with a reason each: read the reason when touching one.
- The settings page's team card lists customers' contacts to managers (`getOrganizationSettings` has no
  `isCustomerRole` filter, unlike `getMembers`): to settle.

## Later: an engineer asks for a site's on-site details

An idea of the owner's, to explore deeper later; not part of the migration. After decision 2, an
engineer looking at a unit at a site that isn't one of their orders' sees only the site's address.
In its place they'd get a button, "Ask for access". A request goes to whoever decides, who accepts
or denies it, and an accepted one shows the engineer the on-site details.

What the registry already makes easy, and what it would still take:

- **The read side is small.** A grant is a row (`site_access_grant`: the engineer, the site, who
  decided, when it lapses). The engineer's `site` rule gains `or exists (a live grant)`, and every
  reader follows: the unit pages, the feed and `readable()`. No page checks it by hand.
- **The request and the decision are the work.** A request is a record with its own lifecycle
  (asked, accepted, denied, lapsed), logged with the site as its parent. Accepting and denying are
  commands, and the engineer hears the answer on their feed and bell.
- **Who decides is the open part.**
  - _A planner:_ the office's bell already has rules, so it's one rule more.
  - _The customer's contact:_ the customer portal has no notifications yet
    (`NotificationAudience` is `office | engineer`, `src/lib/notifications/extensions.ts:20`), so
    it needs a customer bell first. A contact limited to some sites decides only for theirs.
- **Questions to settle then:**
  - How long a grant lasts (a day, the visit, until revoked).
  - Whether a grant opens every on-site column or only some (the contact, but not the access
    notes).
  - Whether an urgent breakdown skips the request (e.g. the planner assigns the engineer an order
    there, which grants access through the existing rule anyway).

The last point suggests the cheap version: a planner who wants an engineer at a site gives them an
order there. The request button pays off when engineers act on their own on site (a scan of a unit
next to theirs), which is worth confirming before building it.
