# Orders

Read before you change which status an order can get, add a way its status changes, touch
orders awaiting acceptance, or read or show what was done on an order's site (its units, notes or
sign-off).

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
asks the modules (`saveOrderParts()`, every move: invoicing's too, for each order; they get the
status it moves `from` and the one it moves to, so a rule about becoming done, like checklists',
leaves an invoice's issuing and voiding alone), makes the verb's
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

## The work record

What was done on an order's site (its units in their order at their sites, with each one's
category and location, the notes engineers wrote, and the sign-off with both signatures) is read
in one place: `readWorkRecord(scope)` (`src/lib/orders/server/work-record.ts`, in
`#lib/orders/server/index.ts`). Its readers are the office's order page (`getOrder`), the engineer
portal's (`getMyOrder`), the customer portal's (`getPortalOrder`) and the checklists module's
printed work order (`loadWorkOrder`); each reads its own header beside it (the order's columns, the
customer, the request, prices, tags, history, checklists), on the scope's `where`.

- **Who sees what** is the `audiences` table, the only place it's declared: `office` (the notes,
  who in the office collected the sign-off, the engineer in full, the site's `onSite` columns),
  `engineer` (the notes, not who collected it, no engineer: it's them), `customer` (no notes, the
  engineer by first name, the site's address) and `workOrder` (no notes, the engineer in full, the
  address); only the office sees a unit's warranty date. A key the table says no to isn't in
  `WorkRecord<A>`'s type: a customer's record has no `notes`. A new column a portal mustn't see is a key in the table, not a select of its own; a key
  that doesn't change the record's shape (prices) doesn't belong there.
- **A scope** finds the order and names its audience, and only these make one: `officeOrder(number)`
  (the tenant's), `await engineerWork(ref)` (the engineer's own, `engineerOrder()`),
  `customerWork(access, number)` (`customerOrders()`, with only the units at the contact's sites,
  `atSites()`) and `printedWorkOrder(where, unitsAt)`. An order the scope doesn't reach reads as
  `undefined`: the caller 404s with its own message (`engineerOrderNotFound()` on the portal).
  A batch query reads several in as many statements as one: `readWorkRecords(officeOrders(numbers))`
  answers them by number (`getOrder`, which the order's page and its hover card share).
- **Sites**: the units' distinct sites, or for an order without units the customer's site when it
  has just one, else none, for every audience.
- **Showing it**: `<SignOff signoff />` ("Signed off by <signer> on <date>", both signatures side
  by side, "collected by" when the sign-off has it) and `<NotesList notes empty? footer? />`, in
  `#lib/orders/components.ts`; a unit's line under its title is `unitLine(unit, { category, site,
location })` (`#lib/equipment/index.ts`), the extras the page shows, always in that order.
