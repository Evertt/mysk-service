# The order lifecycle module

Candidate C1 of `docs/reviews/architecture-review.md`, after grilling (decisions Q1–Q8 below)
and the design-it-twice step (the hybrid of the "table" and the "one entry" designs).

## Problem

- **Seven writers.** These places write `order.status`, each with its own guards,
  completion-date rule, module save hook and activity entry:
  - `changeOrderStatus`, `setOrdersStatus` (`orders/server/order-changes.ts`);
  - `scheduleOrder` (`scheduling.ts`);
  - `acceptOrder` and `rejectOrder` (`acceptance.ts`);
  - `saveOrder` (`order.remote.ts`);
  - `setStatus` (`routes/(field)/my/portal.remote.ts`).
- **Five more places decide which transition is allowed:**
  - `isEditableOrder` and `orderStatusChoices` (`models.ts`);
  - `fieldActions` (`orders/field.ts`);
  - each writer's own guard;
  - the order page's buttons;
  - the engineer portal's own status list.
- **Seven module copies.** The modules copy core's status sets seven times.
- **Integration risk at the seams:**
  - invoicing skips the modules, and only a comment says that's safe;
  - the engineer portal sets the completion date its own way;
  - a consequence added to one writer gets forgotten in the others.
- **Symptoms:**
  - change amplification: a new status or rule touches ~12 places;
  - unknown unknowns: rules that are safe only by coincidence, written in comments.

## Decisions (grilling)

| #      | Decision                                                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1     | A pure refactor: transitions, refusals, messages and activity entries stay as they are. The order form keeps its single `updated` entry; the engineer keeps `work_started` and `completed` with `signedBy`.                                                |
| Q2     | Every status writer goes behind the interface: the list and bulk status change, invoicing, the planner's status part, accept and reject, the engineer's start and complete, and the form's status part. Deleting and assigning stay in `order-changes.ts`. |
| Q3     | Core owns only its own status sets. `getsChecklists` becomes the open statuses, and the seeds' `["completed", "invoiced"]` becomes `doneOrderStatuses`. Materials, contracts, maintenance and condition keep their own rules.                              |
| Q4, Q7 | A new `docs/agents/orders.md` describes the lifecycle, takes over "Orders awaiting acceptance" from `tenancy.md`, and gets one pointer line in `CLAUDE.md` (edit `AGENTS.md`, its target). No `GLOSSARY.md`.                                               |
| Q5, Q8 | Every transition will ask the modules. During the refactor the invoicing rows say "asks no module"; a separate behaviour commit removes the mark and adds a test.                                                                                          |
| Q6     | The browser-safe half exports one named rule per UI question, derived from the same table the server applies.                                                                                                                                              |

## Proposed interface

### Browser-safe half: `src/lib/orders/lifecycle.ts`

It is exported through `#lib/orders/index.ts`. It replaces `orders/field.ts`, takes `plannedStatus`
from `display.ts` and `orderStatusChoices` from `models.ts`. Core's status sets
(`openOrderStatuses`, `doneOrderStatuses`, `pendingOrderStatuses`, `manualOrderStatuses`,
`isOpenOrder`, `isDoneOrder`, `isAwaitingAcceptance`, `isEditableOrder`) stay in `models.ts`: the
schema, seed and queries share them.

```ts
export type OrderActor = "office" | "planner" | "acceptance" | "engineer" | "invoicing";

interface TransitionRule {
	by: OrderActor;
	/** The statuses it moves from. */
	from: readonly OrderStatus[];
	/** The statuses it moves to, or how the target follows (the planner's). */
	to: readonly OrderStatus[] | ((from: OrderStatus, engineerId: number | null) => OrderStatus);
	/** The activity entry's action. */
	action: CoreActivityAction;
	/** "follows": kept while done, set when it becomes done, cleared otherwise (default).
	 *  "at": the move's moment (the engineer's completion). "untouched": not written. */
	completedAt?: "follows" | "at" | "untouched";
	/** A move to the status it has: "skip" does nothing (default); "move" still writes and logs. */
	same?: "skip" | "move";
	/** Removed by the behaviour commit (Q8): every transition then asks the modules. */
	asksModules?: false;
	/** Why it can't move an order in its status. */
	refusal: (order: { number: string; status: OrderStatus }) => string;
}

export const orderTransitions = {
	set:       { by: "office", from: /* not invoiced, not awaiting */, to: manualOrderStatuses, action: "updated", refusal: … },
	plan:      { by: "planner", from: openOrderStatuses, to: plannedStatus, action: "scheduled", completedAt: "untouched", same: "move", refusal: … },
	accept:    { by: "acceptance", from: ["awaiting_acceptance"], to: ["quote"], action: "accepted", completedAt: "untouched", refusal: … },
	reject:    { by: "acceptance", from: ["awaiting_acceptance"], to: ["cancelled"], action: "rejected", completedAt: "untouched", refusal: … },
	start:     { by: "engineer", from: ["scheduled"], to: ["in_progress"], action: "work_started", completedAt: "untouched", refusal: … },
	complete:  { by: "engineer", from: ["in_progress"], to: ["completed"], action: "completed", completedAt: "at", refusal: … },
	invoice:   { by: "invoicing", from: ["completed"], to: ["invoiced"], action: "updated", asksModules: false, refusal: … },
	uninvoice: { by: "invoicing", from: ["invoiced"], to: ["completed"], action: "updated", asksModules: false, refusal: … },
} as const satisfies Record<string, TransitionRule>;

export type OrderVerb = keyof typeof orderTransitions;

/** Whether `verb` may move an order with `status` (its `from` check only). */
export const can: (verb: OrderVerb, status: OrderStatus) => boolean;
/** The page's Edit button and the form's guard: `can("set", status)`. */
export const mayEditOrder: (status: OrderStatus) => boolean;
/** The page's Delete button: not invoiced (an order awaiting acceptance may be deleted). */
export const mayDeleteOrder: (status: OrderStatus) => boolean;
/** The status cell's choices (was `orderStatusChoices`). */
export const statusChoices: (status: OrderStatus) => readonly OrderStatus[];
/** What the engineer may do in the field, derived from `start` and `complete` (shape unchanged). */
export function fieldActions(status: OrderStatus): { start: boolean; work: boolean; note: boolean };
export type FieldAction = keyof ReturnType<typeof fieldActions>;
/** Moved from display.ts: a quote that gets an engineer is scheduled. */
export const plannedStatus: (status: OrderStatus, engineerId: number | null) => OrderStatus;
```

**Invariant:** the rows are the only place that says which status may follow which, for whom,
with which entry. `can`, the UI rules and the server derive from them. The refusal messages stay
today's:

- office: `notEditable`, then `acceptFirst`;
- planner: `orders_only_open_scheduled`;
- acceptance: `orders_not_awaiting_acceptance`;
- engineer: `portal_start_first` / `portal_cant_change`;
- invoicing: none in core, because its caller refuses first with its own message.

### Server half: `src/lib/orders/server/lifecycle.ts`

It is exported through `#lib/orders/server/index.ts`. There are two names: `transitionOrder` and
`beginOrderChange`.

```ts
/** Who does one of the tenant's orders, when (moved from scheduling.ts). */
export interface OrderPlan {
	id: number;
	engineerId: number | null;
	day: Temporal.PlainDate;
	time: string;
}

export type OrderTransition =
	| { verb: "set"; id: number; to: ManualOrderStatus }
	| ({ verb: "plan" } & OrderPlan)
	| { verb: "accept"; id: number; plan?: Omit<OrderPlan, "id"> }
	| { verb: "reject"; id: number; reason: string }
	| { verb: "start"; id: number }
	| {
			verb: "complete";
			id: number;
			signoff: { signerName: string; signature: string; engineerSignature: string };
	  }
	| {
			verb: "invoice" | "uninvoice";
			orders: readonly { id: number; number: string; status: OrderStatus }[];
			note: string;
	  };

/** Single-order verbs resolve to the order; invoicing to nothing. */
export function transitionOrder(
	tx: Transaction,
	t: Exclude<OrderTransition, { verb: "invoice" | "uninvoice" }>,
): Promise<{ id: number; number: string }>;
export function transitionOrder(
	tx: Transaction,
	t: Extract<OrderTransition, { verb: "invoice" | "uninvoice" }>,
): Promise<void>;

/** The order form's handle: the guard first, the form's own writes, then `finish()`. */
export function beginOrderChange(
	tx: Transaction,
	id: number | null,
	to: ManualOrderStatus,
): Promise<OrderChange>;

export interface OrderChange {
	/** The order as loaded; undefined for a new one. */
	readonly before: OrderRow | undefined;
	/** The status columns to write with the form's: `{ status, completedAt }` ("follows"). */
	readonly columns: { status: OrderStatus; completedAt: Temporal.Instant | null };
	/** After the form's writes: asks the modules with the form's parts (also when the status
	 *  stays), a refusal becoming `invalid(...problems)` on the fields; then, for an existing
	 *  order, the one `updated` entry ({...before, ...extra.before} → extra.after, ignoring
	 *  completedAt). A new order gets none (`createOrders` logged it). */
	finish(
		order: { id: number; number: string },
		extra: { form: OrderFormParts; before?: object; after: object },
	): Promise<void>;
}
```

**Steps of `transitionOrder`**, always in the caller's `tx`:

1. Load the order in the verb's scope: `idInTenant`, plus `engineerId` = `currentEngineer()` for
   `start` and `complete`.
2. Check the row's `from`, refusing with its `refusal`.
3. Skip an idle `set`.
4. One update with the status, the completion date per the row, and the verb's columns (the
   planner's engineer and time; the planner checks the assignee first).
5. Ask the modules (`saveOrderParts`) unless `asksModules: false`.
6. The verb's own writes, in today's place:
   - accept and reject: the order request's decision;
   - complete: the sign-off upsert, with `signedAt` equal to the completion date.
7. One activity entry, built from the row's action plus the verb's note (the reason, the
   invoicing note) and `after` (`signedBy`).
8. For `accept` with `plan`: the `plan` verb next, in the same `tx`.

**Invoicing:** it moves only those of `orders` whose status is the row's `from`, with the two
updates `setOrdersStatus` makes today and one entry per order.

**Error modes** (always thrown, never returned):

- **No such order** in the scope: `error(404)` with today's message (`orders_not_found_plain`,
  or `portal_not_found_plain` for the engineer).
- **A rule refusal:** `invalid(message)`. For the planner, "only open" has no path, and the
  assignee problem has `path: ["engineerId"]`; both the schedule dialog and the acceptance form
  call that field `engineerId`.
- **A module's refusal:** `invalid(message)`, where message is `OrderRefused.message`, so every
  message stays as it reads today. From `finish()`: `invalid(...problems)` with their paths.

**Usage**

```ts
// list status cell, bulk
await db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: status }));
// planner (schedule.remote.ts plan()), accept with plan, reject
await db.transaction((tx) => transitionOrder(tx, { verb: "plan", ...input }));
const { number } = await db.transaction((tx) => transitionOrder(tx, { verb: "accept", id, plan }));
await db.transaction((tx) => transitionOrder(tx, { verb: "reject", id, reason }));
// engineer
const { number } = await db.transaction((tx) => transitionOrder(tx, { verb: "complete", id, signoff }));
// invoicing, inside its own transaction, after its own "not completed" check
await transitionOrder(tx, { verb: "invoice", orders, note: invoiceNote(found) });
// order form (saveOrder)
const change = await beginOrderChange(tx, id, fields.status);   // 404, notEditable, acceptFirst
// …type check, units, update with { ...values, ...change.columns } or createOrders(…)…
await change.finish({ id: orderId, number }, { form: modules ?? {}, before: { equipmentIds: unitsBefore }, after: { ...values, equipmentIds } });
// browser
{#if mayEditOrder(order.status)} … {/if}   {#if mayDeleteOrder(order.status)} … {/if}
```

**What it hides:**

- the transition table's enforcement and the guard order;
- every refusal message;
- the three completion-date policies;
- the single update;
- whether the modules are asked, and the `OrderRefused` → `invalid` mapping;
- the order request's decision and the sign-off;
- how the activity entry is built;
- idle skipping;
- invoicing's batch updates.

`findEngineerOrder` stays for the engineer's work that changes no status (`logHours`, `addNote`,
materials' field form) and refuses with the `start` and `complete` rows' messages.

## Cohesion statement

- **Single responsibility:** decides whether an order may move from one status to another, and
  makes the move.
- **Owns:**
  - the transition table;
  - the UI rules derived from it;
  - guard order and messages;
  - the completion date;
  - asking the modules;
  - the order request's decision and the sign-off as consequences of their verbs;
  - the activity entry of a move.
- **Stays out:**
  - creating orders (`createOrders`, `requestOrder`): a different concern, which the form's
    handle calls around;
  - deleting and assigning (`removeOrder`, `assignOrder`, `assigneeProblem`): not transitions;
  - the form's fields and units (`setOrderUnits`): the form's own change;
  - pricing;
  - each module's consequence of a status, which stays behind `orders.saving`;
  - `orders.committed` and the queries' refreshes: the callers keep emitting and refreshing as
    today (Q1). Moving them inside is a later behaviour change.

## Dependency strategy

Local-substitutable: the database runs on libsql in the unit suite, as `acceptance.spec.ts` and
`scheduling.spec.ts` do today. There is no port.

## Testing strategy

**New tests at the interface:**

- `src/tests/unit/lib/orders/lifecycle.spec.ts`:
  - the table's invariants: every `from` and `to` is a status, and `set.from` is exactly
    "not invoiced, not awaiting";
  - the five UI rules over all `orderStatuses`.
  - It absorbs `field.spec.ts`, `models.spec.ts`'s `orderStatusChoices` cases and
    `display.spec.ts`'s `plannedStatus`.
- `src/tests/unit/lib/orders/server/lifecycle.spec.ts`, table-driven over the verbs. For each
  verb it checks:
  - that it moves from each `from` and refuses from every other status with today's message;
  - status and completion date afterwards;
  - the one entry (action, changes, note, `signedBy`);
  - whether the modules were asked, through a made-up module registered as `hooks.spec.ts` does;
  - that a module's refusal rolls everything back;
  - the order request's decision and the sign-off;
  - the 404 and North/South isolation, also by a tampered id.

  It also pins that invoicing asks no module; the behaviour commit flips that case. One
  integration case with the real materials module stays: a stock shortage stores nothing.

- `beginOrderChange`: guard, idle save with parts, the single entry, no entry for a new order.

**Old tests to replace**, deleted in their own commit once the new ones pass:

- `scheduling.spec.ts`: the status and refusal cases (keep the time-zone and assignee cases if
  they don't move);
- `acceptance.spec.ts`: the accept and reject blocks and `changeOrderStatus`'s awaiting refusal
  (keep `requestOrder`);
- `changes.spec.ts`: the status cell's status cases (keep one test of the remote's 400 mapping);
- `routes/(field)/my/portal.spec.ts`: the status and log asserts (keep the 404 and tamper tests
  and one sign-off round trip);
- `field.spec.ts`, and `models.spec.ts`'s choices cases.

**Stay as they are:** `bulk.spec.ts`, `schedule.spec.ts`, the invoices specs, the modules'
save-hook tests, and every e2e file.

**E2e to run** (they don't change; they prove Q1):

- core: `orders.test.ts`, `orders.inline.test.ts`, `orders.bulk.test.ts`,
  `orders.tenancy.test.ts`, `client.acceptance.test.ts`, `portal.test.ts`, `portal.live.test.ts`;
- schedule: `schedule.test.ts`, `schedule.tenancy.test.ts`;
- invoices: `invoices.test.ts`, `credit-notes.test.ts`, `orders.bulk.test.ts`.

## Migration strategy

Incremental: old and new coexist per step, and each step moves callers and then deletes what
they stop using. Every step is a `refactor:` commit except the last, which changes behaviour.

## Implementation steps

1. **Baseline.**
   - Run the unit specs and e2e files above and record the result.
   - Check that the invoices unit specs cover issue and void moving the orders' status; if not,
     add characterization tests in a `test:` commit first.
2. **The browser-safe table** (`src/lib/orders/lifecycle.ts`, about 120 lines).
   - Move `fieldActions` (from `orders/field.ts`), `plannedStatus` (from `display.ts`) and
     `orderStatusChoices` (from `models.ts`, as `statusChoices`) into it.
   - Re-point their importers:
     - `status-cell.svelte`, `bulk-actions.ts`, the field portal pages and `work.ts`;
     - the modules' field remotes (checklists, condition, materials) and schedule's `board.ts`.
   - The order page uses `mayEditOrder` and `mayDeleteOrder`.
   - `getsChecklists = isOpenOrder`, and the two seed literals become `doneOrderStatuses`.
   - Move the lifecycle spec cases from the old specs.
3. **`transitionOrder` for `set`, `plan`, `accept`, `reject`** (`server/lifecycle.ts`).
   - `order-status.remote.ts` and `order-bulk.remote.ts` call it.
   - `schedule.remote.ts`'s `plan()` calls it; the board's `moveOrder` maps `invalid` to
     `error(400, message)`.
   - `acceptance.ts` keeps `requestOrder`; `acceptance.remote.ts` drops `PlanRefused` and its
     catches.
   - Delete `scheduling.ts`, plus `changeOrderStatus` and `completedAt` from `order-changes.ts`.
   - `OrderPlan` moves to `lifecycle.ts`.
4. **`start` and `complete`.**
   - `portal.remote.ts` drops `setStatus` and its `saveOrderParts` / `OrderRefused` imports.
   - `findEngineerOrder` refuses with the rows' messages.
5. **`invoice` and `uninvoice`**, with `asksModules: false`.
   - `invoice-status.remote.ts` calls `transitionOrder` and keeps its own "not completed" check
     and message (via `can("invoice", …)`).
   - Delete `setOrdersStatus`; update the comment in `boundaries.spec.ts`.
6. **`beginOrderChange`.**
   - `saveOrder` uses it; `createOrder` and `updateOrder` keep their `OrderRefused` catch for the
     units hook (`setOrderUnits`).
   - `notEditable` and `acceptFirst` move into `lifecycle.ts`; `order-changes.ts` imports them
     relatively for `removeOrder` and `assignOrder`.
7. **Cleanup.**
   - Trim `server/index.ts` to what is used outside the domain (`pnpm knip`).
   - Write `docs/agents/orders.md` (the lifecycle, plus "Orders awaiting acceptance" moved from
     `tenancy.md`).
   - Update `modules.md`'s references to `setOrdersStatus` and `scheduleOrder`.
   - Add the pointer in `AGENTS.md`.
   - Run `pnpm run check`, `pnpm knip`, then the specs and e2e files above.
8. **Behaviour commit** (Q8).
   - Remove `asksModules: false` from `invoice` and `uninvoice`.
   - Flip the pinned case.
   - Add a test that a module's refusal stops an invoice being issued, with the order's number in
     the message.

Scope: about 600 lines touched over ~25 files. Steps 2–6 each fit a session's context; the whole
plan fits one or two sessions.

## Follow-ups (behaviour changes, not in this work)

- The edit page and the bulk "skip" still use `isEditableOrder` (not invoiced). Switching them to
  `mayEditOrder` would hide the form for an order awaiting acceptance, which saving refuses today
  anyway.
- `orders.committed`: only the form and the engineer portal emit it after a status change. The
  lifecycle could emit it for every move.
