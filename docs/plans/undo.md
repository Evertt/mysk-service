# Undo

A wish of 23 October 2026, not grilled yet. Its open questions are at the end.

## Problem

In the office app a change takes effect at once: a status changed in its cell, a unit or an order
deleted, a bulk action on 40 rows. The toast says it's done, but a slip can't be taken back. For a
delete, a confirmation dialog stands in for undo, and it slows down every delete made on purpose.

The wish: the change shows at once, as now, and its toast offers **Undo** for 30 seconds.

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
  - the entries are this tenant's and this user's;
  - they're younger than the window (30 s, plus a few seconds for latency, checked on the server);
  - they weren't undone yet.

  Then it reverses them in one transaction, newest first, and logs the undo itself (`"undone"`,
  pointing at the entry it reverses). The live feeds and the record's history update as for any
  change.

- **Nothing is overwritten silently.** A field is only put back if it still has the value the entry
  set. If someone changed it since, the undo is refused for that record: "Changed by Anna since". In
  a bulk undo, that record is skipped with its reason (`BulkResult.skipped`), like a bulk action's
  skips.

### How each kind of change is undone

Every mutation that offers undo says how, on the server, next to the code that makes the change:

- **Field changes** (most edits, inline cells, assigning an engineer): undone from the entry's
  changes. This is the default and needs no code per mutation.
- **Status changes of an order:** back through `transitionOrder()` with the status it had, so stock
  moves, completion dates and module hooks (`saveOrderParts`) reverse the normal way. If the
  lifecycle table (`#lib/orders/lifecycle.ts`) doesn't allow the move back, there's no undo. That
  covers completion with signatures and invoicing.
- **Creates:** undone as a delete, with the same checks as a delete by hand (`defineRemoval`'s
  blockers).
- **Deletes:** see below.
- **Not undoable:** sending something, invoicing, sign-off, anything a module marks so. Their toast
  has no Undo button, and their confirmation dialog stays.

### Deletes: hidden first, removed later

Deletes are hard today (`deleteAndLog()` in `src/lib/server/records.ts`). Rebuilding an order from
a snapshot, with its lines, notes, units, stock moves and module records, is the fragile part, so we
don't:

- A delete of a record type that offers undo sets `deletedAt` on its row, and only on that row. Its
  children stay as they are.
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
  The optimistic update reverses at once, and the server's answer settles it.
- One toast per change. A second change doesn't cancel the first one's Undo.
- The keyboard: Ctrl/Cmd+Z undoes the newest toast's change while it's open, unless focus is in a
  text field.
- No undo in the engineer and customer portals for now.

## Open questions

1. **Whose changes can be undone?** Only your own, is the proposal. A manager undoing a colleague's
   change is "reverting from the history", a different feature.
2. **Is the window 30 s exactly?** After it, the toast's button goes away; the server allows a few
   seconds more. Or longer for deletes (e.g. 5 minutes), since the purge can wait anyway?
3. **Do deletes lose their confirmation dialog** once they can be undone? Single deletes probably
   yes; bulk deletes of hundreds of records maybe keep it.
4. **Which record types get soft delete first?** Orders and units, where the list shows a delete. The
   others keep hard deletes and simply offer no undo until they're added.
5. **Unique keys while hidden.** A deleted unit's serial number stays taken until the purge. Is
   "serial in use" for a few seconds acceptable, or does the check ignore hidden rows (and the purge
   then has to handle the clash)?
6. **Undo of an undo (redo)?** Proposed: no. The undo's own toast just says "Undone".
7. **Is the undo visible in the history?** As a "undone" entry under the original, or should both
   entries collapse into nothing? Keeping both is honest, and simpler.
8. **Module changes:** a module's mutation gets field undo by default. Does a module have to declare
   "undoable" explicitly, or opt out?
9. **Several tabs:** the token lives in one tab's toast only. Undo after a reload is out of scope.

## Steps

1. `recordActivity` returns the entry id; `activity.groupId` for bulk changes; the `undo` command for
   field changes of orders, units and customers, with the "changed since" check. Undo in the toasts of
   inline cells and edit forms.
2. Order status: undo through `transitionOrder()`, only where the lifecycle allows the move back.
3. Bulk actions: one token per action, skips in the undo's result.
4. Soft delete with purge for orders and units, the scoping helpers, the guard spec, and undo for
   their deletes. Revisit the delete dialogs (question 3).
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
  - a hidden record can't be read through any scoping helper;
  - the purge removes it with its children.
- E2e, per section that offers it: change a status inline, press Undo and see it back; delete a
  unit, press Undo and find it in the list. One tampered `undo` call with a foreign token.
