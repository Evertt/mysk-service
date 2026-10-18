# Review follow-ups (develop vs main, 2026-10-18)

What's still open after the review of `develop`: points that came up while fixing its findings,
and the lower ones its slice reviews noted. Each says where, what's wrong, and how it shows.
Verify against the code before fixing: lines drift.

## Noted while fixing

- README's "Deploying" section still describes adapter-node and `node build`; the app builds with
  adapter-auto (Vercel) or adapter-cloudflare since 64009fff.
- `searchMatch()` in `src/lib/server/lists/plan.ts` binds each search word once per column; the
  Connect list now joins its columns into one expression, but every list with many search columns
  has the same budget.
- `completeWork`'s activity entry names the signer in its note only, not as a field in `after`.
- `order-form.svelte`'s fix for clearing all units (ranking engineers by the units still chosen)
  has no test: the order form has no component-test harness.

## Lower, noted by the slice reviews

- `src/modules/partner-programme/model.ts:262` with `display.ts:13`: rounding shows "€50,000 of
  €50,000 · 100%" at €49,999.50, while `levelFor` (rightly) gives no level.
- Partners list's wallet column sorts by `max(0, sum(amount))`, including credit past its date
  until the daily expiry runs; the card shows `available`.
- `src/modules/partner-programme/client/client-partner.remote.ts:34`: the portal's "awaiting"
  choice looks at the 3 latest closed years only.
- `src/modules/invoices/detail/credit-note.remote.ts` (`updateCreditReason`): another module's
  credit note's reason is still editable (its lines are locked now).
- `src/modules/checklists/client/client-checklists.remote.ts` (`getClientOrderChecklists`): still
  returns an order's draft checklists to the customer; `loadWorkOrder` gives the customer's work
  order full engineer and office names (maybe intended on a printed work order).
- `src/modules/checklists/server/unit-inspection.ts:21-31` vs `inspection-sql.ts:32-38`: JS takes
  the newest completed inspection (none if its `validUntil` is null), SQL skips those; may not
  occur in practice.
- Docks/energy switched off: removing a site doesn't ask them (the kernel asks only modules that
  are on), so their leftover data still cascades.
- `src/lib/equipment/labels/labels.remote.ts:35,80`: `location` and `unit` together always 404.
- `src/lib/orders/types.ts:99-104`: the "last visible type" refusal can't trigger (breakdown is
  always required) and counts stored, not effective, settings.
- `src/lib/equipment/locations/locations.remote.ts:86`: units sorted by `asc(name)`, NULLs first;
  elsewhere `coalesce(name, manufacturer)`.
- `src/lib/customers/detail/activity.remote.ts:50-53`: `withUnitIds` and `listedUnitsOf` both
  query `order_unit` for the same orders.
- `src/modules/schedule/board/schedule-board.svelte:55`: day view uses the week's orders for its
  engineers (an inactive engineer with an order another day gets an empty row).
- `src/modules/schedule/schedule.remote.ts:63-82`: `withFirstUnit` and `withSpecialties` run two
  near-identical joins over the same orders.
- `src/modules/schedule/schedule.remote.ts:168`: `changedAt` compared with a strict `>` on epoch
  ms: a change in the same millisecond after the read leaves the board stale (very unlikely).
- `src/modules/materials/server/articles.ts:14,28`: `ALL_MAX = 2000` truncates silently.
- `src/routes/(field)/phone-frame.svelte`: the status-bar clock renders the server's time until
  the first 15-second tick.
- `src/lib/i18n/format.ts` (`formatTimeSlot`): `new Date(…)` instead of Temporal (correct output).
- `src/modules/energy/server/figures.ts:233`, `thresholds.ts:31`, `live-simulation.ts:104`:
  `energyThreshold` joined without `tenantJoin()` (no leak: ids are global, the key has the
  tenant).
- `src/modules/energy/overview/clock.svelte.ts` and `docks/board/clock.svelte.ts`: identical
  `Clock` classes but for the interval.
- Condition: the latest-component-score subquery is written twice
  (`checklist-components.ts:24-28`, `status-sql.ts:56-74`); `checkedComponents()`
  (`conditions.ts:139-170`) repeats `componentsOfUnits()`'s query; the facets' customer lookup is
  copied between `checklists/assets/assets.remote.ts:71-84` and `condition/list/units-list.remote.ts:111-122`.
- `src/modules/checklists/server/seed-checklists.ts:186`: `validUntil` in a hard-coded
  `Europe/Amsterdam`.
- Energy spec question: a zone's daily kWh breach raises a new alert every local hour of the day
  (zone alerts are keyed by zone, day and hour).
