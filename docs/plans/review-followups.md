# Review follow-ups (develop vs main, 2026-10-18)

The second-pass review of `develop` found 32 issues; 13 are fixed (merged 2026-10-18). These are
the ones still to fix, most severe first, then the lower ones the slice reviews noted. Each says
where, what's wrong, and how it shows. Verify against the code before fixing: lines drift.

## Still to fix

1. **`src/lib/equipment/server/locations.ts:66`, `categories.ts:68`**: the duplicate-name check
   compares SQLite `lower()` (ASCII only) with JS `toLowerCase()` (Unicode), while the unique index
   uses SQLite `lower()`. Typing an existing "Één" again misses the check, hits the index: a 500
   instead of "name taken"; `locationAt()` in the equipment form crashes instead of reusing it.
   Compare `lower(col) = lower(?)` in SQL.
2. **`src/modules/docks/routes/(api)/ingest/+server.ts:19`**: `request.json()` with no body limit;
   `maxBatch` is checked after parsing. Read it like the energy feed does (`textUpTo()` in
   `src/modules/energy/routes/(api)/ingest/+server.ts`; share it).
3. **`wrangler.jsonc:19`**: the every-minute `* * * * *` tick cron is top-level, so production
   gets it too: with the demo imported, SHLTR's simulations run around the clock, waking the
   Durable Object every minute; at 04:00 UTC it fires with the daily job. Staging only?
4. **`src/modules/materials/api/lines.server.ts:25-59`**: `addOrderLine()` changes an order's
   lines, stock and price without `orders.committed` (the engineer portal's materials card and
   contracts' coverage aren't refreshed), and skips `checkLines()` (tenant's material,
   `fitsUnit`): a foreign `materialId` on a quote is a 500 instead of a 404. Also the "can take
   lines" predicate is duplicated in `parts-shop/suggestions/suggested-parts.remote.ts:76-79`.
5. **`src/routes/(field)/my/portal.remote.ts` (`completeWork`)**: the sign-off's engineer name is
   whatever the client sends (an engineer can sign as another); store `engineer.name`. It also
   logs "completed" before the sign-off upsert, so the log can't show who signed.
6. **`src/modules/partner-programme/form/rules-form.svelte:105-107, 128-130, 145-147`**: number
   inputs write `Number(value)` back, so clearing a threshold snaps it to 0, and a half-typed
   "3." may become 8% in some browsers.
7. **`src/modules/checklists/server/checklists.ts:79-121` (`createChecklists`)**: per unit,
   `offeredTemplate()` + insert + `insertRows()` inside the order's transaction: a 50-unit
   inspection runs ~150 statements while holding every other request on Cloudflare.
8. **`src/modules/checklists/server/checklists.ts:66-67` (`onRecord`)**: a draft with point remarks
   or the customer remark but no results counts as not on record and is deleted silently when the
   unit leaves the order or the type changes.
9. **`src/modules/energy/server/setup.ts:221, 443, 643`**: `deleteEnergySite`, `deleteZone`,
   `deleteDoor` check "has measurements" outside the deleting transaction: a batch committed in
   between is cascade-deleted.
10. **`src/lib/orders/server/list-sql.ts:151-152`**: the units column sorts by manufacturer/model
    but shows `unitTitle()` (the unit's name first); the equipment list sorts by
    `coalesce(name, manufacturer)`. Rows read out of order.
11. **`src/lib/equipment/form/equipment-schema.ts:52` vs `locations/location-schema.ts:18`**: a new
    location's name may be 120 characters from the equipment form, 80 in the location form, so
    such a location can't be saved unchanged.
12. **`src/modules/materials/detail/parts-used.remote.ts:39`**: `onUnit()` credits the full quantity
    of every line of a multi-unit order to each unit (one spring set shows on all 15 doors).
    Documented as deliberate; a product question.
13. **`src/lib/orders/form/order-form.svelte:65`**: `chosenIds?.length ? … : initialUnits` falls
    back to the order's original units when all are cleared, so engineers are ranked for units no
    longer on it. Use `chosenIds ?? initialUnits` as `units-field.svelte` does.
14. **`src/modules/energy/energy.remote.ts:34-58`, `client/client-energy.remote.ts:35-59`**: ~9
    queries per site (40 sites: ~350 per `/energy` load). And `figures.ts` "latest" query
    (~264-272) scans every reading the zones ever had; `simulatedSites()` in `live-simulation.ts`
    seeks per zone instead.
15. **`src/routes/(field)/my/work.ts:80`**: two signatures of up to 500,000 characters each exceed
    adapter-node's default 512 KB body limit: a 413 instead of a message (if the Node deploy uses
    adapter-node; unconfirmed).
16. **`src/modules/invoices/invoicing.remote.ts:110`**: the dashboard's refunds figure leaves out
    sent credit notes offset against a sent invoice, while its link
    (`/invoices/credit-notes?status=sent`) lists all of them.
17. **`src/modules/energy/routes/(app)/[site]/report/+page.svelte:26`**: the default range is built
    in `getTimeZone()`, the server counts days in the site's `timeZone`: a day or month off near
    midnight or on the 1st for a user elsewhere.
18. **`src/modules/condition/server/list-sql.ts:111-121`**: 9 search columns × up to 10 words, plus
    scope, filters and paging, bind 98 of 100 values; one more column or filter and a full search
    throws `TooManyParameters`. Cap words by column count.
19. **`src/modules/docks/board/board.remote.ts:73-82`**: recent sessions, one query per dock.

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
