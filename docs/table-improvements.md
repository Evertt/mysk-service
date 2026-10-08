# Table improvements

What we're building for the app's data tables (`src/lib/components/data-table`), and where each item
stands. Status: ⬜ to do · 🔄 in progress (branch) · ✅ done (merged into `main`).

## Requested

| #   | Item                                                                                                                                                                                                                                                         | Status                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 1   | **Table state in the URL.** Every filter, the search box, sorting and pagination of every table sync with the query string, in a readable grammar: `?status=quote,scheduled`, `?q=boiler`, `?sort=-scheduled,customer`, `?page=2&size=50`. Defaults omitted. | 🔄 `table-url-state`          |
| 2   | **Server-side tables.** Orders, equipment and materials paginate, filter and sort in the database (remote queries), using the URL grammar from 1. The search box is debounced.                                                                               | ⬜ after 1                    |
| 3   | **Filters on related records**, e.g. the customer column on orders and equipment (and engineer, customer elsewhere), also for server-side tables.                                                                                                            | ⬜ after 1, with 2            |
| 4   | **Popover close flicker.** Popovers and other overlays flash back to full opacity for a frame at the end of their exit animation.                                                                                                                            | ✅                            |
| 5   | **Grouping rows by a column**, e.g. equipment by category or manufacturer, engineers by specialty, orders by type; also for server-side tables.                                                                                                              | ⬜ after 2                    |
| 6   | **Pinned columns and a scrolling body.** First (identifying) column pinned left, actions pinned right; the table body scrolls with a sticky header so the pagination is never below the fold.                                                                | 🔄 `sticky-table-layout`      |
| 7   | **Better sorting.** Ascending → descending → unsorted, and sorting by several columns at once (shift-click), with each column's precedence shown.                                                                                                            | 🔄 `table-url-state` (with 1) |

## Suggested

| #   | Item                                                                                                                                       | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 8   | **Saved views.** Name and save a combination of filters, sorting and columns per user (e.g. "My urgent orders").                           | ⬜     |
| 9   | **CSV export** of the current filtered view; server-side for the big tables.                                                               | ⬜     |
| 10  | **Bulk actions on selected rows**, e.g. assign an engineer, change status, add to an invoice. (Row selection exists but does nothing yet.) | ⬜     |
| 11  | **Range filters for dates and numbers**, e.g. "scheduled this week", "stock below 10".                                                     | ⬜     |
| 12  | **Remembered column settings and resizing.** Column visibility, order and width persist per user; drag to resize.                          | ⬜     |
| 13  | **Density toggle and keyboard navigation.** Compact/comfortable rows; arrow keys move between rows, Enter opens one.                       | ⬜     |
| 14  | **Loading state for server-side tables.** While a page, filter or sort loads, keep the previous rows (dimmed) instead of flashing empty.   | ⬜     |
