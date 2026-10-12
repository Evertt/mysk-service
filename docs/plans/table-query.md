# Server-side table queries: review and plan

How the server-side lists (orders, equipment, materials) get their state from the URL into SQL,
what's good and awkward about it, the alternatives, and a recommended design with a migration plan.
Implemented (steps 1–6; the optional step 7 is not done). The code is the reference now; this stays as the rationale.

## Summary

Today a list's whole state goes to its remote queries as one string, the table's own URL
parameters (`status=quote&sort=-priority&page=2`), and the server parses it with the same grammar
the client wrote it with. That was a sensible first step: the URL already held the state, the
grammar already existed, and a canonical string made a good cache key. Its costs show now that
facets, grouping, bulk targets and saved views build on it. There is no schema at the RPC
boundary. Column ids and filter values are untyped `string`s from the URL to the SQL (e.g.
`ids.map(Number)`). Each list describes its columns three times (client columns, URL spec, SQL
mapping) and writes its join chain three times.

**Recommendation:** one isomorphic **list definition** per server-side table (columns, what each
sorts, groups and filters by, and its filter value type). It generates a per-table valibot schema
and the TypeScript types for a **typed query object**
(`{ q, filters: { status?: OrderStatus[], engineer?: number[] }, sort, group, pageIndex, pageSize }`).
It also derives the URL spec, so the URL grammar only works at the edge: URL ↔ table state ↔
query object. On the server, a **typed SQL mapping** checked against the definition, plus a base
query that owns the joins, provides rows, counts, facets, group counts and bulk ids, each written
once. Saved views keep storing URL strings, so the database doesn't change.

## 1. How it works today

### Data flow

```
URL ?status=quote&sort=-priority&page=2
 │  url-sync.svelte.ts: syncTableWithUrl (both ways; search debounced)
 ▼
TanStack table state {globalFilter, sorting, columnFilters, pagination, grouping}
 │  (the table writes the URL; the page reads the URL, not the table)
 ▼
+page.svelte: serverTableQuery(page.url.searchParams, ordersUrl)
 │   → { rows: "status=quote&sort=-priority&page=2", facets: "status=quote" }
 │      canonical: tableUrlKey(), defaults left out; facets without sort/page/group
 ▼
getOrders(rows) / getOrderFacets(facets)       query(tableParams = string ≤ 4000)
 │  devalue → base64url → GET /_app/remote/<id>?payload=…
 ▼
planTable(ordersTable, params)
 │  new URLSearchParams(params) → parseTableUrl(…, spec) → TableUrlState (lenient)
 │  ServerTable.columns[id].{sort, filter(values: string[]), group}, search, scope, tieBreaker
 ▼
TablePlan { where(except?), orderBy, limit, offset, group, page(), key }
 │  used by getOrders (rows), countOrders (total), groupCounts, facetCounts, matchingOrderIds
 ▼
{ rows, rowCount, key, groups }  → orders-table.svelte
      key → isStale()/serverTableLoading (are the rows for the table's current state?)
      key → <BulkActionBar matching={{ key, count }}> → bulk command { matching: key }
```

Saved views are a separate path. They store `viewQuery(state)`, the URL string without the page
(`?status=quote&sort=-priority`), in `saved_view.query`, and read it back with `parseTableUrl`.

### Files

| Concern                                                  | Where                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| URL grammar (parse, write, canonical key)                | `src/lib/components/data-table/url-state.ts`                                                                       |
| Table ↔ URL sync, spec derived from client columns       | `src/lib/components/data-table/url-sync.svelte.ts` (`tableUrlSpec`)                                                |
| Query args from the URL, staleness, spec equality helper | `src/lib/components/data-table/server-table.svelte.ts` (`serverTableQuery`, `isStale`, `urlGrammar`)               |
| Hand-written URL spec per list                           | `src/routes/(app)/{orders,equipment,materials}/*-url.ts`                                                           |
| Client columns (TanStack)                                | `src/routes/(app)/*/columns.ts` (`meta.param`, `meta.filter`, `meta.filterValues`, `enableGrouping`, `filterFn`)   |
| Spec agreement test                                      | `src/routes/(app)/*/columns.spec.ts` (`urlGrammar(tableUrlSpec(table))` = `urlGrammar(ordersUrl)`)                 |
| String arg, plan, facets, groups                         | `src/lib/server/table-query.ts` (`tableParams`, `planTable`, `facetCounts`, `groupCounts`, `pageGroupsOf`)         |
| SQL mapping, base query, rows/facets/bulk                | `src/routes/(app)/*/*.remote.ts` (`ordersTable`, `countOrders`, `getOrders`, `getOrderFacets`, `matchingOrderIds`) |
| Bulk target                                              | `src/lib/server/bulk.ts` (`bulkTarget = ids                                                                        | { matching: tableParams }`, `MatchingIds = (params: string, limit)`) |
| Saved views                                              | `src/lib/components/data-table/views.ts`, `views.remote.ts`, `saved_view` table                                    |

### One column, described four times (orders' `engineer`)

1. **Client column** (`columns.ts`): `enableGrouping`, `getGroupingValue: row.engineer?.id`,
   `filterFn: ids.includes(String(id))`, `meta: { filter: "set" }`.
2. **URL spec** (`orders-url.ts`): `{ id: "engineer", sortable, groupable, filter: "set" }`. Kept
   equal to 1 by `columns.spec.ts`.
3. **SQL mapping** (`orders.remote.ts`): `engineer: { sort, nullsLast, filter: (ids) => inArray(order.engineerId, ids.map(Number).filter(Number.isSafeInteger)), group }`.
   `ServerTable.columns` is `Record<string, ServerColumn>`, and nothing checks it against 2.
4. **Facets and props**: `getOrderFacets` lists `{ type, status, priority }`, and
   `orders-table.svelte` types its prop by hand as `Record<"type" | "status" | "priority", …>`.

## 2. Why a string

No commit message gives a reason. The history and the code show how it came about:

- **The URL came first.** "Keep every table's search, filters, sorting and page in the URL"
  (`8ff9ad7`) built the grammar. The server-side tables (`71fa633`) were defined as "the server
  reads the same URL", with "same grammar and parameters as before". Passing the URL's own
  parameters needed no second format, and server and client run the same parser, so they agree by
  construction.
- **A canonical cache key.** SvelteKit caches and dedupes a query by its serialized argument.
  `tableUrlKey()` gives the same string for the same state (defaults left out, fixed parameter
  order), and a second key without sort/page/group keeps the facets from refetching on paging.
- **An echoable identity.** The same string comes back as `key`, for `isStale()` and as the bulk
  `matching` target. Bulk (`ad592bc`) reused `tableParams` because it was there.
- **Lenient by design.** The grammar ignores unknown columns and bad values, so a stale or
  hand-edited link never errors. Pointing the RPC at that parser inherited the behaviour.
- **One cheap DoS guard:** `maxLength(4000)` on the whole thing.

Saved views (`45b65da`) store the URL string for the same reasons as links. They don't depend on
`tableParams`.

## 3. Assessment

### Good

- **One grammar, one parser on both sides.** Server and client can't disagree about what
  `?status=quote` means.
- **Canonical, deduped queries.** Facets are split from rows, and paging doesn't recount.
- **Tenant scoping is structural.** `scope()` is part of every `where`, and every join carries
  `inTenant()`. `table-query.spec.ts` and the e2e tests cover it.
- **Grouping without breaking pagination.** The ±1 row, group counts and `PageGroups` are well
  thought out and tested.
- **Bulk "all matching" reuses the list's exact `where`,** capped at `MAX_BULK_RECORDS`, and
  re-checks every record in the tenant.
- **Saved views as URL strings** are forward-compatible: unknown parameters are ignored, like an
  old link.

### Awkward

- **No schema at the boundary.** `query(tableParams, …)` says "a string". What it contains is
  validated by a hand-written lenient parser that never rejects. A client bug and a tampered
  request look the same: silently ignored. TypeScript can't help the caller either. A test or a
  module that wants "orders for customer X" has to build a URL string.
- **Stringly typed from end to end.** `TableUrlState.columnFilters` is `{ id: string; value: unknown }[]`.
  `filterValues()` casts the value to `string[]`. `ServerColumn.filter` gets `string[]` whatever
  the column, so number ids are parsed in SQL code (`ids.map(Number).filter(Number.isSafeInteger)`).
  A bad engineer id becomes `inArray(col, [])`, which matches nothing, while the client still
  shows a pill for it. Enum values are only checked when the spec lists `values`. Column ids in
  `ServerTable.columns`, in `facetCounts`' map and in the facets prop are free strings: a typo is
  a silently dead filter.
- **Four descriptions per column** (above). Only the client-to-spec agreement is tested.
- **Per-table boilerplate.** The join chain is written three times in orders (`getOrders`,
  `countOrders`, `matchingOrderIds`) and in equipment. `count*` and `matching*Ids` are the same
  function in every list. A new join added to the rows query but not to `countOrders` gives wrong
  totals or a missed `inTenant()`.
- **Inconsistent construction.** `ordersTable` is a module-level const with a lazy `scope`, while
  `equipmentTable()` and `materialsTable()` are factories, because their subqueries call
  `inTenant()`, which reads the request. It's easy to break by moving an `inTenant()` call.
- **The bulk "matching" target sends the rows key**, including sort, page and group, which the
  server ignores. The target says more than it means.
- **Small leaks.** `replace(/^\?/, "")` in four places. `planTable` accepts `string | SearchParams`.
  `key` is the URL grammar in a different role.
- **Upcoming features stretch it.** Range filters (#11: `{ from, to }` dates and numbers), empty
  values (#19: `engineer=none`, i.e. `null` in a set) and CSV export (#9) all need typed values per
  column. With a string, each one is a grammar extension parsed by hand on the server.

## 4. How SvelteKit handles query arguments (verified)

Checked in `node_modules/@sveltejs/kit` (installed: **3.0.0**), `src/runtime/shared.js` and
`src/runtime/app/server/remote/{query,requested,shared}.js`, plus a throwaway experiment (in the
review session's scratchpad, not committed) that mimics `stringify_remote_arg`:

- **Transport.** A query is a `GET …/remote/<id>?payload=<base64url(devalue(arg))>`. The cache
  and dedup key is `id/payload`, on the client and server alike.
- **Key order doesn't matter.** For query arguments, plain objects are re-created with sorted keys
  before serializing (`to_sorted`). `{ page, sort }` and `{ sort, page }` share a cache entry.
  Measured: true.
- **Array order matters.** `status: ["quote", "scheduled"]` and `["scheduled", "quote"]` are two
  entries.
- **`undefined` is not absent.** `{ q: undefined }` and `{}` give different payloads (measured).
- **The key is the raw input, before validation.** The schema's output doesn't canonicalize the
  cache key, so the client must send a canonical object. Today `tableUrlKey` does that job.
- **Validation** uses Standard Schema (valibot works directly). On failure it throws a
  `ValidationError`, which becomes `400 Bad Request`. SvelteKit 3 passes it to `handleError` with
  `kind: "validation"` and the issues. This app has no `handleError` hook.
- **`requested(getOrders, 4).refreshAll()`** re-parses each payload the client asked for and runs
  the schema again, so it works the same with object arguments.
- **Size.** A typical orders state is 99 base64 characters as a string and 282 as an object
  (devalue's object encoding is heavier). The 4000-character string cap is about 5.3 KB of
  payload, and 200 customer codes as an object is about 4.2 KB. Node's default 16 KB header limit
  applies to the URL, so objects need a total-size cap as well as per-array caps (see 6.7).
  Commands (bulk) are POSTs and have no URL limit.

## 5. Alternatives

|     | Option                                                                                                                                                                                    | Verdict                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Keep the string, tidy around it.** Brand it (`TableParams<"orders">`), type `ServerTable.columns` by the spec's ids, add a shared join helper.                                          | Cheapest. Fixes the boilerplate but not the core: still no schema, and values still `string[]` parsed by hand.                                                                                                               |
| B   | **Generic TanStack-state object.** `{ globalFilter, sorting, columnFilters: {id, value: string[]}[], pagination, grouping }` with one generic schema, sanitized per table in `planTable`. | Close to TanStack's own shape, but the ids and values are still untyped and sanitized loosely. `columnFilters` as an array allows duplicates and needs a `v.variant` per table to type. A different format with little gain. |
| C   | **Typed object per table, from one shared definition.** Schema and types are generated; the SQL mapping is checked against them; the URL codec is derived.                                | **Recommended.** Typed end to end, strict at the RPC, lenient at the URL, and adding a column is one edit. Costs a small generic builder.                                                                                    |
| D   | **No argument; read the page URL on the server** (a `+page.server.ts` load on `url.searchParams`, or the `x-sveltekit-search` header in a query).                                         | Rejected. Loads rerun everything on any parameter change (no rows/facets split), the project prefers remote functions, and a query that depends on a header isn't keyed by it.                                               |
| E   | **JSON in the URL / saved views as JSON.**                                                                                                                                                | Rejected. The readable grammar is a feature (dashboard links, `?customer=CUST-0001` from a customer page). Views would need versioning and a data migration for no user-visible gain.                                        |

### Compared with established patterns

- **TanStack Table, server-side:** `manualPagination`/`manualSorting`/`manualFiltering`, with the
  state slices `{ pagination: {pageIndex, pageSize}, sorting: {id, desc}[], columnFilters: {id, value}[], globalFilter, grouping }`
  sent to the backend in whatever form it takes. Option C keeps TanStack's `sorting` items and
  pagination field names, so the mapping is 1:1. Filters become a record because a record can be
  typed per column and has no duplicates.
- **React-Admin `getList`:** `{ pagination: {page, perPage}, sort: {field, order}, filter: { status: [...] } }`.
  It has the same record-of-filters shape as C, with one sort.
- **Refine:** `{ pagination, sorters: [{field, order}], filters: [{field, operator, value}] }`.
  Operator-based filters are more general than needed, since every filter here is `in`. C's
  per-column _kinds_ (set today, range and nullable later) give the same reach with typed values.
- **nuqs / TanStack Router `validateSearch`:** typed per-parameter parsers and serializers
  (`parseAsArrayOf(parseAsStringLiteral(statuses))`). C's `FilterKind.fromUrl/toUrl` is the same
  idea for the URL edge, and the existing readable grammar stays.

## 6. Recommended design

Three layers, each with one job:

```
URL string ──url-state.ts (lenient: bad → default)──▶ TanStack state ──toListQuery()──▶ ListQuery<C>
                                                                  (canonical, typed)      │
             saved views store the URL string                                             │ remote query
                                                                                          ▼
                                     valibot schema from the definition (strict: bad → 400)
                                                                                          │
                                           planList(sqlMapping, query) → rows / count / facets / groups / ids
```

### 6.1 The list definition (isomorphic, one per server-side list)

`src/routes/(app)/orders/orders-list.ts` replaces `orders-url.ts`. It's imported by the page, the
table component, `columns.ts` and `orders.remote.ts`, and has no server imports.

```ts
import { code, defineList, id, oneOf } from "#lib/components/data-table/list-definition.js";
import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.js";

/** The orders list: what it sorts, groups and filters by, with which values. */
export const ordersList = defineList({
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code }, // by customer code
		equipment: { sort: true, filter: code }, // by serial number
		type: { sort: true, group: true, filter: oneOf(orderTypes) },
		status: { sort: true, group: true, filter: oneOf(orderStatuses) },
		priority: { sort: true, group: true, filter: oneOf(orderPriorities) },
		engineer: { sort: true, group: true, filter: id }, // by engineer id: number[]
		scheduledFor: { param: "scheduled", sort: true },
		createdAt: { param: "created", sort: true },
	},
	defaults: { sort: [{ id: "createdAt", desc: true }], pageSize: 20 },
});
```

The generic part (`src/lib/components/data-table/list-definition.ts`) is small. A throwaway type-check of this sketch
(with `@ts-expect-error` cases for an unsortable id, a string engineer id and an unknown status)
passed, and the generated schema accepted a canonical query and rejected unknown filters, string
ids, duplicate sorts, oversize page sizes, extra keys and empty filters.

```ts
/** How a filter's values look in the query, and in the URL. */
export interface FilterKind<T> {
	value: v.GenericSchema<T>;
	fromUrl: (token: string) => unknown; // then checked with `value`
	toUrl: (value: T) => string;
}
export const code: FilterKind<string> = {
	value: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
	fromUrl: (t) => t,
	toUrl: (s) => s,
};
export const id: FilterKind<number> = {
	value: v.pipe(v.number(), v.integer(), v.minValue(1)),
	fromUrl: Number,
	toUrl: String,
};
export const oneOf = <const T extends readonly [string, ...string[]]>(
	values: T,
): FilterKind<T[number]> => ({
	value: v.picklist(values),
	fromUrl: (t) => t,
	toUrl: (s) => s,
});
// Later: `range(kind)` → { from?, to? } with `a..b` in the URL (#11); `orNone(kind)` → T | null with `none` (#19).

type SortId<C> = { [K in keyof C]: C[K] extends { sort: true } ? K : never }[keyof C] & string;
type GroupId<C> = { [K in keyof C]: C[K] extends { group: true } ? K : never }[keyof C] & string;
type FilterId<C> = {
	[K in keyof C]: C[K] extends { filter: FilterKind<any> } ? K : never;
}[keyof C] &
	string;
type FilterValue<C, K extends keyof C> = C[K] extends { filter: FilterKind<infer T> } ? T : never;

/** Which rows match: the facets' and bulk targets' argument. */
export interface ListWhere<C> {
	q: string;
	filters: { [K in FilterId<C>]?: FilterValue<C, K>[] };
}
/** A page of them: the rows query's argument. Canonical: every key present, nothing undefined. */
export interface ListQuery<C> extends ListWhere<C> {
	sort: { id: SortId<C>; desc: boolean }[];
	group: GroupId<C> | null;
	pageIndex: number;
	pageSize: number;
}

export function defineList<const C extends Columns>(def: ListDef<C>) {
	// Built at runtime from `def.columns`, then typed by the interfaces above.
	const filters =
		v.strictObject(
			/* per filter column: v.optional(v.pipe(v.array(kind.value), v.minLength(1), v.maxLength(50))) */
		);
	const where = v.strictObject({ q: v.pipe(v.string(), v.maxLength(200)), filters });
	const query = v.pipe(
		v.strictObject({
			...where.entries,
			sort: v.pipe(
				v.array(v.strictObject({ id: v.picklist(sortIds), desc: v.boolean() })),
				v.check(unique),
			),
			group: v.nullable(v.picklist(groupIds)),
			pageIndex: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000)),
			pageSize: v.picklist(def.pageSizes ?? defaultPageSizes),
		}),
		v.check((input) => JSON.stringify(input).length <= 4000), // today's budget, see 6.7
	);
	return {
		columns: def.columns,
		urlSpec: toUrlSpec(def), // the TableUrlSpec url-state.ts already reads: param, sortable, groupable, filter, values
		query: query as unknown as v.GenericSchema<ListQuery<C>>,
		where: where as unknown as v.GenericSchema<ListWhere<C>>,
	};
}
```

Plus three helpers in the same module:

```ts
/** The canonical query for a table state (from the URL or the table): sorted, deduped, valid values. */
export function toListQuery<C>(list: List<C>, state: TableUrlState): ListQuery<C>;
/** The part that decides which rows match. */
export const whereOf = <C>({ q, filters }: ListQuery<C>): ListWhere<C> => ({ q, filters });
/** A stable string for a query (sorted keys), to compare states, e.g. for `isStale`. */
export function queryKey(query: ListWhere<unknown>): string;
```

`toListQuery` is where the edge's leniency ends. It turns each URL token into a value with
`fromUrl`, keeps those that pass `kind.value` (`v.is`), dedupes and sorts them (so
`status=paid,quote` and `status=quote,paid` share a cache entry), drops empty filters, trims `q`,
and sets `group: null` rather than leaving it undefined. TanStack's state keeps URL tokens as
strings, as it does now, so client-side `filterFn`s and `RecordFilter` don't change.

### 6.2 The client edge

```svelte
<!-- orders/+page.svelte -->
<script lang="ts">
	const query = $derived(
		toListQuery(ordersList, parseTableUrl(page.url.searchParams, ordersList.urlSpec)),
	);
	const orders = $derived(getOrders(query)); // ListQuery<typeof ordersList.columns>
	const facets = $derived(getOrderFacets(whereOf(query))); // unchanged while paging/sorting
</script>
```

- `serverTableQuery()` goes away. `isStale(table, list, key)` compares `queryKey(toListQuery(list, tableState))`
  with the `key` the rows came with, which the server computes with `queryKey(input)`.
- `createAppTable({ urlState: { spec: ordersList.urlSpec } })` (or keep deriving the spec from the
  columns and keep `columns.spec.ts` comparing it with `ordersList.urlSpec`). Optionally, columns
  can spread their URL-relevant options from the definition (`...ordersList.column("status")` →
  `enableSorting`, `enableGrouping`, `meta.param/filter/filterValues`), which removes the
  agreement test.
- `<BulkActionBar matching={{ where: whereOf(orders.query), key: orders.key, count: orders.rowCount }}>`:
  the bulk target carries only what decides the rows.

### 6.3 The server: a typed mapping and one base query

`src/lib/server/table-query.ts` keeps its helpers (`nocase`, `rank`, `searchMatch`, grouping) and
takes a mapping typed by the definition:

```ts
/** The SQL for every column the definition sorts, groups or filters by, and nothing else. */
type SqlColumns<C> = {
	[K in SortId<C> | GroupId<C> | FilterId<C>]: (K extends SortId<C>
		? { sort: SQLWrapper | readonly SQLWrapper[]; nullsLast?: boolean }
		: unknown) &
		(K extends GroupId<C> ? { group: SQLWrapper } : unknown) &
		(K extends FilterId<C>
			? { filter: (values: FilterValue<C, K>[]) => SQL | undefined }
			: unknown);
};

export interface ListSql<C> {
	list: List<C>;
	/** The list's table with its joins, each scoped to the tenant: for counts, facets and ids. */
	from: (fields: SelectedFields) => SQLiteSelect;
	columns: SqlColumns<C>;
	search: readonly SQLWrapper[];
	/** The row's id: the last sort (stable pages) and what bulk targets resolve to. */
	id: SQLWrapper;
	scope: () => SQL;
}

export function planList<C>(sql: ListSql<C>, input: ListWhere<C> | ListQuery<C>): ListPlan<C>;
// ListPlan: where(except?: FilterId<C>), orderBy, limit, offset, page(), and, written once:
//   paged(q)             → q.where(…).orderBy(…).limit(…).offset(…), keeping q's row type
//   count()              → sql.from({ count: count() }).where(where())
//   groupCounts()        → by the group's SQL, keyed by groupKey()
//   facets({ status: order.status, … })  → keys typed as FilterId<C>
//   ids(limit)           → sql.from({ id: sql.id }).where(where()).orderBy(sql.id).limit(limit)
```

Orders after the change. The join chain is written once, in a helper generic over the query.
This is drizzle's "dynamic query building" pattern. The sketch confirmed that it keeps each
call's row type, including the nullable left joins. A helper generic over the _fields_
(`db.select(fields).from(order).innerJoin(…).leftJoin(…)`) does not type-check: drizzle 0.45 loses
the builder's methods after the first join.

```ts
/** The orders list's joins, each scoped to the tenant. */
const withOrderJoins = <T extends SQLiteSelect>(q: T) =>
	q
		.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
		.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)));

/** Built per request: `inTenant()` reads the request. */
const ordersSql = (): ListSql<typeof ordersList.columns> => ({
	list: ordersList,
	from: (fields) => withOrderJoins(db.select(fields).from(order).$dynamic()),
	columns: {
		number: { sort: order.number },
		customer: {
			sort: nocase(customer.name),
			filter: (codes) => inArray(customer.code, codes),
			group: customer.code,
		},
		// … type, status, priority as today
		engineer: {
			sort: nocase(engineer.name),
			nullsLast: true,
			filter: (ids) => inArray(order.engineerId, ids),
			group: order.engineerId,
		},
		scheduledFor: { sort: order.scheduledFor, nullsLast: true },
		createdAt: { sort: order.createdAt },
	}, // leaving out `customer.filter`, or adding `total`, is a type error
	search: [
		order.number,
		customer.name,
		customer.code,
		equipment.manufacturer,
		equipment.model,
		equipment.serialNumber,
		engineer.name,
	],
	id: order.id,
	scope: () => inTenant(order),
});

export const getOrders = query(ordersList.query, async (input) => {
	requireMember();
	const plan = planList(ordersSql(), input);
	const [rows, rowCount, counts] = await Promise.all([
		plan.paged(withOrderJoins(db.select({ id: order.id /* … as today */ }).from(order).$dynamic())),
		plan.count(),
		plan.groupCounts(),
	]);
	// … pricing and tags for the page, unchanged
	return {
		rows: priced.rows,
		rowCount,
		query: input,
		key: queryKey(input),
		groups: pageGroupsOf(counts, priced),
	};
});

export const getOrderFacets = query(ordersList.where, async (where) => {
	requireMember();
	return planList(ordersSql(), where).facets({
		type: order.type,
		status: order.status,
		priority: order.priority,
	});
});
```

`countOrders`, `matchingOrderIds` and their equipment and materials twins are deleted.

### 6.4 Bulk targets

```ts
// src/lib/server/bulk.ts
const ids = v.object({
	ids: v.pipe(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
		v.minLength(1),
		v.maxLength(MAX_BULK_RECORDS),
	),
});
/** For client-side tables (customers, invoices, contracts, engineers, module actions): ids only. */
export const idsTarget = ids;
/** For a server-side list: ids, or every row matching its search and filters. */
export const bulkTarget = <C>(where: v.GenericSchema<ListWhere<C>>) =>
	v.union([ids, v.object({ matching: where })]);

export async function targetIds<C>(
	target: { ids: number[] } | { matching: ListWhere<C> },
	list?: () => ListSql<C>,
) {
	if ("ids" in target) return [...new Set(target.ids)];
	if (!list) error(400, m.common_error_generic());
	const found = await planList(list(), target.matching).ids(MAX_BULK_RECORDS + 1);
	if (found.length > MAX_BULK_RECORDS)
		error(400, m.common_bulk_too_many({ max: formatNumber(MAX_BULK_RECORDS) }));
	return found;
}
```

`bulkSetOrderStatus = command(v.object({ target: bulkTarget(ordersList.where), status }), …)`. The
client-side `BulkTarget` type becomes `{ ids: number[] } | { matching: ListWhere<unknown> }`.

### 6.5 Saved views: unchanged

Views stay URL strings (`?status=quote&sort=-priority`). A view is a link, the grammar already
ignores what it no longer knows, and applying one is a navigation. That means **no data migration
and no versioning**. The one rule that follows: URL parameter names are a stored format. Renaming
a `param` needs an alias in the codec, as it already does for links.

### 6.6 What else gets simpler

- **The `string | SearchParams` overload and the `replace(/^\?/, "")` calls go away.** So does
  using `tableUrlKey` as an RPC key. `tableUrlKey` stays for the URL sync and views.
- **The facets prop is inferred:** `Awaited<ReturnType<typeof getOrderFacets>>`.
- **CSV export (#9)** is `planList(sql, where)` without a limit, and range and empty filters
  (#11, #19) are new `FilterKind`s, without touching each list's server code.

### 6.7 Errors and limits

| Input                                        | Today                    | Proposed                                                                                                                                                        |
| -------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bad link (`?status=bogus`, `?page=x`)        | ignored, default applies | same: the URL edge stays lenient                                                                                                                                |
| Bad RPC argument (tampered, or a client bug) | ignored                  | **400** (`ValidationError`); `handleError` gets the issues (`kind: "validation"`)                                                                               |
| Huge argument                                | > 4000 chars → 400       | `q` ≤ 200; ≤ 50 values per filter, each ≤ 64; sort ≤ the sortable ids, unique; `pageIndex` ≤ 100 000; a total JSON size ≤ 4000 (keeps the URL well under 16 KB) |
| Bulk "all matching"                          | ≤ 500 ids, else 400      | same                                                                                                                                                            |

## 7. Migration plan

Each step is mergeable on its own, with the app working between steps. Per CLAUDE.md, each step
runs `pnpm run check` and then the relevant spec and e2e files before committing.

1. **Definition module, no callers.** Add `src/lib/components/data-table/list-definition.ts`
   (`FilterKind`s `code`/`id`/`oneOf`, `defineList`, `toListQuery`, `whereOf`, `queryKey`,
   `toUrlSpec`) and `list-definition.spec.ts`. Test: `toUrlSpec` equals today's `ordersUrl` for an
   orders-shaped definition; `toListQuery(parseTableUrl(url))` is canonical (value order, dupes,
   bad ids, defaults); every output of `toListQuery` passes the schema; the schema rejects unknown
   filter ids, string ids, unknown enum values, duplicate sorts, extra keys, oversize input; the
   worst allowed input's payload stays under 8 KB. Add `expectTypeOf` cases for the types.
2. **Typed server planner beside the old one.** In `table-query.ts`, add `ListSql`, `planList` and
   its `paged/count/facets/groupCounts/ids`, and reimplement `planTable(table, string)` on top
   (parse → `toListQuery` → `planList`) so the three lists keep working. Port
   `table-query.spec.ts` to `planList`. Keep a `fromUrl("kind=cooling&sort=-due")` helper so the
   tests stay readable, and add `ids()`, `count()` and a missing-mapping type test. The
   tenant-isolation test ("never returns another tenant's rows") must pass unchanged.
3. **Orders.** `orders-list.ts` replaces `orders-url.ts`. Then `ordersSql()` + `withOrderJoins`,
   `getOrders(ordersList.query)` and `getOrderFacets(ordersList.where)`, then `bulkTarget(ordersList.where)`
   and `targetIds(target, ordersSql)`, deleting `countOrders` and `matchingOrderIds`. On the
   client: `+page.svelte` (6.2), `orders-table.svelte` (`isStale` by `queryKey`, the inferred
   facets type) and `BulkActionBar`'s `matching` prop (`{ where, key, count }`). `columns.spec.ts`
   compares with `ordersList.urlSpec`. Run `e2e/orders.test.ts` (UI-driven, so unchanged) and
   add one step: a request with a malformed argument gets a 400 (`app.expectingErrors`), and
   bulk "select all matching" still acts on exactly the filtered orders. Optional: accept the old
   string for one release, `v.union([ordersList.query, legacyString(ordersList)])`, for tabs still
   running the previous build. Otherwise those tabs see an error until their next navigation, which
   SvelteKit turns into a full reload once it has seen the new version.
4. **Equipment.** Same as step 3. Its `openOrders` subquery calls `inTenant()`, so it stays inside
   the per-request `equipmentSql()`.
5. **Materials.** Same. `stockLevel`'s filter becomes `(levels: StockLevel[]) => inArray(level, levels)`.
6. **Remove the string path:** `tableParams`, the string `planTable`, `ServerTable`,
   `serverTableQuery`, `MatchingIds`, and `bulkTarget`'s string form. The customers, invoices,
   contracts, engineers and invoicing module commands switch to `idsTarget`. Update the doc
   comments in `table-query.ts`, `grouping.ts` and `server-table.svelte.ts`, and add a short
   "Server-side lists" section to CLAUDE.md (definition, then `ListSql`, then `planList`; joins
   once; built per request).
7. **Optional:** columns spread their URL options from the definition (`ordersList.column(id)`),
   which retires the `columns.spec.ts` agreement tests.

### Risks

- **Tenant scoping.** The mechanics don't change (`scope()` in every `where`, `inTenant()` on every
  join), and they get safer: joins live in one helper that rows, counts, facets and ids all use.
  The risk is building `ListSql` at module scope, where `inTenant()` has no request. Make it a
  factory in every list, and say so in its doc comment.
- **Validation strictness.** A strict schema means a client that builds a slightly wrong object
  gets a 400 instead of a silently degraded list. That's the point, but step 1's "every
  `toListQuery` output passes the schema" property test is what makes it safe.
- **Cache-key drift.** SvelteKit keys on the raw argument. A caller that skips `toListQuery` (say
  `{ ...query, q: undefined }`) makes duplicate cache entries and refetches. Keep `toListQuery` the
  only way callers build the argument, and keep `query`/`key` from the response for anything
  derived from it.
- **URL length.** Object payloads are about 3× the string's. The total-size check keeps them where
  today's cap does. A `RecordFilter` with hundreds of ticks fails as it does now.
- **Deploy skew.** Covered by the optional legacy union in step 3.
- **Saved views.** Unchanged storage and codec, so existing rows keep working. `views.spec.ts` and
  `saved-views.svelte.spec.ts` should pass untouched. Run them in step 3 to confirm.

## Range filters (#11)

Built on the design above as three more `FilterKind`s, `dateRange`, `numberRange` and
`moneyRange` (`list-definition.ts`), with their grammar in
`src/lib/components/data-table/ranges.ts`. What was decided:

- **A range is one token, both ends included.** `?scheduled=2026-10-01..2026-10-07`,
  `2026-10-01..` (on or after), `..2026-10-07` (on or before), one day `2026-10-01`; numbers
  `?quantity=5..10`, `..10` (at most 10), `5..` (at least 5), `0`. `..` can't be part of a day or a
  plain number (`-2.5`, no exponents), and a range has no commas. "Below 10" is `..9` for whole
  numbers: inclusive ends read the same on both sides, and match the inputs' "Minimum" and
  "Maximum".
- **Presets stay relative in the URL, also as an end.** `?scheduled=this-week`, `before-today`,
  `next-7-days`, … (`datePresets`) on their own mean their days; as an end, a preset means its first
  day as the start and its last as the end: `today..` (from today on), `..yesterday`,
  `this-week..next-month`. A preset without that day can't be that end (`before-today..` and
  `..from-today` aren't ranges). A link or a saved view ("scheduled this week") means the current
  week whenever it's opened. `toListQuery()` turns the presets into the days they mean when it
  builds the query, so the remote query only ever gets days (`{ from: "2026-10-12", to: null }`),
  its schema stays strict, and the cache key changes with the day. Weeks start on Monday.
- **Several values per filter, comma-separated, like a set filter's.** The rows in any of them are
  kept: `?quantity=2,5..8,12`. On a column that can be empty (`orNone(dateRange)`) `none` keeps the
  rows without a value, as in #19: `?scheduled=none,this-week` ("unscheduled or this week"). The
  query has them as an array like any filter's (`[null, { from, to }]`), deduped and sorted (`null`
  first, then by start and end), at most `listLimits.ranges` (10). The planner, `whereOf()`,
  `queryKey()`, bulk targets and saved views (URL strings) needed nothing new.
- **Money is in euros in the URL and in cents everywhere else.** `?total=500..`, `?price=..12.50`
  (at most two decimals). `euroCents()` reads the digits, not a float (`0.29` is 29 cents, not
  28.999…), and the query's schema takes whole cents only, so an amount is never off by a rounding.
  The client-side tables compare the cents their rows have.
- **Order totals are filtered on what the list shows.** An order's total isn't in the database: it
  is `priceOrders()`'s labour plus the modules' costs (`orders.costs`, e.g. materials) and
  adjustments (`orders.adjustPrices`, e.g. what a contract includes, which depends on the contract
  covering the unit on the order's date). Filtering a SQL column instead would disagree with the
  table, and working the modules' rules out again in SQL would have to match their code exactly,
  forever. So a column's SQL can `match` instead of `filter` (`FilterSql` in `plan.ts`): the plan
  takes the ids of the rows matching the search and the other filters, the column picks those whose
  value is in the ranges (orders price them with `priceOrders()`, from the same facts as the rows),
  and the plan keeps them by id. The rows, the count, the facets, the groups and the bulk ids all
  use that one `where`, worked out once per plan. It costs pricing every matching order (not just a
  page), so it is refused with a 400 beyond `MAX_MATCHED_ROWS` (10,000) rows: narrow down with the
  other filters first. Totals aren't sortable, as before.
- **Whose today, whose midnight.** The days are the browser's (where `toListQuery()` runs; the
  server's while it renders the page), and the server turns a day into timestamps at its own local
  midnight (`inDays()`, as the activity feed's date filter already did). Both are the same zone in
  practice; a tenant time zone would fix both ends if that ever changes.
- **Lenient URL, strict query.** A token that isn't a value (a day that doesn't exist, ends in the
  wrong order, a number with an exponent, euros with three decimals) is dropped from the URL's
  state, the others kept, as an unknown status is. A query with a malformed range (no end, ends
  reversed, more than ten values, a token instead of a range, a string for a number, cents that
  aren't whole, a number beyond ±10¹², `null` on a column that can't be empty) is a 400.
- **No facets.** Range columns have no counts; the filters show what they mean instead (a preset's
  days, "At least 2", "Unscheduled, Next 7 days").
- **The UI.** `DateRangeFilter` lists `none` (where the column can be empty) and presets to toggle,
  and adds a range of one's own whose ends are each a day or a preset; `NumberRangeFilter` (with
  `money` for cents) adds a minimum, a maximum or both. The values chosen are listed at the top, each
  with a button that takes it off; the pill sums them up ("Unscheduled, Next 7 days", or "3
  selected").
- **Client-side tables** use the same grammar through `filterFn: "inDateRange"`, `"inNumberRange"`
  and `"inMoneyRange"` (`features.ts`), which also give the URL spec its `filter` kind, so
  `columns.spec.ts` still compares the table's spec with the list's.
- **Where:** orders' scheduled (with `none`) and created dates and total; equipment's installed and
  warranty dates and open orders; materials' quantity in stock (`quantity`, as `stock` is the stock
  level), orders used on and unit price; customers' equipment, open orders and "since"; engineers'
  open orders, hire date and hourly rate; invoices' total and due date (`none`: the drafts);
  contracts' monthly fee.

## Open questions

- Should client-side tables (customers, engineers, …) also get a definition? It's not needed for
  this change. It would only unify how they get their URL spec.
- Should a bad RPC argument log loudly (a client bug), or should the logs stay quiet for it
  (tampering)? A `handleError` hook could log the `kind: "validation"` failures of remote queries.
