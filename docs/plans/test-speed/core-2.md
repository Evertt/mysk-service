# e2e speed-up, core files part 2 (orders, views, members, portal, tenancy, i18n, splash, themes…)

Read-only research on `develop` (c576ef58). Nothing in the repo was changed. Ran two server specs
(`creation.spec.ts` and `sites.spec.ts`: 17 tests in 1.4 s, 6 % of that the tests themselves) and
timed a migrate plus seed of a scratch database (0.5 s + 2.1 s, 13.5 MB file).

**Durations** come from `e2e-durations.txt`. Some files appear twice there (orders.ranges
257.6/84.3, views 149.3/48.9, splash 57.1/38.4, orders.tenancy 59.2/48.7, without-modules
48.4/13.1, i18n 16.2/14.8). The first number is from the loaded run. The second looks like a retry
or a quieter run, about ⅓ of the first. Savings are given in seconds of the **first-listed (loaded)
run**. For steady state, take about ⅓ to ½ of them.

Classes: **keep** = keep-e2e, **srv** = to-server-spec, **cmp** = to-component-spec, **dup** =
duplicate, **low** = low-value, **merge** = fold into a neighbour.

## Can a server spec call a remote function, gate included, with a tampered id? Yes

No spec does this yet, but all three pieces already exist in the repo:

1. **`$app/server` stand-ins.** `remote-functions.spec.ts` mocks `query`/`form`/`command` (plus
   `.batch` and `.live`) as `(...args) => ({ type, args })`. The last arg is then the **gated**
   handler (`gated()` in `src/lib/server/remote-functions.ts`), so `handlerOf(getOrders)(arg)` runs
   the real gate, then the real handler.
2. **A fake request.** `sites.spec.ts`, `numbering.spec.ts`, `records.spec.ts`,
   `lists/bulk.spec.ts` and `lists/module-columns.spec.ts` mock
   `getRequestEvent: () => ({ locals })`. With `locals = { user, tenant }`, the gates run for real:
   `requireMember`, `requireManager`, `requireEngineer` (it looks up `engineer.userId`) and
   `requireCustomer`. `currentTenant()`, `inTenant()` and `idInTenant()` follow.
   `asSystem(tenant, …)` is enough for code that only needs a tenant, but not for the
   engineer/customer gates: those call `getRequestEvent()` directly.
3. **A real database.** `programme.spec.ts` mocks `#lib/server/db/index.ts` with a migrated temp
   database. For these tests it should be **a copy of the demo seed**. The tests compare against the
   seeded data (North 750 orders, South 320, SHLTR), and building it once costs 2.6 s. A server
   project `globalSetup` builds it (the first half of `src/tests/e2e/global-setup.ts`), and each spec
   file copies the 13.5 MB file in a few ms.

Things a shared helper (e.g. `#unit/remote-harness.ts`) must do itself:

- **Validate the argument.** SvelteKit does this, the stand-in doesn't, so the helper should run
  `v.parseAsync(schema, arg)` before the handler. For a malformed argument, a spec can check the
  schema directly instead.
- **Fake form plumbing.** Form handlers take `(data, issue)`. `invalid()` comes from
  `@sveltejs/kit` and throws, but the `issue` proxy has to be faked.
- **Read live queries.** `query.live` handlers are async generators: read the first yield. This
  covers `watchRecordChanges` and `watchMyWork`.
- **Keep module hooks real.** `priceOrders` and `tagOrders` read the generated module hooks.
- **members.remote.ts is the hard one.** It calls better-auth's `auth.api.*` with the session's
  headers. Its refusals that happen _before_ `auth.api` (`findMember`/`findInvitation` 404,
  own-role and last-owner rules, "already invited/member") can be spec'd. The `auth.api` effects
  stay e2e.

The gates themselves are already covered: `remote-functions.spec.ts` (every set, gate before
handler) and `auth/session.spec.ts` (engineers and customers refused by office functions, managers
only, module 404). So e2e checks like "a member/engineer gets a 403" are duplicates.

**Required coverage.** CLAUDE.md and docs/agents/tests.md want isolation in **every section's
tests**, written as e2e tamper tests (`app.expectingErrors`). Moving them needs a doc change.
Proposed: keep **one** e2e tamper per section, which proves the hidden-id/form-post wiring, and put
the rest in a `<section>.isolation.spec.ts` server spec that calls each remote function as South
with North's ids.

---

## orders.ranges: 257.6 s / 84.3 s, 17 tests (the longest e2e file of all, so it sets wall-clock time)

| test                                                                        | class | reason / target                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a preset from the Filter menu stays relative in the URL…                    | keep  | UI → URL → count. Fold 2, 5, 6 into it: one `afresh` load, the Filter menu used four ways                                                                                                                                                                                                             |
| days of one's own, from the Filter menu…                                    | merge | into the test above                                                                                                                                                                                                                                                                                   |
| a link combines ranges with the other filters…                              | srv   | `getOrders` on the seeded DB: `createdAt` range + status, open end, `..2100` excludes unscheduled (3 page loads)                                                                                                                                                                                      |
| a link's range that isn't one is ignored                                    | dup   | `list-definition.spec` "leaves out what isn't a range" plus `url-sync` "invalid parameters are ignored" (4 page loads)                                                                                                                                                                                |
| several values from the Filter menu…                                        | merge | fold the UI part into test 1; the `none` + `next-7-days` count → srv                                                                                                                                                                                                                                  |
| a preset as an end…                                                         | merge | UI part → test 1; the link part (`this-week..next-month`, `..yesterday,none`) → srv                                                                                                                                                                                                                   |
| totals in euros, as priced with the modules…                                | srv   | `getOrders` with `total` ranges on North (contracts adjust prices): over + under = all, with status. Keep only the "At least €500.00" pill in test 1. "Select all N matching" is a dup of the bulk-action-bar spec                                                                                    |
| a bulk action on all the loaded orders acts on those in range only          | dup   | `orders.bulk` "selecting all the loaded orders…" (same ids target), plus a srv check on `bulkAssignOrders`                                                                                                                                                                                            |
| a malformed range… is refused with a 400 ×8 (`test.each`, a page load each) | dup   | `list-definition.spec` "the query schema › refuses %s": token, wrong way round, no end, Feb 30, too many ranges. Add the 3 missing cases (`createdAt:[null]`, `total:[{from:12.5}]`, `total:["500.."]`) as `v.safeParse(ordersList.query, …)` there. One "schema is applied" e2e stays in orders.list |
| in South: count South's orders only                                         | srv   | South isolation of the range SQL: `getOrders` as South, rows and counts against SQL                                                                                                                                                                                                                   |

**Saves ~225 s** (one merged UI test of ~30 s remains); ~70 s steady state. orders.list then becomes
the longest of these files.

## orders.list: 177.8 s, 15 tests

| test                                                                      | class           | reason / target                                                                                                                                                            |
| ------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the list shows North's orders                                             | dup             | test 4 asserts the same `rowCount`                                                                                                                                         |
| a link with filters and sorting opens the list that way                   | keep            | thin: header sort numbers, the customer pill's name, Clear filters. The urgency ordering → srv `getOrders` sort `-priority,number`                                         |
| the rows scroll inside the table on desktop; on a phone, the page does    | keep            | layout/responsive                                                                                                                                                          |
| the server sends a page of rows at a time…                                | keep            | scroll-triggered paging, client and server together                                                                                                                        |
| malformed query, in the rows' query ×4                                    | dup ×3, keep ×1 | 3 dups of `list-definition.spec` (status `bogus`, `engineer:["1"]`, `pageSize`, unknown filter). Keep one as the suite's single "SvelteKit applies the query schema" proof |
| in the filters' counts                                                    | dup             | `list-definition.spec` "the where schema takes a search and filters, and nothing else"                                                                                     |
| while the list works as before once the request is right                  | low             | a page load to re-check test 1                                                                                                                                             |
| searching, filtering and sorting happen in the database                   | srv             | `getOrders` with `q` + status + sort, and `getOrderFacets` status counts, against the test's own SQL. The URL `q` part duplicates `url-sync.svelte.spec`                   |
| filtering by customer and engineer, finding them by searching the filters | keep            | filter-option search UI. The customer search (North only, ≤20, order) → srv on the options query                                                                           |
| unassigned orders and new installations…                                  | srv             | `getOrders` with `engineer:[null]`, `[null, id]`, `equipment:[null]`, and the facet count for "Unassigned". `columns.spec` covers the client side only                     |
| while another sorting loads, the rows shown stay, dimmed                  | cmp             | no component spec checks `aria-busy`/dimmed/progress bar: table harness in server-side mode with a held fake query                                                         |
| a link sorted otherwise shows loading until its rows are in               | keep            | navigation with held requests                                                                                                                                              |

Also: 6 tests end with a redundant `await app.go(afresh("/orders"))` (the next test starts with its
own `go`), ~2 s each. **Saves ~110 s.**

## views: 149.3 s / 48.9 s, 12 tests (two browsers: admin and planner)

| test                                                                    | class | reason / target                                                                                                                         |
| ----------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| saving the current view keeps its filters and sorting, not the position | keep  | the one smoke test: save → open from the menu → Back → update. The client part duplicates `saved-views.svelte.spec` and `views.spec`    |
| a name the user already has is refused                                  | srv   | `createView` `nameTaken` (case-insensitive)                                                                                             |
| opening a view restores its URL and rows…                               | merge | into the smoke test (dup of `saved-views.svelte.spec` "opening a view… new history entry")                                              |
| a view can be updated…                                                  | merge | into the smoke test; "with unsaved changes" is in the component spec                                                                    |
| a view can be renamed                                                   | srv   | `renameView`, already in the component spec                                                                                             |
| an owner shares a view…, logged                                         | srv   | `shareView` and `createView` (shared) log `shared`/`created`; a personal view logs nothing                                              |
| the planner sees the shared views…, can't change them                   | dup   | `saved-views.svelte.spec` "a view shared by someone else can't be changed by a member", plus srv `getTableViews` returning shared views |
| the planner's own views are theirs alone, can't share                   | srv   | `getTableViews` per user; `createView({shared:true})` as a member → 403                                                                 |
| planner can't delete a shared view by tampered id                       | srv   | `deleteView` → `findView(edit)` 403                                                                                                     |
| deleting asks first; a shared view's deletion is logged                 | srv   | `deleteView`/unshare logging. "Asks first" duplicates the component spec                                                                |
| in South: North's views don't show                                      | srv   | `getTableViews` as South                                                                                                                |
| North's views can't be renamed/updated/deleted by a tampered id         | srv   | `renameView`/`updateView`/`deleteView` as South with North's id → 404                                                                   |

Drops the planner's browser and sign-in. **Saves ~120 s** (~40 s steady state).

## views.memory: 83.5 s, 7 tests (two browsers)

| test                                                                     | class | reason / target                                                                                                            |
| ------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| a hidden column stays hidden after a reload                              | keep  | round trip to the server's memory                                                                                          |
| and on another device, but not for another user                          | srv   | memory is stored per user (`table-memory.remote.ts`); saves the planner's browser                                          |
| the list comes back as it was left, with the open view's unsaved changes | keep  | the real navigation restore. Logic is in `table-memory.svelte.spec`                                                        |
| a link with parameters wins                                              | merge | into the test above (dup of `table-memory.svelte.spec` "a link with other parameters keeps the columns, but not the view") |
| No view goes back to the defaults, and forgets the list                  | merge | same; "forgets them at its defaults" is in the component spec                                                              |
| South: North's memory doesn't come back                                  | srv   | memory is kept per organization                                                                                            |
| a North view can't be remembered as open by a tampered id                | srv   | `rememberTable` with North's `viewId` as South → `view_id` null                                                            |

**Saves ~35 s.**

## members: 85.8 s, 16 tests

| test                                                             | class | reason / target                                                                                                                      |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| the members page lists the organization's people                 | keep  | thin                                                                                                                                 |
| an owner invites someone by email                                | keep  | better-auth `createInvitation` plus the mail outbox                                                                                  |
| inviting a member, or someone invited already, is refused        | srv   | `invite` validation, before `auth.api`                                                                                               |
| an invitation can be sent again, valid for longer                | keep  | better-auth resend                                                                                                                   |
| the invited person creates their account and joins…              | keep  | account creation, cookies, real form                                                                                                 |
| the owner sees them as a member…                                 | merge | into the next members-page step                                                                                                      |
| used, cancelled and made-up invitation links say so              | keep  | invite page states                                                                                                                   |
| an owner makes another member an owner                           | keep  | fold the demote step in                                                                                                              |
| nobody can change their own role, even with a tampered form      | srv   | `changeRole` refusal rule                                                                                                            |
| an owner demotes a member                                        | merge | into "makes another member an owner"                                                                                                 |
| an owner removes a member, who then can't work…                  | keep  | session effect in another browser                                                                                                    |
| the activity log has the invitations and changes…                | merge | the DB assertions cost nothing, keep them; drop the `/activity` page load (feed rendering is `activity.test`/`feed.spec`)            |
| a member can't invite, change roles or remove anyone             | srv   | gate dup (`forManagers` → `session.spec`), plus a planner browser and sign-in. The read-only UI could become a small component check |
| an existing user signs in to accept an invitation to another org | keep  | cross-page auth flow                                                                                                                 |
| the last owner can't be demoted or removed                       | srv   | last-owner rule                                                                                                                      |
| South's admins can't cancel/resend/change/remove North's         | srv   | `findInvitation`/`findMember` in the tenant → 404; 4 submits and 3 page loads                                                        |

**Saves ~33 s.** Member removal and invitations stay e2e because better-auth runs them.

## orders.types: 76.2 s, 11 tests

| test                                                             | class | reason / target                                                                                                                          |
| ---------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| finds the types from the settings…                               | keep  | page smoke                                                                                                                               |
| renames a type in both languages, and logs it                    | keep  | the dialog flow; it also sets up "Job". Storing and logging are dups of `orders/server/types.spec`                                       |
| refuses a name another type has                                  | dup   | `server/types.spec` "refuses a name another type has in that language"                                                                   |
| the list shows the name, filters by it…                          | keep  | display across pages                                                                                                                     |
| the form, an order's page and the schedule show it               | merge | into the test above (labels are in `orders/types.spec`); drop the schedule load                                                          |
| hides a type from the order form; an order that has it keeps it  | merge | do the hide in the same dialog save as the rename. Offering rules are dups of `orders/types.spec` "the types the order form offers"      |
| the server refuses a hidden type for an order that hasn't got it | srv   | order save (`order.remote.ts`) with a hidden type ≠ the order's own → issue                                                              |
| can't hide a type a module that's on needs                       | dup   | `server/types.spec` "refuses hiding a type a module that's on needs, saying which"                                                       |
| a member… can't reach the page, nor change them                  | srv   | gate dup plus page 403. Costs `clearCookies` and a planner sign-in                                                                       |
| South keeps the standard names…, sets up its own                 | dup   | `server/types.spec` "keeps to the tenant…" and "leaves no row once it's back to standard". Costs a re-sign-in and an organization switch |
| North, afterwards, puts its types back                           | keep  | cleanup for other files on the lane                                                                                                      |

**Saves ~45 s.**

## portal (engineer portal): 73.2 s, 15 tests (phone viewport)

| test                                                             | class   | reason / target                                                                                                                                      |
| ---------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| signing in lands on their own open work, by day…                 | keep    | thin. Grouping is `work.spec` `groupByDay`; "which orders" → srv `getMyWork`                                                                         |
| an order shows what's needed on site, tap-to-call                | keep    | render                                                                                                                                               |
| starting the job…, logging hours, a note                         | keep ×3 | the core story, no page loads in between                                                                                                             |
| completing needs the customer's signature                        | dup     | `work.spec` "signature is required"                                                                                                                  |
| completing needs the engineer's own signature too                | srv     | `completeWork` rule (cheap here, but a rule)                                                                                                         |
| completing with both drawn signatures stores the sign-off        | keep    | signature pad and real form                                                                                                                          |
| the office sees the sign-off on the order                        | keep    | merge with the next test's office part: one admin context instead of two                                                                             |
| the activity log has what they did…, on the office's page        | merge   | DB part free; the office page goes into the previous test's context                                                                                  |
| office pages send them to the portal (5 paths)                   | low     | 5 page loads; keep one path, the rule goes in the guard's unit spec                                                                                  |
| office remote functions refuse them with a 403                   | dup     | `auth/session.spec` "[engineers] are refused by the office's remote functions with a 403". Costs a second context, an admin sign-in and form capture |
| another engineer's order is a 404, by its page                   | srv     | `getMyOrder` as the engineer with another's number                                                                                                   |
| by the id in the forms of their own order (others / southern) ×2 | srv     | `addNote`/`logHours` with another engineer's and South's ids → 404, nothing changed (4 submits and 4 loads)                                          |

**Saves ~34 s.**

## orders.tenancy: 59.2 s / 48.7 s, 11 tests

| test                                                           | class | reason / target                                                                                                                    |
| -------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| switching organization shows South's orders                    | keep  | switch, then list and search                                                                                                       |
| the list never shows North's orders, whatever its filters say  | srv   | `getOrders` as South with North's customer code/engineer id → 0; shared code → South's rows                                        |
| the customer filter offers South's customers only              | srv   | the customer-options query as South                                                                                                |
| North's orders are a 404                                       | srv   | `getOrder(northOnly)` as South                                                                                                     |
| a number both have shows South's order                         | srv   | `getOrder(shared)` as South                                                                                                        |
| saving with the id of a North order is refused                 | keep  | the one real tampered form post for the section                                                                                    |
| North's customers and materials are rejected                   | srv   | the update path. `creation.spec` covers create ("refuses another tenant's customer, unit or engineer"); materials are the module's |
| deleting with the id of a North order is refused               | srv   | `deleteOrder` as South → 404                                                                                                       |
| a new order gets South's next number and South's prices        | dup   | `creation.spec` "continues the tenant's numbers, not another tenant's"; stock is the materials module's                            |
| an order's total… the same on its page and in the list         | srv   | `getOrder` total = `getOrders` row total for the same order                                                                        |
| a bulk action with the ids of North's orders leaves them alone | dup   | `lists/bulk.spec` "doesn't find another tenant's records" (+ srv `bulkSetOrderStatus` in the isolation spec)                       |

**Saves ~48 s.** This file is the template for an `orders.isolation.spec.ts`.

## orders.row-actions: 42.0 s, 4 tests

| test                                                            | class | reason / target                                                                                                           |
| --------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| assigning an engineer to one order updates it alone and logs it | merge | into `orders.bulk.test.ts` (one file and sign-in fewer); `bulk-action-bar.svelte.spec` "on a single row…" covers the menu |
| an invoiced order's menu offers none of the actions…            | srv   | pure unit spec of the orders' bulk actions' `applies()` (`src/lib/orders/list/bulk-actions.ts`)                           |
| deleting an order from its row asks first                       | dup   | `bulk-action-bar.svelte.spec` "asks first, naming the row"; deletion and logging as in orders.bulk                        |
| a row's action with the id of South's order leaves it alone     | dup   | orders.tenancy "a bulk action with the ids of North's orders…" and `bulk.spec`                                            |

**Saves ~34 s** (the whole file but one folded test).

## orders.widths: 41.5 s, 4 tests (hard look)

| test                                                                       | class | reason / target                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| more rows as the table scrolls keep the columns' widths                    | cmp   | the client project is real Chromium: table harness with server-side fake pages. Caveat: widths depend on the app's CSS (`layout.css`/Tailwind), so the harness must load it, or keep this one as a 1-`loadMore` e2e smoke |
| the hidden rows are no rows                                                | cmp   | `aria-hidden`, `inert`, `offsetHeight` 0, row count: plain DOM, no server needed                                                                                                                                          |
| a filter lays the columns out again…                                       | cmp   | same harness; 6 `loadMore`s and 2 page loads here                                                                                                                                                                         |
| another organization's table never starts from the rows the first one kept | low   | two `switchOrganization` round trips (each reloads `/`) to test a storage key. Add the organization to `column-widths.spec` "widthContext changes with…"                                                                  |

The logic (`learn`, `hiddenRows`, `widthContext`) is already in `column-widths.spec`. **Saves
~35 s.**

## orders.inline: 40.8 s, 7 tests

| test                                                            | class | reason / target                                                                                                       |
| --------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| choosing another status changes the order and logs it           | keep  | core                                                                                                                  |
| it works with the keyboard, without moving the row's focus      | cmp   | new spec of the status-select cell (none exists; `status-badge.svelte.spec` is display only)                          |
| on a phone, a tap opens the statuses on the screen              | keep  | layout                                                                                                                |
| an invoiced order's status can't be changed, only filtered by   | cmp   | the status cell with `invoiced` renders the filter button only                                                        |
| a change the server refuses shows why, and the status goes back | srv   | `setOrderStatus` on an invoiced id → 400 + message; the revert → cmp                                                  |
| a status that can't be given by hand is refused with a 400      | srv   | `v.safeParse` of `setOrderStatus`'s schema with `invoiced` (cf. `order-schema.spec` "can't be made invoiced by hand") |
| South's order can't be changed by tampering with the id         | srv   | `setOrderStatus` as North with South's id → 404                                                                       |

**Saves ~26 s.**

## orders.units: 40.6 s, 7 tests

| test                                                                | class | reason / target                                                                                                                                                |
| ------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| is created with the units chosen, in their order                    | keep  | form unit chooser                                                                                                                                              |
| its page shows each unit… and the sites                             | keep  | render                                                                                                                                                         |
| editing takes a unit off and puts another on; the log names them    | keep  | form and log render                                                                                                                                            |
| the list shows its first unit and how many more, finds it by any    | srv   | `getOrders` with `q` = second unit's serial and `equipment:[serial]` (`unitsText`/`withUnitIn`). Saves a `loadAllRows` scroll-through plus a trailing `afresh` |
| it's in the service history of each unit, at its share of the cost  | srv   | the equipment timeline query's share                                                                                                                           |
| the engineer… sees all its units and their sites' access notes      | srv   | `getMyOrder` returns 3 units and their sites. Saves a new context and an engineer sign-in; rendering is in `portal.test`                                       |
| a unit of another customer or of South can't be put on it, tampered | srv   | edit path (`setOrderUnits`/update); create is a dup of `creation.spec`                                                                                         |

**Saves ~25 s.**

## orders.bulk: 39.5 s, 5 tests

| test                                                               | class | reason / target                                                                                                        |
| ------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| assigning the selected orders an engineer updates them and logs it | keep  | the core selection → dialog → toast → refreshed rows flow (+ row-actions' test folded in)                              |
| changing the status skips an invoiced order, and says why          | srv   | `bulkSetOrderStatus` skip rule + reason (generic skipping in `bulk.spec`; the bar's display in the component spec)     |
| deleting the selected orders asks first, then deletes and logs     | srv   | `bulkDeleteOrders` logs `deleted`, stock stays balanced; "asks first" is in the component spec                         |
| selecting all the loaded orders acts on exactly the filtered ones  | srv   | `bulkAssignOrders` with the ids target touches exactly those (South untouched); select-all UI is in the component spec |
| a bulk action with a malformed target is refused with a 400        | dup   | `bulk.spec` "targets… are refused when malformed"                                                                      |

**Saves ~28 s.**

## orders.live: 36.3 s, 6 tests (two browsers)

| test                                                                                          | class   | reason / target                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| edit form says when someone else changed it…; reloading…; own changes…; own page and deletion | keep ×4 | live updates across sessions, the point of the file                                                                                       |
| a customer's edit form says when someone else changed it                                      | srv     | same `<ChangedElsewhere>` mechanism; what's customer-specific is that saving a customer announces to `watchRecordChanges("customer", id)` |
| watching another tenant's record is refused                                                   | srv     | the `watchRecordChanges` live handler with South's id → 404 (read the first yield)                                                        |

**Saves ~12 s.**

## orders.click-filter: 32.5 s, 4 tests

| test                                                             | class | reason / target                                                                   |
| ---------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- |
| clicking an order's type filters by it…                          | keep  | real columns                                                                      |
| clicking an order's priority filters by it…                      | merge | same code path (the loop's second run); `cell-filter.svelte.spec` covers toggling |
| clicking the status badge filters…, its arrow opens the statuses | keep  | the orders-specific split button                                                  |
| the customer stays a link                                        | dup   | `cell-filter.svelte.spec` "…a link stays a link"                                  |

**Saves ~16 s.**

## orders: 29.1 s, 12 tests

| test                                                                                                                                                                                                                                 | class   | reason / target                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------- |
| creating validates first; changing the customer clears the units; category puts fitting engineers first; new order gets the next number; its page shows the site; editing saves; scheduled time and day; invoiced has no edit/delete | keep ×8 | form story, mostly without page loads                               |
| isn't a status to choose in the form                                                                                                                                                                                                 | dup     | `order-schema.spec` "can't be made invoiced by hand" + form options |
| can't be chosen through a tampered form                                                                                                                                                                                              | dup     | the same schema                                                     |
| saving another order's form with its id is refused (invoiced)                                                                                                                                                                        | srv     | the order update handler refuses an invoiced id                     |
| deleting another order with its id is refused (invoiced)                                                                                                                                                                             | srv     | `deleteOrder` refuses invoiced                                      |

**Saves ~8 s.**

## orders.scroll: 28.4 s, 4 tests

| test                                                              | class | reason / target                                                                                                       |
| ----------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| the position goes into the URL as the rows scroll…                | keep  | scroll and URL                                                                                                        |
| a link with a position opens the list there…                      | keep  | scroll anchoring                                                                                                      |
| another sorting starts at the top                                 | dup   | `table.svelte.spec` "starts over with the first rows when the sorting changes" (add a `scrollTop`/`?row` check there) |
| the selection keeps to the rows loaded, and offers all that match | dup   | `bulk-action-bar.svelte.spec` "in a server-side table" tests                                                          |

**Saves ~14 s.**

## orders.i18n: 12.5 s, 4 tests

All 4 → **merge** into `i18n.test.ts`, which already has a Dutch, signed-in session. That saves a
browser launch and sign-in. **Saves ~3 s.**

## i18n: 16.2 s / 14.8 s, 9 tests

The 3 language-negotiation tests are fetch-only (~0.1 s each): keep. The 6 Dutch UI tests (switch
reload, validation, sign-in, formats, translated refusal, back to English): keep. Make the
translated refusal the only e2e of the "switch to an organization you're not in" tamper (see
tenancy). **Saves 0** (it receives orders.i18n).

## splash: 57.1 s / 38.4 s, 6 tests

| test                                                          | class | reason / target                                                                                                                                                                        |
| ------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the server's HTML has the splash, in the request's language   | keep  | make it fetch-only (it uses `app.go` for the HTML) and merge with the next                                                                                                             |
| the stylesheets don't hold up the first paint…                | merge | into the test above                                                                                                                                                                    |
| stops catching clicks once interactive, then goes             | keep  |                                                                                                                                                                                        |
| a client-side navigation shows no splash                      | keep  |                                                                                                                                                                                        |
| without JavaScript, it isn't shown                            | keep  |                                                                                                                                                                                        |
| on a slow connection and computer, it shows until interactive | low   | 4× CPU throttle at 1.5 Mbps, 45 s timeout, the slowest and flakiest under load. Gate it behind an env flag (like `skeletons.repro`) for a nightly/CI-only run, or lighten the throttle |

**Saves ~17 s.**

## themes: 68.1 s, 5 tests (68 s for 5 small tests suggests a loaded moment)

| test                                                             | class | reason / target                                                                               |
| ---------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| the theme and mode come from the cookies, rendered by the server | keep  | SSR `transformPageChunk`                                                                      |
| an unknown theme falls back to the default                       | dup   | `themes/index.spec` "a known theme is used, anything else falls back to the default (Lagoon)" |
| system mode follows the OS before the page is shown              | keep  | pre-paint script                                                                              |
| choosing a mode applies it and remembers it                      | keep  | merge the next test in: one page, both switchers, one reload                                  |
| choosing a theme keeps the mode, and remembers it                | merge | into the test above; picking is in `mode-switcher`/`theme-switcher` specs                     |

**Saves ~20 s.**

## tenancy: 48.8 s, 9 tests

| test                                                                  | class   | reason / target                                                                                                     |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| the admin starts in North…                                            | merge   | into the switch test                                                                                                |
| switching to South shows South's numbers, without its missing modules | keep    | real switch via the sidebar                                                                                         |
| the switch is remembered across page loads                            | keep    | cheap reload                                                                                                        |
| switching to an organization you're not a member of is refused        | srv     | the switch handler (non-member org → 403); the i18n test keeps the e2e of this tamper                               |
| the switcher works on a module's 404 page too                         | keep    | layout on the error page                                                                                            |
| an owner can enable a module…; and disable it again                   | keep ×2 | the sidebar follows without a reload; the DB/log asserts are free                                                   |
| a submission that switches nothing is refused                         | srv     | module toggle form validation                                                                                       |
| a member can't change modules                                         | srv     | gate dup (`forManagers`) plus `clearCookies` and a planner sign-in. The read-only hints → `module-card.svelte.spec` |

**Saves ~17 s.**

## shltr: 29.1 s, 7 tests

| test                                                            | class | reason / target                                                                                                             |
| --------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| works in SHLTR, which lists SHLTR's customers                   | keep  | sign-in lands in the third tenant                                                                                           |
| a customer's site shows its time slot and access notes…         | dup   | `seed/shltr.spec` "has the mockup's customers, with their sites' preferences"; site-row rendering is `customers.sites.test` |
| the schedule's month is SHLTR's orders, plenty of them          | dup   | `seed/shltr.spec` "the coming two weeks are planned…"; month rendering is the schedule module's e2e                         |
| the order types go by SHLTR's names, without damage on the form | dup   | seeded `orderTypeSettings` + `orders/types.spec`                                                                            |
| SHLTR's engineer lands on the portal, with Lev's work for today | dup   | `seed/shltr.spec` "its engineers have one to three jobs a day" + `portal.test`. Costs `clearCookies` and a sign-in          |
| in North: none of SHLTR's customers or units are there          | keep  | isolation of the third tenant                                                                                               |
| SHLTR isn't among the admin's organizations                     | merge | into the test above (same page)                                                                                             |

**Saves ~16 s.**

## without-modules: 48.4 s / 13.1 s, 4 tests

| test                                              | class | reason / target                                                                                                                                                                                                                |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| an owner switches every module off                | low   | the toggle UI is `tenancy.test`'s; one submit and wait per module. A single command or `fixture()` would do, but docs/tests.md says changes go through the UI and South's modules are read elsewhere, so this needs a decision |
| the sidebar has none of them                      | merge | into the core-pages test (first page is `/`)                                                                                                                                                                                   |
| every core page works, without a part that failed | keep  | the point: 12 core pages render with no extensions                                                                                                                                                                             |
| switching them back on brings back what South had | low   | same as the first test                                                                                                                                                                                                         |

**Saves ~24 s** (~6 s steady state).

## time-zone: 10.3 s, 3 tests

All keep: the browser→cookie→reload and the list's day display. "A day in a date range…" is also in
`lists/plan.spec` "count a moment's day in the user's time zone", but cheap here. **Saves 0.**

## portal.frame: 8.2 s, 5 tests; portal.live: 14.3 s, 1 test

All keep: phone-frame layout and overlays, sign-out, live updates. **Saves 0.**

## skeletons.repro: not run (describe.skipIf without `REPRO_SKELETONS`)

| test                                 | class              | reason / target                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| stays responsive (CPU 6×, 50 rounds) | low (in the suite) | a repro tool, not a test. Every e2e run still collects the file (worker start, imports, `inject("lanes")`). Move it out of the e2e include glob (e.g. include it only when `REPRO_SKELETONS` is set, or a `src/tests/repro/` folder) |

**Saves ~1–2 s** of lane time, and clutter.

---

## Summary

### Totals over these 28 files (211 tests, 1,606 s in the loaded run)

| class             | tests |
| ----------------- | ----- |
| keep-e2e          | 86    |
| to-server-spec    | 52    |
| duplicate         | 36    |
| merge             | 24    |
| low-value         | 7     |
| to-component-spec | 6     |

**Estimated saving: ~945 s of the 1,606 s (≈ 59 %) of these files' lane time** in the loaded run,
about 300–450 s steady state. Wall-clock: orders.ranges (257 s), orders.list (178 s) and views
(149 s) are three of the four longest e2e files. After the changes the longest of these files drops
to ~70 s, so `materials.test.ts` (214 s, not in this set) and `equipment.list.test.ts` (174 s) set
the e2e wall clock.

### Top 10 conversions by seconds saved per hour of work (loaded-run seconds)

| #   | change                                                                                                                                                    | work  | saves                                                       | s/h     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------- | ------- |
| 1   | orders.ranges: delete the 8 malformed-range `test.each` + "a link's range that isn't one" (dups of `list-definition.spec`); add the 3 missing cases there | 0.5 h | ~135 s                                                      | ~270    |
| 2   | orders.list: shrink the malformed-query block to one case; delete "the list shows North's orders" and "works as before"                                   | 0.3 h | ~80 s                                                       | ~265    |
| 3   | orders.types: delete the dups "refuses a name", "can't hide a needed type", "South keeps standard names" (re-sign-in + switch)                            | 0.3 h | ~25 s                                                       | ~80     |
| 4   | splash: gate "on a slow connection and computer" behind an env flag / nightly                                                                             | 0.2 h | ~15 s                                                       | ~75     |
| 5   | themes: delete the fallback dup, merge the two switcher tests                                                                                             | 0.3 h | ~20 s                                                       | ~65     |
| 6   | shltr: delete the 4 tests that re-check the seed (`seed/shltr.spec`)                                                                                      | 0.3 h | ~16 s                                                       | ~55     |
| 7   | orders.click-filter: one column instead of the `type`/`priority` loop; delete the link dup                                                                | 0.3 h | ~16 s                                                       | ~55     |
| 8   | Drop trailing `app.go(afresh(…))` cleanups (orders.list 6, orders.ranges 2, orders.units 1)                                                               | 0.3 h | ~15 s                                                       | ~50     |
| 9   | Sign in once per lane and user in `global-setup.ts` (save `storageState`; `useApp` and mid-file `signIn` load it). `auth.test` keeps the real login form  | 2 h   | ~100 s here (41 sign-ins, ~2–3 s each), ~3× that suite-wide | ~50–150 |
| 10  | orders.row-actions: fold its one real test into orders.bulk, delete the 2 dups, unit-spec the orders' bulk actions' `applies()`                           | 1 h   | ~34 s                                                       | ~34     |

**Largest absolute savings, after a one-off ~3 h for the shared harness** (seeded-DB copy, fake
`locals`, `$app/server` stand-ins with schema validation):

- views → `views.remote.ts` spec: +2 h, ~120 s.
- orders.ranges/orders.list counts → a `getOrders`/`getOrderFacets` spec on the seeded DB: +3 h,
  ~150 s.
- orders.tenancy → `orders.isolation.spec.ts`: +2 h, ~48 s.
- views.memory, portal, orders.inline, orders.bulk and orders.units isolation/rule tests: ~1–1.5 h
  each, 25–35 s each.

### Patterns

- **Malformed-request tests are full page loads per case.** That is 13 tests in orders.ranges and
  orders.list, each `go(afresh)`, tamper, scroll, `expectingErrors`. The schema is already tested
  exhaustively by `list-definition.spec` and `bulk.spec`. One e2e in the whole suite is enough to
  prove SvelteKit applies a remote query's schema.
- **Every tenancy check runs through a tampered DOM.** Hidden-id DOM edits or `tamperWithCommand`,
  then a submit, a 500 ms `quiet()` and a page reload to check. That's orders.tenancy, views,
  views.memory, members, portal, orders.inline, orders.live, orders.row-actions and orders.units.
  One server spec per section (`<section>.isolation.spec.ts`) can call every remote function as
  South with North's ids in milliseconds. Keep one e2e tamper per section; this needs a docs/tests.md
  (and CLAUDE.md "Tenancy") change.
- **Role checks cost a sign-in, and duplicate `session.spec`/`remote-functions.spec`.** "A
  member/planner/engineer can't…" means `clearCookies()` + `signIn`, a second `useApp`, or a
  `signedInPage`. That's orders.types ×2, tenancy, members, portal ×3, views, views.memory,
  orders.live, orders.units and shltr ×2. Where the gate is the point, it's already a duplicate.
- **Sign-in per file through the UI.** Each `useApp` loads `/login`, hydrates, submits and waits for
  `quiet()` (≥500 ms idle). With 31 `useApp` and ~10 extra sign-ins in these files, a
  `storageState` per lane and user from `global-setup.ts` saves 2–3 s each.
- **Fixed `quiet()` costs.** `submit()`, `signIn()`, `switchOrganization()` and `expectingErrors()`
  always wait for 500 ms of network silence. These files have ~45 submits, ~15 organization switches
  and dozens of `expectingErrors`, so ≥30 s of pure idle. `go()` races `hydrated` against `quiet`,
  so it is cheaper. `switchOrganization` reloads the whole app at `/`, and orders.types, tenancy and
  orders.widths do it twice or more.
- **`go()` to the current URL is two navigations** (`about:blank` first), and many tests end with a
  cleanup `go(afresh(…))` the next test repeats.
- **Seed re-checks.** shltr.test asserts what `seed/shltr.spec` already pins down.
- **Merges inside a file.** Filter-menu tests (orders.ranges 1/2/5/6), view-menu tests (views
  1/3/4), table-memory tests (views.memory 3/4/5), theme switchers, and orders.i18n into i18n. Each
  merge saves a fresh load, and a merged file saves a browser launch and sign-in.
