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

## 4. Click a value to filter by it

Clicking a value in a table cell could make it an active filter. E.g. at `/customers`:

- Clicking the country in the location field activates that country's filter.
- Clicking the city, which has no filter of its own, adds it to the global search field.

The same may make sense for other fields and tables (an order's customer, status or engineer; an
equipment unit's manufacturer).

Open: how it looks and stays discoverable without getting in the way of a row click (rows
navigate to their record, `row-navigation.svelte.ts`), and whether it adds to a set filter or
replaces it.
