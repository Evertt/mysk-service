# Lists

Read before you add or change a list page: its definition, its columns, its toolbar and filters,
its rows query, range filters or module columns.

A list is a table of a section's records with a search, filters, sorting, grouping and its state in
the URL. There is one way to build one, in either of two modes:

- **Server** (the default): the database searches, filters, sorts and pages, and the table loads a
  page at a time as it scrolls. For lists that grow: orders, equipment, the modules' materials,
  maintenance's due list, condition's units, partners.
- **Client** (`mode: "client"`): all the rows are loaded once, and the browser searches, filters,
  sorts and groups them, instantly and at no cost to the server. For small lists: customers,
  engineers, contracts, invoices, credit notes. That's on purpose; don't move one to the server
  unless it grows too large to load whole.

Both have the same columns, toolbar and URL grammar, from one definition. The orders list
(`src/lib/orders/list/`) is the server example, the customers list (`src/lib/customers/list/`) the
client one. `src/tests/unit/lists.spec.ts` refuses the hand-written forms of what follows.

## The definition: `defineList()`

`list/<section>-list.ts` (`orders-list.ts`; isomorphic, no server imports) names every column of the
table but the selection and the row actions, and says what each sorts, groups and filters by: the
filter's value type (`code`, `id`, `oneOf(values)`, `dateRange`, `numberRange`, `moneyRange`;
`orNone(kind)` for a column that can be empty, `none` in the URL), and its name in the URL (`param`)
if not its id. A column the list only shows or searches is `{}`. It makes the URL spec
(`list.urlSpec`) and, for a server list, the valibot schemas `list.query` and `list.where` and the
typed `ListQuery`/`ListWhere`. The URL stays lenient (bad values are dropped), the remote query
strict (a malformed argument is a 400).

```ts
export const ordersList = defineList({
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		engineer: { sort: true, group: true, filter: orNone(id) },
		scheduledFor: { param: "scheduled", sort: true, filter: orNone(dateRange) },
	},
	defaults: { sort: [{ id: "createdAt", desc: true }] },
});
```

## The columns: `withListColumns()`

`list/columns.ts` builds the table's columns with the list: `withListColumns(list, { select, …, actions })`,
by id in their order (an id the list doesn't have is a type error). Each takes from the definition
whether it sorts and groups, its URL name and its filter's kind and values, so a column never says
`enableSorting`, `enableGrouping`, `filterFn`, `param`, `filterValues` or `filterNone` itself. It says
what only it knows: its cell, label, search (`enableGlobalFilter`), and:

- `getGroupingValue`, the value the URL has for the row when it isn't the cell's, e.g. a
  customer's code where the column shows the name. A set filter keeps the rows by it (in the
  browser), and the rows group by it (on the server too: `SqlColumns.group` is the same value).
- `meta.none`, what its rows without a value are called (`m.common_unassigned`), for its filter's
  `none` option, if its filter takes `none`.
- An enum's column is `column.enum()`, which also gives its filter's options (`meta.filterOptions`).

A column made from a function (and a display column) names its `id` too, as TanStack wants: the
same as its key.

## The table: `createServerTable()` or `createClientTable()`

The list's table component (`list/<section>-table.svelte`) makes it while it initializes (it sets
context, which Svelte doesn't allow after the page's `await`):

- `createServerTable({ list, first, fetch, columns, initialState })`: `first` is the page of rows
  the page awaited, `fetch` the rows' remote query, which it asks for the pages before and after as
  it scrolls. It says whether it waits for rows, the groups and the rows that match (for "select
  all matching"), and gives the record filters the rows' `where`.
- `createClientTable({ list, data, columns, initialState })` for a client list.

Both start at the list's defaults; `initialState` adds the rest (hidden columns).

## The shell and toolbar: `<ListLayout>` and `<ListToolbar>`

The component renders `<ListLayout {table} {facets} searchLabel emptyTitle actions filters>`:
whatever goes above (`header`, in the table's context, e.g. chips that set its filters), the
toolbar, the rows and the bulk action bar. The toolbar (`ListToolbar`) has a filter for each column
that filters, in the definition's order, picked by the filter's kind, titled with the column's
label and counted with `facets` (a server list's counts by column id; a client list counts its rows).
`filters` gives each what only the page knows, typed by the list:

- a filter on codes or ids needs its `options` (`customerFacets(table.table)` on a client list) or,
  on a server list, a `load`: its options query (`facetOptions()`), searched as you type;
- `presets` for a date range, `step`/`min` for a number, `title` or `none` where the column's don't
  fit, and `false` for a filter the page sets in its own way (`tools`, the toolbar's own actions).

## The page: `listQueries()`

A server list's page reads the query from the URL and asks for the first page of rows and the
counts, which start at once: `const orders = listQueries(() => ordersList, getOrders, getOrderFacets)`,
then `<OrdersTable orders={await orders.rows} facets={await orders.facets} />`. A client list's page
awaits its remote query of all the rows.

Every list page brings its table back as the member left it (`table-memory.svelte.ts`): a core
page's `+page.ts` is `export const load: Load = loadTableMemory`; a module's list page gets it from
the generator (a page that imports a component of its module calling `createServerTable()` or
`createClientTable()`), so it has no `+page.ts` of its own.

## The server: `ListSql` and `planList()`

1. **The SQL**, `ListSql` from a per-request factory (`ordersSql()`) in the domain's
   `server/list-sql.ts`: the SQL of every column the definition sorts, groups or filters by (a
   missing or extra one is a type error), the search columns, the id and the tenant scope. Write
   the joins once in a helper generic over the query (`withOrderJoins`, drizzle's `$dynamic()`
   pattern) and use it for the rows and in `ListSql.from`, so rows, counts, facets and bulk ids
   can't drift apart. Never build a `ListSql` at module scope: `inTenant()` reads the request.
2. **The rows query** answers `planList(ordersSql(), input).answer(select, { enrich })`: a page of
   rows of the `select`, how many match, the query and its key, and when grouped the page's groups.
   `enrich` adds what SQL doesn't have to the rows fetched (their totals, a module column's values).
3. **The counts**: `planList(sql, where).facets({ status: order.status })` for the filters,
   `facetOptions()` for a record filter's options, `count()`, `groupCounts()` and `ids()`.

Remote queries take `list.query` (the rows) or `list.where` (the filters' counts) as their argument
and answer with the `query` and `queryKey()` they ran, which the table compares with its state
(`isStale()`). Bulk commands take ids or the list's where: `listTarget(list.where)` for a server list
(and `list: ordersSql` to `bulkChange()`), `idsTarget` for a client list. A new column is one edit in
the definition, one in `ListSql` (if it sorts, groups or filters) and one in the table's columns.

## Modules' columns

See `docs/agents/modules.md`. A list that takes them names its point,
`defineList({ …, moduleColumns: points.list.columns })` (`defineRecordPoints()`); its `ListSql` factory returns
`withModuleColumns({ … })` (`#lib/server/lists/module-columns.ts`, imported by its path: it imports
the registry, which imports the modules' files, which import the lists barrel); its rows query adds
`moduleValues(listSql, ids)` to each row as `moduleValues` (in `enrich`), and its facets query
`moduleFacets(listSql)`; its page merges the tenant's columns before reading the URL,
`extendList(list, await loadListColumns(points.list.columns))`, and gives the merged list to the table,
which adds their columns with `withModuleTableColumns()`; the toolbar has their filters from the
merged list. Such a list's `list.query` and `list.where` let any namespaced column
(`<module>.<name>`) through, and `planList()` checks the query against the tenant's list
(`listSql.list.strict`). The equipment list is the example.

## Range filters

`dateRange`, `numberRange` and `moneyRange` (cents in the query, euros in the URL) filter by ranges,
both ends included: `?scheduled=2026-10-01..2026-10-07`, `?quantity=..10`, `?total=500..`. A date
end may be a preset that stays relative in the URL (`?scheduled=today..`, `this-week..next-month`;
`datePresets` in `ranges.ts`). Like a set filter's, a range filter's value takes several,
comma-separated, any of which keeps a row, and `none` with `orNone()`: `?scheduled=none,this-week`.
Their SQL is `inDays()` and `between()`; a value that isn't in the database (an order's total) uses
`match` instead of `filter` and is kept by id (see `docs/plans/table-query.md`, "Range filters").
