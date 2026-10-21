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
- If the owner wants it: the customer portal's feed (`provideChangeFeed` in
  `src/routes/(customer)/+layout.svelte`). It retires `watchPortal` and `watchMyWork` and moves
  their pages to `refreshOnRecordChange()`.

## Open questions for the owner

1. **The audience of a hybrid user.** The plan takes the gate's audience (a `forEngineers` call is
   the engineer's, even for an office member), and for `forAnyRole` the stronger role. Agreed?
2. **What engineers may read beyond their orders.** Today every unit, location and site of the
   tenant (the QR pages) and every customer's name on those. Keep that tenant-wide, or narrow it,
   e.g. customers and sites to those of their orders?
3. **Old log entries of an off module.** The plan drops them from the office's feed page, dashboard
   and filters (today they show by label without a link). Or keep showing them, and 404 only the
   record's own card?
4. **The office's sensitive types.** `member`, `invitation`, `portal_contact` and
   `integration_token` entries are readable by every office member in the log today, while
   `getMembers` hides contacts and only managers manage these. Should their office read rule be
   managers only?
5. **Unreadable answers.** `getRecordChangedAt` answers 0 for an unreadable record, the same as
   unchanged. Or should a batch refuse the whole call (a 404) if any subject is unreadable?
6. **A customer portal feed** (step 7): wanted now, or later?
7. **The engineer's status rules** (`getMyWork`, `myOpenOrders`, `getMyOrder`, three rules): should
   the `order` engineer rule include a status condition (e.g. not `quote`), or stay "assigned to
   me" with the views filtering?
