# The kit: one way per recurring problem

Each heading below is a problem the app solves often, with the one way it's solved. A guard spec
refuses the hand-written form; when one fails, its message names the helper. Find your problem here
before writing the code.

## Pages and components

- **A record's page** is a `<RecordPage>` (`#lib/components/record-page.svelte`). It holds the
  header, trail, Edit/Delete, `<ChangedElsewhere>`, the two columns (`main`, `side`), the modules'
  slots and the activity card. Its cards live in the domain's `detail/`. Its form is a
  `<RecordForm>` with `<FormSection>`s (`#lib/components/form/`), and its props are a union of the
  create and update forms, never a cast. A key figure is a `<StatTile>` (`layout="card"` on a page,
  `"figure"` in a card). `PageHeader` titles the tab, so no `<title>` beside it
  (`src/tests/unit/record-pages.spec.ts`).
- **A record's extension points** are one `defineRecordPoints("<domain>", { detail, listColumns,
bulk })` in its `extensions.ts` (`<domain>.detail.main`/`.side`, `.list.columns`, `.list.bulk`),
  passed to `RecordPage` as `slots={points.detail}`. A point's contributions (slots, bulk actions,
  list columns) load with `$derived(await loadContributions(registry, point, await
getTenantModules()))` (`#lib/extensions/define.ts`), never by filtering `contributions.gen.ts`
  by hand (`src/tests/unit/load-contributions.spec.ts`).
- **A link** that shows an order, customer, unit or engineer is its link component (`OrderLink`,
  `CustomerLink`, `EquipmentLink`, `EngineerLink`; in a table cell with `secondary`), never a
  `resolve()`d anchor: it gives the office the record's hover card (`RecordLink`). Breadcrumbs,
  page headers and buttons stay plain.
- **A dialog** is `FormDialog` (a form with fields) or `ConfirmDialog` (a question; `DeleteDialog`
  is its delete button), from `#lib/components/form/`. They submit, toast, close, show the server's
  refusal, and give the dialog a history entry so back closes it. `Dialog.Root` and
  `AlertDialog.Root` live only in `src/lib/components/` (`src/tests/unit/dialogs.spec.ts`).
- **A single choice among a few options** is `FilterChips` (chips, each with an `href` when the
  choice is kept in the URL) or `SegmentedNav` (a page's views), from `#lib/components/`. A
  hand-made row of buttons or links is refused (`src/tests/unit/choice-controls.spec.ts` refuses
  `aria-pressed` and tabs).
- **A shell's chrome** is shared, never copied (`src/routes/`). The parts are:
  - `<BrandMark>` for the icon tile before its name;
  - `<AppearanceSwitchers>` for the language, theme and mode;
  - `<SignOutButton>`, using the one `signOut` in `#lib/auth/session.remote.ts`;
  - `<NavSidebar>` for a sidebar's navigation;
  - `getCurrentUser` (in `#lib/auth/session.remote.ts`) for who's signed in;
  - `useTenantOrderTypes()` for a layout to name the order types.

  `src/tests/unit/shell-chrome.spec.ts` checks these.

- **Where a role lands**, and which pages are its shell's, is `shellOf(roles)`
  (`#lib/auth/shells.ts`: `{ name, home, owns(routeId) }`, which the guard in `hooks.server.ts`
  goes by). The link to the login page and back is `loginUrl(target)`. A role check for a home
  path, or a hand-built `/login?redirectTo`, is refused (`src/tests/unit/lib/auth/shells.spec.ts`).

## Lists

A list, in the browser or on the server, is built from these parts:

- one `defineList()`, with `mode: "client"` for a small list loaded whole;
- its columns from `withListColumns()`;
- its table from `createServerTable()` or `createClientTable()`;
- its page's shell `<ListLayout>`, with the toolbar `<ListToolbar>`;
- its page's queries from `listQueries()`;
- on the server, `planList(…).answer()`.

A hand-written toolbar, or a table without a definition, is refused (`lists.spec.ts`). Read
`docs/agents/lists.md` first.

## Forms and commands

- **A command a button runs** is `ran(cmd(), fallback)`, and a form's `enhance` awaits
  `submitted(submit)` (`#lib/components/form/submitted.ts`). Both toast the error's own message
  (`errorMessage()`) or the fallback, and answer whether it went through. A try/catch toast of its
  own is refused (`src/tests/unit/command-toasts.spec.ts`).
- **A form's rows that can be added and removed** are `lineItems(() => initial)`
  (`#lib/components/form/line-items.svelte.ts`: keyed `rows`, `add`, `remove`). Their inputs take
  the field's attributes with `withoutValue(field.as(…))` and the value from the row
  (`src/tests/unit/line-items.spec.ts`).
- **A schema** takes its fields from `#lib/schema.ts`:
  - a number in bounds: `numberIn({ min, max, above, message })` or `wholeIn()`;
  - from a hidden field: `hiddenInt()`;
  - a year: `year()`;
  - an id: `id()` (a command's: `recordId()`);
  - an email address: `email()`.

  Fields hand-built from `v.minValue()`, `v.integer()` and the like are refused
  (`schema-helpers.spec.ts`).

## Permissions

An office page hides manager-only controls with `await canManage()` (`#lib/auth/can-manage.ts`,
from `getCurrentTenant()`'s roles); a query never sends a `canManage` flag (`can-manage.spec.ts`).
It only hides controls: the gate (`forManagers`) still refuses everyone else. Portals don't use it,
because `getCurrentTenant()` sends anyone outside the office to their own home.

**Who may read or change a record** is `#lib/server/access` (the barrel, for pages and core). The
gated sets still decide who may _call_ a function; this decides which _records_ they reach. Ask with:

- `await mayRead(subject)`, or `await readOrNotFound(subject)` for its 404;
- `await readable(subjects)` for a batch: the `type/id` keys the viewer may read, one statement per
  type. It trusts a rule that reads the whole type, so a feed's or the log's own-tenant subjects
  need no query (a single `mayRead` always checks the table);
- `await visible(type)` for the viewer's condition on its table (`undefined`: none), for a list's
  `scope`, a join or a subquery; `visibleOrNone(type)` is the same for a `where`, where `undefined`
  in an `and()` would let everything through; `await readableTypes()` for the types the viewer reads
  at all (the log's readers drop the rest);
- `mayChange`, `changeOrNotFound`, `changeable` and `visible(type, "change")` for a change. Status
  rules stay in `lifecycle.ts`: this says the record is theirs to touch, `can()` that the move is
  allowed now;
- `as`: `mayRead(subject, as)` and `visible(type, which, as)` answer for another viewer. A scope
  maker names its audience's with `viewerAs("office" | "engineer")` (`#lib/server/access/viewer.ts`,
  which refuses a request of another audience). `viewerIn(organizationId, userId)` (same file)
  builds a member's viewer in a tenant that isn't the request's (the QR scan), and
  `mayReadIn(organizationId, viewer, subject)` asks as them there.

Each subject type has one entry of rules per audience (`office` with its managers, `engineer`,
`customer`, `system`; no rule for an audience is no access). It is made from the audience scopes
(`engineerOrders()`, `customerOrders()`, `customerUnits()`, …) with the makers in
`src/lib/server/access/rules.ts`: `rows(table, idColumn, byAudience)` for a type with a row,
`partOf(parentType, table, parentColumn, narrowedBy?)` for a part (its parent's rule, `narrowedBy`
narrowing it per audience), `tenantWide(byAudience, { change: "manager" })` for a type without a row.
The core's entries are in `src/lib/server/access/core.ts`. A module's are in its `server/access.ts`,
contributed in its `server/index.ts` with `contribute(accessRules, () => rules)` (point
`access.rules`, `modules.md`); it imports the makers from `#lib/server/access/rules.ts`, not the
barrel, which is circular for modules. A type of a module the tenant lacks has no rule, and unknown
is not found.

`src/tests/unit/lib/server/access.spec.ts` guards it, with `access/matrix.spec.ts` and each module's
`access.spec.ts` for the behaviour:

1. every logged type has a rule (core and each module's `subjects`, no more, no fewer);
2. a file that reads the log or feeds changes (`recordChangedAt`, `liveFeed`, `watchEvery`, the
   `activity` table, a `v.picklist(loggedTypes)` input) imports the registry (an allow-list gives
   a reason per file);
3. no hand-written module check (`subjectTypes(…)`) in a `*.remote.ts`;
4. portal files (`(field)`, `(customer)`, a module's `portal/` and `client/`) never scope a table
   that has a rule by the tenant alone;
5. `portal_contact` is looked up only in `server/auth/` and the portal-access feature;
6. no literal `"owner"`/`"admin"` comparison outside the files that own roles (`isManager()`).

**Feeds:** a shell's feed presents with `liveFeed(types, feedFor())` (`#lib/server/live.ts`).
`feedFor(viewer)` keeps the changes to records the viewer may `readable()` and says what each
audience hears of them (the `hears` table: the office the name of who did it and the full action,
engineers and customers neither, and only the office changes announced for a type alone). When a
change takes a record off someone who knew it (an order off its engineer), that person's feed gets
one `access_revoked` change (`ACCESS_REVOKED`), then the record is unreadable; the open page handles
it (see "Staying live").

## Server code

Read `docs/agents/tenancy.md`, "One way"; `hand-written.spec.ts` refuses the rest.

- **Refusing:** services in `server/` throw a `Refused`, which `gated()` turns into the form's
  issues or a 400. Remote files hold no transactions.
- **Looking up a record:** `unitBySerial()`, `customerByCode()` or `orderByNumber()`.
- **Deleting a record:** `deleteAndLog()` or `defineRemoval()`.
- **Ordering:** `nextPosition()`/`reorder()`.
- **Checking a name:** `nameTaken()`.

These live in `src/lib/server/records.ts`. A lookup done once per request is `perRequest(find)`
(`#lib/server/per-request.ts`).

**A tenant's table** is declared with `tenantTable()`, its references with `tenantRef()` or
`optionalTenantRef()`, and their relations with `tenantOne()` (`#lib/server/db/columns.ts`). The
references are composite foreign keys that include the tenant.

**Units and locations** are read by audience, as the work record is with `readWorkRecord()`:

- `readUnits(scope, where)` and `readLocation(scope, id)`, with `await officeUnits()`,
  `await engineerUnits()` or `await customerUnits(access)` (`#lib/equipment/server`);
- the units of orders: `listedUnitsOf(ids, seenBy(scope))`;
- shown with `<WorkUnits>` and `<UnitRow>`.

A portal's own select of them is refused (`hand-written.spec.ts`).

**A module's settings** use these parts; a module's own copy is refused (`hand-written.spec.ts`):

- its settings row: `defineTenantSettings()` (`#lib/server/modules/settings.ts`);
- its daily automatic orders: `dailyOrderRun()`;
- its settings page: `<ModuleSettingsPage>`;
- its integration tokens: `<IntegrationTokensCard>`;
- its feed's endpoint: `jsonIngest()` (`#lib/server/modules/integrations.ts`).

## Staying live

A page or card that shows one record stays live by it through its shell's one feed of changes:
`refreshOnRecordChange(() => ({ type, id }), () => getX(key).refresh())`
(`#lib/components/activity/change-feed.svelte.ts`). This works in the office and the engineer
portal. A part is logged with its record as its parent, so its changes count too.

There is no live query per record: SvelteKit keeps its stream open until the browser collects it
(`docs/upstream-bugs/README.md`, 14). So:

- a form or command keeps no list of queries to refresh: a form without one refreshes its page, and
  a refresh sent along with a redirect stays;
- no `server/` file imports a `*.remote.ts` to refresh a card from a hook.

`src/tests/unit/live-by-subject.spec.ts` checks both.

## Text, values and time

- **Format** through `#lib/i18n/format.ts`, by its named formats where one fits: `formatShortDay`,
  `formatLongDay`, `formatMonth`, `formatWholeEuros`, `formatPercent(value, { basis })`,
  `formatStopwatch(ms, { hours })`. `named-formats.spec.ts` refuses a copy.
- **Show enum values** with `label(kind, value)`: as a badge with
  `<EnumBadge display={…Display} value />`, as a table column with `column.enum()`.
- **Ask whether a value is one of a list's** with `isOneOf(values, value)` (`#lib/one-of.ts`, which
  narrows it). A cast `.includes()` is refused (`is-one-of.spec.ts`).
- **The earlier or later of two moments** is `earlier(a, b)`/`later(a, b)`. A moment's whole
  seconds, as the database keeps them, are `momentSeconds(moment)` (back:
  `fromMomentSeconds(seconds)`). These come from `#lib/dates.ts`.
- **A kebab-case or dotted name in camelCase** is `camelCase()` (`#lib/camel-case.ts`, shared with
  `scripts/`; `src/tests/unit/camel-case.spec.ts`).

## Colours and themes

- **Colour a state** with the theme's tone tokens: `text-success`, `bg-warning/10`,
  `border-info/30`, `bg-destructive` (`success`, `warning`, `info`, and `destructive` for
  `danger`), or a `Badge` / `Callout` tone. A raw palette such as `text-emerald-600` looks the same
  in every theme, so `state-colours.spec.ts` refuses it.
- **A theme restyles a component part** through its `data-slot` in `src/lib/themes/<name>.ts`. Run
  `pnpm themes:sync` after adding or updating a shadcn-svelte component.

## Reactive utilities

Use runed (`runed`) first, for debounce, resources, observers, persisted state, idle detection and
state machines:

- a debounced function: `useDebounce`; a debounced value: `Debounced`;
- a search: `resource()` on a `Debounced` term, dropping a stale answer with
  `signal.throwIfAborted()`;
- idle detection: `IsIdle`.

A context is `createContext()`, and a time that moves on is `Clock` (`#lib/hooks/clock.svelte.ts`).
A hand-rolled `setTimeout` debounce or observer is refused (`src/tests/unit/runed.spec.ts`).
