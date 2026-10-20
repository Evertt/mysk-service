import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import type { TableState } from "@tanstack/svelte-table";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vite-plus/test";

import {
	code,
	dateRange,
	defineList,
	id,
	type List,
	type ListQuery,
	type ListWhere,
	listLimits,
	moneyRange,
	numberRange,
	oneOf,
	orNone,
	queryKey,
	startingAt,
	toListQuery,
	toUrlSpec,
	whereOf,
	withListColumns,
} from "#lib/components/data-table/list-definition.ts";
import type { DateRange, NumberRange } from "#lib/components/data-table/ranges.ts";
import { urlGrammar } from "#lib/components/data-table/server-table.svelte.ts";
import { createAppColumnHelper, createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { parseTableUrl, type TableUrlState } from "#lib/components/data-table/url-state.ts";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.ts";
import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";
import { at, freezeNow } from "#unit/temporal-support.ts";

/** The orders list, as `orders-list.ts` defines it. */
const ordersList = defineList({
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		equipment: { sort: true, filter: orNone(code) },
		type: { sort: true, group: true, filter: oneOf(orderTypes) },
		status: { sort: true, group: true, filter: oneOf(orderStatuses) },
		priority: { sort: true, group: true, filter: oneOf(orderPriorities) },
		engineer: { sort: true, group: true, filter: orNone(id) },
		scheduledFor: { param: "scheduled", sort: true },
		createdAt: { param: "created", sort: true },
	},
	defaults: { sort: [{ id: "createdAt", desc: true }], pageSize: 20 },
});

type OrdersColumns = typeof ordersList.columns;

/** The canonical query for a URL's parameters. */
const fromUrl = (search: string) =>
	toListQuery(ordersList, parseTableUrl(new URLSearchParams(search), ordersList.urlSpec));

const canonical: ListQuery<OrdersColumns> = {
	q: "",
	filters: {},
	sort: [{ id: "createdAt", desc: true }],
	group: null,
	pageIndex: 0,
	pageSize: 20,
};

const accepts = (input: unknown) => v.safeParse(ordersList.query, input).success;

describe("toUrlSpec", () => {
	test("gives the URL spec the orders list has had by hand", () => {
		expect(ordersList.urlSpec).toEqual({
			columns: [
				{ id: "number", sortable: true },
				{ id: "customer", sortable: true, groupable: true, filter: "set" },
				{ id: "equipment", sortable: true, filter: "set" },
				{ id: "type", sortable: true, groupable: true, filter: "set", values: orderTypes },
				{ id: "status", sortable: true, groupable: true, filter: "set", values: orderStatuses },
				{ id: "priority", sortable: true, groupable: true, filter: "set", values: orderPriorities },
				{ id: "engineer", sortable: true, groupable: true, filter: "set" },
				{ id: "scheduledFor", param: "scheduled", sortable: true },
				{ id: "createdAt", param: "created", sortable: true },
			],
			defaults: {
				sorting: [{ id: "createdAt", desc: true }],
			},
		});
	});

	test("has the defaults: group and filters", () => {
		const spec = toUrlSpec({
			columns: {
				status: { sort: true, group: true, filter: oneOf(orderStatuses) },
				engineer: { filter: id },
			},
			defaults: {
				sort: [{ id: "status", desc: true }],
				group: "status",
				filters: { engineer: [7, 3] },
				pageSize: 50,
			},
		});
		expect(parseTableUrl(new URLSearchParams(), spec)).toEqual({
			globalFilter: "",
			sorting: [{ id: "status", desc: true }],
			columnFilters: [{ id: "engineer", value: ["7", "3"] }],
			grouping: ["status"],
		});
	});

	test("lists `none` among the values of a filter on a fixed set that can be empty", () => {
		const spec = toUrlSpec({
			columns: {
				status: { filter: orNone(oneOf(orderStatuses)) },
				engineer: { filter: orNone(id) },
			},
			defaults: { filters: { status: [null, "quote"], engineer: [null] } },
		});
		expect(spec.columns).toEqual([
			{ id: "status", filter: "set", values: [...orderStatuses, "none"] },
			{ id: "engineer", filter: "set" },
		]);
		expect(spec.defaults?.columnFilters).toEqual([
			{ id: "status", value: ["none", "quote"] },
			{ id: "engineer", value: ["none"] },
		]);
	});

	test("refuses columns that share a name in the URL", () => {
		expect(() =>
			defineList({
				columns: { created: { sort: true }, createdAt: { param: "created", sort: true } },
			}),
		).toThrow('Two sortable columns are called "created"');
		expect(() => defineList({ columns: { q: { filter: code } } })).toThrow(
			'The filter "q" is taken',
		);
	});
});

describe("toListQuery", () => {
	test("is the defaults for an untouched table", () => {
		expect(fromUrl("")).toStrictEqual(canonical);
	});

	test("has a filter's values deduped and sorted, whatever the URL's order", () => {
		const query = fromUrl("status=scheduled,quote");
		expect(query.filters).toStrictEqual({ status: ["quote", "scheduled"] });
		expect(fromUrl("status=quote&status=scheduled&status=quote")).toStrictEqual(query);
		expect(fromUrl("status=quote,scheduled,quote")).toStrictEqual(query);
		expect(fromUrl("customer=C-2,C-10,C-1,C-2").filters.customer).toStrictEqual([
			"C-1",
			"C-10",
			"C-2",
		]);
	});

	test("has ids as numbers, sorted as numbers, and leaves out those that aren't", () => {
		expect(fromUrl("engineer=10,9,x,2").filters).toStrictEqual({ engineer: [2, 9, 10] });
		expect(fromUrl("engineer=0,-3,1e2,0x10,1.5,%20,12345678901234567890").filters).toStrictEqual(
			{},
		);
		expect(fromUrl("engineer=abc").filters).toStrictEqual({});
	});

	test("has null, first, for `none` in a filter that can be empty", () => {
		expect(fromUrl("engineer=12,none,3").filters).toStrictEqual({ engineer: [null, 3, 12] });
		expect(fromUrl("equipment=X-2,none,none").filters).toStrictEqual({ equipment: [null, "X-2"] });
		expect(fromUrl("engineer=none").filters).toStrictEqual({ engineer: [null] });
		// In the others, `none` is a value like any other: a code that matches nothing, not a status.
		expect(fromUrl("customer=none").filters).toStrictEqual({ customer: ["none"] });
		expect(fromUrl("status=none").filters).toStrictEqual({});
	});

	test("leaves out values a filter doesn't have, and the filters left with none", () => {
		expect(fromUrl("status=bogus,quote").filters).toStrictEqual({ status: ["quote"] });
		expect(fromUrl("status=bogus").filters).toStrictEqual({});
		expect(fromUrl("status=&type=repair").filters).toStrictEqual({ type: ["repair"] });
	});

	test("has the search trimmed, and cut where it is too long", () => {
		expect(fromUrl("q=%20boiler%20").q).toBe("boiler");
		expect(fromUrl(`q=${"x".repeat(500)}`).q).toHaveLength(listLimits.search);
	});

	test("has the sorting, each column once, of the columns the list sorts by", () => {
		const state: TableUrlState = {
			globalFilter: "",
			sorting: [
				{ id: "status", desc: true },
				{ id: "bogus", desc: false },
				{ id: "status", desc: false },
				{ id: "number", desc: false },
			],
			columnFilters: [],
			grouping: [],
		};
		expect(toListQuery(ordersList, state).sort).toStrictEqual([
			{ id: "status", desc: true },
			{ id: "number", desc: false },
		]);
		expect(fromUrl("sort=").sort).toStrictEqual([]);
		expect(fromUrl("sort=-priority,number").sort).toStrictEqual([
			{ id: "priority", desc: true },
			{ id: "number", desc: false },
		]);
	});

	test("has the group, or null, if it isn't one the list groups by", () => {
		expect(fromUrl("group=status").group).toBe("status");
		expect(fromUrl("group=number").group).toBeNull();
		const state: TableUrlState = {
			...parseTableUrl(new URLSearchParams(), ordersList.urlSpec),
			grouping: ["number"],
		};
		expect(toListQuery(ordersList, state).group).toBeNull();
	});

	test("is the first page, of the list's page size, whatever an old link says", () => {
		expect(fromUrl("size=50&page=3")).toMatchObject({ pageSize: 20, pageIndex: 0 });
	});

	test("starts at the page with a position's row, within reach", () => {
		const first = fromUrl("status=quote");
		expect(startingAt(first, 0)).toBe(first);
		expect(startingAt(first, 19)).toBe(first);
		expect(startingAt(first, 20)).toStrictEqual({ ...first, pageIndex: 1 });
		expect(startingAt(first, 125).pageIndex).toBe(6);
		expect(startingAt(first, 999_999_999_999).pageIndex).toBe(listLimits.pageIndex);
		expect(startingAt(first, Number.NaN)).toBe(first);
		expect(accepts(startingAt(first, 999_999_999_999))).toBe(true);
	});

	test("is the same query, and the same key, for states that mean the same", () => {
		const a = fromUrl("status=quote,paid&sort=-priority&other=1&q=boiler");
		const b = fromUrl("q=%20boiler&sort=-priority&status=paid&status=quote");
		expect(a).toStrictEqual(b);
		expect(queryKey(a)).toBe(queryKey(b));
		expect(queryKey(fromUrl("status=quote"))).not.toBe(queryKey(fromUrl("status=scheduled")));
	});

	test("has every key, and nothing undefined", () => {
		for (const query of [fromUrl(""), fromUrl("engineer=x&status=bogus&group=bogus")]) {
			expect(Object.keys(query).toSorted()).toEqual([
				"filters",
				"group",
				"pageIndex",
				"pageSize",
				"q",
				"sort",
			]);
			expect(JSON.parse(JSON.stringify(query))).toStrictEqual(query);
		}
	});

	test("cuts a filter's values where there are more than the list takes", () => {
		const codes = Array.from({ length: 80 }, (_, i) => `C-${String(i).padStart(3, "0")}`);
		const query = fromUrl(`customer=${codes.join(",")}`);
		expect(query.filters.customer).toStrictEqual(codes.slice(0, listLimits.values));
	});

	test("cuts the values that make the query too big, from the fullest filter", () => {
		const long = (prefix: string, count: number) =>
			Array.from({ length: count }, (_, i) => `${prefix}${i}-${"x".repeat(60)}`).join(",");
		const query = fromUrl(`customer=${long("c", 50)}&equipment=${long("e", 50)}&type=repair`);
		expect(new TextEncoder().encode(JSON.stringify(query)).length).toBeLessThanOrEqual(
			listLimits.bytes,
		);
		expect(query.filters.type).toStrictEqual(["repair"]);
		expect(query.filters.customer?.length).toBeGreaterThan(20);
		expect(query.filters.equipment?.length).toBeGreaterThan(20);
		expect(accepts(query)).toBe(true);
	});

	test("always passes the schema", () => {
		// A deterministic stream of states, from sensible to garbage.
		let seed = 42;
		const random = (n: number) => {
			seed = (seed * 1664525 + 1013904223) % 2 ** 32;
			return seed % n;
		};
		const pick = <T>(items: readonly T[]) => items[random(items.length)];
		const junk = [
			"",
			" ",
			"x",
			"a,b",
			"-1",
			"0",
			"1",
			"42",
			"NaN",
			"é",
			"😀",
			"\\",
			`"`,
			"C-1",
			"none",
			"x".repeat(100),
		];
		const tokens = () =>
			Array.from({ length: random(70) }, () =>
				random(3) ? pick([...junk, ...orderStatuses, ...orderTypes]) : String(random(5000)),
			);
		for (let i = 0; i < 300; i++) {
			const state: TableUrlState = {
				globalFilter: Array.from({ length: random(300) }, () => pick(junk)).join(""),
				sorting: Array.from({ length: random(5) }, () => ({
					id: pick(["number", "status", "bogus", "createdAt", ...junk]),
					desc: random(2) === 0,
				})),
				columnFilters: [
					"customer",
					"equipment",
					"type",
					"status",
					"priority",
					"engineer",
					"bogus",
				].flatMap((filter) => (random(2) ? [{ id: filter, value: tokens() }] : [])),
				grouping: random(2) ? [pick(["status", "number", "bogus", "customer"])] : [],
			};
			const query = toListQuery(ordersList, state);
			expect(v.safeParse(ordersList.query, query).issues).toBeUndefined();
			expect(v.safeParse(ordersList.where, whereOf(query)).issues).toBeUndefined();
		}
	});
});

describe("the query schema", () => {
	test("accepts a canonical query, with and without everything", () => {
		expect(accepts(canonical)).toBe(true);
		expect(
			accepts({
				q: "boiler",
				filters: { customer: ["C-1"], status: ["quote", "paid"].slice(0, 1), engineer: [3, 4] },
				sort: [
					{ id: "priority", desc: true },
					{ id: "number", desc: false },
				],
				group: "status",
				pageIndex: 4,
				pageSize: 20,
			}),
		).toBe(true);
	});

	test("rejects what isn't a query", () => {
		for (const bad of [undefined, null, "q=x", [], {}, { ...canonical, q: undefined }]) {
			expect(accepts(bad)).toBe(false);
		}
	});

	test("rejects unknown filters, and filters with no values", () => {
		expect(accepts({ ...canonical, filters: { bogus: ["x"] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { number: [1] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { status: [] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { status: undefined } })).toBe(false);
	});

	test("accepts null only in a filter that can be empty", () => {
		expect(accepts({ ...canonical, filters: { engineer: [null, 3] } })).toBe(true);
		expect(accepts({ ...canonical, filters: { equipment: [null] } })).toBe(true);
		expect(accepts({ ...canonical, filters: { engineer: ["none"] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { customer: [null] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { status: [null, "quote"] } })).toBe(false);
	});

	test("rejects values of the wrong type or not in the set", () => {
		expect(accepts({ ...canonical, filters: { engineer: ["3"] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { engineer: [0] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { engineer: [1.5] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { engineer: [Number.NaN] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { status: ["bogus"] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { status: ["quote", "bogus"] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { customer: [""] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { customer: [3] } })).toBe(false);
		expect(accepts({ ...canonical, filters: { customer: ["x".repeat(65)] } })).toBe(false);
	});

	test("rejects sorts by a column twice, by unknown columns, or in the wrong shape", () => {
		const sort = (...items: unknown[]) => accepts({ ...canonical, sort: items });
		expect(sort({ id: "number", desc: false })).toBe(true);
		expect(sort({ id: "number", desc: false }, { id: "number", desc: true })).toBe(false);
		expect(sort({ id: "bogus", desc: false })).toBe(false);
		expect(sort({ id: "number" })).toBe(false);
		expect(sort({ id: "number", desc: false, extra: 1 })).toBe(false);
	});

	test("rejects groups the list can't group by", () => {
		expect(accepts({ ...canonical, group: "status" })).toBe(true);
		expect(accepts({ ...canonical, group: "number" })).toBe(false);
		expect(accepts({ ...canonical, group: undefined })).toBe(false);
	});

	test("rejects pages and page sizes out of range", () => {
		expect(accepts({ ...canonical, pageSize: 7 })).toBe(false);
		expect(accepts({ ...canonical, pageSize: 50 })).toBe(false);
		expect(accepts({ ...canonical, pageSize: 100_000 })).toBe(false);
		expect(accepts({ ...canonical, pageIndex: -1 })).toBe(false);
		expect(accepts({ ...canonical, pageIndex: 1.5 })).toBe(false);
		expect(accepts({ ...canonical, pageIndex: listLimits.pageIndex + 1 })).toBe(false);
		expect(accepts({ ...canonical, pageIndex: listLimits.pageIndex })).toBe(true);
	});

	test("rejects extra keys", () => {
		expect(accepts({ ...canonical, extra: 1 })).toBe(false);
		expect(
			accepts({ ...canonical, filters: { ...canonical.filters, status: ["quote"], extra: [1] } }),
		).toBe(false);
	});

	test("rejects what is too big", () => {
		expect(accepts({ ...canonical, q: "x".repeat(listLimits.search) })).toBe(true);
		expect(accepts({ ...canonical, q: "x".repeat(listLimits.search + 1) })).toBe(false);
		const engineers = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
		expect(accepts({ ...canonical, filters: { engineer: engineers(listLimits.values) } })).toBe(
			true,
		);
		expect(accepts({ ...canonical, filters: { engineer: engineers(listLimits.values + 1) } })).toBe(
			false,
		);
		// Within each limit, but 100 values of 64 characters are over the total.
		const codes = (prefix: string) =>
			Array.from({ length: 50 }, (_, i) => `${prefix}${i}`.padEnd(64, "x"));
		expect(accepts({ ...canonical, filters: { customer: codes("c") } })).toBe(true);
		expect(
			accepts({ ...canonical, filters: { customer: codes("c"), equipment: codes("e") } }),
		).toBe(false);
		// Bytes count, not characters.
		expect(
			accepts({
				...canonical,
				filters: {
					customer: Array.from({ length: 50 }, (_, i) => `${"é".repeat(31)}${i}`.padEnd(40, "é")),
					equipment: Array.from({ length: 50 }, (_, i) => `${"é".repeat(31)}${i}`.padEnd(40, "é")),
				},
			}),
		).toBe(false);
	});

	test("the where schema takes a search and filters, and nothing else", () => {
		const where = whereOf({ ...canonical, q: "x", filters: { status: ["quote"] } });
		expect(v.safeParse(ordersList.where, where).success).toBe(true);
		expect(v.safeParse(ordersList.where, canonical).success).toBe(false);
		expect(v.safeParse(ordersList.where, { q: "x", filters: { bogus: ["x"] } }).success).toBe(
			false,
		);
		expect(v.safeParse(ordersList.where, { q: "x" }).success).toBe(false);
	});
});

describe("queryKey", () => {
	test("is the same whatever the order of the keys, and tells queries apart", () => {
		expect(queryKey({ q: "a", filters: { status: ["quote"], type: ["repair"] } })).toBe(
			queryKey({ filters: { type: ["repair"], status: ["quote"] }, q: "a" }),
		);
		expect(queryKey({ q: "a", filters: { status: ["quote", "paid"] } })).not.toBe(
			queryKey({ q: "a", filters: { status: ["paid", "quote"] } }),
		);
		const nextPage = { ...canonical, pageIndex: 1 };
		expect(queryKey(canonical)).not.toBe(queryKey(nextPage));
	});
});

describe("the argument of a remote query", () => {
	/** The payload of a query's argument in the URL (`?payload=`), as SvelteKit makes it. */
	async function payloadLength(argument: unknown) {
		const kit = createRequire(import.meta.url).resolve("@sveltejs/kit/package.json");
		const devalue = await import(pathToFileURL(createRequire(kit).resolve("devalue")).href);
		return Buffer.from(devalue.stringify(argument)).toString("base64url").length;
	}

	test("stays under 8 KB for the biggest the schema allows", async () => {
		// Codes of every length fill the budget in different ways; longer ones take it up with fewer
		// values, shorter ones cost more in the payload for their size.
		let largest = 0;
		for (let length = 1; length <= 64; length++) {
			const values = (prefix: string) =>
				Array.from({ length: 50 }, (_, i) => `${prefix}${i}`.padEnd(length, "x").slice(0, length));
			const query = toListQuery(ordersList, {
				...parseTableUrl(new URLSearchParams(), ordersList.urlSpec),
				globalFilter: "é".repeat(listLimits.search),
				columnFilters: [
					{ id: "customer", value: values("c") },
					{ id: "equipment", value: values("e") },
					{
						id: "engineer",
						value: Array.from({ length: 50 }, (_, i) => String(1_000_000 + i * 7)),
					},
					{ id: "status", value: [...orderStatuses] },
					{ id: "type", value: [...orderTypes] },
					{ id: "priority", value: [...orderPriorities] },
				],
				sorting: [
					{ id: "customer", desc: true },
					{ id: "equipment", desc: true },
					{ id: "engineer", desc: true },
				],
				grouping: ["status"],
			});
			expect(v.is(ordersList.query, query)).toBe(true);
			largest = Math.max(largest, await payloadLength(query));
		}
		expect(largest).toBeGreaterThan(1000);
		expect(largest).toBeLessThan(8 * 1024);
	});

	test("is short for a typical state", async () => {
		const typical = startingAt(fromUrl("status=quote,scheduled&sort=-priority"), 40);
		expect(await payloadLength(typical)).toBeLessThan(400);
	});
});

describe("types", () => {
	test("the query is typed by the definition", () => {
		expectTypeOf<ListQuery<OrdersColumns>["filters"]>().toEqualTypeOf<{
			customer?: string[];
			equipment?: (string | null)[];
			type?: (typeof orderTypes)[number][];
			status?: (typeof orderStatuses)[number][];
			priority?: (typeof orderPriorities)[number][];
			engineer?: (number | null)[];
		}>();
		expectTypeOf<ListQuery<OrdersColumns>["sort"][number]["id"]>().toEqualTypeOf<
			| "number"
			| "customer"
			| "equipment"
			| "type"
			| "status"
			| "priority"
			| "engineer"
			| "scheduledFor"
			| "createdAt"
		>();
		expectTypeOf<NonNullable<ListQuery<OrdersColumns>["group"]>>().toEqualTypeOf<
			"customer" | "type" | "status" | "priority" | "engineer"
		>();
		expectTypeOf(ordersList.query).toEqualTypeOf<v.GenericSchema<ListQuery<OrdersColumns>>>();
		expectTypeOf(ordersList.where).toEqualTypeOf<v.GenericSchema<ListWhere<OrdersColumns>>>();
		expectTypeOf(toListQuery(ordersList, canonicalState)).toEqualTypeOf<ListQuery<OrdersColumns>>();
		expectTypeOf(whereOf(canonical)).toEqualTypeOf<ListWhere<OrdersColumns>>();
		// The type checker does the checking; this is for the runner.
		expect(true).toBe(true);
	});

	test("a query that doesn't fit the definition doesn't compile", () => {
		const query = (change: Partial<ListQuery<OrdersColumns>>): ListQuery<OrdersColumns> => ({
			...canonical,
			...change,
		});
		// @ts-expect-error a column the list can't sort by
		query({ sort: [{ id: "bogus", desc: false }] });
		// @ts-expect-error a column the list can't group by
		query({ group: "number" });
		// @ts-expect-error an id is a number
		query({ filters: { engineer: ["3"] } });
		// @ts-expect-error a status the list doesn't have
		query({ filters: { status: ["bogus"] } });
		// @ts-expect-error a filter that can't be empty
		query({ filters: { customer: [null] } });
		// @ts-expect-error a column the list can't filter by
		query({ filters: { number: [1] } });
		// @ts-expect-error a column the list doesn't have
		query({ filters: { bogus: ["x"] } });
		// @ts-expect-error a missing key
		const missing: ListQuery<OrdersColumns> = {
			q: "",
			filters: {},
			sort: [],
			group: null,
			pageIndex: 0,
		};
		expect(missing).toBeDefined();
	});

	test("a definition's defaults are checked by its columns", () => {
		defineList({
			columns: { number: { sort: true }, notes: {} },
			// @ts-expect-error a column the list can't sort by
			defaults: { sort: [{ id: "notes", desc: false }] },
		});
		defineList({
			columns: { number: { sort: true }, status: { filter: oneOf(orderStatuses) } },
			// @ts-expect-error a value the filter doesn't have
			defaults: { filters: { status: ["bogus"] } },
		});
		expect(true).toBe(true);
	});
});

const canonicalState: TableUrlState = parseTableUrl(new URLSearchParams(), ordersList.urlSpec);

describe("range filters", () => {
	/** A list with a date and a number to filter by a range. */
	const rangeList = defineList({
		columns: {
			number: { sort: true },
			scheduledFor: { param: "scheduled", sort: true, filter: dateRange },
			stock: { param: "quantity", sort: true, filter: numberRange },
		},
		defaults: { sort: [{ id: "number", desc: false }], pageSize: 20 },
	});

	const rangesFromUrl = (search: string) =>
		toListQuery(rangeList, parseTableUrl(new URLSearchParams(search), rangeList.urlSpec));

	const rangeQuery = (filters: Record<string, unknown>) => ({
		q: "",
		filters,
		sort: [],
		group: null,
		pageIndex: 0,
		pageSize: 20,
	});
	const acceptsRanges = (filters: Record<string, unknown>) =>
		v.safeParse(rangeList.query, rangeQuery(filters)).success;

	// Wednesday 14 October 2026.
	beforeEach(() => {
		freezeNow(at("2026-10-14 15:30"));
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("the URL spec", () => {
		test("has the range filters' grammar", () => {
			expect(rangeList.urlSpec.columns).toEqual([
				{ id: "number", sortable: true },
				{ id: "scheduledFor", param: "scheduled", sortable: true, filter: "dateRange" },
				{ id: "stock", param: "quantity", sortable: true, filter: "numberRange" },
			]);
		});
	});

	describe("toListQuery", () => {
		test("has a range as its ends, a preset as the days it means today", () => {
			expect(rangesFromUrl("scheduled=this-week&quantity=..10").filters).toEqual({
				scheduledFor: [{ from: "2026-10-12", to: "2026-10-18" }],
				stock: [{ from: null, to: 10 }],
			});
			expect(rangesFromUrl("scheduled=2026-10-01..&quantity=5..10").filters).toEqual({
				scheduledFor: [{ from: "2026-10-01", to: null }],
				stock: [{ from: 5, to: 10 }],
			});
		});

		test("follows the day it's built on", () => {
			freezeNow(at("2026-11-02 09:00"));
			expect(rangesFromUrl("scheduled=before-today").filters).toEqual({
				scheduledFor: [{ from: null, to: "2026-11-01" }],
			});
		});

		test("leaves out what isn't a range", () => {
			expect(rangesFromUrl("scheduled=2026-10-07..2026-10-01&quantity=lots").filters).toEqual({});
		});

		test("is the same query for a preset and its days", () => {
			expect(rangesFromUrl("scheduled=this-week")).toEqual(
				rangesFromUrl("scheduled=2026-10-12..2026-10-18"),
			);
		});

		test("always passes the schema", () => {
			for (const search of [
				"scheduled=today",
				"scheduled=before-today&quantity=0",
				"scheduled=..2026-10-07&quantity=-2.5..",
				"quantity=1000000000000",
			]) {
				expect(v.safeParse(rangeList.query, rangesFromUrl(search)).success, search).toBe(true);
				expect(v.safeParse(rangeList.where, whereOf(rangesFromUrl(search))).success, search).toBe(
					true,
				);
			}
		});
	});

	describe("the query schema", () => {
		test("takes a range with both ends or either", () => {
			expect(acceptsRanges({ scheduledFor: [{ from: "2026-10-01", to: "2026-10-07" }] })).toBe(
				true,
			);
			expect(acceptsRanges({ scheduledFor: [{ from: null, to: "2026-10-07" }] })).toBe(true);
			expect(acceptsRanges({ stock: [{ from: 0, to: null }] })).toBe(true);
			expect(acceptsRanges({ stock: [{ from: 1.5, to: 1.5 }] })).toBe(true);
		});

		test.each<[string, Record<string, unknown>]>([
			["no end", { stock: [{ from: null, to: null }] }],
			["the ends the wrong way round", { stock: [{ from: 10, to: 5 }] }],
			[
				"more ranges than a filter takes",
				{
					stock: Array.from({ length: listLimits.ranges + 1 }, (_, i) => ({ from: i, to: i })),
				},
			],
			["no range", { stock: [] }],
			["a token rather than a range", { scheduledFor: ["this-week"] }],
			["a day that doesn't exist", { scheduledFor: [{ from: "2026-02-30", to: null }] }],
			["a moment rather than a day", { scheduledFor: [{ from: "2026-10-01T00:00", to: null }] }],
			["a number for a day", { scheduledFor: [{ from: 20261001, to: null }] }],
			["a text for a number", { stock: [{ from: "5", to: null }] }],
			["a number too big", { stock: [{ from: null, to: 1e13 }] }],
			["not a number", { stock: [{ from: Number.NaN, to: null }] }],
			["a missing end", { stock: [{ from: 5 }] }],
			["an extra key", { stock: [{ from: 5, to: null, inclusive: false }] }],
		])("refuses %s", (_, filters) => {
			expect(acceptsRanges(filters)).toBe(false);
		});
	});

	test("several ranges keep their order and lose their duplicates; `none` only where it may", () => {
		expect(rangesFromUrl("quantity=12,5..8,2,5..8&scheduled=next-week,today..").filters).toEqual({
			scheduledFor: [
				{ from: "2026-10-14", to: null },
				{ from: "2026-10-19", to: "2026-10-25" },
			],
			stock: [
				{ from: 2, to: 2 },
				{ from: 5, to: 8 },
				{ from: 12, to: 12 },
			],
		});
		// `stock` can't be empty, so `none` is left out of it.
		expect(rangesFromUrl("quantity=none").filters).toEqual({});
		const nullable = defineList({ columns: { due: { filter: orNone(dateRange) } } });
		const query = toListQuery(
			nullable,
			parseTableUrl(new URLSearchParams("due=this-week,none"), nullable.urlSpec),
		);
		expect(query.filters).toEqual({ due: [null, { from: "2026-10-12", to: "2026-10-18" }] });
		expect(v.safeParse(nullable.query, query).success).toBe(true);
		expect(nullable.urlSpec.columns).toEqual([{ id: "due", filter: "dateRange", none: true }]);
		// A range that can't be empty doesn't take `none` from the URL, so no filter shows it.
		const plain = defineList({ columns: { due: { filter: dateRange } } });
		expect(parseTableUrl(new URLSearchParams("due=none"), plain.urlSpec).columnFilters).toEqual([]);
	});

	test("a preset is an end: its first day as the start, its last as the end", () => {
		expect(rangesFromUrl("scheduled=this-week..next-month").filters).toEqual({
			scheduledFor: [{ from: "2026-10-12", to: "2026-11-30" }],
		});
		expect(rangesFromUrl("scheduled=..yesterday").filters).toEqual({
			scheduledFor: [{ from: null, to: "2026-10-13" }],
		});
	});

	test("money is in euros in the URL and in cents in the query, exactly", () => {
		const money = defineList({ columns: { total: { filter: moneyRange } } });
		const filtersOf = (search: string) =>
			toListQuery(money, parseTableUrl(new URLSearchParams(search), money.urlSpec)).filters;
		expect(filtersOf("total=500..,0.29..0.57,..12.5")).toEqual({
			total: [
				{ from: null, to: 1250 },
				{ from: 29, to: 57 },
				{ from: 50000, to: null },
			],
		});
		const accepts = (total: unknown) =>
			v.safeParse(money.where, { q: "", filters: { total } }).success;
		expect(accepts([{ from: 1250, to: null }])).toBe(true);
		// Cents are whole.
		expect(accepts([{ from: 12.5, to: null }])).toBe(false);
		expect(money.urlSpec.columns).toEqual([{ id: "total", filter: "moneyRange" }]);
	});

	test("a range filter's values are typed as ranges", () => {
		expectTypeOf<ListQuery<typeof rangeList.columns>["filters"]["scheduledFor"]>().toEqualTypeOf<
			DateRange[] | undefined
		>();
		expectTypeOf<ListQuery<typeof rangeList.columns>["filters"]["stock"]>().toEqualTypeOf<
			NumberRange[] | undefined
		>();
		const filters: ListQuery<typeof rangeList.columns>["filters"] = {
			// @ts-expect-error a range filter takes ranges, not the URL's tokens
			scheduledFor: ["this-week"],
		};
		expect(filters).toBeDefined();
	});
});

describe("withListColumns", () => {
	const list = defineList({
		columns: {
			name: { sort: true },
			customer: { sort: true, group: true, filter: code },
			status: { group: true, filter: orNone(oneOf(["open", "closed"])) },
			dueOn: { param: "due", sort: true, filter: orNone(dateRange) },
			total: { filter: moneyRange },
		},
		defaults: { sort: [{ id: "name", desc: false }] },
	});
	interface Row {
		id: number;
		name: string;
		customer: { code: string; name: string };
		status: "open" | "closed" | null;
		dueOn: string | null;
		total: number;
	}
	const column = createAppColumnHelper<Row>();
	const columns = withListColumns(list, {
		select: column.select(),
		name: column.accessor("name", { meta: { label: "Name" } }),
		customer: column.accessor((row) => row.customer.name, {
			id: "customer",
			getGroupingValue: (row) => row.customer.code,
		}),
		status: column.accessor("status", {}),
		dueOn: column.accessor("dueOn", {}),
		total: column.accessor("total", {}),
		actions: column.display({ id: "actions" }),
	});
	const rows: Row[] = [
		{
			id: 1,
			name: "B",
			customer: { code: "C-1", name: "Acme" },
			status: "open",
			dueOn: null,
			total: 500,
		},
		{
			id: 2,
			name: "A",
			customer: { code: "C-2", name: "Bolt" },
			status: null,
			dueOn: "2026-10-20",
			total: 100,
		},
	];
	const shown = (state: Partial<TableState<never>>) =>
		createAppTable({ columns, data: rows, initialState: state })
			.getRowModel()
			.rows.map((row) => row.original.name);

	test("gives each column what the definition says of it, in the order given", () => {
		expect(columns.map((each) => each.id)).toEqual([
			"select",
			"name",
			"customer",
			"status",
			"dueOn",
			"total",
			"actions",
		]);
		const [, name, customer, status, dueOn, total] = columns;
		expect(name).toMatchObject({
			enableSorting: true,
			enableGrouping: false,
			meta: { label: "Name" },
		});
		expect(customer).toMatchObject({
			enableGrouping: true,
			filterFn: "oneOf",
			meta: { filter: "set" },
		});
		expect(status.meta).toEqual({
			filter: "set",
			filterValues: ["open", "closed", "none"],
			filterNone: true,
		});
		expect(dueOn).toMatchObject({
			filterFn: "inDateRange",
			meta: { param: "due", filter: "dateRange", filterNone: true },
		});
		expect(total).toMatchObject({ enableSorting: false, filterFn: "inMoneyRange" });
	});

	test("a table of them reads and writes the URL as the list says", () => {
		const table = createAppTable({ columns, data: [], initialState: { ...list.urlSpec.defaults } });
		expect(urlGrammar(tableUrlSpec(table))).toEqual(urlGrammar(list.urlSpec));
	});

	test("a set filter keeps the rows by their grouping value, as the URL has it", () => {
		expect(shown({ columnFilters: [{ id: "customer", value: ["C-2"] }] })).toEqual(["A"]);
		expect(shown({ columnFilters: [{ id: "status", value: ["none"] }] })).toEqual(["A"]);
		expect(shown({ columnFilters: [{ id: "status", value: ["open", "none"] }] })).toEqual([
			"B",
			"A",
		]);
	});

	test("refuses a column the list doesn't have, or one named otherwise", () => {
		expect(() =>
			// @ts-expect-error: the list has no `other` column.
			withListColumns(list, { other: column.accessor("name", {}) }),
		).toThrow('The list has no column "other"');
		expect(() =>
			withListColumns(list, { customer: column.accessor("name", { id: "name" }) }),
		).toThrow('The column "customer" is called "name"');
	});
});

describe("a client-side list", () => {
	const columns = { name: { sort: true }, status: { filter: oneOf(["open", "closed"]) } } as const;

	test("has the URL grammar a server-side one has", () => {
		const client = defineList({ mode: "client", columns });
		expect(client.mode).toBe("client");
		expect(defineList({ columns }).mode).toBe("server");
		expect(client.urlSpec).toEqual(defineList({ columns }).urlSpec);
	});

	test("isn't taken for a server-side one", () => {
		const client = defineList({ mode: "client", columns });
		// @ts-expect-error: a server-side table (`createServerTable()`) takes a server-side list.
		const server: List<typeof columns> = client;
		expect(server.mode).toBe("client");
	});
});
