# Counts and count order in the record filters

Wish 5 of 19 October 2026, after grilling (Q11, Q12), and the filter bugs found along the way.

## Problem

A relation column's filter (`src/lib/components/data-table/record-filter.svelte`) gets its options
from a remote query in `src/lib/components/data-table/filter-options.remote.ts`:
`getCustomerOptions`, `getEngineerOptions`, `getLocationOptions` and `getEquipmentOptions`.

- **How the options are chosen:** 20 matches of the search, sorted by name. The queries don't know
  the list or its other filters.
- **Where the counts come from:** a separate source, the list's facets query, through the `counts`
  prop. `getOrderFacets` and `getEquipmentFacets` count under the search and every other filter, but
  not the facet's own filter (`plan.where(except = id)`, `src/lib/server/lists/plan.ts:136`).
- **Customer filters have no counts.** Orders' and equipment's customer filters pass no `counts`,
  so the right side shows the customer's code (`CUST-0016`). Engineer, equipment and location
  filters show counts already. Equipment shows its serial and the count.
- **Options aren't sorted by count.** A count only exists for a value the matching rows have. The
  20 options are chosen alphabetically, so the customer with the most orders may not be among them.

Bugs found, to fix here:

- `equipment.manufacturer`'s empty option has no label. Orders' engineer filter shows
  "Unassigned"; this one should show its equivalent, e.g. "No manufacturer".
- The `equipment.location` filter's list layout is broken. Look at it in the browser at desktop and
  phone widths.
- On `/condition`, a table with 1–2 rows scrolls about 20 px inside itself. The hidden widest-cell
  rows in the `tfoot` (`data-table.svelte`, the `collapse` row) stick out under the table. The
  condition table's two-line cells overflow despite `overflow-hidden`. `/orders` doesn't do this.
  Found while fixing the table's height (branch `table-fill-height`). Start from that branch's
  `data-table.svelte` if it's merged by then.

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q11 | Options are sorted **by count, most first, then by name**, both with an empty search box and while typing. The count is the number of matching rows under the list's other active filters, as the other facets count. Options with 0 come last, greyed, still selectable. |
| Q12 | **Check every record filter** in every list (the table below), and give each a count. It may turn out that only the customer filters need one. Fix the bugs above, and whatever else turns up along the way, listed in this plan.                                         |

The record filters to check:

| List                                             | Filter                                              | File                                                |
| ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------- |
| orders                                           | customer                                            | `src/lib/orders/list/orders-table.svelte:95`        |
| orders                                           | equipment                                           | `src/lib/orders/list/`                              |
| orders                                           | engineer                                            | `src/lib/orders/list/`                              |
| equipment                                        | customer                                            | `src/lib/equipment/list/equipment-table.svelte:144` |
| equipment                                        | location                                            | `src/lib/equipment/list/`                           |
| condition                                        | customer                                            | `src/modules/condition/list/units-table.svelte:195` |
| maintenance due                                  | customer                                            | `src/modules/maintenance/list/due-table.svelte:78`  |
| checklists assets                                | customer                                            | `src/modules/checklists/assets/`                    |
| contracts, invoices, credit notes (browser-side) | their relation filters, counted by `recordFacets()` | `src/lib/components/data-table/record-facets.ts`    |

## Design

- **Options and their counts come from one query, made per list.** That's the only way the
  ordering by count can see the list's filters. A shared helper in `src/lib/server/lists/`, e.g.
  `facetOptions(listSql, input, facetId, source)`, does this:
  - takes the list's query (as the facets query does) and the filter's search
  - counts the list's rows per value under `where(except = facetId)`
  - joins the matching records (customers, engineers, …) of the tenant, including those with 0
  - sorts by count desc, then name
  - returns the first 20, plus the ticked ones, plus the "none" option with its count

  Each list's remote file exports its record filters' options queries made with it. They use the
  list's gate, so a module list's options use its `moduleRemote()`. The generic `get*Options`
  queries go where nothing uses them any more. Write down in the code why it's per list, not one
  query taking a list key: the gate and the list's SQL stay with the list.

- **Tenancy:** the records joined are the tenant's (`inTenant`). The count's rows are the list's
  rows, which `planList` already scopes. The value the URL carries (a customer's code) stays.
- **`record-filter.svelte`:**
  - Shows the count on the right instead of the code, so the code is no longer shown. The code stays
    searchable. Equipment keeps its serial as a second line with the count on the right, as now.
  - Greys options with 0.
  - Keeps the current order of groups: the "none" option, then ticked options the search didn't
    find, then the results. The results are now in count order.
  - Refetches when the list's filters change, not only on typing.
  - If the separate `counts` prop is no longer needed, remove it.
- **Browser-side tables:** sort `recordFacets()`' options by count, then name, and grey the 0s, so
  they behave the same.
- **Check the record filters' look** against the faceted filters (`FacetedFilter`): the count's
  alignment and number format (`#lib/i18n/format.ts`), and the empty state.

## Tests

- **Unit:** the sorting and its ties (equal counts by name, 0s last, ticked first).
- **Server spec** per list's options query:
  - The counts respect the search and the other filters, not the filter's own.
  - A customer with 0 matching rows is included.
  - South's options and counts never include North's records, also with a tampered list query or
    ticked values naming North's codes.
- **e2e:**
  - Orders' customer filter shows counts, most first. Narrowing by status changes them.
  - The manufacturer filter's empty option has its label.
  - The location filter's list is laid out like the others (bounding boxes, no overlap).
  - `/condition` with one row doesn't scroll inside the table.

## Out of scope

New filters, faceted filters other than the label and layout fixes, and changing which values the
URL carries.

## As built (19 October 2026, branch `record-filter-counts`)

### What every record filter had, and has now

| List                              | Filter                      | Before                                                                                                                                             | Now                                                                                    |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| orders                            | customer                    | no counts, the code on the right                                                                                                                   | `getOrderCustomerOptions`: counts, most first                                          |
| orders                            | engineer                    | counts (`getOrderFacets`), options by name                                                                                                         | `getOrderEngineerOptions`, most first; "Unassigned" counted                            |
| orders                            | equipment                   | counts (`unitFacets`), options by make                                                                                                             | `getOrderEquipmentOptions` (`unitCounts`: an order under each unit), serial underneath |
| equipment                         | customer                    | no counts, the code on the right                                                                                                                   | `getEquipmentCustomerOptions`                                                          |
| equipment                         | location                    | counts, but broken: the site (`shrink-0`) squeezed the name to "1…" and pushed the count out                                                       | `getEquipmentLocationOptions`, the site on a second line                               |
| equipment                         | manufacturer (faceted)      | an empty option without a label (SHLTR's imported units), which couldn't even be ticked                                                            | `orNone(code)`, "No manufacturer" (`?manufacturer=none`)                               |
| condition                         | customer                    | no counts                                                                                                                                          | `getConditionCustomerOptions` (the module's `query`)                                   |
| maintenance due                   | customer                    | no counts                                                                                                                                          | `getDueCustomerOptions` (the module's `query`)                                         |
| checklists assets                 | customer (a native select)  | counts (`customerFacet()`); the chosen customer vanished when the year left none of theirs, and the select said "All customers" over an empty list | the chosen one stays, with 0; still by name (a native select)                          |
| contracts, invoices, credit notes | customer (`recordFacets()`) | counts, by name, the code shown                                                                                                                    | most first, 0s greyed, the code searchable but not shown                               |

### Built

- `facetOptions(listSql, input, facetId, records, counted)` in `src/lib/server/lists/facet-options.ts`
  (with `facetOptionsInput(list)`, `RecordSource` and `parseIds`). One statement per answer: the
  tenant's records left-joined to a subquery of the list's rows counted by value under
  `plan.where(facetId)`, sorted by count, then name. `counted` is `{ by }` (a value of the list's
  query) or `{ count }` (a grouped select of its own, for orders' units), plus `none` for the
  "none" option's count. The record sources: `customerRecords()` (`lists/customer-facet.ts`, used by
  four lists), `engineerRecords()` and `unitRecords()` (orders' `list-sql.ts`), `locationRecords()`
  (equipment's). Why per list and not one query with a list key is at the top of the file.
- `filter-options.remote.ts` is gone; `getOrderFacets` no longer counts engineers and units, nor
  `getEquipmentFacets` locations; `RecordFilter`'s `counts` prop is gone.
- `recordOptions(query, where, columnId)` (`server-table.svelte.ts`) makes a `RecordFilter`'s `load`
  from the list's options query and the rows' `whereOf()`, without the filter's own values (which
  its counts don't depend on, so ticking doesn't fetch again), and a new `load` only when the
  where changes by value.
- `RecordFilter`: the count on the right (`formatNumber`), greyed at 0 (`data-no-rows`), a detail
  (a unit's serial, a location's customer and site) on a second line; it shows an answer only for
  the `load` it was asked with, so on opening it after the other filters changed it doesn't show
  the old counts while the new ones come. The order of groups is `recordOptionsInOrder()` in
  `record-facets.ts`, with `byCount`, which `recordFacets()` sorts by.
- `FacetedFilter`: an option may carry its own `count` (greyed at 0) and `keywords` (searched, not
  shown), in place of `detail`; counts through `formatNumber`; the checkbox doesn't shrink.

### Deviations

- Greying 0s is only for the options of record filters (`RecordFilter`, and `FacetedFilter`'s
  options with a `count`, from `recordFacets()`), not for the status or type filters: out of scope.
- "Refetches when the list's filters change": a filter's popover closes when another filter is
  changed, so it fetches on the next opening (with the new `load`), not while open.
- The checklists' customer select keeps its order by name: a native select is read by scanning for
  a name.

### Also found and fixed

- `/condition`'s table scrolling ~20 px inside itself with one row: not the cells' overflow but
  positioned content in them (a status's `sr-only` text and dot), which `overflow: hidden` on a
  static cell doesn't clip, so it hung below the collapsed widest-cell rows. The `tfoot` rows' cells
  are now `relative` (`data-table.svelte`, one class); independent of `table-fill-height`'s height
  change, which leaves the `tfoot` alone.
- Grouping the equipment list by manufacturer: the units without one had a group without a label
  ("No manufacturer" now).
- Imported units without a make: `unitModel()` gave a space, so the list's second line read
  " · serial"; the orders' unit filter's label had a dangling " · " likewise (trimmed in SQL).

### Tests

- Unit: `record-facets.spec.ts` (`byCount`, its ties and 0s; `recordOptionsInOrder`).
- Server: orders' `list.spec.ts` (counts under the search and other filters, not the own; 0s
  included, most first; engineers' and units' counts and `none`), `tenancy.spec.ts` (South's
  options and counts only, also with North's codes ticked or in the where), equipment's
  `list.spec.ts` (customer and location counts, South's isolation, SHLTR's "none" manufacturer),
  condition's `connect.spec.ts`, maintenance's `plans.spec.ts`, checklists' `work-orders.spec.ts`.
- e2e: `orders.list.test.ts` (counts, most first, narrowed by status), `equipment.list.test.ts`
  (the location filter's boxes at desktop and phone widths; "No manufacturer" in SHLTR),
  `condition.test.ts` (one row doesn't scroll), `invoices.list.test.ts` (most first, found by
  code).
- Rebased onto `develop` after `table-fill-height` and `multi-word-search` were merged, without
  conflicts: `searchMatch()` (now on `searchWords()`) searches the filters' options too, and the
  `tfoot` fix sits beside the new height handling. The specs, e2e files, `svelte-check` and
  `knip` above were rerun on top of it.

### For the next one who works here

- In the Browser pane, other sessions' tabs are on `localhost`, and cookies are per host, not
  port: a dev server of your own on `127.0.0.1:<port>` (`ORIGIN` and `BETTER_AUTH_URL` to match),
  in a tab of your own, keeps its session. bits-ui's Filter menu doesn't open from a JS `click()`;
  click it, then pick its options.
- `afresh(path)` appends `?row=1`: for a path with a query, write `&row=1` yourself.
