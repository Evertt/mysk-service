import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import * as v from "valibot";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.js";

import {
	code,
	defineList,
	id,
	type ListQuery,
	type ListWhere,
	listLimits,
	oneOf,
	queryKey,
	toListQuery,
	toUrlSpec,
	whereOf,
} from "./list-definition.ts";
import { parseTableUrl, type TableUrlState } from "./url-state.ts";

/** The orders list, as `orders-list.ts` defines it. */
const ordersList = defineList({
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		equipment: { sort: true, filter: code },
		type: { sort: true, group: true, filter: oneOf(orderTypes) },
		status: { sort: true, group: true, filter: oneOf(orderStatuses) },
		priority: { sort: true, group: true, filter: oneOf(orderPriorities) },
		engineer: { sort: true, group: true, filter: id },
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
				pagination: { pageIndex: 0, pageSize: 20 },
			},
		});
	});

	test("has the defaults: group, filters and page sizes", () => {
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
			pageSizes: [50, 100],
		});
		expect(spec.pageSizes).toEqual([50, 100]);
		expect(parseTableUrl(new URLSearchParams(), spec)).toEqual({
			globalFilter: "",
			sorting: [{ id: "status", desc: true }],
			columnFilters: [{ id: "engineer", value: ["7", "3"] }],
			pagination: { pageIndex: 0, pageSize: 50 },
			grouping: ["status"],
		});
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
			pagination: { pageIndex: 0, pageSize: 20 },
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

	test("has a page size the list offers, and a page within reach", () => {
		expect(fromUrl("size=50&page=3")).toMatchObject({ pageSize: 50, pageIndex: 2 });
		expect(fromUrl("size=7&page=x")).toMatchObject({ pageSize: 20, pageIndex: 0 });
		expect(fromUrl("page=999999999").pageIndex).toBe(listLimits.pageIndex);
		const state: TableUrlState = {
			...parseTableUrl(new URLSearchParams(), ordersList.urlSpec),
			pagination: { pageIndex: Number.NaN, pageSize: 3 },
		};
		expect(toListQuery(ordersList, state)).toMatchObject({ pageIndex: 0, pageSize: 20 });
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
				pagination: {
					pageIndex: random(3) - 1 + random(3) * 100_000,
					pageSize: pick([1, 10, 20, 50, 77, 100]),
				},
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
				pageSize: 50,
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
		const typical = fromUrl("status=quote,scheduled&sort=-priority&page=2");
		expect(await payloadLength(typical)).toBeLessThan(400);
	});
});

describe("types", () => {
	test("the query is typed by the definition", () => {
		expectTypeOf<ListQuery<OrdersColumns>["filters"]>().toEqualTypeOf<{
			customer?: string[];
			equipment?: string[];
			type?: (typeof orderTypes)[number][];
			status?: (typeof orderStatuses)[number][];
			priority?: (typeof orderPriorities)[number][];
			engineer?: number[];
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
