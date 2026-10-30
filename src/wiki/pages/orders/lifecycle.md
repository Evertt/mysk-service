---
title: Order lifecycle
summary: The statuses an order goes through, who may move it from one to the next, and how the app keeps buttons and server in agreement.
section: orders
order: 1
status: built
covers: [domain:orders]
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import OrderLifecycle from "#wiki/widgets/order-lifecycle/order-lifecycle.svelte";
</script>

An order is work for a customer: a repair, an inspection, an installation. From the first quote to
the invoice it has one **status**, and the status says what may happen to it next.

| Status                  | What it means                                                         |
| ----------------------- | --------------------------------------------------------------------- |
| **Awaiting acceptance** | A customer reported it in their portal. A planner hasn't decided yet. |
| **Quote**               | Accepted, or made in the office. Not planned yet.                     |
| **Scheduled**           | Planned: an engineer, a day and a time.                               |
| **In progress**         | The engineer has started the job.                                     |
| **Completed**           | Done. When the engineer completes it, the customer has signed.        |
| **Invoiced**            | On an invoice that was sent. The order is frozen.                     |
| **Cancelled**           | Won't happen, or a customer's report that was rejected.               |

Orders made in the office start as quotes. Only a customer's report starts as awaiting acceptance
(see [Orders awaiting acceptance](/wiki/orders/awaiting-acceptance)).

## Try the moves

Click a status to see how an order leaves it and how it gets there, and who makes each move.

<OrderLifecycle />

The moves have a name, a **verb**, and a person who makes them:

- **The planner** _plans_ an order: gives it an engineer (or nobody), a day and a time. A quote that
  gets an engineer becomes scheduled; any other open order keeps its status.
- **The planner** _accepts_ or _rejects_ a customer's report. Accepted, it's a quote, or scheduled
  at once if they plan it in the same step. Rejected, it's cancelled, with a reason the customer
  reads in their portal.
- **The engineer** _starts_ a scheduled job and _completes_ the job in progress, with the
  customer's signature.
- **Invoicing** makes a completed order _invoiced_ when an invoice for it is issued, and completed
  again if that invoice is voided.
- **The office** can also _set_ a status by hand: in the order form, the list's status column, or a
  bulk action. By hand it can give an order any of quote, scheduled, in progress, completed or
  cancelled, but never invoiced, and never to an order that is invoiced or awaiting acceptance.

Once an order is invoiced it can't be edited or deleted: it's on an invoice with its amounts. Void
the invoice and it's completed again.

The same rules drive the buttons. The status in the orders list offers only the statuses that
order may be given by hand, and the engineer portal shows **Start job** only on a scheduled order.
They can't disagree with the server, because they ask the same table.

<TryIt as="planner" />

<HowItWorks />

**One table.** The rules are `orderTransitions` in `src/lib/orders/lifecycle.ts`: a row per verb
(`set`, `plan`, `accept`, `reject`, `start`, `complete`, `invoice`, `uninvoice`). A row says who
makes the move (`by`), from which statuses and to which, the activity entry's `action`, its
refusal, and two choices with defaults:

- `completedAt`: `"follows"` the status (set when it becomes done, cleared otherwise), `"at"` the
  moment of the move (the engineer's completion, the same instant as the sign-off), or
  `"untouched"`.
- `same`: a move to the status it already has does nothing (`"skip"`), or is still made
  (`"move"`: the planner's, because it changes the engineer and the time).

This wiki's graph above is drawn from that table: it can't drift from the app.

**Rules derived from it.** Pages and the server ask `mayEditOrder`, `mayDeleteOrder`,
`statusChoices`, `fieldActions`, `plannedStatus` and `can(verb, status)` instead of testing
statuses themselves.

**One way to move.** Every status change goes through `transitionOrder(tx, { verb, … })` in
`src/lib/orders/server/lifecycle.ts`, in the caller's transaction. It:

1. finds the order in the verb's scope (the tenant's; for the engineer's verbs, their own);
2. checks the row with `can()`, and refuses with the row's message otherwise;
3. makes one update, with the completion date as the row says;
4. asks the modules (`saveOrderParts()`), which may refuse, such as materials with too little stock;
5. makes the verb's own writes: the request's decision, the sign-off;
6. logs one entry with `recordActivity()`.

The order form is the one other writer. It saves its fields and units itself, so it takes a handle,
`beginOrderChange()`, which guards the order and gives the status columns to write with the form's.

A new way to change an order's status is a row and a verb here, never an update of `order.status`
of its own. Creating an order (`createOrders()`), deleting it and assigning it keep their own
checks; they aren't transitions.

- <SourceLink path="src/lib/orders/lifecycle.ts" line={69}><code>orderTransitions</code></SourceLink>
- <SourceLink path="src/lib/orders/server/lifecycle.ts" line={66}><code>transitionOrder()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/lifecycle.ts" line={176}><code>beginOrderChange()</code></SourceLink>
- <SourceLink path="src/lib/models.ts">the status sets</SourceLink> (<code>openOrderStatuses</code>,
  <code>doneOrderStatuses</code>, …)

<DocsPointer doc="docs/agents/orders.md" section="The lifecycle" />
