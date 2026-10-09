# Table improvements

What we're building for the app's data tables (`src/lib/components/data-table`), and where each item
stands. Status: ⬜ to do · 🔄 in progress (branch) · ✅ done (merged into `main`).

## Requested

| #   | Item                                                                                                                                                                                                                                                         | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | **Table state in the URL.** Every filter, the search box, sorting and pagination of every table sync with the query string, in a readable grammar: `?status=quote,scheduled`, `?q=boiler`, `?sort=-scheduled,customer`, `?page=2&size=50`. Defaults omitted. | ✅     |
| 2   | **Server-side tables.** Orders, equipment and materials paginate, filter and sort in the database (remote queries), using the URL grammar from 1. The search box is debounced.                                                                               | ✅     |
| 3   | **Filters on related records**, e.g. the customer column on orders and equipment (and engineer, customer elsewhere), also for server-side tables.                                                                                                            | ✅     |
| 4   | **Popover close flicker.** Popovers and other overlays flash back to full opacity for a frame at the end of their exit animation.                                                                                                                            | ✅     |
| 5   | **Grouping rows by a column**, e.g. equipment by category or manufacturer, engineers by specialty, orders by type; also for server-side tables.                                                                                                              | ✅     |
| 6   | **Pinned columns and a scrolling body.** First (identifying) column pinned left, actions pinned right; the table body scrolls with a sticky header so the pagination is never below the fold.                                                                | ✅     |
| 7   | **Better sorting.** Ascending → descending → unsorted, and sorting by several columns at once (shift-click), with each column's precedence shown.                                                                                                            | ✅     |

## Suggested

| #   | Item                                                                                                                                       | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 8   | **Saved views.** Name and save a combination of filters, sorting and columns per user (e.g. "My urgent orders").                           | ✅     |
| 9   | **CSV export** of the current filtered view; server-side for the big tables.                                                               | ⬜     |
| 10  | **Bulk actions on selected rows**, e.g. assign an engineer, change status, add to an invoice. (Row selection exists but does nothing yet.) | ✅     |
| 11  | **Range filters for dates and numbers**, e.g. "scheduled this week", "stock below 10".                                                     | ⬜     |
| 12  | **Remembered column settings and resizing.** Column visibility, order and width persist per user; drag to resize.                          | ⬜     |
| 13  | **Density toggle and keyboard navigation.** Compact/comfortable rows; arrow keys move between rows, Enter opens one.                       | ✅     |
| 14  | **Loading state for server-side tables.** While a page, filter or sort loads, keep the previous rows (dimmed) instead of flashing empty.   | ✅     |

## Other

| #   | Item                                                                                                                                                                                                                                                                                                                       | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 15  | **Dutch seed data.** The demo seed uses Dutch names and words (companies, people, cities, materials, descriptions, …), since the app's tenants will mainly be Dutch.                                                                                                                                                       | ✅     |
| 16  | **Sorting on a plain click.** A header click cycles ascending → descending → unsorted (no menu; hiding columns stays in the View menu); shift/cmd/ctrl-click still adds the column to a multi-column sort.                                                                                                                 | ✅     |
| 17  | **Sticky dates on the planning page.** The schedule's row of day headers stays at the top while scrolling down.                                                                                                                                                                                                            | ✅     |
| 18  | **One Filter button.** The per-column filter buttons give way to a single "Filter" button (next to the search box) whose popover lists every available filter; only active filters show in the toolbar, as pills, in a row that scrolls sideways (`overflow-x: auto`) when there are many, so the toolbar no longer wraps. | ✅     |
| 19  | **Filter on empty values.** Every filter on a nullable column offers an option for rows without a value, e.g. unassigned orders (`?engineer=none` or similar), in client- and server-side tables.                                                                                                                          | ⬜     |
| 20  | **Charts.** Charts where they help, at least on the dashboard (e.g. orders per week by status, revenue per month, equipment by status), with shadcn-svelte's charts and/or TanStack's.                                                                                                                                     | ⬜     |
