# Code-quality review, 2026-10-20

Six reviewers read the codebase in parallel, one slice each: generic UI and client code; server
infrastructure and codegen; the core domains with the office routes; energy, checklists and
condition; invoices, partner programme, docks and materials; the small modules with the portals.
The coordinator checked the main claims against the code.

The review measured the code against two goals:

- **One idiomatic way to solve each recurring problem.**
- **DRY through composition, factories and codegen,** reaching for reputable third-party utilities
  such as runed before writing our own.

## Verdict

The TypeScript backbone is good. The gated remote sets, `defineList`/`planList`, extension
points, the module generator, `readWorkRecord`'s audience policy, the tenancy helpers and the form
fields are real abstractions, and consumers use them.

The debt sits one layer up. There are **shapes that recur in every domain and module but have no
abstraction yet**:

- the dialog with a form;
- the per-tenant settings row;
- the record lookup or 404;
- the enum badge;
- the list toolbar;
- the detail page;
- the "remove unless referenced" rule.

So every new feature copies the nearest sibling, and the copies drift. Where a helper does exist,
it is often adopted only in part:

- `deleteAndLog` covers 6 of 19 deletes;
- `historyDialog` is used in 3 of 44 dialogs;
- `idInTenant` is bypassed about 20 times;
- list `groups` are returned by 3 of 7 lists.

Agents and humans don't find these helpers because nothing points to them and no spec refuses the
hand-written form.

Third-party utilities are a smaller lever than expected. There are only about 32 `$effect`s outside
`ui/`, and `runed` is installed only as a dependency of bits-ui. It does replace about 10 hand-rolled
pieces (finding 13).

Findings are ordered by conviction and payoff. Those found independently by three or more slices
come first.

---

## 1. Dialogs: no `FormDialog` or `ConfirmDialog`, so 44 files hand-roll the shell

**Found by:** all five slices that touch UI. **Payoff:** about 700–1,000 lines. **Confidence:** high.

44 non-vendor files contain `Dialog.Root` or `AlertDialog.Root`. The same scaffold appears each
time: Root, then Header, then `form.enhance(async ({ submit }) => { if (await submitted(submit)) { open = false; toast } })`,
then hidden inputs, then `FieldError`, then Cancel plus Submit. Examples:

- `lib/equipment/locations/location-dialog.svelte`
- `energy/setup/{zone,consumer,door}-dialog.svelte`
- `docks/form/dock-dialog.svelte`
- `materials/detail/{receive,count}-stock-dialog.svelte`
- the kit's own `data-table/{save,rename}-view-dialog.svelte`, which are about 80% identical

About 15 confirm-delete copies exist because `DeleteDialog` only has a fixed trigger and an
`{ id }` + redirect form:

- `site-row`, `location-row`, `category-row`, `point-row`, `component-row`, `plan-row`
- `docks/form/delete-dock.svelte`
- `energy/setup/delete-part.svelte`

The copies have already drifted:

- `fields.issues()` in 17 files, `allIssues()` in 16;
- some dialogs are opened from outside, others own their trigger;
- **the back button closes only 3 of 44 dialogs.**

**Remedy:** two components in `#lib/components/form/`. `FormDialog` owns `submitted()`, the toast,
closing, `allIssues()`, `SubmitButton` and `historyDialog()`. `DeleteDialog` becomes a preset of
`ConfirmDialog`.

```svelte
<FormDialog
	{form}
	title
	description
	submitLabel
	bind:open?
	trigger?={snippet}
	hidden={{ id }}
	done={m.x_saved}
	reset?>{fields}</FormDialog
>
<ConfirmDialog
	title
	description
	confirmLabel
	destructive
	bind:open?
	trigger?
	form?={{ form, hidden }}
	|
	onconfirm?
	done?
/>
```

## 2. Lists: two systems, and each table restates its definition three times

**Found by:** generic-ui, core, modules-b, server. **Payoff:** about 800 lines (half of it specs).
**Confidence:** high, except medium on moving customers and engineers.

- **Two systems.** Five tables load everything on the client: customers, engineers, invoices,
  credit notes and contracts. Six page on the server with `defineList`. Parts-shop uses neither.
- **Columns restate the definition.** `columns.ts` repeats `meta.param`, `filter`, `filterValues`,
  `filterNone`, `enableSorting` and `enableGrouping`, which `defineList` already declares. There
  are 12 no-op `filterFn`s on server tables. Nine `columns.spec.ts` files (809 lines) exist only to
  catch the drift that this duplication makes possible.
- **The toolbar restates it again.** Each table lists its `FacetedFilter`/`RecordFilter`/`DateRangeFilter`
  by hand, passing `title=` with the column's own label, even though `equipment-table` already
  renders the module columns' filters from the definition.
- **Wiring is copied per table and page.**
  - 11 copies of the `scrollPages` + `createAppTable({serverSide})` + `serverTableLoading` +
    `matching` + layout-shell block.
  - 7 copies of the list-remote tail `Promise.all([paged, count, groupCounts?])` → `{ rows, rowCount, query, key, groups }`.
    Only 3 of the 7 return `groups`.
  - 11 identical `+page.ts` files that contain only `loadTableMemory`.

**Remedy:**

- `withListColumns(list, columns)` fills in the meta from the definition, and the type rejects
  unknown ids. Delete the drift halves of the specs.
- A `<ListToolbar {list} {facets} filters={{ customer: { load } }}>` picks the filter component
  from the column's filter kind.
- `createServerTable({ list, first, fetch, columns })`, plus `<ListLayout>`.
- `plan.answer(select, { enrich? })` on `planList`, so every list gets grouping.
- The stub generator emits `tableMemory`.
- **Decision (2026-10-20): keep both modes.** Loading everything on the client is deliberate for
  small tables: once the rows are in, sorting, filtering and paging need no server. So don't move
  the client tables to the server. Unify the _declaration_ instead: client tables also get a
  `defineList` (a `mode: "client"`), so columns, toolbar and URL grammar come from one definition
  in both modes, and only where rows are filtered differs. Revisit invoices on its own if it grows
  too large to load whole.

## 3. Module settings and integration feeds are copied per module

**Found by:** four slices. **Payoff:** about 450 lines and about 70 messages per locale. **Confidence:** high.

- **Per-tenant settings, three times.** `{condition,invoices,maintenance}/server/settings.ts` repeat
  the same find, insert-defaults, re-find. Their `settings.remote.ts` files repeat the same
  get-with-`canManage`, then save, log `<x>_settings`, refresh and redirect. Invoices alone uses
  `requireMember()`.
- **Settings pages:** five settings pages share one shape, a read-only `DetailItem` grid or the form.
  The daily "automatic orders" run is copied between maintenance and condition.
- **Integration tokens and ingest, twice.** Docks and energy each have their own copy of:
  - the integration-token remotes (42 lines);
  - `tokens-card.svelte` (about 125 lines);
  - about 16 `*_token_*` messages;
  - the ingest endpoint's 415/413/400/422 preamble.

  The two endpoints already answer different error shapes.

**Remedy:**

- `defineTenantSettings(moduleId, table, { subject, defaults, schema, home })` returning
  `{ settingsOf, getSettings, saveSettings }`, plus a `<ModuleSettingsPage>`.
- Core `getIntegrationTokens(moduleId)` / `create…` / `revoke…`, a `<IntegrationTokensCard module>`
  and `jsonIngest({ maxBytes }, handle)`.
- `dailyOrderRun({...})` for the copied run.

**Bugs found along the way (verified):**

- `invoices/module.ts` and `maintenance/module.ts` declare no `settings:`, although both have a
  settings page. The settings overview therefore never links to them.
- The module card links to `manifest.settings` for every member
  (`routes/(app)/settings/module-card.svelte:78`), but energy's and docks' settings queries are
  `forManagers`. A non-manager who clicks the link gets an error page. Other modules show a
  read-only view instead. Pick one rule.

## 4. Record server toolkit: lookups, removal, ordering and scoping are hand-rolled everywhere

**Found by:** all six slices. **Payoff:** about 600 lines and about 15 messages. **Confidence:** high.

- **Lookup or 404.**
  - Unit by serial: 16 copies, with 3 different 404 messages.
  - Customer by code: 8 copies.
  - Order by number: 11 copies. "Order {number} not found" exists as 5 separate messages.
  - In total, 146 hand-written `if (!x) error(404, …)`.
- **Remove unless referenced.**
  - `removeX()` is the same 25 lines in 6 places.
  - `deleteAndLog` covers 6 of 19 deletes. The rest hand-roll delete + `recordActivity`, because it
    takes no `tx`, `parent` or guard.
  - Some of this lives in `*.remote.ts` (customers, engineers, contracts) and some in `server/`.
- **Batch `getX`:** the same find-by-keys, then counts, then Map, then 404 closure, ×4.
- **Ordered collections.**
  - `max(position)+1` ×7.
  - Swap-and-renumber ×4, although `moved()` exists.
  - `picklist(["up","down"])` ×3.
  - `NameIssue` and the case-insensitive "name taken" check ×5.
- **Scoping helpers bypassed.** About 20 hand-written `and(eq(X.id, id), inTenant(X))` instead of
  `idInTenant`, and about 40 `eq(a.organizationId, b.organizationId)` joins. Condition even has its
  own `sameTenant`.

**Remedy:** a `#lib/server/records.ts` toolkit:

- `unitBySerial`, `customerByCode` and `orderByNumber` in the domain barrels, each with core's message;
- `found(row, msg)`;
- `defineRemoval({ table, subject, blockers })`;
- `byKey({ table, key, extras, notFound })` for batch queries;
- `deleteAndLog(table, id, { tx?, parent?, refuse? })`;
- `nextPosition`, `reorder` and `nameTaken`, plus `moveSchema`;
- a promoted `sameTenant()`.

Pair it with a spec that refuses the hand-written forms, as `parameters.spec` does for `inArray`.

## 5. One way for server code to refuse

**Found by:** modules-a, modules-b, core. **Payoff:** about 100 lines plus a rule. **Confidence:** medium-high.

Services report a refusal in about six shapes:

- `{ problem }`, `{ problems }`, a bare `Problem[]` or `{ issues }`;
- thrown classes: `StockShortage`, `UnknownDocks`, `OrderRefused`;
- `invalid()` thrown deep inside `server/`, with the form's `issue` threaded into it.

Callers adapt by hand: `refuse(issue, …)`, hand-mapped `invalid(...problems.map(...))`,
`try`/`instanceof`, or `refusedAsBadRequest`. Separately, some `*.remote.ts` files run
transactions and 60-line queries inline, while others are thin wrappers over `server/`.

**Remedy:**

- One `Refused` error that carries `Problem<path>[]`. `OrderRefused` already has this shape.
- `gated()` in `remote-functions.ts` catches it centrally: a form gets field issues, a command gets
  a 400.
- Delete `refuse()`, `refusedAsBadRequest` and the result unions.
- Document "remote files hold no transactions; services live in `server/`".

## 6. Enum display: about 17 badge components, two display-map shapes, 450 lines of label maps

**Found by:** core, modules-b, modules-c, generic-ui, server. **Payoff:** about 600 lines. **Confidence:** high.

- **Badges.** About 17 files have the same body:
  `<Badge variant={display.tone}><display.icon/>{display.label}</Badge>`.
- **Display maps** come in two shapes:
  - `variant` in customers and part of contracts;
  - `tone` everywhere else.
- **Barrel clash.** `StatusBadge` is exported by both the orders and equipment barrels, so callers
  alias it 10 times.
- **Columns.** Enum columns repeat
  `renderComponent(XBadge)` + `oneOf` + grouping + sort-by-index + `filterValues` + `clickFilter`
  12 times.
- **Label maps.** `lib/i18n/labels.ts` and the 10 module `labels.ts` files (about 450 lines) are
  mechanical `value: m.<prefix>_<value>`. The prefixes are irregular: `enum_order_status_*`,
  `checklists_result_*` and `energy_tone_*`.

**Remedy:**

- `<EnumBadge display value>` with one `{ icon?, tone }` shape, exported as `BadgeDisplay` from
  `labels.ts`.
- `column.enum(id, { kind, values, display })`.
- Generate `labels.gen.ts` from the `as const` arrays, under one `<owner>_enum_<kind>_<value>` key
  convention.

## 7. Naming that contradicts itself

**Found by:** all slices. **Payoff:** clarity, plus enabling convention-driven codegen. **Confidence:** high.

- **"Portal".**
  - In `lib` it means the engineer portal: `#lib/portal`, slot `portal.order`, `portal_*` messages,
    module `portal/` folders.
  - In URLs and the manifest it means the customer portal: `/portal`, `manifest.portal`, which
    then uses `#lib/client` and `client_*`.
  - Fix: rename to the route-group words, `field` and `customer`, by codemod.
- **Stored activity subject types** mix camelCase (`maintenancePlan`, `checklistTemplate`,
  `checklistTemplateItem`, `unitCondition`) with prefixed snake_case, sometimes within one file.
  Two are unprefixed (`component`, `checklist`). Fix: rename in a migration like
  `0008_rename-invoicing-module`.
- **Module remote sets.** Modules write bare `query(...)` for the member set and redefine
  `forManagers` locally with a different gate. Core writes `forMembers.query`. Fix:
  `export const { forMembers, forManagers } = moduleSets(id)`.
- **Extension point ids.** `orders.list` is a _bulk_ point, while `equipment.list` is a _columns_
  point. Engineers have no `extensions.ts`, and `detailMain` exists only for customers. Fix: one
  declaration per domain, `defineRecordPoints("orders", { detail, listColumns, bulk })`.
- **Prefixes drifted from module ids:** `partners_`, `shop_`, and the `invoicing*` leftovers. Each
  module also writes its own id about six times.
- **Record routes** are hard-coded in 34+ `resolve()` calls and again in `coreSubjectTypes.href`.
  There is no `engineerSubject`. Fix: a record registry,
  `records.customer.{href, keySchema, subject}`.

## 8. Detail pages, forms and cards: no shells

**Found by:** core, modules-c, modules-a. **Payoff:** about 400 lines. **Confidence:** high.

- **Detail pages.**
  - 10 detail pages hand-lay `grid lg:grid-cols-3` with `col-span-2`.
  - The customer and engineer pages hold 3–4 inline cards each.
  - `equipment/[serial]` hand-copies `CustomerCard`.
  - `ChangedElsewhere` and the extension slots are applied unevenly: equipment and engineers have
    none.
- **Record forms.** The four record forms share one frame: snapshot, enhance, toast, a cast hidden
  id, and Card sections.
- **Stat components.** `StatCard`, `StatTile`, `ServiceStats`, `KeyFigure`, and hand-written figure
  markup in dashboard slots.
- **Page titles.** 59 pages write `<svelte:head><title>` by hand, in four formats.

**Remedy:**

- `<RecordPage title badges edit remove changes slots>{main}{side}</RecordPage>`, owning
  breadcrumbs, `ChangedElsewhere`, the `ExtensionSlot`s and `ActivityCard`.
- `<RecordForm>` + `<FormSection>`.
- `StatTile layout="card"`.
- `PageHeader` renders `<title>`.

## 9. The portals and shells re-derive what the office already has

**Found by:** modules-c, core. **Payoff:** about 400 lines. **Confidence:** medium-high.

- **Units and locations by audience.** `readWorkRecord(scope)` is the right model, but it stops at
  the order:
  - unit and location reads exist three times (office, engineer, customer);
  - `unitColumns` and `unitsWhere` are each defined twice;
  - "units of these orders" is hand-written twice next to `listedUnitsOf`;
  - order units are rendered in three layouts.

  Fix: `readUnits(scope, where)` / `readLocation(scope, id)`, plus `<WorkUnits>` and `<UnitRow>`.

- **Shell chrome.**
  - `signOut` is defined 3 times.
  - The brand mark is copied 5 times.
  - Language, theme and mode switchers appear in 5 shells; the customer portal omits the theme
    switcher.
  - Sidebar nav is built twice, with different "current" rules.
  - The order-type naming block appears 3 times.
- **Role → home.** Seven places decide where a role lands, and the login URL is built 4 ways. Fix:
  `#lib/auth/shells.ts` with `shellOf(roles)` and `loginUrl()`.
- **Notices.** Hand-made success and danger notices sit beside `Callout`, which needs those tones.
- **Choice controls.** Five single-choice chip or tab implementations exist beside `FilterChips`
  and `SegmentedNav`.

## 10. Database schema and seed

**Found by:** server, modules-b. **Payoff:** about 650 lines. **Confidence:** medium-high.

- **Schema boilerplate.** 67 tables repeat the same pieces:
  - 43 copies of the `id` primary key;
  - 65 copies of `organizationId()`;
  - 31 copies of the `<t>_organization_id` unique index;
  - 69 composite tenant foreign keys;
  - 31 composite relations;
  - 8 "optional tenant ref" clusters, each with a column, index, foreign key and check.

  `schema.ts` is 935 lines, close to the 1k bar, and mixes infrastructure tables with domain
  tables. Fix: `tenantTable()`, `tenantRef()`, `tenantOne()` and `optionalTenantRef()`, then split
  the schema by domain. The generated DDL stays identical, and `migrations.spec` proves it.

- **Seed clearing.** The seed's clear step (21 tables by hand, plus 10 module `clear()` hooks) is a
  second, incomplete copy of the foreign-key graph. `organizationId()` already cascades, as
  `db/columns.ts:20` shows, and the docks seed already relies on that. Fix: delete the
  organizations and drop `ModuleSeed.clear`.
- **Seed helpers.**
  - `insertAll` duplicates `insertRows`. It exists only because `SeedTransaction` isn't the app's
    `Transaction`; type `insertRows` structurally instead.
  - Seven hand-kept id-offset counters and per-module faker magic offsets should become
    `ids.claim()` and `tenant.faker(moduleId)`.

## 11. Theming

**Found by:** generic-ui, modules-c. **Payoff:** about 300 lines, plus pristine vendor files. **Confidence:** high, except medium on the CSS move.

- **Status tones bypass the theme.** `BadgeTone`'s `success`, `warning` and `info` map to raw
  emerald, amber and sky classes in Badge, StatTile, Callout, and 24 module files. Themes can
  restyle a badge but not those components.
  - Fix: add `--success`, `--warning` and `--info` theme tokens.
  - Delete the per-component tone maps and most per-theme badge overrides.
- **A regex rewriter edits the vendor code.** `scripts/theme-components.ts` uses regex bracket
  matching to inject `useTheme().classes(...)` into 133 vendor files.
  - Code judo: emit the theme files as `[data-theme=x] [data-slot=y] { @apply … }` CSS. The
    injection, `useTheme`, the slot typegen and the rewriter all go.
  - At minimum, rewrite the script on `svelte/compiler`'s `parse` with `magic-string`.
- **Print CSS** that hides the shell is pasted 5 times with drifting selectors. Fix: `print:hidden`
  on the shells, once.

## 12. Smaller cross-cutting items

- **`canManage: isManager(currentTenant().roles)`** is appended to 16 data queries, although the
  client already has the roles from `getCurrentTenant()`. Fix: a client-side `canManage()`.
- **Four places build a system tenant from an organization**: `loadTenant`, `runDaily`,
  `systemTenantOf` and `integrationTenant`.
  - Only `loadTenant` loads `orderTypes`, so jobs, simulations and integrations see the default
    order-type names. This is a latent label inconsistency; that only `session.ts` loads them is
    verified.
  - Fix: `tenantOf(organizationId)`.
  - Tenancy also imports orders' type settings, which is a layering leak.
- **Refresh is done three ways:**
  - `live()` + `refreshOnChange`;
  - manual `.refresh()` lists (energy setup, checklists, condition);
  - `orders.committed` hooks that import `*.remote.ts` into `server/`.

  Fix: make live-by-subject the default.

- **Formatters are duplicated or misplaced.**
  - `formatRate` is defined twice with different units (percent vs basis points).
  - `formatEuros`, `formatDuration` and `onOff` exist ×3 per module, each with its own On/Off
    messages.
  - Per-file `dateFormatter({...})` options.
  - Fix: named formats in `#lib/i18n/format.ts`.
- **Schemas.**
  - About 15 hand-built bounded-number pipes.
  - 4 hand-rolled `id` schemas although `id()` exists.
  - 3 hand-rolled email schemas although `email()` exists.
  - `isTimeZone` duplicated.
  - Fix: `wholeIn()`, `numberIn()`, `year()` and `hiddenInt()` in `#lib/schema.ts`.
- **`(xs as readonly T[]).includes(x)`** appears about 11 times. Fix: an `isOneOf()` type guard.
- **Line items.** `withoutValue()` is copied 4 times and the keyed-row state 3 times. Fix:
  `lineItems()` in `#lib/components/form/`.
- **Commands.** 8 copies of `try { await cmd() } catch { toast.error(errorMessage(...)) }`. Fix:
  `ran()` beside `submitted()`, with `errorMessage` moved into `#lib/errors/`.
- **Extensions.** Contributions load three ways (async `$derived`, an `$effect` with a stale flag, a
  plain function). Fix: one `loadContributions()`.
- **The module generator** parses `module.ts` and `extensions.ts` with regexes, although
  `routes.ts` already uses the oxc AST. Each contribution kind is also listed in 4 places. Fix:
  one `contributionKinds` table.
- **Layering and leftovers.**
  - `routes/splash.ts` is imported by both hooks files (an inversion; it belongs in `lib`).
  - Generic list code holds `customer-facet.ts`.
  - `scripts/docks-simulator.ts` duplicates `docks/server/scenario.ts`.
  - Vercel leftovers remain in `better-auth.ts`, `prepare.ts` and `jobs/daily.ts`.
- **Condition's activity feed** (about 300 lines over 3 tables) re-derives history that
  `recordActivity` already holds.
- **Energy files.**
  - `energy/server/setup.ts` (666 lines) writes the same child CRUD 4 times; target about 380
    lines.
  - `figures.ts` `sitesFigures` is 170 lines and recomputes every zone and door to show one.
- **Invoices vs credit notes.** They are two parallel stacks: two document components plus a third
  PDF layout copy, a status `changing()` ×2, and the list pipeline ×2.

## 13. runed and other third-party utilities

`runed` is in the tree only through bits-ui. Making it a direct dependency pays for itself:

- **`resource(…, { debounce })`:** replaces the two cancellable debounced searches
  (`record-filter.svelte:105`, `condition/detail/article-field.svelte:47`) and `preview-content`.
- **`useDebounce`:** replaces `asset-list` (search and URL write), `table-memory`,
  `checklist-draft` (keyed; it has `runScheduledNow`) and `sync-indicator`.
- **`IsIdle`:** replaces `routes/idle.ts`. Pass `wheel` and `pointerdown`, because runed listens
  on `window`.
- **`useIntersectionObserver`:** replaces asset-list's hand-made observer.
- **`useResizeObserver`:** replaces `settled-width.ts`.
- **`useSearchParams(schema)`:** fits energy's `?period`, `?scope`, `?from` and `?to`, and the
  portal orders tab.
- **`FiniteStateMachine`:** fits `lib/bug-reports/machine.ts`.
- **`PersistedState({ storage: "session" })`:** fits the `new-version` and `time-zone` flags, and
  the parts-shop cart, which is lost on navigation today.
- **In-repo duplicates with no runed needed:**
  - `phone-frame.svelte` and `changed-elsewhere.svelte` re-implement `Clock`.
  - Four Symbol-key context pairs should use Svelte's own `createContext()`, as `status-cell` does.
- **bits-ui:** `ToggleGroup` could underlie the chip and segment rows.

---

## Making the system enforce itself

Most findings are of one kind: a helper exists, but an agent or person didn't find it. So:

1. **A component and helper catalogue in AGENTS.md** (or `docs/agents/kit.md`). It lists, per
   recurring problem, the one way to solve it: dialog, confirm, list, detail page, settings, badge,
   lookup, removal, ordering, refusal, refresh, formatters, schemas.
2. **Specs that refuse the hand-written form,** as `parameters.spec` already does for `inArray`:
   - `and(eq(.id), inTenant())`;
   - `Dialog.Root` outside the kit;
   - `<Badge variant={display.tone}>`;
   - `max(position)`;
   - `canManage:` in a query;
   - `Temporal.Now.plainDateISO`.
3. **Codegen for what is a pure function of a folder or an enum array:** module `remote-functions`
   and module ids, enum label maps, `+page.ts` table memory, prop-less page stubs, the seed
   clearing order, and barrels.

## Suggested order

1. **Quick fixes:** the two missing `settings:` manifest entries, the settings-card gating, and
   `tenantOf()` with `orderTypes`.
2. **Dialogs** (finding 1). Every later refactor touches dialogs.
3. **The records server toolkit and the refusal convention** (findings 4 and 5).
4. **Module settings and integrations factories** (finding 3).
5. **Enum display plus labels codegen** (finding 6).
6. **Lists** (finding 2). It is the biggest piece; do it after 5, because columns use `column.enum`.
7. **Naming renames with migrations** (finding 7). These are mechanical but wide, so do them in one
   quiet window.
8. **The rest,** by payoff.
