# Remembered columns, the last view, and stable column widths

Items #12, #21 and #22 of `docs/table-improvements.md`: how they work, and why this way. The code
is the reference (`src/lib/components/data-table/`: `column-widths.svelte.ts`,
`column-visibility.ts`, `table-memory.svelte.ts`); this is the rationale.

## Stable column widths (#21)

The tables use the browser's automatic layout, which sizes each column from its cells' content:
from two widths per cell, its max-content width (on one line) and its min-content width (wrapped
wherever it can be). So a page of short names gave narrow columns and the next page wider ones.

**Hidden rows.** Per column, the table keeps the cells with the widest max-content and the widest
min-content it has seen (`column-widths.ts`, at most two per column), and renders them in a
`<tfoot>` of its own: `inert`, `aria-hidden`, rows with `visibility: collapse`. Chromium (and the
CSS spec) keeps a collapsed row's cells in the columns' widths but gives the row no height, so the
browser lays the columns out as if all that data were on the page; nothing about the layout is
computed by hand, and tables that fit the page (columns trading width) and tables that scroll
sideways behave as they did, pinned columns and the sticky header included.

- The hidden cells are rendered with the columns' own `cell`s, on rows made for the purpose with
  TanStack's `constructRow` (the column's value put in the row's value cache, so a known value can
  be tried on any row). They're in none of the table's row models: selection, counts, grouping,
  keyboard navigation and screen readers never see them, and `tbody tr` selectors don't either
  (hence a `<tfoot>`, not a second `<tbody>`).
- **Measuring.** After the page's rows are painted, each cell is measured on a copy, off-screen,
  at `width: max-content` and `min-content` (checked against the browser's own column widths: they
  agree to the pixel). Copies are costly: in this app any DOM insertion restyles the whole document
  (its CSS has many `:has()` rules), about 50 ms for a page of 100 orders on the test machine. So
  measuring waits until the page is painted, cells that look like ones measured before (same
  classes and HTML: a status, a date) aren't measured again, and the hidden cells, measured when
  they were the page's, never are.
- **Paging freezes.** Turning a page pins the columns' widths as they are (a `<colgroup>` and
  `table-layout: fixed`, measured from the header cells before the new rows render), so nothing
  moves; cells too wide for a column are clipped meanwhile. The hidden rows keep learning from the
  pages, and the next filter, search, sort, page size, grouping, column or density change lays the
  table out again, with all of it. The widths converge to what the table would pick with every row
  seen loaded at once.
- **Known values start right.** No column is configured: a column whose filter has options
  (`meta.filterValues`, which a server-side list's `oneOf` filters mirror) tries each option once,
  and a column of dates the 28th of every month (the longest month names; two-digit days), in a
  real row of the page, in the current language. They're rendered on the server too, so the first
  paint has them. Other columns settle by measuring.
- **Memory.** It lasts a visit: `sessionStorage` (`devalue`, as rows have dates), per table, with
  the context it was learned in (visible columns, density, language); another context starts
  over. Without storage it lasts as long as the table. A table the server rendered reads it once
  it's hydrated (the root layout's `data-hydrated`), so a full page load can adjust once right after
  hydrating; a table rendered in the browser reads it at once.

`runed`'s `PersistedState` was considered for the storage and not used: it reads storage in its
constructor (a hydration mismatch here, and an exception where storage is blocked) and parses it on
every read. Nothing else in `runed` would have saved code: the effects here need the previous
state (a `$effect.pre` with a plain variable) or a timer and an animation frame.

The fallback (page size 100, widths frozen after the first load) wasn't needed.

## Remembered columns (#12) and the last view (#22)

Both are what the app remembers of a member's table: one row per user, organization and table in
`table_memory` (`table-memory.remote.ts`), only while there's something to remember:

- `columns`: the visibility of the table's hideable columns (`column-visibility.ts`), or `null`
  for the defaults. Read against the table's columns now: a column it doesn't know (one a module
  added since) gets its default.
- `query` and `view_id`: the table's parameters as left (without the page, which a list's data
  soon moves under) and the saved view that was open.

Saved views keep their columns too (`saved_view.columns`; `null` for views saved before, which
leave the columns as they are), and a view only matches the table when its columns do, so showing
or hiding a column is an unsaved change of the open view.

**Server, not browser storage**, because it should follow the member to other devices (as the
user asked for the columns), and because only the server can bring the list back before anything
renders: each list page's `+page.ts` is `loadTableMemory`, a universal load that, for a visit
without parameters, redirects to the parameters left. The page's queries then ask for the right
rows from the start, with no flash of the default table. The load hands the memory to the table
(`page.data.tableMemory`), which shows its columns from the first render, and reopens the view if
the URL shows what it was left at, so it's still shown as having unsaved changes. A link with
parameters wins (the columns still come back). The load reads the URL untracked, so the table's
own URL changes, and going back and forward within the list, never run it again.

The table remembers its changes as they happen (`rememberTable`, half a second after they settle,
and at once when the page goes), and keeps what it hasn't saved yet in the tab, so coming straight
back doesn't race the save. "No view" (the saved views menu) goes back to the table's defaults,
columns included, which forgets the row; the toolbar's Reset clears the filters and the search and
forgets the open view. No "unsaved changes" warning: nothing is lost by leaving.

Not logged in the activity log: like a personal view, it concerns nobody else, and it changes with
every filter. A view id is only kept if the member sees that view; tenant and user come from the
session.

## Choices to revisit

- The page isn't remembered, only the parameters a view would save.
- Clicking the list's own sidebar entry while on it doesn't restore anything (the load doesn't run
  again), so it shows the defaults, which the memory then follows.
- "No view" resets the columns to the defaults too, and so forgets the hidden columns.
- Frozen pages clip cells wider than anything seen before, until the next layout.
- The e2e tests forget every table at the start of each file (`forgetTables()` in `useApp`), the
  one write the tests make to the database directly.
