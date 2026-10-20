# Fieldworks

A multi-tenant field-service app: SvelteKit 3 with remote functions, Svelte 5 (`experimental.async`),
drizzle on SQLite (libsql on Node, a Durable Object on Cloudflare), better-auth, Paraglide (English
and Dutch), Vite+ (`vp`) and pnpm. Many rules below are enforced by specs; when one fails, its
message names the file and line.

## Before committing

1. `pnpm run check`: generation, format, lint, svelte-check and the Worker's types.
2. `pnpm knip`: drop what's unused, or say in `knip.ts` why knip can't see the use.
3. The tests of what you changed: its specs (`pnpm exec vp test run <spec>`) and the e2e files of
   the sections and modules it touches (`pnpm exec vp test run --project e2e <file>`).

Every e2e run (and `pnpm test`, the whole suite) goes through the shared lock, so runs from other
checkouts wait their turn: `flock /tmp/mysk-service-tests.lock …` (macOS: `lockf -k`). CI
(`.github/workflows/ci.yml`) runs everything on each push and deploys `main` to Cloudflare; check
its result after pushing. Parallel agents that edit code each work in their own worktree: rename
its branch after the task, then `git worktreeinclude apply` (`.env`) and `pnpm install`.

## Where things live

- **Core domains** (`orders`, `customers`, `equipment`, `engineers`): `src/lib/<domain>/`, by
  feature: `ui/`, `list/`, `form/`, `detail/`, `server/`, and at the root `display.ts`,
  `extensions.ts` and the record's own `<record>.remote.ts`. Pages in `src/routes/(app)/<domain>/`
  compose them.
- **Optional modules** (a tenant can switch them off): everything in `src/modules/<id>/`. Core never
  imports a module.
- **`src/routes`** holds `+` files, plus the files of the app shell, dashboard, auth pages,
  engineer portal (`(field)/my`) and customer portal (`(customer)/portal`), which belong to no
  domain.
- Where a role lands and which pages are its shell's is `shellOf(roles)` (`#lib/auth/shells.ts`:
  `{ name, home, owns(routeId) }`, which the guard in `hooks.server.ts` goes by), and the link to
  the login page and back is `loginUrl(target)`: never a role check for a home path or a
  hand-built `/login?redirectTo` (`src/tests/unit/lib/auth/shells.spec.ts`).
- **Generic code**: `src/lib/components/`, `activity/`, `auth/`, `i18n/`, `modules/`, `extensions/`,
  `themes/`, `errors/`; server infrastructure in `src/lib/server/`. Any `server/` folder or `*.server.ts` is
  server-only: database code and secrets go there.
- A file sits in the nearest folder that holds all its users; move it when its users move.
- Outside a domain, import it through its **barrels** (`#lib/orders/index.ts`, `components.ts`,
  `remotes.ts`, `server/index.ts`); inside, import siblings relatively.
- Imports name the real extension: `.ts`, `.svelte.ts`, `.svelte`, and `.js` only for Paraglide's
  output. A folder is never imported by its name.
- A link that shows an order, customer, unit or engineer is its link component (`OrderLink`,
  `CustomerLink`, `EquipmentLink`, `EngineerLink`; in a table cell with `secondary`), never a
  `resolve()`d anchor: it gives the office the record's hover card (`RecordLink`). Breadcrumbs,
  page headers and buttons stay plain.
- A dialog is `FormDialog` (a form with fields) or `ConfirmDialog` (a question; `DeleteDialog` is
  its delete button), from `#lib/components/form/`: they submit, toast, close, show the server's
  refusal and give the dialog a history entry, so back closes it. Never `Dialog.Root` or
  `AlertDialog.Root` outside `src/lib/components/` (`src/tests/unit/dialogs.spec.ts`).
- A record's page is a `<RecordPage>` (`#lib/components/record-page.svelte`): header, trail,
  Edit/Delete, `<ChangedElsewhere>`, the two columns (`main`, `side`), the modules' slots and the
  activity card; its cards live in the domain's `detail/`. Its form is a `<RecordForm>` with
  `<FormSection>`s (`#lib/components/form/`), its props a union of the create and update forms,
  never a cast. A key figure is a `<StatTile>` (`layout="card"` on a page, `"figure"` in a card).
  `PageHeader` titles the tab: no `<title>` beside it (`src/tests/unit/record-pages.spec.ts`).
- A record's extension points are one `defineRecordPoints("<domain>", { detail, listColumns, bulk })`
  in its `extensions.ts` (`<domain>.detail.main`/`.side`, `.list.columns`, `.list.bulk`), passed
  to `RecordPage` as `slots={points.detail}`.
- A single choice among a few options is `FilterChips` (chips; each with an `href` when the choice
  is kept in the URL) or `SegmentedNav` (a page's views), from `#lib/components/`, never a
  hand-made row of buttons or links (`src/tests/unit/choice-controls.spec.ts` refuses
  `aria-pressed` and tabs).
- A shell's chrome is shared, never copied (`src/routes/`): `<BrandMark>` for the icon tile before
  its name, `<AppearanceSwitchers>` for the language, theme and mode, `<SignOutButton>` (the one
  `signOut`, in `#lib/auth/session.remote.ts`), `<NavSidebar>` for a sidebar's navigation, and in
  `#lib/auth/session.remote.ts` `getCurrentUser` for who's signed in; a layout names the order
  types with `useTenantOrderTypes()` (`src/tests/unit/shell-chrome.spec.ts`).

Details: `docs/agents/structure.md`.

## Tenancy

Organizations own all business data.

- Make every remote function with a **gated set** from `src/lib/server/remote-functions.ts`:
  `forMembers` (the office), `forManagers` (settings), `forEngineers` (the engineer portal),
  `forCustomers` (the customer portal), `forAnyRole` (any member, field engineers too: the app
  shell's tenant), `forUsers` (no tenant data), `forAnyone` (public on
  purpose), or a module's `moduleRemote("<id>")`. Each has `query`, `query.live`, `form` and
  `command`. The gate runs before the handler, which reads what it admitted with
  `currentTenant()`, `currentUser()`, `await currentEngineer()` or `await currentCustomer()`; the
  engineer portal's orders are scoped to the engineer (`await engineerOrders()`,
  `await engineerOrder(ref)`, `engineerOrderNotFound(ref)` in `src/lib/server/auth/engineer.ts`),
  the customer portal's queries to the customer (`ofCustomer()`, `customerOrders()`, `atSites()`
  in `src/lib/server/auth/customer.ts`).
- Every select, update and delete on a tenant table is scoped: `inTenant(table)`,
  `idInTenant(table, id)`, `idsInTenant(table, ids)`, and joins through `tenantJoin()` (or
  `sameTenant(a, b)`). Ids come from the client.
- Inserts take `organizationId` from `currentTenant()`. Numbers come from `nextNumber(tx, …)` in the
  same transaction. Orders are created only through `createOrders(tx, drafts)`, and change status
  only through `transitionOrder()` (the order form through `beginOrderChange()`).
- Declare a tenant's table with `tenantTable()`, its references with `tenantRef()` or
  `optionalTenantRef()` and their relations with `tenantOne()` (`#lib/server/db/columns.ts`): the
  references are composite foreign keys that include the tenant.
- Every section's tests cover isolation: South can't see or change North's records, also by
  tampering with ids. In e2e one page and one tampered form per section; the rest in its server
  spec (`docs/agents/tests.md`).

Server code has one way per recurring problem (`docs/agents/tenancy.md`, "One way";
`hand-written.spec.ts` refuses the rest): services in `server/` throw a `Refused` to refuse
(`gated()` turns it into the form's issues or a 400), and remote files hold no transactions; a
record is looked up with `unitBySerial()`, `customerByCode()` or `orderByNumber()`, deleted with
`deleteAndLog()` or `defineRemoval()`, ordered with `nextPosition()`/`reorder()`, and its name
checked with `nameTaken()` (`src/lib/server/records.ts`).

Details and the shared server helpers: `docs/agents/tenancy.md`.

## Changes and the activity log

Every mutation calls `recordActivity(tx, { action, subject, before, after })` inside the
`db.transaction` that makes it, after the change, so a rolled-back change logs nothing. The log also
announces the change to live queries, which return `live()` (`src/lib/server/live.ts`; `watchSchedule` and
`<ChangedElsewhere>` are the examples) and refresh their page with `refreshOnChange()`. Orders, customers and
units are logged by `orderSubject()`, `customerSubject()` and `equipmentSubject()`. Keep outside I/O (mail, `fetch`) out of transactions:
on Cloudflare a transaction holds every other request. The bells' notifications are log entries
that rules pick (`#lib/server/notifications/`, a module's through `notifications.rules`): a rule that
needs more than an entry says gets it added to the entry, not a record of its own.

A statement binds at most 100 values: pass lists with `inList()`/`notInList()` and insert rows with
`insertRows()`.

Before you change the schema, add a migration, or log a new subject or action: read
`docs/agents/database.md`.

## Text, numbers and dates

- Every user-facing text is a Paraglide message (`m.orders_title()`), added to `en` and `nl`
  together. Call messages where they're read (component, `$derived`, function body), and pass the
  message function itself where a module-scope value needs a label.
- Format through `#lib/i18n/format.ts`, and show enum values with `label(kind, value)`: as a badge
  with `<EnumBadge display={…Display} value />`, as a table column with `column.enum()`.
- Days are `Temporal.PlainDate` and moments are `Temporal.Instant`. Compare them with `compare()` or
  `.equals()`. Ask the user's time zone through `#lib/dates.ts`: `currentDay()` (today), `dayOf(moment)`,
  `startOfDay(day)` and `mondayOf(day)`, not `Temporal.Now.plainDateISO(getTimeZone())` and the like.

Before you add a message file, an enum kind, a plural or a format, or write Dutch copy: read
`docs/agents/i18n.md`.

## Colours and themes

- Colour a state with the theme's tone tokens: `text-success`, `bg-warning/10`, `border-info/30`,
  `bg-destructive` (`success`, `warning`, `info`, and `destructive` for `danger`), or a `Badge` /
  `Callout` tone; never a raw palette (`text-emerald-600`), which every theme shows alike
  (`state-colours.spec.ts` refuses it).
- A theme restyles a component part through its `data-slot` in `src/lib/themes/<name>.ts`. Run
  `pnpm themes:sync` after adding or updating a shadcn-svelte component.

## Pointers

- **Modules and extension points** (hooks, slots, form slots, bulk actions, list columns, module
  routes, seeds): `docs/agents/modules.md`. A module's settings row is `defineTenantSettings()`
  (`#lib/server/modules/settings.ts`; its daily automatic orders `dailyOrderRun()`), its settings
  page `<ModuleSettingsPage>`, its integration tokens `<IntegrationTokensCard>` and its feed's
  endpoint `jsonIngest()` (`#lib/server/modules/integrations.ts`), never its own copy
  (`hand-written.spec.ts`).
- **Orders** (the transition table, `transitionOrder()`, orders awaiting acceptance, the work
  record each portal reads with `readWorkRecord()`): `docs/agents/orders.md`. Units and locations
  are read the same way, by audience: `readUnits(scope, where)` and `readLocation(scope, id)` with
  `officeUnits()`, `engineerUnits()` or `customerUnits(access)` (`#lib/equipment/server`), the units
  of orders with `listedUnitsOf(ids, seenBy(scope))`, and shown with `<WorkUnits>` and `<UnitRow>`;
  never a portal's own select of them (`hand-written.spec.ts`).
- **Lists**, in the browser or on the server: one `defineList()` (`mode: "client"` for a small
  list loaded whole), its columns `withListColumns()`, its table `createServerTable()` or
  `createClientTable()`, its page's shell `<ListLayout>` (toolbar `<ListToolbar>`) and its
  page's queries `listQueries()`, and on the server `planList(…).answer()`; never a hand-written
  toolbar or a table without a definition (`lists.spec.ts`). Read `docs/agents/lists.md` first.
- **Tests** (where they go, e2e conventions, component harnesses): `docs/agents/tests.md`.
- **Cloudflare deployment**: README.md, "On Cloudflare"; the plan is in `docs/plans/cloudflare.md`.
- **Svelte and SvelteKit**: use the Svelte MCP. Fetch the docs sections a task needs
  (`list-sections`, then `get-documentation`), and run `svelte-autofixer` on Svelte code you write
  until it reports nothing.
- **Reactive utilities**: runed (`runed`) first (debounce, resource, observers, persisted state,
  idle, state machines): `useDebounce` (a value: `Debounced`), a search `resource()` on a
  `Debounced` term (dropping a stale answer with `signal.throwIfAborted()`), `IsIdle`; never a
  hand-rolled `setTimeout` debounce or observer. A context is `createContext()`, a time that moves
  on `Clock` (`#lib/hooks/clock.svelte.ts`) (`src/tests/unit/runed.spec.ts`).
- **Vite+**: `vp <command>` is a built-in, and `vp run <name>` runs a `package.json` script; the docs
  are in `node_modules/vite-plus/docs`.
