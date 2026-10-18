# Orders

Read before you change which status an order can get, add a way its status changes, or touch
orders awaiting acceptance.

## The lifecycle

Which status may follow which, and for whom, is one table: `orderTransitions` in
`src/lib/orders/lifecycle.ts`, a row per verb. `set` is the office giving a status by hand (the
form, the list's status, bulk); `plan` the planner's; `accept` and `reject` a customer's report;
`start` and `complete` the engineer's; `invoice` and `uninvoice` invoicing's. A row says who makes
the move, from which statuses and to which, the activity entry's action, its refusal, and two
choices with defaults:

- `completedAt`: `"follows"` the status (kept while done, set when it becomes done, cleared
  otherwise), `"at"` the move's moment (the engineer's completion, the same instant as the
  sign-off), or `"untouched"`.
- `same`: a move to the status it has does nothing (`"skip"`), or is still made (`"move"`, the
  planner's, which changes the engineer and the time).

The pages ask the rules derived from the table (`mayEditOrder`, `mayDeleteOrder`, `statusChoices`,
`fieldActions`, `plannedStatus`, `can`) rather than testing statuses themselves, so a button and
the server agree. Core's status sets stay in `src/lib/models.ts` (`openOrderStatuses`,
`doneOrderStatuses`, …), shared with the schema and the queries; a module keeps a rule of its own
(materials' statuses that hold stock), and uses the core's set where it means the same.

Every status change goes through `transitionOrder(tx, { verb, … })`
(`src/lib/orders/server/lifecycle.ts`), in the caller's transaction. It finds the order in the
verb's scope (the tenant's; for the engineer's verbs, their own), checks the row, makes one update,
asks the modules (`saveOrderParts()`, every move: invoicing's too, for each order), makes the verb's
own writes (the order request's decision, the sign-off), and logs one entry. Refusals are thrown: a
404, or `invalid()` with the row's message, a module's (an `OrderRefused`'s message, after the
order's number for invoicing's, which moves several), or, for the planner, the engineer's problem
at the field `engineerId`. A command turns them into a 400 itself, as the
list's status cell does. The caller still emits `orders.committed` and refreshes its queries.

The order form saves its own fields and units, so it takes a handle instead:
`beginOrderChange(tx, id, to)` guards the order (a 404, invoiced, awaiting acceptance) and gives
the status columns to write with the form's; `finish()` asks the modules with the form's parts
(also when the status stays) and logs the one `updated` entry of an edited order (a new one's
creation is logged by `createOrders()`).

A new way to change an order's status is a row and a verb in `transitionOrder()`, never an update
of `order.status` of its own. Not transitions: creating an order (`createOrders()`,
`requestOrder()`), deleting it (`removeOrder()`) and assigning it (`assignOrder()`, in
`order-changes.ts`), which keep their own checks.

## Orders awaiting acceptance

An order a customer's contact reports in the customer portal (a breakdown) is made by
`requestOrder(tx, draft)` (`src/lib/orders/server/acceptance.ts`): through `createOrders()`, with the
status `awaiting_acceptance` and an `order_request` (who reported it). Until a planner decides, it's
no open work (`openOrderStatuses` doesn't have it; `pendingOrderStatuses` is the customer's view of
what's still to be done): it's off the planning board and its backlog, holds no stock (materials'
`holdsStock()`), gets no checklists, can't be given a status by hand (`statusChoices()` is empty),
an engineer or a plan, or be edited (`mayEditOrder()` is false; the server refuses with
`acceptFirst()`); it can be deleted. The office's order page accepts it (`transitionOrder()`'s
`accept`: a quote, logged `accepted`; with an engineer and a day it's planned at once, `plan`,
logged `scheduled`) or rejects it (`reject`: cancelled, logged `rejected` with the reason, which the
customer reads). A contract's response time counts from the report (the order's creation), not
from its acceptance: the contracts module counts an order awaiting acceptance as not responded to
yet, like a quote (`waitingStatuses` in `src/modules/contracts/coverage.ts`). Orders made in the
office start as quotes, past acceptance.
