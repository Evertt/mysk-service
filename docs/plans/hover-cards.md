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
  - The open delay is about 400 ms and the close delay about 150 ms. Tune them by feel.
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

### The queries

- One `query.batch` per record kind, in its domain's `<record>.remote.ts`. For example,
  `getOrderPreview = forMembers.query.batch(v.string(), async (numbers) => …)`. Each does this:
  - one select with `inList()` over the asked keys, scoped with `inTenant()`
  - joins through `tenantJoin()`
  - returns `(key) => preview | null`
- A key from another tenant, or an unknown one, gives `null`. The card then says "Not found", and
  this is never an error.
- **What batching gains here.** Kit batches calls made in the same macrotask, so one hover is one
  request either way. The gain comes when many previews are asked at once, as in the prefetch
  experiment below. Check whether batch requests go through the service worker's response cache
  (`src/service-worker/index.ts`), and whether a repeated hover on the same link is answered from
  the client's query cache. Write both findings down in this plan.

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
2. `hover-card`, the four batch queries with their server specs, and the cards.
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
