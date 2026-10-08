import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { integer, type SQLiteSelect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
	code,
	defineList,
	type ListQuery,
	oneOf as oneOfKind,
	toListQuery,
	whereOf,
} from "#lib/components/data-table/list-definition.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";

import {
	type ListSql,
	nocase,
	planList,
	rank,
	searchMatch,
	type SqlColumns,
} from "./table-query.ts";

// Tables of their own in a temporary database, rather than the app's.
const item = sqliteTable("item", {
	id: integer("id").primaryKey(),
	tenant: text("tenant").notNull(),
	name: text("name").notNull(),
	code: text("code").notNull(),
	kind: text("kind").notNull(),
	priority: text("priority").notNull(),
	due: integer("due"),
});

// What `kind` is called, for a join: plumbing has no label.
const label = sqliteTable("label", {
	kind: text("kind").primaryKey(),
	text: text("text").notNull(),
});

const folder = mkdtempSync(join(tmpdir(), "table-query-spec-"));
const client = createClient({ url: `file:${join(folder, "test.db")}` });
const db = drizzle(client);

type Item = typeof item.$inferInsert;
const items: Item[] = [
	{ id: 1, tenant: "a", name: "boiler", code: "B-1", kind: "heating", priority: "low", due: 3 },
	{
		id: 2,
		tenant: "a",
		name: "Chiller",
		code: "C-1",
		kind: "cooling",
		priority: "urgent",
		due: null,
	},
	{
		id: 3,
		tenant: "a",
		name: "air handler",
		code: "A-1",
		kind: "cooling",
		priority: "normal",
		due: 1,
	},
	{
		id: 4,
		tenant: "a",
		name: "Boiler room",
		code: "B-2",
		kind: "heating",
		priority: "urgent",
		due: 2,
	},
	{
		id: 5,
		tenant: "a",
		name: "50%_valve",
		code: "V-1",
		kind: "plumbing",
		priority: "low",
		due: null,
	},
	{ id: 6, tenant: "a", name: "boiler", code: "B-3", kind: "heating", priority: "normal", due: 3 },
	// Another tenant's, which no query may return.
	{ id: 7, tenant: "b", name: "boiler", code: "B-1", kind: "heating", priority: "low", due: 1 },
];

beforeAll(async () => {
	await client.execute(`create table item (
		id integer primary key, tenant text not null, name text not null, code text not null,
		kind text not null, priority text not null, due integer
	)`);
	await client.execute("create table label (kind text primary key, text text not null)");
	await db.insert(item).values(items);
	await db.insert(label).values([
		{ kind: "heating", text: "Warmth" },
		{ kind: "cooling", text: "Cold" },
	]);
});

afterAll(() => {
	client.close();
	rmSync(folder, { recursive: true, force: true });
});

const kinds = ["heating", "cooling", "plumbing"] as const;
const priorities = ["low", "normal", "high", "urgent"] as const;

/** A list definition, and the SQL for it (`ListSql`). */
const itemList = defineList({
	columns: {
		name: { sort: true },
		code: { sort: true, filter: code },
		kind: { sort: true, group: true, filter: oneOfKind(kinds) },
		priority: { sort: true, group: true, filter: oneOfKind(priorities) },
		due: { sort: true },
	},
	defaults: { sort: [{ id: "name", desc: false }], pageSize: 2 },
	pageSizes: [2, 5],
});

type ItemColumns = typeof itemList.columns;

/** The labels of the items, for the list's search. */
const withLabel = <T extends SQLiteSelect>(query: T) =>
	query.leftJoin(label, eq(item.kind, label.kind));

// A function, as the tenant comes from the request.
const itemSql = (): ListSql<ItemColumns> => ({
	list: itemList,
	from: (fields) => withLabel(db.select(fields).from(item).$dynamic()),
	columns: {
		name: { sort: nocase(item.name) },
		code: { sort: item.code, filter: (codes) => inArray(item.code, codes) },
		kind: {
			sort: item.kind,
			filter: (values) => inArray(item.kind, values),
			group: item.kind,
		},
		priority: {
			sort: rank(item.priority, priorities),
			filter: (values) => inArray(item.priority, values),
			group: item.priority,
		},
		due: { sort: item.due, nullsLast: true },
	},
	search: [item.name, item.code, label.text],
	id: item.id,
	scope: () => eq(item.tenant, "a"),
});

/** The list's canonical query for a URL's parameters. */
const fromUrl = (search: string) =>
	toListQuery(itemList, parseTableUrl(new URLSearchParams(search), itemList.urlSpec));

/**
 * What a URL's parameters ask of a list: the ids of the page, how many match in all, and when
 * grouped, the rows just before and after it; the counts for the filters and the groups.
 */
const planner = {
	grouped: async (params: string) => {
		const plan = planList(itemSql(), fromUrl(params));
		const fetched = await plan.paged(withLabel(db.select({ id: item.id }).from(item).$dynamic()));
		const { rows, previous, next } = plan.page(fetched);
		return {
			page: { ids: rows.map((row) => row.id), total: await plan.count() },
			previous: previous?.id,
			next: next?.id,
		};
	},
	facets: (params: string) =>
		planList(itemSql(), whereOf(fromUrl(params))).facets({
			kind: item.kind,
			priority: item.priority,
		}),
	groupCounts: (params: string) => planList(itemSql(), fromUrl(params)).groupCounts(),
	groupId: (params: string) => planList(itemSql(), fromUrl(params)).group?.id,
};

describe("planList on a URL's parameters", () => {
	/** The ids of the page the URL's parameters ask for, and how many match in all. */
	const page = async (params: string) => (await planner.grouped(params)).page;
	const grouped = planner.grouped;

	/** All the ids, on one page. */
	const all = async (params: string) => (await page(`${params}&size=5`)).ids;

	describe("paging", () => {
		test("pages by the default size, sorted by default, with the total", async () => {
			expect(await page("")).toEqual({ ids: [5, 3], total: 6 });
			expect(await page("page=2")).toEqual({ ids: [1, 6], total: 6 });
			expect(await page("page=3")).toEqual({ ids: [4, 2], total: 6 });
		});

		test("a page beyond the last is empty, with the total", async () => {
			expect(await page("page=9")).toEqual({ ids: [], total: 6 });
		});

		test("takes only the page sizes the table offers", async () => {
			expect((await page("size=5")).ids).toHaveLength(5);
			expect((await page("size=3")).ids).toHaveLength(2);
			expect((await page("size=1000000")).ids).toHaveLength(2);
			expect((await page("size=-5&page=0")).ids).toEqual([5, 3]);
		});

		test("never returns another tenant's rows", async () => {
			expect(await all("q=boiler&code=B-1")).toEqual([1]);
		});
	});

	describe("sorting", () => {
		test("text sorts without regard to case, ties by id", async () => {
			// Digits first; boiler (1), boiler (6), Boiler room (4) after air handler, before Chiller.
			expect(await all("")).toEqual([5, 3, 1, 6, 4]);
			expect(await all("sort=-name")).toEqual([2, 4, 1, 6, 3]);
		});

		test("by several columns, in order", async () => {
			expect(await all("sort=kind,-name")).toEqual([2, 3, 4, 1, 6]);
		});

		test("by a list's order rather than alphabetically", async () => {
			expect(await all("sort=-priority,name")).toEqual([4, 2, 3, 6, 5]);
		});

		test("rows without a value come last both ways", async () => {
			expect(await all("sort=due")).toEqual([3, 4, 1, 6, 2]);
			expect(await all("sort=-due")).toEqual([1, 6, 4, 3, 2]);
		});

		test("unknown columns are ignored", async () => {
			expect(await all("sort=tenant,-bogus")).toEqual(await all(""));
		});
	});

	describe("filtering", () => {
		test("keeps rows with any of a filter's values, and all filters", async () => {
			expect(await all("kind=cooling,plumbing")).toEqual([5, 3, 2]);
			expect((await page("kind=heating&priority=urgent")).ids).toEqual([4]);
		});

		test("ignores values a filter doesn't have, and unknown filters", async () => {
			expect((await page("kind=heating,bogus")).total).toBe(3);
			expect((await page("kind=bogus")).total).toBe(6);
			expect((await page("tenant=b")).total).toBe(6);
		});

		test("takes any value of a filter without a list, e.g. codes", async () => {
			expect((await page("code=B-1,B-2,X-9")).total).toBe(2);
		});
	});

	describe("searching", () => {
		test("finds each word in any searched column, in any case", async () => {
			expect((await page("q=BOILER")).total).toBe(3);
			expect((await page("q=b- room")).ids).toEqual([4]);
			expect((await page("q=  ")).total).toBe(6);
		});

		test("takes % and _ literally", async () => {
			expect((await page("q=%25")).ids).toEqual([5]);
			expect((await page("q=_")).ids).toEqual([5]);
			expect((await page("q=0%25_v")).ids).toEqual([5]);
		});
	});

	describe("counting for the filters", () => {
		test("counts each value among what the search and the other filters leave", async () => {
			const counts = await planner.facets("q=b&kind=heating&priority=urgent");
			// Without its own filter: all kinds with an urgent priority and a "b".
			expect(counts.kind).toEqual({ heating: 1 });
			// Without its own filter: every priority of heating with a "b".
			expect(counts.priority).toEqual({ low: 1, normal: 1, urgent: 1 });
		});
	});

	describe("grouping", () => {
		test("sorts by the group first, then as the table is sorted", async () => {
			// Cooling: air handler, Chiller; heating: boiler (1), boiler (6), Boiler room; plumbing.
			expect(await all("group=kind")).toEqual([3, 2, 1, 6, 4]);
			expect((await page("group=kind&size=5&page=2")).ids).toEqual([5]);
			expect(await all("group=kind&sort=-name")).toEqual([2, 3, 4, 1, 6]);
		});

		test("the groups go the way the table sorts their column, wherever it is in the sort", async () => {
			expect(await all("group=kind&sort=name,-kind")).toEqual([5, 1, 6, 4, 3]);
			// By urgency, as the priority sorts.
			expect(await all("group=priority&sort=name")).toEqual([5, 1, 3, 6, 4]);
		});

		test("fetches the rows around the page, and splits them off", async () => {
			expect(await grouped("group=kind")).toEqual({
				page: { ids: [3, 2], total: 6 },
				previous: undefined,
				next: 1,
			});
			expect(await grouped("group=kind&page=2")).toEqual({
				page: { ids: [1, 6], total: 6 },
				previous: 2,
				next: 4,
			});
			expect(await grouped("group=kind&page=3")).toEqual({
				page: { ids: [4, 5], total: 6 },
				previous: 6,
				next: undefined,
			});
		});

		test("counts each group's rows among those the search and filters leave", async () => {
			const counts = planner.groupCounts;
			expect(await counts("group=kind")).toEqual({ heating: 3, cooling: 2, plumbing: 1 });
			expect(await counts("group=kind&priority=urgent")).toEqual({ heating: 1, cooling: 1 });
			expect(await counts("group=kind&q=b")).toEqual({ heating: 3 });
			expect(await counts("")).toBeUndefined();
		});

		test("only by columns the server can group by", async () => {
			expect(planner.groupId("group=tenant")).toBeUndefined();
			expect(planner.groupId("group=kind")).toBe("kind");
			expect(await all("group=tenant")).toEqual(await all(""));
			expect(await grouped("group=tenant")).toMatchObject({ previous: undefined, next: undefined });
		});
	});
});

test("searchMatch is nothing for an empty search", () => {
	expect(searchMatch([item.name], " ")).toBeUndefined();
	expect(searchMatch([], "boiler")).toBeUndefined();
});

describe("planList on typed queries", () => {
	const query = (change: Partial<ListQuery<ItemColumns>> = {}): ListQuery<ItemColumns> => ({
		q: "",
		filters: {},
		sort: [{ id: "name", desc: false }],
		group: null,
		pageIndex: 0,
		pageSize: 5,
		...change,
	});

	test("plans a typed query, without a URL", async () => {
		const plan = planList(
			itemSql(),
			query({ filters: { kind: ["heating"] }, sort: [{ id: "due", desc: true }] }),
		);
		const rows = await plan.paged(withLabel(db.select({ id: item.id }).from(item).$dynamic()));
		expect(rows.map((row) => row.id)).toEqual([1, 6, 4]);
		expect(await plan.count()).toBe(3);
	});

	test("pages rows of a query with joins, and keeps their types", async () => {
		const plan = planList(itemSql(), fromUrl("group=kind&size=5"));
		const select = db
			.select({ id: item.id, kind: item.kind, text: label.text })
			.from(item)
			.$dynamic();
		const rows = await plan.paged(withLabel(select));
		expectTypeOf(rows).toEqualTypeOf<{ id: number; kind: string; text: string | null }[]>();
		expect(plan.page(rows).rows.map((row) => [row.id, row.text])).toEqual([
			[3, "Cold"],
			[2, "Cold"],
			[1, "Warmth"],
			[6, "Warmth"],
			[4, "Warmth"],
		]);
	});

	test("searches the columns the joins bring in, in the counts too", async () => {
		const where = whereOf(fromUrl("q=warm"));
		expect(await planList(itemSql(), where).ids(10)).toEqual([1, 4, 6]);
		expect(await planList(itemSql(), where).count()).toBe(3);
		expect((await planner.grouped("q=warm&size=5")).page).toEqual({ ids: [1, 6, 4], total: 3 });
		expect(await planList(itemSql(), where).facets({ kind: item.kind })).toEqual({
			kind: { heating: 3 },
		});
	});

	describe("ids", () => {
		test("are those of the rows that match, in order, of the tenant only", async () => {
			const ids = (search: string, limit = 10) =>
				planList(itemSql(), whereOf(fromUrl(search))).ids(limit);
			expect(await ids("")).toEqual([1, 2, 3, 4, 5, 6]);
			expect(await ids("kind=heating")).toEqual([1, 4, 6]);
			expect(await ids("q=boiler")).toEqual([1, 4, 6]);
			expect(await ids("q=boiler&code=B-1")).toEqual([1]);
			expect(await ids("kind=heating&priority=urgent,normal")).toEqual([4, 6]);
		});

		test("are at most as many as asked for", async () => {
			const ids = (limit: number) => planList(itemSql(), whereOf(fromUrl(""))).ids(limit);
			expect(await ids(2)).toEqual([1, 2]);
			expect(await ids(0)).toEqual([]);
		});

		test("don't depend on the sorting, paging or grouping", async () => {
			const ids = await planList(itemSql(), whereOf(fromUrl("group=kind&sort=-due&page=2"))).ids(
				10,
			);
			expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
		});
	});

	describe("count", () => {
		test("is how many rows match, whatever the page", async () => {
			const total = (search: string) => planList(itemSql(), fromUrl(search)).count();
			expect(await total("")).toBe(6);
			expect(await total("page=3")).toBe(6);
			expect(await total("kind=cooling")).toBe(2);
			expect(await total("q=boiler&kind=heating,cooling")).toBe(3);
			expect(await total("kind=plumbing&q=boiler")).toBe(0);
		});
	});

	test("a plan for what matches has no page", () => {
		const plan = planList(itemSql(), whereOf(query()));
		// @ts-expect-error only a plan of a whole query has a page
		void plan.paged;
		expect(Object.keys(plan).toSorted()).toEqual(["count", "facets", "ids", "where"]);
	});

	test("counts only the filters it has columns for", async () => {
		const plan = planList(itemSql(), whereOf(query()));
		expectTypeOf(await plan.facets({ kind: item.kind })).toEqualTypeOf<
			Record<"kind", Record<string, number>>
		>();
		// @ts-expect-error `due` isn't a column the list filters by
		const untyped = await plan.facets({ due: item.due });
		expect(Object.keys(untyped)).toEqual(["due"]);
	});

	test("the SQL has to cover the definition's columns, and no others", () => {
		const columns = itemSql().columns;
		const withColumns = (columns: SqlColumns<ItemColumns>) => ({ ...itemSql(), columns });
		// @ts-expect-error `kind` has no filter or group
		withColumns({ ...columns, kind: { sort: item.kind } });
		// @ts-expect-error `due` has no sort
		withColumns({ ...columns, due: {} });
		// @ts-expect-error `total` isn't a column of the list
		withColumns({ ...columns, total: { sort: item.id } });
		const byId = (ids: number[]) => inArray(item.id, ids);
		// @ts-expect-error a filter takes the definition's values
		withColumns({ ...columns, code: { sort: item.code, filter: byId } });
		// @ts-expect-error `code` isn't groupable
		withColumns({ ...columns, code: { ...columns.code, group: item.code } });
		const { name: _, ...withoutName } = columns;
		// @ts-expect-error `name` is missing
		withColumns(withoutName);
		expect(withColumns(columns).columns).toBe(columns);
	});
});
