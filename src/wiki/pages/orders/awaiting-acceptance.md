---
title: Orders awaiting acceptance
summary: How a customer's reported breakdown waits for a planner to accept or reject it, and what it does and doesn't count as until then.
section: orders
order: 3
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

A customer who sees a unit break down doesn't phone the office: they open the customer portal and
**report a breakdown**, on the unit (or by scanning its QR code), with a description and an
urgency (normal, high or urgent). That makes an order, but not yet work. It is **awaiting
acceptance** until a planner decides.

## What the customer sees

Their order shows as waiting for the office. When the planner decides they see it change: planned,
with the engineer's first name, or **rejected, with the reason the planner wrote**.

## What the office sees

- A badge on **Orders** in the menu, and a card on the dashboard, count the reports waiting. The
  card opens the orders list filtered to them. The bell has a notification for each new one.
- On the order's page, a card says who reported it and when. It has two buttons:
  - **Accept.** The order becomes a quote. Or fill in an engineer, a day and a time and it is
    scheduled at once, as if it were planned in the same step.
  - **Reject.** A reason is required. The order is cancelled and the customer reads the reason.
- Once decided, the card says what was decided and by whom.

Any office member can decide, as planning is. Orders made in the office never wait: they start as
quotes.

## Until it's decided, it isn't work

An order awaiting acceptance is deliberately kept out of everything that counts or plans work:

- it isn't on the planning board or in the backlog;
- it holds no stock, and gets no checklists;
- it can't be given an engineer or a plan, or a status by hand, or be edited (the server refuses
  with "accept first");
- it _can_ be deleted;
- on a service contract, the response time already runs from the moment of the report, not from
  the acceptance: the customer's wait counts.

<TryIt as="customer" />

<HowItWorks />

**Creating it.** The portal's `reportBreakdown` form
checks that the unit is one the contact sees, then calls `requestOrder(tx, draft)` in a
transaction. That is `createOrders()` (checked, numbered, logged as created, by the contact) with
the status `awaiting_acceptance`, plus an `order_request` row that keeps who reported it
(`reporterName`) and, later, who decided, when and why.

**Not open work.** `openOrderStatuses` doesn't have `awaiting_acceptance`; `pendingOrderStatuses`,
the customer's view of what is still to be done, does. The materials module's `holdsStock()` and
the contracts module's `waitingStatuses` (`src/modules/contracts/coverage.ts`) make the stock and
response-time rules above.

**Deciding.** Both buttons call `transitionOrder()`, the one way to change a status (see
[Order lifecycle](/wiki/orders/lifecycle)):

- `accept`: from awaiting acceptance to quote, logged _accepted_. With a plan it then calls the
  `plan` verb in the same transaction (logged _scheduled_).
- `reject`: to cancelled, logged _rejected_ with the reason as the entry's note.

They are `acceptReportedOrder` and `rejectReportedOrder`, gated for any office member
(`forMembers`). An order that already was decided is refused.

**The count.** `awaitingAcceptance(organizationId)` counts the orders for the menu's badge.

- <SourceLink path="src/lib/orders/server/acceptance.ts" line={22}><code>requestOrder()</code></SourceLink>
- <SourceLink path="src/routes/(customer)/portal/client.remote.ts" line={186}><code>reportBreakdown</code></SourceLink>
- <SourceLink path="src/lib/orders/detail/acceptance.remote.ts" line={35}><code>acceptReportedOrder</code></SourceLink>
  and <SourceLink path="src/lib/orders/detail/acceptance.remote.ts" line={61}><code>rejectReportedOrder</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={169} symbol="orderRequest"><code>order_request</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Orders awaiting acceptance" />
