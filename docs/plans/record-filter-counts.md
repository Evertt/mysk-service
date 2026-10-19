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
