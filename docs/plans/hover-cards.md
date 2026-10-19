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

## As built

Built on 19 October 2026 (branch `hover-cards`, on develop at `35bda1a6`). What differs from the
design above, and what was found on the way.

### Links first (step 1)

Every anchor that shows an order, customer, unit or engineer and links to its page renders the
record's link component, on a shared `RecordLink` (`src/lib/components/record-link/`): the core's
tables (the orders' customer, units and engineer columns; the engineers', equipment's and
invoices' first columns; maintenance's and condition's units), cards (`CustomerCard`, the order
page's engineer, the customer's and location's units), the modules' pages and slots (contracts,
checklists, condition, docks, energy, maintenance, parts shop, the schedule's board and calendar)
and the activity log (`activity-sentence.svelte`: the core four's subjects by their link
components; a module's subject that links to a core record by a label of its own, e.g. a partner's
`CUST-0001 · 2025`, stays a plain link, as does a sentence given the engineer portal's `href`). The
link components take `class` (which replaces their look, so nothing changed visibly), `children`,
`label` (`EquipmentLink`), the anchor's other attributes, and `secondary`: a table cell's two
lines, through `TwoLineCell`'s new `link` snippet. Left plain: breadcrumbs, page headers, buttons
(also the energy alerts' order number, a `Button`), the edit pages' cancel links, redirects and
`goto()`. Its own commit.

### The queries (step 2)

- `getOrder`, `getCustomer`, `getEquipment` and `getEngineer` are `forMembers.query.batch`: one
  `findMany` over the keys (`inList()`, `inTenant()`), the joined parts in the same go, and a
  resolver per key. **Not found:** the resolver throws the page's `error(404, …)` for its key,
  which SvelteKit answers per key (a `{ type: "error" }` in the batch's answer), so the pages keep
  their 404 and message and the batch's other keys answer. The server spec checks a 404 where the
  plan said `null`. The card shows "Not found" for a refusal.
- **Split off**, and asked for in the pages' markup (an `await` in an attribute, or as a snippet's
  argument) so they run alongside the record rather than after it: `getOrderHistory` (the units'
  other orders), `getCustomerRevenue` (the done orders, priced) and `getEngineerWork` (open and
  recent orders, last month's hours and revenue; three statements per engineer weren't a hover's
  either). The record queries count instead, in one grouped statement for all their keys: a
  customer's orders, open orders and last order; an engineer's open orders and today's (in the
  user's time zone); a unit's orders and last service. An order's price, tags and portal report
  stay in `getOrder`: `priceOrders()` and `tagOrders()` take the batch's orders at once.
- **Refreshes:** `updateOrder` refreshes `getOrderHistory` too (the units may change),
  `updateEngineer` `getEngineerWork` (the revenue is at the engineer's rate).
- **The service worker** took a batch query's `POST` for a change, which would have outdated every
  cached answer on each record page. It now recognises one (JSON, no `x-sveltekit-pathname`, a
  body of `{ payloads }`) and answers it like a query, kept under a URL of its own that names the
  payloads (`?payloads=[…]`); an answer with an error in it isn't kept. Checked against a
  production build with the worker on: the order page's `getOrder` came from the worker, and the
  server saw it about as often as the page's GET queries (1–2 times a visit, the worker's own
  revalidation included).
- **Harness:** `callBatch(query, keys)` (`#unit/lib/server/harness/calls.ts`) calls a batch query
  with several keys in one request, as a page does, and counts their statements. The specs
  (`batch-query.test-support.ts`, used by the four domains' server specs): several keys answer in
  the statements of one, an unknown key is a 404 of its own beside answering ones, North's keys
  asked by South are a 404 each, 170 keys work, engineers and customers' contacts are refused; and
  the new counts match the database.

### The cards

- `hover-card` added with the CLI (its `#lib/utils.js` import made `.ts`), themed like the
  popover; `pnpm themes:sync` also listed the `data-slot`s added since it last ran.
- `RecordLink` wraps its anchor in a card when it's given `load` (the record's batch query) and
  `preview` (the card's content, given the answer), the office shell turned cards on
  (`showRecordPreviews()` in the `(app)` layout; so not in the portals, nor on the label sheet, a
  `+page@`), it isn't inside a card (`PreviewContent` turns them off) and the pointer is fine
  (`MediaQuery`, live, as bits-ui's `disabled`, so the server renders the same markup). The
  content is `order-preview.svelte` and friends in each domain's `ui/`, text only. The schedule
  board's cards have `preview={false}`: they're dragged over each other.
- **The trigger stays a link:** bits-ui gives it `role="button"` and popup state; `RecordLink`
  takes those off (screen readers open the page), and the card opens on the pointer only, not on
  focus.
- **Delays:** 500 ms to open, 150 ms to close (`previews.ts`). The e2e tests set
  `sessionStorage["fieldworks:record-preview-delay"]` to `0` in every context (`newContext()`, an
  init script that keeps a value already there), which the links read once; production reads the
  key and does nothing else with it. No build flag.
- **One request for a hover and a click, and SvelteKit's fork.** The preload renders the hovered
  link's page in a fork 20 ms after the pointer rests, and asks for its queries there. A card that
  then read the same query failed: a query first asked for in the fork wasn't readable outside it
  ("Couldn't load this preview" on a customer's card). And a card whose markup awaited the query
  was held up with the fork: bits-ui never positioned it, so it stayed off the screen. So the link
  asks for the record itself, on the same 20 ms rest, from its pointer events, which come just
  before the mouse events SvelteKit times its preload on: the query is then the page's, and the
  fork, the card and the page after the click read that one answer. With a 10 ms rest at first,
  the session's slow passes over links (16 ms between moves) asked for records SvelteKit didn't
  preload; at 20 ms they ask for nothing. The card keeps the answer in a state of its own
  (`PreviewContent`), and asks again (`refresh()`) if it meets the fork's error anyway. See
  `docs/upstream-bugs/README.md`, 13.
- **Cards that didn't close:** in the production build the e2e tests run, a card opened while an
  earlier hover's fork was pending stayed open: bits-ui's safe polygon is an effect, and the
  effects of a branch made while a fork is pending may never run (upstream bug 8). The link, made
  with the page, closes its card itself when the pointer is on neither for 300 ms.
- **Repeated hovers** are answered from SvelteKit's query cache: the same link hovered again at
  once, 10 s later, after another link's hover (whose preload discards the first's fork) and after
  a garbage collection made no request.

### Tests

- Server specs as above, in `customers.spec.ts`, `engineers.spec.ts`,
  `equipment/server/units.spec.ts` and `orders/server/tenancy.spec.ts`; the revenue check in
  `customers.spec.ts` reads `getCustomerRevenue`.
- e2e `src/tests/e2e/record-previews.test.ts`: an order's link in the orders table shows its card
  with the customer, and is still a link; an order's page shows its customer's, unit's and
  engineer's cards with the database's counts; a quick pass opens nothing and a card opens only
  after half a second (the delay on); a touch screen (`isMobile`, `hasTouch`) opens none; the
  engineer portal has no card triggers. The "Not found" card isn't tested end to end (the server
  specs check the 404 per key).
- The link-heavy e2e files pass with the cards (orders, the orders' list and units, customers,
  equipment and its detail, engineers, activity, dashboard, i18n, the engineer portal, the
  schedule's board and calendar, checklists, contracts, maintenance, condition, invoices): no card
  covered a link a test clicked next.

### Measure (wish 7)

On this machine, against production builds served by `vp preview` (Node and libsql, not `wrangler
dev`), with `TIMING_LOGS=1` and the service worker blocked, so the server sees every query. The
scripted session (`session.mjs`, a Playwright script kept outside the repo): SHLTR's planner opens
the orders list, scrolls it down and back, moves the pointer over 30 of the table's links (every
third rests 0.9 s, so 10 cards open; 20 are passed over), then opens three orders and a customer
from the list (a 0.3 s hover, a click) and goes back each time; 117 s. Three runs per variant, each
variant on a server started afresh with a log of its own; each run's server requests matched the
requests its browser made (within the 1–3 of the sign-in still in flight at its start).

The first measurement was discarded and run again: the user hovered links on the same server
meanwhile, which showed in one run as 70 server requests more than its browser made.

| Per session, mean of 3 runs       | Baseline (`35bda1a6`) |       Hover cards |  Cards + prefetch |
| --------------------------------- | --------------------: | ----------------: | ----------------: |
| Requests                          |                   355 |               341 |               338 |
| Statements                        |                 2,723 |             2,588 |             2,573 |
| Wall time, sum (range of runs)    |     2.3 s (1.5–3.1 s) | 3.3 s (2.6–4.5 s) | 3.1 s (2.5–3.7 s) |
| Wall time, p95 (range of runs)    |               8–22 ms |          21–54 ms |          20–41 ms |
| Transactions                      |                     0 |                 0 |                 0 |
| Order, customer, unit, engineer   |          18, 8, 10, 2 |        7, 4, 5, 1 |        6, 5, 5, 3 |
| History, revenue, engineer's work |                     — |           8, 8, 2 |           8, 8, 2 |

- **The cards add no load.** Fewer requests and statements than without them: SvelteKit's
  preload asks every query it asks first twice (in the browser's network log: two requests a few
  milliseconds apart; 18 `getOrder` requests in the baseline's session), and a record's query, now
  asked for by the link before the preload, once (7). That pays for the split-off queries, a request each per page (twice per preload). The 20
  passed links asked for nothing. The runs' wall times spread wider than the variants differ; per
  request, `getOrder` took 7.6 ms on average before and 8.6 ms after.
- **The open delay** of 500 ms is enough: no pass opened a card, and the requests come from the
  rests SvelteKit already preloads on, not from the cards.
- **Prefetching isn't worth it.** Asking for the links in view, one batch per frame
  (`IntersectionObserver`, behind a `sessionStorage` flag), saved 3 requests a session but more
  than doubled the record queries' server time (653 → 1,420 ms over three runs: a batch of the ~20
  orders in view priced and tagged at once took up to 80 ms, against 16 ms for one order), for
  records nobody looked at. Its code was removed, not committed.
- **No cache in the Durable Object** is called for by the cards: they make no request the preload
  didn't make already, SvelteKit's query cache answers repeated hovers, and the service worker
  answers revisits. The session ran no transactions (it only reads); on Cloudflare its statements
  are what holds the object, and the cards lower them slightly.

### Left

- SvelteKit's preload asking each query it asks first twice (upstream bugs, 13, "Also seen")
  deserves a look of its own: it doubles every hovered page's queries, with or without cards.
- The measurement on `wrangler dev` or staging, where the Durable Object's own timing applies.
- Module fields on the cards (a slot), and cards in the portals, as planned.
