# Table wishes

Wishes for the data tables, recorded on 2026-10-15. Nothing here is decided or built yet; each
item says what's wanted, what's still open, and a first note on the current code.

## 1. Bulk actions as row actions

Bulk actions have been getting updates, and row actions have fallen behind: a row's menu
(`#lib/components/data-table/row-actions.svelte`) only has open, edit and copy. Some, maybe all,
of the bulk actions could just as well be row actions.

- **At least**: assign an engineer to an order (`assign` in `src/lib/orders/list/bulk-actions.ts`)
  as a row action.
- **Consider every other bulk action** for the row menu too:

  | Table     | Bulk actions                                | File                                               |
  | --------- | ------------------------------------------- | -------------------------------------------------- |
  | Orders    | `assign`, `status`, `delete`                | `src/lib/orders/list/bulk-actions.ts`              |
  | Orders    | `invoices:create-invoice` (invoices module) | `src/modules/invoices/bulk-actions/orders.list.ts` |
  | Equipment | `status`, `delete`                          | `src/lib/equipment/list/bulk-actions.ts`           |
  | Engineers | `activate`, `deactivate`                    | `src/lib/engineers/list/bulk-actions.ts`           |
  | Customers | `delete`                                    | `src/lib/customers/list/bulk-actions.ts`           |

- **If it holds for all of them**, unify the two: one action definition (and one hook or extension
  point, so modules' contributions show up in both places) that a table offers on a selection and
  on a single row, where a row action is the bulk action with `{ ids: [row.id] }` as its target.

Notes: a bulk command already checks each record with the single-record rules and answers per
record (`BulkResult`), so running it on one id should work as is; what differs is the UI (a
dialog for one row, a result message that reads well for one record, which rows an action applies
to deciding whether it shows in the menu at all).

## 2. Inline editing in tables (open for pushback)

Some fields could be edited right in the table, instead of on the row's edit page. Enum-like
fields that change during a record's life are the best candidates:

- **Good**: `order.status`, `engineer.status`, and fields like them.
- **Probably not**: `order.type`, `engineer.specialty`: they're rarely changed after creation.

The look: these fields are badges now. Ideally they become a select that still looks very much
like the badge, with a small dropdown arrow attached. That's probably a custom component combining
shadcn's badge and select.

Open: whether it's worth it at all; how it fits the status rules a change goes through (an order's
status change goes through `saveOrderParts()`, which a module can refuse, e.g. for a shortage of
stock); and how it relates to item 1 (a status row action does the same thing from the menu).

### Optimistic updates

As an extension of inline editing: update the table optimistically.

- **The default route**: SvelteKit's remote functions, whose `form` has a mechanism for optimistic
  updates (and `command` has `updates(...withOverride())`). Probably what we use.
- **A spike, in a separate worktree**: install TanStack DB and run queries and mutations through
  it, to see what the DX is like. It isn't made for SvelteKit, but it may give optimistic updates
  more or less automatically.

## 3. Infinite scroll instead of pagination

Considering replacing the tables' pagination with infinite scroll. The doubt: today the URL in the
address bar holds the filters, the sort _and the page_, so sending it to someone shows them exactly
the rows on your screen. With infinite scroll that's lost once you've scrolled far down.

Open:

- Could the URL still hold an equivalent of the page, based on the scroll position (e.g. the
  first visible row's offset, updated with `replaceState` while scrolling, and the table loading
  from there with rows above it loaded on scrolling up)? Would it work well?
- Is it a real loss? Filters and sort would still be in the URL; only the position would be gone.

**Status: built on the `infinite-scroll` branch, to try on a preview deploy first** (not merged).
Every table scrolls instead of paging, and the position idea is in: `?row=121` is the first row
in view (1-based, among all that match), kept in the URL while scrolling and read when the table
opens. The code: `scroll-window.svelte.ts` (the window onto the rows, client and server),
`scroll-position.svelte.ts` (loading more, the position, keeping the view still),
`scrollPages()` and `urlListQuery()` in `server-table.svelte.ts`.

- **Server-side lists load pages of 50 as the end comes near** (an `IntersectionObserver` on the
  line under the rows, 600 px ahead), appended; filters, sort and search stay in the URL, and
  changing them starts over at the top. **Offset paging, not keyset**: each page is the list's
  query with a `pageIndex`, so `planList()` and `paged()` didn't change (their sorts are
  arbitrary SQL, ranks and `nulls last`, and some filters are computed in code, which keyset
  cursors would have to reproduce as row comparisons), grouping keeps its rows around the page,
  and each page is its own cached remote query: a mutation's `updates(getOrders)` refreshes every
  loaded page in place, so a refresh drops no rows and moves nothing. The cost of offsets: a row
  added or removed above the loaded ones between two loads shifts the next page by one (a
  duplicate is shown once; a skipped row shows after the next refresh).
- **Client-side tables render the first 50 rows and 50 more as they scroll** (TanStack's first
  page, growing), rather than virtualizing: the longest has a few hundred rows (invoices), which
  render fine, and keeping real rows keeps the sticky header, pinned columns, stable widths,
  grouping and keyboard navigation as they are.
- **The position**: written with `history.replaceState` (not SvelteKit's `goto`, even shallow:
  that's a navigation, which would cancel one the reader starts and flash the progress bar), a
  quarter second after scrolling stops, in the history entry the table is on, so a reload, a
  shared link and coming back to the list all open it there. A server-side list then starts at
  the page with that row and loads the rows above it when the reader scrolls up, keeping what's
  in view in place (the browser's scroll anchoring is off for the table: it would latch onto the
  line under the rows). Any change of the filters, sort, search or grouping drops it. It works,
  with caveats worth trying on the preview: the position is a row index, so on a live list it
  points at another row once rows come and go above it; and in development SvelteKit warns once
  that `history.replaceState` is used directly.
- Kept: stable column widths (more rows freeze them, like a page turn did), grouping (counts from
  the server, "continues in more rows below"), selection ("select all loaded rows", then "select
  all N matching" while more match than are loaded; more rows keep the selection), the remembered
  table and saved views (which stored no page; an old `size` is ignored), PageUp/PageDown (a
  screenful of rows), the dimmed loading state, density, live refreshes. The footer keeps the
  count.

## 4. Click a value to filter by it

Clicking a value in a table cell could make it an active filter. E.g. at `/customers`:

- Clicking the country in the location field activates that country's filter.
- Clicking the city, which has no filter of its own, adds it to the global search field.

The same may make sense for other fields and tables (an order's customer, status or engineer; an
equipment unit's manufacturer).

Open: how it looks and stays discoverable without getting in the way of a row click (rows
navigate to their record, `row-navigation.svelte.ts`), and whether it adds to a set filter or
replaces it.
