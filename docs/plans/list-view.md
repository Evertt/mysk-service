# The server list view: the client half of lists

Candidate C6 of `docs/reviews/architecture-review.md` (X9, D15), with F1 (the list kernel's
placement), after grilling (Q1–Q6 below) and the design-it-twice step: the "one headless view"
design, with the "component" design's envelope on the plan and the "served definitions" design's
thin table adapter.

## Problem

- **The client half is copied into every list.** The server half (`planList`) is deep; the client
  half is not:
  - 7 pages repeat four lines: `urlListQuery`, `listQuery.current`, the rows query, the facets of
    `whereOf(query)`;
  - 6 tables repeat `scrollPages` + `createAppTable({ serverSide, scroll, data, rowCount, getRowId })`
    - `serverTableLoading`;
  - 7 remotes return `{ rows, rowCount, query, key: queryKey(input) }` with copied doc comments.
- **Lists that couldn't follow the copy went their own way:** partners counts its levels in JS over
  all partners, ignoring the search; the checklists assets list parses and writes its URL by hand;
  orders' `unitCounts` and `facet-options.ts` repeat `plan.ts`'s facet counting.
- **The list kernel lives in the UI kit:** `list-definition.ts`, `ranges.ts`, `url-state.ts`,
  `module-columns.ts` and the binding sit among 66 `data-table/` files with the components and saved
  views, while `src/lib/server/lists/` holds the server half.
- **No unit test covers the client half** (`scrollPages`, `serverTableLoading`, `urlListQuery`,
  staleness).
- **Symptoms:** change amplification (a change to the protocol touches 7 pages, 6 tables, 7
  remotes), cognitive load (two folders, one of them a component folder), and an unrecorded decision
  (which lists are client-side).

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | C6 and F1 together: the list protocol moves into `src/lib/lists/`, mirroring `src/lib/server/lists/`.                                                                                                                       |
| Q2  | Both outliers onto the view: partners gets a facets query (its level counts follow the search: a visible fix; the dashboard card keeps `getProgrammeOverview`); the assets list reads and writes its URL through the view.  |
| Q3  | Customers, engineers (and contracts, invoices) stay client-side tables; the decision is recorded.                                                                                                                           |
| Q4  | What moves: the list protocol only (definition, ranges, url-state, module-columns, search-words, grouping's list part, bulk-action targets, the binding). Table plumbing, components and saved views stay in `data-table/`. |
| Q5  | Orders' `unitCounts` and `facet-options.ts`'s copy count through `plan.ts`.                                                                                                                                                 |
| Q6  | The record: a list that can grow past about 1,000 rows per tenant is a server list; one that stays in the hundreds is a client-side table. Otherwise no visible change.                                                     |

## Proposed interface

### `src/lib/lists/` (barrel `index.ts`; no UI imports)

- Moved: `list-definition.ts`, `ranges.ts`, `url-state.ts` (with `urlGrammar`), `module-columns.ts`,
  `search-words.ts`, `groups.ts` (`groupKey`, `PageGroups`), `bulk-targets.ts` (`BulkTarget`,
  `AnyListWhere`, `MAX_BULK_RECORDS`), `record-options.ts` (types), `list-page.ts` (`ListPage`).
- New: `view.svelte.ts`:

```ts
/** A server list as a page shows it: the URL's query, its rows and facets, scroll pages, staleness. */
export function listView<
	C,
	Page extends ListPage<{ id: unknown }, ListQuery<C>>,
	Facets = undefined,
>(
	list: List<C> | (() => List<C>), // a getter for an extendList()'d list
	remotes: {
		rows: (query: ListQuery<C>) => RemoteQuery<Page>;
		facets?: (where: ListWhere<C>) => RemoteQuery<Facets>;
	},
): ListView<C, Page, Facets>;

interface ListView<C, Page, Facets> {
	readonly ready: Promise<this>; // the first page and the facets for the URL's query
	readonly list: List<C>;
	readonly query: ListQuery<C>;
	readonly where: ListWhere<C>;
	readonly rows: Page["rows"];
	readonly rowCount: number;
	readonly key: string;
	readonly groups: PageGroups | undefined;
	readonly facets: Facets;
	readonly matching: { where: ListWhere<C>; key: string; count: number }; // for <BulkActionBar>
	readonly scroll: ScrollPages; // loadMore / loadEarlier, also for a list without a table
	stale(state: TableUrlState): boolean; // the table's state asks for other rows, or a navigation is arriving
	queryOf(id: unknown): ListQuery<C>;
	options(remote: RecordOptionsRemote<C>, column: FilterId<C>): LoadRecordOptions; // without its own filter
	href(change: ListChange<C>, params?: Record<string, string | null>): string; // drops `row`, keeps other params
	go(change: ListChange<C>, params?: Record<string, string | null>): Promise<void>;
}
```

### `src/lib/components/data-table/list-table.svelte.ts` (the thin adapter)

```ts
/** The view's table: createAppTable with the view's rows, row count, scroll and URL defaults. */
export function listTable<T>(view: ListView<…>, options: Omit<AppTableOptions<T>, "serverSide" | "scroll" | "data" | "rowCount">): {
	table: AppTable<T>;
	readonly loading: boolean; // view.stale(the table's state)
};
```

Called while the table component initializes (as today).

### The envelope: `planList(sql, input).page(...)` (`src/lib/server/lists/plan.ts`)

```ts
/** A page of rows as the client half expects it: the rows, how many match, the query and its key, the groups. */
plan.page({ rows, rowCount, groupCounts? }): ListPage<Row, ListQuery<C>>; // { rows, rowCount, query, key, groups? }
```

The remotes keep their own selects and post-processing (prices, tags, components) and their
normal exports; the doc comment is written once, on `page()`.

### Usage

```svelte
<!-- orders/+page.svelte -->
const view = listView(ordersList, { rows: getOrders, facets: getOrderFacets });
<OrdersTable view={await view.ready} />

<!-- orders-table.svelte -->
const { table, loading } = listTable(view, { columns, getRowId: (row) => String(row.id),
	initialState: { columnVisibility: { createdAt: false } } });
setStatusCellQuery(view.queryOf);
<FacetedFilter columnId="status" counts={view.facets.status} … />
<RecordFilter columnId="customer" load={view.options(getOrderCustomerOptions, "customer")} … />
<table.Table {loading} groups={view.groups} />
<BulkActionBar {actions} matching={view.matching} />
```

- Equipment: `listView(() => list, …)` with `list = $derived(extendList(equipmentList, …))`; the
  table keeps `withModuleTableColumns(columns, view.list.moduleColumns)`.
- Partners: `getPartnerFacets = query(partnersList.where, …)` counting levels through `plan.facets()`;
  the table's level filter takes `view.facets.level`.
- Checklists assets: `view.query.filters`, `view.go({ filters })`, `view.href({ filters }, { unit })`,
  `view.scroll.loadMore()`; `selection.ts`'s `pageHref` keeps only the selection links (or folds
  into `href`'s params).

## Cohesion statement

- **Single responsibility:** binds a list definition to its rows and facets for a page.
- **What it owns:** the URL → query step (with the sticky `?row=` position), starting rows and
  facets, scroll pages (spans, dedupe, retries, earlier pages), staleness and arriving navigations,
  bulk `matching`, record options without their own filter, URL writes, the envelope.
- **What stays out:** columns, toolbars, filters' components, bulk actions, cells, SQL, saved views.
  A member that needs a column or a component is the sign it's growing into a god object: split it
  out.

## Dependency strategy

In-process. `$app/state` and `$app/navigation` through the existing fake navigation in the tests;
remote queries through a stand-in (`{ current, error, refresh }` over deferred promises).

## Testing strategy

- **New `src/tests/unit/lib/lists/view.svelte.spec.ts`** (client project, a small harness), the
  client half's first tests:
  - the URL becomes the query; a change of `?row=` alone fetches nothing; `?row=120` asks the page
    it's on;
  - `ready` resolves with the first page and the facets;
  - `loadMore` / `loadEarlier` add pages, show a row moved between pages once, refresh a failed page
    instead of skipping it; opening past the end loads earlier pages; a new key resets the span;
  - `stale` from a changed filter until the page with the new key arrives, and during a navigation
    to other rows;
  - `href` / `go` round-trip through `parseTableUrl`, drop `row`, keep other params;
  - `options` changes only when the other filters do.
- **`plan.page()`** in the plan spec: `key` is `queryKey(query)`; `groups` only with counts.
- **Partners:** a spec that its level counts follow the search.
- **Kept:** the columns specs (URL grammar), `list-definition`, `url-state`, `url-sync` specs, the
  e2e list tests (orders.list, orders.scroll, equipment.list, the modules').

## Migration strategy

Incremental, each commit passing the gate: the move first (a mechanical path change, guarded by
`import-extensions.spec.ts`), then the view with its tests, then the lists one at a time (orders,
equipment, materials, condition, maintenance, partners, checklists assets), then the server
counting copies, then the docs.

## Implementation steps

1. **Move** the protocol files into `src/lib/lists/` (barrel), updating the ~60 importers; no
   behaviour change (`refactor:`).
2. **View and adapter**, tests first: `view.svelte.ts`, `list-table.svelte.ts`; `plan.page()`;
   `server-table.svelte.ts` goes once its users have moved.
3. **Lists:** each page, table and remote onto the view, the adapter and `page()`.
4. **Partners:** `getPartnerFacets`, the level filter on it; a spec of the counts following the
   search.
5. **Checklists assets:** the URL through the view.
6. **Server counting:** `unitCounts` and `facet-options.ts` through `countBy`.
7. **Docs:** `docs/agents/lists.md` (the view, the folder, the rule on client-side tables: a list
   that can grow past about 1,000 rows per tenant is a server list); `structure.md` (`src/lib/lists/`).
8. **Gate:** check, knip, the specs above, the e2e list files (when the machine is free).
