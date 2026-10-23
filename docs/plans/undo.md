# Undo

A wish of 23 October 2026, after grilling (Q1–Q11 below). Not built yet.

## Problem

In the office app a change takes effect at once: a status changed in its cell, a unit or an order
deleted, a bulk action on 40 rows. The toast says it's done, but a slip can't be taken back. For a
delete, a confirmation dialog stands in for undo, and it slows down every delete made on purpose.

The wish: the change shows at once, as now, and its toast offers **Undo** for 30 seconds.

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Only your own changes** can be undone. Undoing a colleague's change from the history is a different feature, for later.                                                                                                                     |
| Q2  | **30 seconds for everything**: the toast, the server's check (plus a few seconds of grace), the purge of hidden records, and the delay of effects outside the app. One constant.                                                              |
| Q3  | **A single delete of a type with undo has no confirmation dialog**: the toast's Undo replaces it. Bulk deletes keep their dialog, and so do the deletes of types without undo.                                                                |
| Q4  | **Orders and units** get the hidden-then-purged delete in the first version. Every other type keeps its hard delete, without Undo and with its dialog.                                                                                        |
| Q5  | A hidden unit's **serial number stays taken** until the purge. Creating one with it within those seconds gets the existing "serial taken" refusal. Nothing to build.                                                                          |
| Q6  | **No redo.** The undo's own toast just says "Undone".                                                                                                                                                                                         |
| Q7  | **The history keeps every entry**: the original, marked undone, then an `"undone"` entry with the fields put back. One new activity action.                                                                                                   |
| Q8  | **Undo is opt-in per mutation**: a command returns an undo token only when its code says how it's undone. The first version opts in the orders' and units' edits, inline cells, status, assigning and deletes. Modules follow when they want. |
| Q9  | **The token lives in the toast only.** A reload or a closed tab ends it; client-side navigation keeps it.                                                                                                                                     |
| Q10 | **Ctrl/Cmd+Z** undoes the newest open toast's change, unless focus is in a text field.                                                                                                                                                        |
| Q11 | **Undo never navigates.** Undoing a delete made on a detail page leaves you on the list, where the record reappears.                                                                                                                          |

## Two ways considered

1. **Hold the request in the client** for 30 seconds and only send it when nobody pressed Undo.
   Rejected:
   - The tab has to stay open, or the page blocks closing it.
   - The toast says "deleted" before the server has checked anything. A refusal ("ORD-12 is
     invoiced") arrives 30 seconds later, when the user is elsewhere.
   - Colleagues, the live feeds and the bell see the old state for 30 seconds.
2. **Send it at once, and keep a reverse action.** Chosen, but the reverse is worked out **on the
   server, from the activity log**, not sent as a compensating command by the client. The client
   only holds a token.

## Design

### The log is the undo record

Every mutation already calls `recordActivity(tx, { action, subject, before, after })` in its
transaction (`src/lib/server/activity/log.ts`), and the entry stores each changed field's old and
new values (`ActivityChanges`). That's what an undo needs for an update.

- `recordActivity` returns the new entry's id. A command that wants undo returns an **undo token**:
  the entry's id, or for a bulk action (`bulkChange()`) a group id that its entries share (a new
  `activity.groupId` column).
- One server command, `undo({ token })`, gated `forMembers`. It checks:
  - the entries are this tenant's and this user's (Q1);
  - they're younger than the window (30 s, plus a few seconds for latency, checked on the server);
  - they weren't undone yet.

  Then it reverses them in one transaction, newest first. It marks each original entry undone (a
  new `activity.undoneAt` column) and logs the undo itself as an entry with the new action
  `"undone"`, which lists the fields put back and points at the original (Q7). The live feeds and
  the record's history update as for any change.

- **Nothing is overwritten silently.** A field is only put back if it still has the value the entry
  set. If someone changed it since, the undo is refused for that record: "Changed by Anna since". In
  a bulk undo, that record is skipped with its reason (`BulkResult.skipped`), like a bulk action's
  skips.

### How each kind of change is undone

Undo is **opt-in** (Q8). A mutation offers it only when it says how it's undone, on the server, next
to the code that makes the change; only then does its command return an undo token. That way no
toast offers an undo that would be wrong: undoing only the logged fields of an order line whose
quantity moved stock would leave the stock wrong. The ways:

- **Field changes** (edits, inline cells, assigning an engineer): undone from the entry's changes.
  No code per mutation besides opting in.
- **Status changes of an order:** back through `transitionOrder()` with the status it had, so stock
  moves, completion dates and module hooks (`saveOrderParts`) reverse the normal way. If the
  lifecycle table (`#lib/orders/lifecycle.ts`) doesn't allow the move back, there's no undo. That
  covers completion with signatures and invoicing.
- **Creates:** undone as a delete, with the same checks as a delete by hand (`defineRemoval`'s
  blockers). Not in the first version: a create's form redirects to the new record's page.
- **Deletes:** see below.
- **Everything else** (sending something, invoicing, sign-off, and every mutation that hasn't opted
  in): no Undo button, and its confirmation dialog stays.

The first version opts in, for orders and units: their edit forms, their inline cells, an order's
status, assigning an engineer, the bulk actions on those fields, and their deletes. Modules opt in
their own mutations when they want.

### Deletes: hidden first, removed later

Deletes are hard today (`deleteAndLog()` in `src/lib/server/records.ts`). Rebuilding an order from
a snapshot, with its lines, notes, units, stock moves and module records, is the fragile part, so we
don't:

- A delete of a record type that offers undo sets `deletedAt` on its row, and only on that row. Its
  children stay as they are. In the first version: orders and units (Q4).
- A **single** delete of such a type has no confirmation dialog any more; the toast's Undo replaces
  it. Bulk deletes keep theirs, since they say how many records and which are skipped (Q3).
- A **purge** removes the rows for real once the window has passed. It runs as a Durable Object
  alarm on Cloudflare and a timer on Node, and also catches up on start for any it missed. It runs
  `defineRemoval`'s delete path, so cascades and module cleanup run as they do today, only later.
- Undo clears `deletedAt`.
- **Hiding:** for the tables that have `deletedAt`, `inTenant()`, `idInTenant()`, `idsInTenant()`
  and `tenantJoin()` add `deletedAt IS NULL`. Almost every query goes through them, so this is one
  change. A guard spec checks that each table with the column is read only through them.
- Refusals stay as they are: `blockers` are checked when the user deletes, not when the purge runs.
  If the purge is refused anyway (a reference made in the meantime), the row stays deleted-hidden.
  The error log says so; that should never happen.
- **Unique keys:** a hidden unit's serial number stays taken until the purge, about 30 seconds.
  Creating a unit with it meanwhile gets the existing "serial taken" refusal (Q5). Order numbers are
  never reused, so they don't clash.

### Effects outside the app wait out the window

Whatever a change sends out of the app (mail, webhooks, later the PDF report from
[service-report-pdf.md](service-report-pdf.md)) is queued with a delay of the window. It's skipped
if its entry was undone by then. On Cloudflare that's a Queue message with `delaySeconds`, or the
same alarm as the purge.

The bell's notifications are picked from log entries, so a rule skips entries that were undone, and
the tray drops them. Live feeds need nothing: the undo is a change like any other.

### The client

- The command helpers that toast (`submitted()` in `#lib/components/form/submitted.ts`, the bulk
  actions' run) read the undo token from the result. If there is one, the success toast gets an
  **Undo** action and lasts 30 seconds. `svelte-sonner` supports both.
- Undo calls `undo({ token })` and refreshes what the original command refreshed (`.updates(...)`).
  The optimistic update reverses at once, and the server's answer settles it. The undo's own toast
  says "Undone", without a Redo (Q6).
- **Undo never navigates** (Q11). A delete on a detail page goes to the list, as now. Undo there
  makes the record reappear in the list, and you stay on it.
- One toast per change. A second change doesn't cancel the first one's Undo.
- **Ctrl/Cmd+Z** undoes the newest open toast's change, unless focus is in a text field (an input,
  a textarea, a contenteditable) (Q10).
- **The token lives in the toast only** (Q9): client-side navigation keeps the toast, a reload or a
  closed tab ends it. The change then simply stays.
- No undo in the engineer and customer portals for now.

## Out of scope

- Undoing other people's changes, or reverting from the history (Q1).
- Redo (Q6).
- Undo after a reload, in another tab, or from a list of recent changes (Q9).
- Undo in the engineer and customer portals.
- Hidden-then-purged deletes for customers, engineers and the other types (Q4); each is a column, a
  migration and opting in, later.
- Undo of creates.

## Steps

1. The opt-in, the token and the `undo` command, for field changes of orders and units:
   `recordActivity` returns the entry id; `activity.undoneAt`; the `"undone"` action with its labels
   (en and nl); the "changed since" check. The Undo action in `submitted()`'s toast, for the edit
   forms and inline cells. Ctrl/Cmd+Z.
2. Order status: undo through `transitionOrder()`, only where the lifecycle allows the move back.
   Assigning an engineer.
3. Bulk actions: `activity.groupId`, one token per action, skips in the undo's result.
4. Hidden-then-purged deletes for orders and units: `deletedAt`, the scoping helpers, the purge, the
   guard spec, undo for their deletes, and their single deletes without a dialog.
5. Delayed outside effects, and the bell skipping undone entries.

## Tests

- Server specs of `undo`:
  - an update is reversed;
  - a field changed since is refused;
  - a token older than the window is refused;
  - another user's token is refused;
  - South's token is refused for a North user, also when tampered with;
  - a bulk undo skips with reasons;
  - a status undo goes through the lifecycle;
  - a mutation that hasn't opted in returns no token;
  - the original entry is marked undone and an `"undone"` entry follows it;
  - a hidden record can't be read through any scoping helper;
  - the purge removes it with its children.
- E2e, per section that offers it:
  - change a status inline, press Undo and see it back;
  - delete a unit from its page (no dialog), press Undo on the list and find it there;
  - Ctrl/Cmd+Z undoes, but not while typing in a field;
  - one tampered `undo` call with a foreign token.
