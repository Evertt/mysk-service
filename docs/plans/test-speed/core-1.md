# Core e2e, part 1: activity, auth, client, customers, dashboard, engineers, equipment

25 files, 267 tests, **1,313 s** of file time in the recorded run (inflated by load; the relative
sizes hold). Estimated saving if everything below is done: **~665 s (about half)**, with each
section keeping a thin e2e smoke and its isolation smokes.

Savings are file-seconds as measured. Wall-clock time is set by the slowest lane, so the big files
count double: equipment.list (174 s → ~88), auth.view-as (138 → ~73), customers (110 → ~40) and
engineers (107 → ~44).

## What the cheaper layers can already do (checked)

- **Server specs on a tenant.** `src/tests/unit/lib/equipment/server/categories.spec.ts`,
  `customers/server/sites.spec.ts`, `orders/server/acceptance.spec.ts` and `equipment/server/locations.spec.ts`
  each migrate a temporary libsql database, insert a small North/South fixture, and run the server
  functions as a tenant, through `getRequestEvent: () => ({ locals })` or `asSystem(tenant, …)`
  (`north(() => …)` in the module specs). The three specs I ran together took **1.37 s for 29
  tests**, about 0.05 s a test. An e2e test here costs about 4.9 s.
- **A remote function's handler, gate included, can be called without HTTP.**
  `remote-functions.spec.ts` mocks `$app/server` so that `query`/`form`/`command` hand back what
  they were made with, and `handlerOf(made)(arg)` runs **gate + handler**. With `requireMember`
  reading `locals`, a spec can call `handlerOf(updateEquipment)({ id: northId, … }, fakeIssue)` as
  South and expect a 404, which is the tamper the e2e tests do through the DOM. Some care is needed:
  - SvelteKit's schema parse and form-field binding are skipped. Validate with the schema
    separately (`v.parse(equipmentList.query, …)` is covered in `list-definition.spec.ts`).
  - The stand-ins must also be callable as `getX(arg).refresh()`, because handlers refresh queries.
  - Catch `redirect()` with `isRedirect`.
  - `issue` is a Proxy, `field => message => ({ message, path: [field] })`, the same as `forms.spec.ts`.
- **No shared harness yet.** Every spec hand-rolls its migrated database and fixture (about 40
  lines each). A shared `#unit/lib/server/remote-harness.ts` (temporary database + two-tenant
  fixture + `$app/server` stand-ins + `as(tenant, user)` + fake `issue`) is the one investment that
  makes the to-server-spec conversions about 20 minutes each. Estimate 3–4 h.
- **Component specs (browser, no server) already cover much of what the list tests click.**
  `data-table/`:
  - grouping.svelte.spec (collapse, expand, all, keyboard, groups continuing past the loaded rows)
  - cell-filter.svelte.spec (click a value to filter, again to stop; the city into search)
  - density.svelte.spec (compact, cookie, SSR)
  - row-navigation.svelte.spec (arrows, Enter)
  - table.svelte.spec (sort, column visibility, faceted filters, pills, Reset)
  - bulk-action-bar.svelte.spec (incl. a row's menu)
  - filter-chips and toolbar-band
  - `form/delete-dialog` ("shows why the server refused")
- **Existing server specs that already cover e2e assertions:**
  - `categories.spec`: add, case-insensitive duplicate, rename, move, delete refused or allowed,
    another tenant's is a 404
  - `sites.spec`: create, update, remove, the refusals, another tenant's site or customer is a 404
  - `locations.spec`: last at site, token, logged, names unique in any case, in-use refusal,
    another tenant's ids, the location must be at the unit's site, QR destinations, another
    tenant's QR
  - `acceptance.spec`: quote, scheduled with an engineer, plan problems, reject with reason
  - `session.spec`: contacts and engineers get a 403 from the office's remotes
  - `demo-accounts.spec`: every bogus role refused
  - `plan.spec` and `bulk.spec`: paging, sorting, filters, search, ranges, grouping counts, other
    tenants' rows never returned, malformed targets
  - `list-definition.spec`: the query schema rejects unknown filters, wrong types and page sizes
    out of range
  - `service-history.spec`: timeline and stats
  - `feed.spec`: entries, links, parents, Dutch
  - `dashboard-charts.spec`, `masonry.spec`, `numbering.spec`

Classes: **keep** = keep-e2e, **server** = to-server-spec, **comp** = to-component-spec, **dup**
= duplicate, **low** = low-value, **merge** = fold into a neighbour. "Save" is the e2e seconds
removed (estimated from the file time per test, weighted by what each test does).

---

## activity.live.test.ts: 14.6 s, 2 tests, save ~0 s

| Test                                                     | Class | Reason / target                       |
| -------------------------------------------------------- | ----- | ------------------------------------- |
| first page shows another user's change without reloading | keep  | live query (`watchActivity`)          |
| a page past the first keeps its entries, counts new ones | keep  | live notice and "Show new" navigation |

## activity.test.ts: 67.5 s, 14 tests, save ~45 s

| Test                                                                          | Class                  | Reason / target                                                                                                                                               |
| ----------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| editing a customer logs the changed field; refused or empty save logs nothing | server (thin keep)     | `updateCustomer` handler: diff logged, nothing on refusal or no change (`log.spec` has "nothing if none changed"). Keep one UI save as setup for the feed     |
| the customer's page shows it on its Activity card                             | merge                  | into the test above (same page after the redirect)                                                                                                            |
| changing an order's status logs it, and its lines against it                  | server                 | `updateOrder` logs the `order` and the `order_line` with its parent; the rendering is in `feed.spec` "links a part to its parent". Two order edits, about 8 s |
| a change refused for want of stock logs nothing                               | server                 | `updateOrder` stock refusal; rollback is in `log.spec`                                                                                                        |
| receiving stock logs the new stock and the note                               | keep (+server)         | the card refreshing after a command is the e2e part; the log entry goes to a materials spec                                                                   |
| the feed shows changes newest first, with links                               | keep (thin)            | the one feed-page smoke; links are in `feed.spec` (`present`)                                                                                                 |
| the feed filters by record type, user and date                                | server (+keep 1 click) | `getActivity` type/user/from/to filtering; keep one Filter click to the URL                                                                                   |
| the feed of one record has it and its parts                                   | server                 | `getActivity({type,id})` takes the parent rows                                                                                                                |
| the dashboard shows the latest changes                                        | dup/low                | dashboard.live checks the recent entries; `getRecentActivity` limit 8 goes to a spec                                                                          |
| South: switching shows none of North's activity                               | server                 | `getActivity`/`getRecentActivity` as South (isolation)                                                                                                        |
| South creates and deletes a customer; the deleted one doesn't link            | dup                    | `records.spec` deleteAndLog, `feed.spec` "knows a subject is gone"; customers.test does the same UI flow. About 8 s of form filling                           |
| North's records' activity can't be loaded by their ids                        | server                 | `getActivity`/`getSubjectActivity` with North ids as South gives nothing (isolation, required)                                                                |
| the feed reads in Dutch                                                       | dup                    | `feed.spec` "reads in the language of the request", `subjects.spec` Dutch                                                                                     |
| switching back to English                                                     | low                    | cleanup only; goes with the one above                                                                                                                         |

## auth.demo.test.ts: 17.3 s, 11 tests, save ~7.5 s

| Test                                     | Class         | Reason / target                                                                                                                                                         |
| ---------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| login page has the demo buttons          | keep          | cheap; captures the form action                                                                                                                                         |
| Admin signs in as SHLTR's owner          | keep          | real session cookie                                                                                                                                                     |
| its session signs out                    | keep          |                                                                                                                                                                         |
| Engineer signs in as Lev                 | keep          |                                                                                                                                                                         |
| Customer signs in as Riedel's contact    | keep          |                                                                                                                                                                         |
| works without JavaScript                 | keep          | real form post (fetch, cheap)                                                                                                                                           |
| anything but a demo role is refused      | dup (cheap)   | role parsing in `demo-accounts.spec`; the HTTP 400 path is cheap, keep or move to `demoSignIn` handler spec                                                             |
| an email posted with the role is ignored | keep          | SvelteKit field binding                                                                                                                                                 |
| a post from another site is refused      | keep          | CSRF config, cheap                                                                                                                                                      |
| without DEMO_SIGN_IN: no demo buttons    | server + comp | `vi.mock("$app/env/private",{DEMO_SIGN_IN:false})`: `demoSignInEnabled` is false; login page component without the buttons. **Removes this file's second server start** |
| without DEMO_SIGN_IN: demo form is a 404 | server        | `demoSignIn` handler gives a 404 with the flag off                                                                                                                      |

## auth.test.ts: 23.2 s, 11 tests, save ~2 s

| Test                                                | Class              | Reason / target                                                                                                                                                                     |
| --------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pages redirect to login, remembering where to       | keep               | hooks and redirect                                                                                                                                                                  |
| remote functions answer 401                         | dup (keep cheaper) | 401 is in `session.spec`; the e2e checks the wiring but signs in a whole tab to learn one remote URL. Read the URL from the build's manifest or a signed-out page's requests (~2 s) |
| better-auth's organization endpoints aren't exposed | keep               | fetch, cheap                                                                                                                                                                        |
| signing up is disabled                              | keep               | fetch, cheap                                                                                                                                                                        |
| empty form shows what's missing                     | keep               | cheap                                                                                                                                                                               |
| wrong password refused                              | keep               |                                                                                                                                                                                     |
| right password goes where you were going            | keep               |                                                                                                                                                                                     |
| login page sends signed-in users to the dashboard   | keep               |                                                                                                                                                                                     |
| signing out ends the session                        | keep               |                                                                                                                                                                                     |
| a redirect to another site is ignored               | keep               | cheap                                                                                                                                                                               |
| works without JavaScript                            | keep               |                                                                                                                                                                                     |

## auth.view-as.test.ts: 138.1 s, 16 tests, save ~65 s

| Test                                                     | Class         | Reason / target                                                                                                                               |
| -------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| office menu has View as above Sign out, Admin checked    | keep          | captures the action; could be a component spec, but it's cheap                                                                                |
| office → engineer portal                                 | keep          |                                                                                                                                               |
| engineer portal in the phone frame → customer portal     | keep          | the menu painted inside the phone screen (layout)                                                                                             |
| customer portal → office                                 | keep          |                                                                                                                                               |
| office → customer portal                                 | low           | same office form as office → engineer portal, only the target differs; the targets are in `demo-accounts.spec`. About 8 s (heavy portal page) |
| customer portal → engineer portal                        | low           | same portal button as customer portal → office. About 8 s                                                                                     |
| engineer portal on a phone → office                      | keep          | phone overlays (`display: contents`)                                                                                                          |
| its current role only closes the menu                    | keep          |                                                                                                                                               |
| anything but a demo role is refused, the session stays   | dup (cheap)   | `demo-accounts.spec` plus SvelteKit's own checks; fetch only                                                                                  |
| signed out, the switch is a 404                          | keep (cheap)  | fetch; or `viewAs` handler spec without a user                                                                                                |
| North's admin has no View as, and a 404                  | keep (thin)   | keep one other-tenant smoke                                                                                                                   |
| North's engineer and customer have none in their portals | server + comp | `getViewAs`/`inDemo()` false for a North tenant; the portal header without the switch. Two UI sign-ins and two portal loads, about 12 s       |
| SHLTR's other people have it, nothing checked            | comp + server | `getViewAs` for Weggemans (in demo, no role); the checked state in a menu spec. About 7 s                                                     |
| without DEMO_SIGN_IN: office menu has no View as         | server + comp | flag mocked off: `getViewAs` null; the user menu without the switch                                                                           |
| without DEMO_SIGN_IN: nor have the portals               | server + comp | as the row above                                                                                                                              |
| without DEMO_SIGN_IN: the switch is a 404                | server        | `viewAs` gives a 404 with the flag off. **The block's server start plus 4 UI sign-ins, about 30 s**                                           |

## client.acceptance.test.ts: 63.5 s, 9 tests, save ~22 s

| Test                                                 | Class                | Reason / target                                                                                                                   |
| ---------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| counted on the sidebar's Orders and on the dashboard | keep                 | live badge                                                                                                                        |
| the dashboard's stat opens the orders list on them   | keep                 | navigation into a server filter                                                                                                   |
| off the planning board's backlog                     | server               | schedule module's backlog query excludes `awaiting_acceptance` (check the module's specs); `/schedule` is a heavy page, about 5 s |
| an awaiting order has no Edit                        | merge/comp           | same page as the next test; or the order header given the status                                                                  |
| accepting with an engineer and a day plans it        | keep (thin)          | dialog plus live badge 3 → 2; the logic is in `acceptance.spec`                                                                   |
| an engineer but no day asks for the day              | dup/server           | `acceptOrder` plan problems (`acceptance.spec` "answers what's wrong with the plan"); add the no-day case there                   |
| accepting without a plan makes it a quote            | dup                  | `acceptance.spec` "makes it a quote"                                                                                              |
| rejecting needs a reason, cancels with the reason    | keep (thin)          | sets up the portal check; the reason rule is schema plus `rejectOrder` spec                                                       |
| the customer sees the outcome in their portal        | keep (thin) + server | keep the Riedel check; move Weggemans' "Lev, not Hoekstra" to a `getPortalOrder` spec (saves a second `signedInPage`, about 5 s)  |

## client.access.test.ts: 46.4 s, 7 tests, save ~13 s

| Test                                                        | Class         | Reason / target                                                                                   |
| ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| an owner invites a contact for one of its sites             | keep          | real mail link flow                                                                               |
| inviting someone invited already, or a member, is refused   | server        | the portal-access invite handler's checks                                                         |
| the members page doesn't have contacts or their invitations | server        | `getMembers` leaves out customer-role rows                                                        |
| the contact creates their account and sees only their sites | keep          | invite acceptance, cookies; `atSites`                                                             |
| the office sees they have access; the log has it            | merge         | into the next customer-page visit; or `getPortalAccess` spec                                      |
| a member sees who has access but can't invite or revoke     | comp + server | card without buttons for a non-manager; the invite/revoke gate. Saves a `signedInPage`, about 5 s |
| revoking takes the access away, and logs it                 | keep          | the session consequence on the contact's next visit                                               |

## client.layout.test.ts: 19.4 s, 8 tests, save ~0 s

All **keep**: sidebar beside the page, bonus beside the wallet, orders as a table, cart beside the
catalogue, the sidebar folding, the phone sheet, nothing wider than the screen on 8 pages, signing
out. Layout and responsiveness are the e2e's job, and the file is cheap.

## client.tenancy.test.ts: 54.0 s, 8 tests, save ~35 s

| Test                                                          | Class           | Reason / target                                                                                                                                                |
| ------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| another customer's order, unit, location and work order pages | keep 1 + server | keep one page-404 smoke; spec `getPortalOrder`/`getPortalUnit`/`getPortalLocation` (and the checklists work order) as Riedel with Weggemans' ids               |
| their units' and locations' QR codes, and other tenants'      | server          | `resolveQrCode` with a customer viewer (`locations.spec` has the other-tenant case); `/portal/report?unit=` too                                                |
| a tampered query of their order                               | server          | `handlerOf(getPortalOrder)(victim)` as Riedel gives a 404, the tamper without the DOM; about 6 s                                                               |
| a report by a tampered unit id is refused, makes no order     | server          | `reportBreakdown` handler with the other customer's unit: issue, no order                                                                                      |
| office and engineer pages send them to the portal             | keep            | route guards, 6 navigations                                                                                                                                    |
| their remote functions refuse them with a 403                 | dup             | `session.spec` "customers' contacts are refused by the office's remote functions with a 403"; the wiring by a gate-kind spec. **2× `signedInPage`, about 8 s** |
| the portal isn't the office's                                 | keep (thin)     | keep the redirect; the 403 is a dup of `session.spec` (saves a `signedInPage`)                                                                                 |
| a contact of another tenant sees their own customer only      | server          | `getPortalMe`/`getPortalOrder` as North's contact; QR cross-tenant                                                                                             |

## client.test.ts: 22.1 s, 10 tests, save ~3 s

| Test                                                       | Class          | Reason / target                                        |
| ---------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| lands on their open orders, also reports not accepted yet  | keep (+server) | smoke; the open-orders set (`getPortalHome`) to a spec |
| units needing attention (condition)                        | keep           | cheap; the condition module's spec could own it        |
| a rejected report's page says why                          | keep           | cheap                                                  |
| the orders page: open, done or all                         | comp           | client-side tabs over `getPortalOrders`                |
| their equipment: sites, units, a unit's history            | keep (+server) | `getPortalSites` via `atSites` to a spec               |
| a done order shows its sign-off, checklists and work order | keep           | cross-module navigation                                |
| reporting makes a breakdown awaiting acceptance            | keep (thin)    | real post; logic in `acceptance.spec`                  |
| asks for the unit and what's wrong                         | dup            | schema validation                                      |
| a unit's QR code opens the report filled in                | keep           | redirect flow                                          |
| a location's QR code offers its units                      | keep           | cheap                                                  |

## customers.click-filter.test.ts: 10.0 s, 2 tests, save ~8 s

| Test                                            | Class | Reason / target                                                                                                                                                              |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clicking the country filters by it, again stops | dup   | `cell-filter.svelte.spec` "filters the column by it, into the URL, and clicking it again stops"                                                                              |
| clicking the city searches for it, again clears | dup   | `cell-filter.svelte.spec` "the city goes in the search box". Fold one assertion into customers.test's list test and drop the file (saves its browser launch and sign-in too) |

## customers.sites.test.ts: 31.2 s, 10 tests, save ~18 s

| Test                                                     | Class       | Reason / target                                                                      |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| a customer's page lists their sites, units, slots, notes | keep (thin) | rendering of what the server sent                                                    |
| adding a site validates it first, its time slot too      | dup         | `site-schema.spec` (both ends, end after start, what's missing)                      |
| a new site is the customer's, logged against them        | keep (thin) | one real dialog save; the logic is in `sites.spec` createSite                        |
| editing a site saves it; its card says what's urgent     | dup         | `sites.spec` updateSite (logs what changed)                                          |
| a site with equipment can't be deleted                   | dup         | `sites.spec` "refuses a site with equipment"; `delete-dialog` spec shows the refusal |
| deleting the site without equipment removes and logs it  | dup         | `sites.spec` removeSite                                                              |
| a South customer's page shows their own sites            | keep        | the organization switch the tamper smoke needs                                       |
| editing with the id of a North site is refused           | keep        | **the file's isolation smoke** (hidden id through the real form)                     |
| deleting with the id of a North site is refused          | dup         | `sites.spec` "another tenant's site is a 404"                                        |
| adding a site to a North customer by id is refused       | dup         | `sites.spec` "another tenant's customer is a 404"                                    |

## customers.test.ts: 110.2 s, 34 tests, save ~70 s

| Test                                                                | Class                | Reason / target                                                                                                 |
| ------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| the list shows exactly North's customers, more as it scrolls        | keep (thin) + server | keep 50 rendered, one scroll and the "End of the list"; drop the full-list compare (`getCustomers` tenant spec) |
| searching finds customers by code and phone                         | dup                  | customers `list/columns.spec` "finds customers by code, email, city and phone"; Reset is in `table.svelte.spec` |
| filtering by segment and country                                    | dup                  | `columns.spec` country filter, `table.svelte.spec` faceted filter                                               |
| filtering by a range of open orders, from the menu and a link       | comp + server        | client-side range filter (`ranges.spec`, `url-state.spec`); the open-orders count in `getCustomers` to a spec   |
| sorting by open orders puts the busiest first                       | comp + server        | table sorting is covered; the count goes to a spec                                                              |
| the column menu can show 'Customer since', not the search column    | dup                  | `table.svelte.spec` column visibility; assert hideable/searchable in `columns.spec`                             |
| compact rows are remembered after a reload                          | dup                  | `density.svelte.spec` (cookie, rendered compact from the cookie)                                                |
| the keyboard moves between rows, Enter opens one                    | dup                  | `row-navigation.svelte.spec`                                                                                    |
| the detail page shows equipment and orders                          | keep (thin)          |                                                                                                                 |
| deleting a customer with equipment and orders is refused            | server/dup           | `deleteCustomer` message (counts); `records.spec` "refuses with the message"; `delete-dialog` spec              |
| going back closes the delete dialog, forward opens it               | keep                 | history and shallow routing                                                                                     |
| its recent activity links to all its orders in the list             | keep                 | cross-page, server filter by customer, pill clearing                                                            |
| completing an order shows in recent activity                        | server               | `getCustomer` recent activity after a status change; the order edit costs about 5 s                             |
| revenue and costs equal the orders' pages less contracts            | server               | `getCustomer` revenue through the pricing code; the test re-implements pricing in `contracts-helpers.ts`        |
| the detail page fits a phone screen                                 | keep                 |                                                                                                                 |
| an unknown code is a 404                                            | merge                | with South's 404 test                                                                                           |
| creating a customer validates it first                              | keep (thin)          | one invalid submit; email and phone formats are in `customer-schema.spec`                                       |
| a new customer gets North's next code                               | keep                 | create flow; numbering is in `numbering.spec`                                                                   |
| editing it validates and saves                                      | keep (thin)          | drop the validation round                                                                                       |
| typed and unsaved comes back on back/reload, not on a new visit     | keep                 | form snapshot, bfcache                                                                                          |
| customers created at the same moment get consecutive codes          | server               | `createCustomer` ×8 with `Promise.all` on the spec database (`nextNumber` in a transaction)                     |
| South: switching shows exactly South's customers                    | keep (thin)          | keep the switch; drop the full scroll                                                                           |
| South: North's customers are a 404                                  | keep                 | cheap page-level isolation smoke                                                                                |
| South: the orders list doesn't show North customers' orders by code | server               | `getOrders` with a North code in South gives 0                                                                  |
| South: a code both have shows South's customer                      | server               | `getCustomer("CUST-0001")` in South                                                                             |
| South: saving with the id of a North customer is refused            | keep                 | **the section's tamper smoke**                                                                                  |
| South: deleting with the id of a North customer is refused          | server               | `deleteCustomer` handler with a North id gives a 404                                                            |
| South: a new customer gets South's next code                        | dup                  | `numbering.spec` "only counts the current tenant's records"; about 5 s of form filling                          |
| South: deleting it removes it, then a 404                           | merge                | delete North's created customer at the end of "in North" instead                                                |
| Dutch: the customers list is in Dutch                               | keep (merge)         | merge the Dutch tests into one smoke (i18n.test exists too)                                                     |
| Dutch: a customer's page, with the country's Dutch name             | low                  | `countries.spec`                                                                                                |
| Dutch: an equipment page is in Dutch                                | low                  | wrong file; messages are checked in `messages.spec`                                                             |
| Dutch: validation messages are in Dutch                             | low                  |                                                                                                                 |
| Dutch: switching back to English                                    | low                  | cleanup                                                                                                         |

## dashboard.live.test.ts: 14.1 s, 1 test, save 0 s

| Test                                          | Class | Reason / target                   |
| --------------------------------------------- | ----- | --------------------------------- |
| an open dashboard shows another user's change | keep  | live query, one refresh per burst |

## dashboard.test.ts: 51.5 s, 12 tests, save ~29 s

| Test                                                         | Class                | Reason / target                                                                                                   |
| ------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| greets the member by first name, for the time of day         | comp/merge           | greeting from name and hour; fold into the next test                                                              |
| the tiles compare with the period before                     | server               | `getDashboard` trends (7 days, 30 days revenue %)                                                                 |
| the charts show North's numbers                              | keep (thin) + server | one render smoke; the SQL behind `getCharts` to a spec (helpers in `dashboard-charts.spec`)                       |
| revenue priced like the tile, so the year ≥ the last 30 days | server               | `getDashboard` vs `getCharts` consistency                                                                         |
| charts hidden from assistive technology, a bar per status    | dup                  | `equipment-by-status-chart.svelte.spec`                                                                           |
| fit a phone's screen                                         | keep                 |                                                                                                                   |
| South sees its own numbers only                              | server               | `getCharts` as South (isolation); 2 org switches, about 6 s                                                       |
| cards pack into three columns, the modules' each on its own  | keep                 | layout with real slots                                                                                            |
| cards stack in one column on a phone                         | keep                 |                                                                                                                   |
| redraw at once when the window grows (Svelte bug)            | keep                 | regression for upstream bug 10                                                                                    |
| South's cards pack the same way                              | server/low           | which cards a tenant gets (its modules) to a spec; the layout duplicates the 3-column test. 2 switches, about 6 s |
| upcoming work shows the first unit and "+N"                  | server               | `getDashboard` upcoming units label; the order edit costs about 5 s                                               |

## engineers.inline.test.ts: 15.2 s, 5 tests, save ~11.5 s

| Test                                                       | Class       | Reason / target                                                        |
| ---------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| choosing Inactive marks them inactive and logs it          | keep (thin) | inline select into a command                                           |
| and back with the keyboard                                 | comp        | the status select's keyboard handling                                  |
| South's engineer can't be changed by tampering with the id | server      | `setEngineerActive` handler, North tenant with a South id, gives a 404 |
| clicking a specialty filters, again stops                  | dup         | `cell-filter.svelte.spec`                                              |
| clicking the status badge filters; its arrow changes it    | comp        | cell-filter plus inline select in one cell                             |

## engineers.test.ts: 106.6 s, 26 tests, save ~63 s

| Test                                                            | Class                | Reason / target                                                                                                                    |
| --------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| the list shows North's engineers by name                        | keep (thin)          | drop the full scroll (`getEngineers` tenant spec)                                                                                  |
| searching finds an engineer by email                            | dup                  | engineers `columns.spec` / table search                                                                                            |
| filtering by status shows the inactive ones                     | dup                  | `table.svelte.spec` faceted filter                                                                                                 |
| filtering by specialty and region combines                      | dup                  | `table.svelte.spec` "keeps rows with any…"                                                                                         |
| sorting by rate or open orders                                  | dup + server         | sorting covered; the open-orders count to a spec                                                                                   |
| grouping by specialty: counts, collapse, expand, keyboard       | dup                  | `grouping.svelte.spec` (collapse/expand one or all, keyboard Enter/Space); about 5 s                                               |
| unknown ids and South's engineers are a 404                     | keep                 | cheap page-level isolation                                                                                                         |
| an engineer's page shows open orders and recent work            | keep (thin)          |                                                                                                                                    |
| an engineer with orders can't be deleted                        | server               | `deleteEngineer` refusal message                                                                                                   |
| adding validates the form first (format, unique ignoring case)  | server (thin keep)   | `createEngineer` uniqueness (case-insensitive); schema in `engineer-schema.spec`                                                   |
| a new engineer is stored as entered                             | keep                 | create flow, rate in cents                                                                                                         |
| Active box: unticked → inactive                                 | merge                | the three Active tests (5 edits, 15–20 s) become one with untick plus untouched; `engineer-schema.spec` "unchecked means inactive" |
| Active box: ticked, stays when untouched                        | merge                |                                                                                                                                    |
| Active box: same for inactive                                   | merge                |                                                                                                                                    |
| a refused edit keeps the box as the user left it                | keep                 | form state after a server refusal                                                                                                  |
| an owner links and unlinks a member's account                   | keep (thin) + server | `getEngineerAccount` options (already-linked users left out) to a spec                                                             |
| an engineer added inactive is stored inactive, deletable        | low                  | inactive saving covered by the merged Active test; delete by the South test                                                        |
| selected engineers deactivated and activated together, logged   | keep (thin)          | the one bulk e2e; per-row logging to a `bulkSetEngineersActive` spec                                                               |
| deactivated from the row's menu, which then offers Activate     | comp                 | `bulk-action-bar.svelte.spec` "on a single row, from its menu"                                                                     |
| South: switching shows South's engineers                        | keep (thin)          | drop the full scroll                                                                                                               |
| South: North's engineers are a 404                              | dup                  | the 404 test above covers isolation the other way round                                                                            |
| South: South's engineers show                                   | low                  | trivial                                                                                                                            |
| South: saving with the id of a North engineer is refused        | keep                 | **the section's tamper smoke**                                                                                                     |
| South: deleting with the id of a North engineer is refused      | server               | `deleteEngineer` handler gives a 404                                                                                               |
| South: linking an account with a North engineer's id is refused | server               | the account handler gives a 404; South members only in the options                                                                 |
| email addresses are unique within South only                    | server               | `createEngineer` uniqueness per tenant; UI create plus delete about 6 s                                                            |

## equipment.categories.test.ts: 46.3 s, 11 tests, save ~29.5 s

| Test                                                        | Class       | Reason / target                                                                                                    |
| ----------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| finds them from the settings, in order with their equipment | keep (thin) | navigation from settings                                                                                           |
| adds one, last, with a name North lacks in any case         | keep (thin) | one UI add; the duplicate-name round is in `categories.spec`                                                       |
| renames it and takes its specialty away                     | dup         | `categories.spec` updateCategory                                                                                   |
| moves it up past the one before it                          | dup         | `categories.spec` moveCategory (incl. first up/last down)                                                          |
| the equipment form and list filter offer them in order      | server      | `getEquipmentFormOptions`/`getEquipmentFacets` order by position                                                   |
| deleting a category equipment has is refused                | dup         | `categories.spec` "refuses one that units have, saying how many"                                                   |
| deletes one that no equipment has                           | keep (thin) | one UI delete                                                                                                      |
| a member sees them but gets a 403 for the page and the post | keep        | page guard plus the real no-JS post                                                                                |
| a field engineer is sent to the portal                      | low         | route guard covered elsewhere; a UI sign-in, about 3 s                                                             |
| South sees its own categories only                          | dup         | `categories.spec` "lists the tenant's categories"; needs a re-sign-in and a switch                                 |
| South can't rename or delete North's by tampering           | dup         | `categories.spec` "another tenant's is a 404" (update, remove); equipment.tenancy keeps the section's tamper smoke |

## equipment.detail.test.ts: 19.1 s, 6 tests, save ~13.5 s

| Test                                                               | Class                | Reason / target                                                                                                    |
| ------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| service history newest first, engineer, materials, cost            | keep (thin) + server | order and stats are in `service-history.spec` (`buildTimeline`); `getServiceHistory` cost less contracts to a spec |
| the summary counts orders by type, cost, mean time between repairs | dup                  | `service-history.spec` serviceStats                                                                                |
| deleting a unit with orders is refused                             | server               | `removeEquipment` refusal                                                                                          |
| moving a unit with orders to another customer is refused           | server               | `checkUnit` move refusal (in `equipment.remote.ts`, not exported: via the handler or move it to `server/`)         |
| completing an order shows in the history and summary               | server/low           | `getServiceHistory` after a status change; the order edit costs about 4 s                                          |
| an unknown serial number is a 404                                  | keep                 | cheap                                                                                                              |

## equipment.list.test.ts: 173.9 s, 19 tests, save ~86 s

| Test                                                           | Class                | Reason / target                                                                                                                                                                                                |
| -------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the list shows exactly North's units, 50 at a time             | keep (thin) + server | `listedSerials()` scrolls through all of North's units; keep the 50 and the count. `plan.spec` "never returns another tenant's rows". About 15 s                                                               |
| on a laptop screen it fits, rows scroll under the header       | keep                 | layout                                                                                                                                                                                                         |
| searching finds a unit by serial, case-insensitively           | dup                  | `plan.spec` searching "in any case"                                                                                                                                                                            |
| filtering by category, status and manufacturer                 | dup                  | `plan.spec` filtering, equipment `columns.spec` filters; 3 resets, about 8 s                                                                                                                                   |
| the band counts the units; its chips set the category filter   | keep (thin) + server | chips wired to the URL and facets; the counts to a `getEquipmentFacets` spec; the chip UI in `filter-chips` spec                                                                                               |
| the band and chips fit a phone                                 | keep                 |                                                                                                                                                                                                                |
| sorting by warranty, and by open orders                        | dup + server         | `plan.spec` sorting; the open-orders column SQL to a spec                                                                                                                                                      |
| the server sends a page at a time as it scrolls                | keep                 | network paging                                                                                                                                                                                                 |
| malformed query 400 `filters.category: ["bogus"]`              | dup                  | `list-definition.spec` "the query schema rejects…" (each test loads the page afresh, about 5–6 s)                                                                                                              |
| malformed query 400 `filters.total`                            | dup                  | as the row above                                                                                                                                                                                               |
| malformed query 400 `filters.customer: [1]`                    | dup                  | as the row above                                                                                                                                                                                               |
| malformed query 400 `pageSize: 5000`                           | dup                  | "rejects page sizes out of range"                                                                                                                                                                              |
| malformed facets query 400                                     | dup                  | "the where schema takes a search and filters, and nothing else"                                                                                                                                                |
| the list works as before once the request is right             | low                  | sanity check after the tampering                                                                                                                                                                               |
| filtering by customer, found by searching the filter           | keep (thin)          | `getCustomerOptions` search in the filter                                                                                                                                                                      |
| grouped by category: counted whole, kept together as rows load | keep (thin) + dup    | it loads every operational row. `plan.spec` grouping (counts, the rows around the page) and `grouping.svelte.spec` (groups that go on past the loaded rows) cover it; keep a 2-page boundary check. About 15 s |
| a reload keeps it grouped, and it can be ungrouped             | dup/low              | `grouping.svelte.spec` "View menu groups … into the URL", `url-state.spec`                                                                                                                                     |
| selecting all loaded units acts on exactly the filtered ones   | keep                 | the one bulk e2e (checks every organization's rows)                                                                                                                                                            |
| a bulk action with a malformed target is a 400                 | dup                  | `bulk.spec` "targets are refused when malformed"                                                                                                                                                               |

## equipment.locations.test.ts: 50.7 s, 13 tests, save ~26 s

| Test                                                        | Class                | Reason / target                                                                                         |
| ----------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| the sites card lists each site's locations with their units | keep (thin)          |                                                                                                         |
| adding needs a name the site hasn't got yet                 | dup                  | `locations.spec` "each name once, whatever the case", `location-schema.spec`                            |
| a new location comes last, with a QR token, logged          | keep (thin)          | the one UI create; the logic is in `locations.spec`                                                     |
| renaming it saves it                                        | dup/low              | `editLocation`; a plain update                                                                          |
| a location with units can't be deleted                      | dup                  | `locations.spec` "one with units can't be deleted"                                                      |
| a location's page shows its units, orders and QR code       | keep                 | page render, QR svg                                                                                     |
| the equipment form picks the location among its site's      | keep (thin) + server | form behaviour; list by location / search in `columns.spec` and a `getEquipmentList` spec               |
| a site's label sheet has a QR code per location and unit    | keep                 | drawn QR codes                                                                                          |
| a unit's page prints its own label                          | keep                 | cheap                                                                                                   |
| deleting the location without units removes and logs it     | keep (thin)          | UI delete, cleanup                                                                                      |
| South: North's locations and label sheets are a 404         | server               | `getLocation`/`getLabelSheet` in South gives a 404                                                      |
| South: renaming with a North location's id is refused       | dup                  | `locations.spec` "another tenant's sites and locations are a 404, also by their ids"                    |
| South: a unit can't be put at a North location              | dup                  | `locations.spec` "a unit's location must be at its own site". With the South block gone, so is a switch |

## equipment.qr.test.ts: 51.9 s, 6 tests, save ~20.5 s

| Test                                                  | Class       | Reason / target                                                                                               |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| leads someone of the office to its page               | keep        | the `/q/` route redirect (destinations in `locations.spec`)                                                   |
| an unknown one is a 404                               | dup (cheap) | `locations.spec` "not one that isn't a token"                                                                 |
| leads a field engineer to the unit in their portal    | dup         | `locations.spec` "a field engineer into the portal"; a `signedInPage` plus 2 portal loads, about 8 s          |
| sends someone signed out to the login, and on after   | keep (thin) | `redirectTo` through login; drop the engineer half (destination is spec'd), about 4 s                         |
| of another tenant is a 404 for a non-member           | dup         | `locations.spec` "another tenant's code is nothing for who isn't a member there"; a `signedInPage`, about 7 s |
| of another of the user's organizations switches to it | keep        | active-organization switch on the session                                                                     |

## equipment.ranges.test.ts: 59.2 s, 8 tests, save ~43 s

| Test                                                            | Class  | Reason / target                                                                                                   |
| --------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| out of warranty, from the Filter menu: a relative preset        | keep   | the one range-UI e2e                                                                                              |
| units with open orders, from the menu: a minimum                | server | the same UI as the test above; `plan.spec` "numbers keep both ends"; open-orders SQL to a `getEquipmentList` spec |
| links combine ranges and filters; what isn't a range is ignored | server | `getEquipmentList` with ranges; `toListQuery` "leaves out" (`list-definition.spec`). 3 page loads                 |
| malformed range 400 `{from:5,to:1}`                             | dup    | `list-definition.spec` query schema, `ranges.spec`                                                                |
| malformed range 400 `{from:"1"}`                                | dup    | as the row above                                                                                                  |
| malformed range 400 `{from:1e13}`                               | dup    | as the row above                                                                                                  |
| malformed range 400 `warrantyUntil:"today"`                     | dup    | as the row above (4 × ~6 s)                                                                                       |
| South counts its own units only                                 | server | `plan.spec` tenant scoping plus a range `getEquipmentList` spec as South; saves a switch                          |

## equipment.tenancy.test.ts: 56.0 s, 12 tests, save ~42 s

| Test                                                             | Class       | Reason / target                                                                                         |
| ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| switching shows exactly South's units                            | keep (thin) | keep the switch and count; drop the full scroll                                                         |
| the list never shows North's units; facets count South's only    | server      | `getEquipmentList`/`getEquipmentFacets` as South with a North customer code; category facet values      |
| grouped, the categories count South's units only                 | server      | `plan.spec` group counts are tenant-scoped; `loadAllRows` about 5 s                                     |
| North's units are a 404                                          | keep        | page-level isolation smoke                                                                              |
| North's unit history is a 404, no order numbers leak             | server/dup  | `getServiceHistory(northSerial)` in South gives a 404                                                   |
| saving with the id of a North unit is refused                    | keep        | **the section's tamper smoke**                                                                          |
| deleting with the id of a North unit is refused                  | server      | `deleteEquipment` handler / `removeEquipment` gives a 404                                               |
| a North customer, site, category and a taken serial are rejected | server      | `checkUnit` via `handlerOf(createEquipment)` as South with North ids (option injection costs about 6 s) |
| a serial only North has can be reused in South                   | server      | `createEquipment` in South with North's serial                                                          |
| the shared serial number shows South's unit                      | server      | `getEquipment(serial)` in South                                                                         |
| deleting it leaves North's unit with that serial                 | server      | `removeEquipment` by id in the tenant                                                                   |
| a unit can't be put at a North site, nor another customer's      | server      | `checkUnit` site rule (not in `locations.spec`)                                                         |

## equipment.test.ts: 51.0 s, 6 tests, save ~14 s

| Test                                                                | Class                | Reason / target                                                                                                                                                                           |
| ------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| registering a unit validates it first                               | keep (thin) + server | keep the site select following the customer (client); serial taken, warranty before installation and categories in order to a `checkUnit` spec; the charset is in `equipment-schema.spec` |
| a new unit is stored with its serial in upper case                  | keep                 | create flow (upper case is a schema dup)                                                                                                                                                  |
| editing it saves, incl. another customer and a new location         | keep                 | form behaviours (one site chosen at once, new location on the spot)                                                                                                                       |
| the list shows its name, site and location, and finds it            | server/dup           | `columns.spec` "a unit with a name of its own is shown, sorted and found by it"; location search to a `getEquipmentList` spec                                                             |
| selected units get another status; those with orders aren't deleted | dup + server         | the bulk e2e lives in equipment.list; `bulk.spec` "skips what the change refuses, with the reason"                                                                                        |
| deleting it removes it; no 404 query for the gone unit              | keep                 | client refresh regression                                                                                                                                                                 |

---

## Summary

### Totals per class (267 tests)

| Class                          | Tests | Note                                                                                          |
| ------------------------------ | ----- | --------------------------------------------------------------------------------------------- |
| keep-e2e (incl. "keep (thin)") | ~120  | about 30 of them get thinner (drop a full scroll, a validation round or an extra page)        |
| to-server-spec                 | ~56   | ~35 need the remote harness (handler + gate as a tenant); the rest are plain server functions |
| to-component-spec              | ~9    | most component behaviour already has a spec, so these are mostly dups                         |
| duplicate                      | ~60   | delete now: the existing specs named above already assert it                                  |
| low-value                      | ~13   | Dutch smokes beyond one, cleanup steps, combinations of the same switch                       |
| merge                          | ~9    | Active-box ×3, the Dutch tests, card-after-save, 404 pairs                                    |

Estimated saving: **~665 s of 1,313 s**. About 300 s of that is **pure deletion** of duplicates
and low-value tests (no new code). The rest needs the remote harness or new specs.

### Top 10 conversions by seconds saved per hour of work

| #   | Change                                                                                                                                                                                                                                                    | Save                          | Work   | s/h  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ | ---- |
| 1   | auth.view-as: drop "office → customer portal" and "customer portal → engineer portal" (same forms as the kept switches)                                                                                                                                   | ~16 s                         | 0.15 h | ~105 |
| 2   | equipment.categories: delete the 5 dups (rename, move, delete refused, South list, South tamper) and the engineer redirect                                                                                                                                | ~27 s                         | 0.3 h  | ~90  |
| 3   | equipment.list (6) and equipment.ranges (4) "malformed … 400" tests: delete, plus one spec that `getEquipmentList`/`getEquipmentFacets`/`bulkSetEquipmentStatus` are made with the list's schemas (`$app/server` stand-in, as in `remote-functions.spec`) | ~57 s                         | 0.75 h | ~76  |
| 4   | equipment.qr: delete the engineer-portal and other-tenant tests (`locations.spec` QR covers them), halve the signed-out test                                                                                                                              | ~19 s                         | 0.25 h | ~76  |
| 5   | customers.click-filter (whole file) and engineers.inline's two filter tests: dups of `cell-filter.svelte.spec`                                                                                                                                            | ~14 s                         | 0.2 h  | ~70  |
| 6   | Full scrolls trimmed: equipment.list (all of North's units, grouped all rows), equipment.tenancy (`listedSerials`, `loadAllRows`)                                                                                                                         | ~39 s                         | 0.6 h  | ~65  |
| 7   | equipment.locations: delete the 5 dups and the South block's switch                                                                                                                                                                                       | ~19 s                         | 0.3 h  | ~63  |
| 8   | customers.sites: delete the 5 dups of `sites.spec`/`site-schema.spec`, keep one tamper                                                                                                                                                                    | ~18 s                         | 0.3 h  | ~60  |
| 9   | **Sign in by API, not the form**: `useApp`, `signedInPage`, `app.signIn` outside `auth*.test.ts`. A `fetch` to better-auth's sign-in endpoint and `addCookies`, about 0.1 s instead of 2–3 s under load. About 45 UI sign-ins in these files              | ~100 s here (more suite-wide) | 2 h    | ~50  |
| 10  | engineers: delete the grouping/filter/search dups, merge the 3 Active-box tests, drop "added inactive" and "South's engineers show"                                                                                                                       | ~27 s                         | 0.5 h  | ~54  |

Next by value:

- customers' component dups (search, filters, column menu, density, keyboard): ~13.5 s for 0.3 h.
- client.acceptance's two `acceptance.spec` dups: ~10 s for 0.2 h.
- The **demo.remote server spec** with `$app/env/private` mocked off, plus a user-menu/portal-header
  component spec. It replaces both files' second server start and many sign-ins: ~57 s for 2.5 h.
- The **remote harness** (3–4 h once). It unlocks about 150 s of isolation and logging
  conversions across:
  - equipment.tenancy (~25 s)
  - client.tenancy (~30 s)
  - activity (~45 s)
  - dashboard (~29 s)
  - customers and engineers South (~23 s)

### Patterns

- **Every tenancy file could become one server spec per section plus two e2e smokes.** The
  smokes: a page-level 404 for the other tenant's record, and one hidden-id tamper through the real
  form (`app.expectingErrors`), which proves the id travels from the form to the handler. The rest
  are handler calls with tampered ids as South through `handlerOf(...)`: update, delete, link,
  create with foreign ids, list/facets with a foreign filter, history. They need no DOM option
  injection.
  - Many of them already exist at the server-function level: `sites.spec`, `categories.spec`,
    `locations.spec`, `acceptance.spec` and `bulk.spec` each have "another tenant's … is a 404".
  - This conflicts with today's wording. `docs/agents/tests.md` says isolation is in each
    section's e2e tests, through `app.expectingErrors`. Changing the rule to "server spec plus one
    e2e smoke" is the user's call, and the doc would need the change.
- **Logic inside `*.remote.ts` blocks cheap specs.** Examples: `checkUnit` (equipment), email
  uniqueness (engineers), the activity filters, the dashboard numbers, the portal queries. The
  harness gets at them through the handler; moving them to `server/` (as categories, sites and
  locations already are) would make them plain functions to test.
- **Sign-in per file and per extra context.** `useApp` signs in through the form in every file.
  `signedInPage` (10×) and `app.signIn` (10×) add more, at ~2–3 s each under load. API sign-in
  (pattern 9 above) removes most of it. Keep the form only in `auth.test.ts`.
- **`quiet()`'s 500 ms idle.** It runs after every `app.submit` (54×), `quiet` (23×),
  `tableSettled` (10×), `switchOrganization` (13×) and sign-in. That is ≥55 s of pure idle in
  these files. Waiting on the specific signal (the response plus the submit button re-enabled,
  `aria-busy` gone) instead of the network going idle would cut most of it. It's risky (that is
  why `quiet` exists), so measure it on one file first.
- **Full-list scrolls** (`loadAllRows`, `listedSerials`, `allNames`, `listedNames`) compare the
  whole list with the database through the UI. The server spec is the right place for "exactly
  this tenant's rows". The e2e needs one or two pages.
- **`test.each` of tampered queries, each loading the page afresh** (10 tests, ~55 s). They test
  valibot schemas that `list-definition.spec` already tests. The only thing left is that the
  remote function uses the schema, a one-line spec.
- **A second server for the flag-off case** (auth.demo, auth.view-as). Mock
  `$app/env/private` in a spec instead.
- **Organization switches** (13×, each a full reload to `/` plus `quiet`) mostly exist to reach
  South for isolation checks that become specs.
