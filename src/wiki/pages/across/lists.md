---
title: Lists
summary: Every section is a table you can search, filter, sort, group and keep, and the browser or the server does the work.
section: across
order: 1
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import ListPlayground from "#wiki/widgets/list-playground/list-playground.svelte";
</script>

Orders, customers, units, engineers and the modules' records (invoices, contracts, materials) all
open as a list, and every list works the same way. That is on purpose: learn one and you know them
all.

- **Search** takes several words. Each word has to be in one of the columns, in any case, so
  "bakker tiel" finds the customer Bakker in Tiel.
- **Filters** sit behind the Filter button. Each active filter becomes a pill above the table, and
  Reset clears them. Dates and amounts filter by range (`this-week..next-month`, `..10`).
- **Sorting and grouping.** Click a column header to sort. Group by a column such as status or
  customer, and each group gets a header row with its count (and sums, where a column has them).
  Groups collapse.
- **Columns, density and views.** Hide columns, make rows tighter or looser, and save a set of
  filters and sorting as a view, for yourself or shared with the office.
- **The table keeps its state in the address bar.** Copy the link and a colleague sees the same
  filtered, sorted list. Come back later and the list is as you left it.
- **Select rows** to act on them: assign an engineer to ten orders at once, change their status, or delete them.
  On a long list you can select everything that matches the filters, not just the rows on screen.
- **Rows load as you scroll**, so a list of thousands opens as fast as one of ten.

Try the search, the status filter and the grouping on 25 made-up orders:

<ListPlayground />

This is a miniature. The real table also keeps its state in the address bar, has saved views, column
visibility and bulk actions, and those belong to a signed-in user's organization, so the public wiki
doesn't embed it.

<TryIt as="planner" />

<HowItWorks />

A list is defined once and built the same way in both of its modes:

- **Server lists** (the default, for lists that grow: orders, equipment) let the database search,
  filter, sort and page. The table asks for a page of rows as it scrolls.
- **Client lists** (`mode: "client"`, for small ones: customers, engineers, contracts, invoices) load
  all rows once, and the browser does everything instantly. The list's definition says which mode
  it is; don't move a list to the server unless it grows too large to load whole.

The parts, in the order a list is built:

1. **`defineList()`** in `list/<section>-list.ts` names every column and what it sorts, groups and
   filters by, and makes the URL grammar from it.
   See <SourceLink path="src/lib/components/data-table/list-definition.ts" line={350}>defineList</SourceLink>.
2. **`withListColumns()`** builds the table's columns from that definition, so a column never
   restates whether it sorts or filters.
3. **`createServerTable()`** or **`createClientTable()`** makes the table. See <SourceLink path="src/lib/components/data-table/table.svelte.ts" line={336}>createClientTable</SourceLink>.
4. **`<ListLayout>`** and **`<ListToolbar>`** draw the toolbar, the filters from the definition, the
   rows and the bulk-action bar.
5. On the server, **`planList()`** turns the URL's query into SQL for the rows, the counts and the
   filter options. See <SourceLink path="src/lib/server/lists/plan.ts" line={493}>planList</SourceLink>.

The orders list (<SourceLink path="src/lib/orders/list/orders-list.ts">orders-list.ts</SourceLink>)
is the server example, and the customers list
(<SourceLink path="src/lib/customers/list/customers-list.ts">customers-list.ts</SourceLink>) the
client one. A guard spec (`src/tests/unit/lists.spec.ts`) refuses a hand-written table or toolbar,
and names the file and line.

Modules add columns to a core list (the equipment list gets the condition, maintenance and checklists
modules' columns when a tenant has those modules) through an extension point; see [extension points](/wiki/internals/extension-points).

<DocsPointer doc="docs/agents/lists.md" />
