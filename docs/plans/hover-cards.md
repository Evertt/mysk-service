# Hover cards for record links

Wish 6 of 19 October 2026, after grilling (Q13), with the measurement from wish 7 (Q4, Q5).
**Starts after [error-handling.md](error-handling.md) is merged**, because it measures with that
plan's timing lines.

## Problem

A link to an order, customer, unit or engineer shows only its name or number. To see what's behind
it, the user has to open it. A preview on hover saves those round trips.

The links are built in two ways:

- **Link components**, used in about 23 places: `OrderLink`, `CustomerLink`, `EquipmentLink` and
  `EngineerLink`, in each domain's `ui/`.
- **Direct `resolve()` calls**, about 60 of them: tables, cards and the activity log.
  - `orders/[number]`: 17 calls in 15 files
  - `customers/[code]`: 18 in 17
  - `equipment/[serial]`: 23 in 20
  - `engineers/[id]`: 10 in 8

  Those counts include the link components' own calls.

`hover-card` isn't installed. `query.batch` is wired into the gated sets
(`src/lib/server/remote-functions.ts:84`) but nothing uses it yet.

## Decisions (grilling)

| #     | Decision                                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q13   | The **core four** (orders, customers, equipment, engineers) on **every link** to their detail pages. The direct `resolve()` anchors move to the link components first. Desktop pointer only, no card on touch. Office app only.                                                         |
| Q4/Q5 | Hover cards are the first feature that turns mouse movement into requests to the Durable Object. This plan measures the object's load before and after them, and decides by the numbers whether anything (prefetching, a cache) is worth more. The old in-memory cache idea is dropped. |

## Design

### Links first

- Change every anchor that links to a core four record and shows that record (its name, number or
  serial) to use the record's link component. Leave these as they are:
  - breadcrumbs
  - the record's own page header
  - buttons and menu items ("Open", "View order")
  - `goto()` and redirects
- Give each link component the props its call sites need, such as a class or a `children` snippet
  for custom content (`EquipmentLink` has one), so nothing is lost in the move.
- **Commit this step on its own**, before any hover card. It's a refactor with no visible change.

### The cards

- Add shadcn-svelte's `hover-card` through its CLI (the `shadcn-svelte` skill describes how).
- Each link component wraps its anchor in a hover card:
  - **The open delay is 500 ms** (the user's choice). Cards don't pop in and out while the cursor
    crosses the page, and resting on a link for half a second is a clear sign of intent. The close
    delay is about 150 ms. Both are one shared constant, not set per link.
  - **The e2e tests turn the delay off**, so no test waits half a second or times out on it. Put the
    switch in the shared e2e context setup (`#e2e/app.ts`), so every test gets it without asking.
    For example, an `addInitScript` that sets a key the link components read once, giving a 0 ms
    delay. Two rules:
    - Production behaves the same whether the key is set or not, apart from the delay.
    - No build flag ships test code.

    One e2e test leaves the delay on and checks that a quick pass over a link opens no card, so the
    delay itself is covered.

  - The content loads when the card opens, never before (but see "Measure", below).
  - A skeleton shows while it loads.
  - Opt out with `preview={false}`.
- **Only where it makes sense:**
  - Only with a fine pointer that can hover (`(hover: hover) and (pointer: fine)`, checked live).
  - Only in the office shell. The `(app)` layout sets a context that the link components read.
  - Not inside the card itself (no nested cards).
- **Content** (core fields only; modules adding fields to a card is a follow-up):
  - **Order:** number, status badge, type, priority, customer, site and city, planned date and
    time, engineer, number of units, and the first line of the description.
  - **Customer:** name, code, city, phone and email, open orders, units, last order date.
  - **Unit:** name or model, manufacturer, serial, customer, site, category, status, last service.
  - **Engineer:** name, phone and email, today's orders, open orders.

  Dates and numbers go through `#lib/i18n/format.ts`, enum values through `label()`, and text
  through Paraglide `en` and `nl`.

### The queries: the detail page's own, shared with the card

**The card and the detail page read the same query** (the user's ask, added after the grilling).
The card's data is a subset of what the detail page loads. So the detail page's record query
becomes a `query.batch` and the card calls that same query, not a separate preview query. A hover
followed by a click then costs one request for the record, not two.

- **Turn `getOrder`, `getCustomer`, `getEquipment` and `getEngineer` into batch queries.** These
  are `forMembers.query` in each domain's `<record>.remote.ts`. Each becomes
  `forMembers.query.batch(v.string(), async (keys) => …)`. The detail pages
  (`src/routes/(app)/<domain>/[…]/+page.svelte`) keep calling `await getCustomer(code)` as they do
  now, and the card calls the same thing.
  - The batch reads the asked keys in one go: `inList()`, scoped with `inTenant()`, joins through
    `tenantJoin()`. It returns `(key) => record`.
  - Every place that refreshes or reads these queries (forms, `refreshOnChange()`, the e2e tests)
    keeps working. Find them with CodeGraph before changing a signature.
- **Not found:** the detail page needs today's 404 with its message (`customers_code_not_found`,
  …). Check how a batch query's per-key resolver can give that: throw `error(404)` for one key, or
  return `null` and let the page throw. The card shows "Not found" for a missing or another
  tenant's key, never an error.
- **Keep the shared query light enough for a hover.** Some of the detail queries do heavy work that
  a hover shouldn't pay for:
  - `getCustomer` reads all of the customer's orders and prices the done ones for the revenue stat.
  - `getOrder` reads the history of the order's units.

  Move such parts into their own queries that only the detail page calls, e.g.
  `getCustomerStats(code)`, so the shared record query stays a few joined selects. The card shows
  only the fields listed above. If a card field (open orders, last order date) needs one of those
  parts, prefer a cheap count in the record query over calling the heavy one.

- **The link already preloads on hover.** `src/app.html` has `data-sveltekit-preload-data="hover"`,
  and `forkPreloads` is on, so hovering a link already runs the detail page's top-level `await`s in
  a fork. The service worker keeps those preloaded answers (`startHover`/`freshForHover` in
  `src/service-worker/index.ts`). Find out:
  - whether the card's call and the preload's call of the same query and key share one request, or
    make two
  - whether the click then reuses that answer

  The goal is **one request for the record per hover and click together**, counted in the network
  panel and the timing lines. If the preload and the card can't share it, make them: e.g. the card
  waits for the preload's answer.

- **What batching gains beyond that.** Kit batches calls made in the same macrotask, so one hover is
  one request either way. The gain comes when many records are asked at once, as in the prefetch
  experiment below. Check whether a repeated hover on the same link is answered from the client's
  query cache. Write the findings down in this plan.

### Measure (wish 7)

With the timing lines of [error-handling.md](error-handling.md) on (`TIMING_LOGS=1`), locally on
`wrangler dev` or on staging:

1. **Baseline:** a scripted session of a few minutes. It opens the orders list, scrolls, opens three
   orders and a customer, and goes back. Count the Durable Object's requests, their total and p95
   wall time, and the time spent in transactions.
2. **The same session, with hover cards:** the mouse passes over about 30 links, and about 10 cards
   open.
3. **The same session, with an experimental prefetch:** links in view are previewed through one
   batch per frame. This uses an `IntersectionObserver` and is behind a flag, not shipped.
4. Write the numbers and a recommendation at the end of this plan. Cover whether the open delay is
   enough, whether prefetching is worth it, and whether the object needs any cache at all. If (3)
   isn't worth it, remove its code.

## Steps

1. The links to the link components (its own commit).
2. The four detail queries as batch queries (their heavy parts split off), with their server specs; the detail pages still pass their e2e tests. Then `hover-card` and the cards on those same queries.
3. The measurement and its findings.

## Tests

- **Server spec** per batch query:
  - It answers several keys in one call.
  - Unknown keys give `null`.
  - North's keys asked by South give `null` (tampered ids).
  - More than 100 keys work, through `inList()`.
  - Customer contacts and field engineers are refused by the gate.
- **e2e:**
  - Hovering an order link in the orders table opens a card with its customer.
  - A customer link in an order's page opens the customer's card.
  - With touch emulation, no card opens.
  - The engineer portal's links have no card.
  - Keep it to one test per link component.
- Existing e2e tests that click these links still pass. Check that a card doesn't cover the next
  link a test clicks.

## Out of scope

Module records (invoices, contracts, materials) and module fields on the cards: a slot can follow.
Cards in the portals.
