# Server-side lists

Read before you change a list page that filters and sorts in the database (orders, equipment, materials, maintenance's due list), its columns, or its range filters.

Orders, equipment and the materials module's list page, filter and sort in the database. A list is three layers (the
orders list in `src/lib/orders/` is the example):

1. **The definition**, `defineList()` in `list/<section>-list.ts` (`orders-list.ts`; isomorphic, no
   server imports): the columns, what each sorts, groups and filters by, and the filter's value
   type (`code`, `id`, `oneOf(values)`; `orNone(kind)` for a column that can be empty, `none` in the
   URL). It makes the valibot schemas `list.query` and `list.where`, the typed
   `ListQuery`/`ListWhere`, and the URL spec. The table's URL state is read into a query
   with `toListQuery()`; the URL stays lenient (bad values are dropped), the remote query strict
   (a malformed argument is a 400).
2. **The SQL**, `ListSql` from a per-request factory (`ordersSql()`) in the domain's
   `server/list-sql.ts`: the SQL of every column the definition sorts, groups or filters by
   (a missing or extra one is a type error), the search columns, the id and the tenant scope. Write
   the joins once in a helper generic over the query (`withOrderJoins`, drizzle's `$dynamic()`
   pattern) and use it for the rows and in `ListSql.from`, so rows, counts, facets and bulk ids can't
   drift apart. Never build a `ListSql` at module scope: `inTenant()` reads the request.
3. **The plan**, `planList(ordersSql(), query)` (`src/lib/server/lists/plan.ts`): `paged()` for a page
   of rows (the table loads them a page at a time as it scrolls, `scrollPages()` in
   `server-table.svelte.ts`, and a page reads its query from the URL with `urlListQuery()`), and `count()`, `facets()`, `groupCounts()` and `ids()`, each written once.

Remote queries take `list.query` (the rows) or `list.where` (the filters' counts) as their argument
and answer with the `query` and `queryKey()` they ran, which the table compares with its state
(`isStale()`, `serverTableLoading()`). Bulk commands take ids or the list's where:
`listTarget(list.where)` for a list (and `list: ordersSql` to `bulkChange()`), `idsTarget` for a
client-side table. A new column is one edit in the definition, one in `ListSql` and one in the
table's columns (`columns.spec.ts` checks the table against `list.urlSpec`).

**Modules' columns** (`docs/agents/modules.md`): a list that takes them names its point,
`defineList({ …, moduleColumns: points.list.columns })` (`defineRecordPoints()`); its `ListSql` factory returns
`withModuleColumns({ … })` (`#lib/server/lists/module-columns.ts`, imported by its path: it imports
the registry, which imports the modules' files, which import the lists barrel); its rows query adds
`moduleValues(listSql, ids)` to each row as `moduleValues`, and its facets query
`moduleFacets(listSql)`; its page merges the tenant's columns before reading the URL,
`extendList(list, await loadListColumns(points.list.columns))`, and gives the merged list to the table,
which adds their columns with `withModuleTableColumns()` and a `FacetedFilter` for each that
filters. Such a list's `list.query` and `list.where` let any namespaced column (`<module>.<name>`)
through, and `planList()` checks the query against the tenant's list (`listSql.list.strict`). The
equipment list is the example.

**Range filters**: `dateRange`, `numberRange` and `moneyRange` (cents in the query, euros in the
URL) filter by ranges, both ends included: `?scheduled=2026-10-01..2026-10-07`, `?quantity=..10`,
`?total=500..`. A date end may be a preset that stays relative in the URL (`?scheduled=today..`,
`this-week..next-month`; `datePresets` in `ranges.ts`). Like a set filter's, a range filter's value
takes several, comma-separated, any of which keeps a row, and `none` with `orNone()`:
`?scheduled=none,this-week`. Their SQL is `inDays()` and `between()`; a value that isn't in the
database (an order's total) uses `match` instead of `filter` and is kept by id (see
`docs/plans/table-query.md`, "Range filters").
