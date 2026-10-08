import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { count, eq, type SQL, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import type { TableUrlSpec } from "#lib/components/data-table/url-state.js";

import {
	facetCounts,
	nocase,
	oneOf,
	planTable,
	rank,
	searchMatch,
	type ServerTable,
} from "./table-query.ts";

// A table of its own in a temporary database, rather than the app's.
const item = sqliteTable("item", {
	id: integer("id").primaryKey(),
	tenant: text("tenant").notNull(),
	name: text("name").notNull(),
	code: text("code").notNull(),
	kind: text("kind").notNull(),
	priority: text("priority").notNull(),
	due: integer("due"),
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
	await db.insert(item).values(items);
});

afterAll(() => {
	client.close();
	rmSync(folder, { recursive: true, force: true });
});

const priorities = ["low", "normal", "high", "urgent"];

const spec: TableUrlSpec = {
	columns: [
		{ id: "name", sortable: true },
		{ id: "code", sortable: true, filter: "set" },
		{ id: "kind", sortable: true, filter: "set", values: ["heating", "cooling", "plumbing"] },
		{ id: "priority", sortable: true, filter: "set", values: priorities },
		{ id: "due", sortable: true },
	],
	defaults: { sorting: [{ id: "name", desc: false }], pagination: { pageIndex: 0, pageSize: 2 } },
	pageSizes: [2, 5],
};

const table: ServerTable = {
	spec,
	columns: {
		name: { sort: nocase(item.name) },
		code: { sort: item.code, filter: oneOf(item.code) },
		kind: { sort: item.kind, filter: oneOf(item.kind) },
		priority: { sort: rank(item.priority, priorities), filter: oneOf(item.priority) },
		due: { sort: item.due, nullsLast: true },
	},
	search: [item.name, item.code],
	tieBreaker: item.id,
	scope: () => eq(item.tenant, "a"),
};

/** The ids of the page the URL's parameters ask for, and how many match in all. */
async function page(params: string) {
	const plan = planTable(table, params);
	const rows = await db
		.select({ id: item.id })
		.from(item)
		.where(plan.where())
		.orderBy(...plan.orderBy)
		.limit(plan.limit)
		.offset(plan.offset);
	const [{ total }] = await db.select({ total: count() }).from(item).where(plan.where());
	return { ids: rows.map((row) => row.id), total };
}

/** All the ids, on one page. */
const all = async (params: string) => (await page(`${params}&size=5`)).ids;

const countBy = async (where: SQL | undefined, by: SQLWrapper) =>
	db
		.select({ value: sql<unknown>`${by}`, count: count() })
		.from(item)
		.where(where)
		.groupBy(sql`${by}`);

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

	test("searchMatch is nothing for an empty search", () => {
		expect(searchMatch([item.name], " ")).toBeUndefined();
		expect(searchMatch([], "boiler")).toBeUndefined();
	});
});

describe("counting for the filters", () => {
	test("counts each value among what the search and the other filters leave", async () => {
		const plan = planTable(table, "q=b&kind=heating&priority=urgent");
		const counts = await facetCounts(plan, { kind: item.kind, priority: item.priority }, countBy);
		// Without its own filter: all kinds with an urgent priority and a "b".
		expect(counts.kind).toEqual({ heating: 1 });
		// Without its own filter: every priority of heating with a "b".
		expect(counts.priority).toEqual({ low: 1, normal: 1, urgent: 1 });
	});
});

test("the key is the same for the same state, whatever the URL's order or extras", () => {
	const key = planTable(table, "priority=low&kind=heating&sort=-due&other=1").key;
	expect(planTable(table, "kind=heating&sort=-due&priority=low").key).toBe(key);
	expect(planTable(table, "kind=cooling&sort=-due&priority=low").key).not.toBe(key);
	expect(planTable(table, "sort=name&size=2&page=1").key).toBe("");
});
