import { describe, expect, test } from "vite-plus/test";

import { parseTableUrl, type TableUrlSpec } from "./url-state.ts";
import { canShareViews, matchingViews, tableViewsKey, viewQuery, viewState } from "./views.ts";

const spec: TableUrlSpec = {
	columns: [
		{ id: "number", sortable: true },
		{ id: "status", sortable: true, filter: "set", values: ["quote", "scheduled", "completed"] },
		{ id: "priority", sortable: true, filter: "set", values: ["low", "high"] },
	],
	defaults: {
		sorting: [{ id: "number", desc: true }],
		pagination: { pageIndex: 0, pageSize: 20 },
	},
};

const state = (search: string, using = spec) => parseTableUrl(new URLSearchParams(search), using);

describe("viewQuery", () => {
	test("saves the search, filters, sorting and page size, but not the page", () => {
		expect(viewQuery(state("?q=boiler&status=quote&sort=priority&page=3&size=50"), spec)).toBe(
			"?q=boiler&status=quote&sort=priority&size=50",
		);
	});

	test("leaves out the defaults, so an untouched table saves nothing", () => {
		expect(viewQuery(state("?page=2"), spec)).toBe("");
		expect(viewQuery(state("?sort=-number&size=20"), spec)).toBe("");
	});

	test("keeps that the table was unsorted or unfiltered against its defaults", () => {
		expect(viewQuery(state("?sort="), spec)).toBe("?sort=");
	});

	test("uses the table's prefix", () => {
		const prefixed = { ...spec, prefix: "orders" };
		expect(viewQuery(state("?orders.status=quote&orders.page=2", prefixed), prefixed)).toBe(
			"?orders.status=quote",
		);
	});
});

describe("viewState", () => {
	test("reads a saved query as the table would, on the first page", () => {
		expect(viewState("?status=quote,paid&sort=-priority&size=50&page=4", spec)).toEqual({
			globalFilter: "",
			sorting: [{ id: "priority", desc: true }],
			columnFilters: [{ id: "status", value: ["quote"] }],
			pagination: { pageIndex: 0, pageSize: 50 },
		});
	});

	test("an empty query is the table's defaults", () => {
		expect(viewState("", spec)).toEqual(state(""));
	});
});

describe("matchingViews", () => {
	const views = [
		{ id: 1, query: "?status=quote,scheduled" },
		{ id: 2, query: "?status=scheduled,quote&sort=priority" },
		{ id: 3, query: "" },
		{ id: 4, query: "?status=quote,scheduled&gone=1" },
	];
	const ids = (search: string) => matchingViews(views, state(search), spec).map((view) => view.id);

	test("finds the views that show the table as it is, whatever its page", () => {
		expect(ids("?status=quote,scheduled&page=2")).toEqual([1, 4]);
		expect(ids("?page=3")).toEqual([3]);
	});

	test("doesn't mind the order of a filter's values", () => {
		expect(ids("?status=scheduled,quote")).toEqual([1, 4]);
		expect(ids("?sort=priority&status=quote,scheduled")).toEqual([2]);
	});

	test("finds none when the table shows something else", () => {
		expect(ids("?status=quote")).toEqual([]);
		expect(ids("?status=quote,scheduled&size=50")).toEqual([]);
	});
});

test("tableViewsKey names a table by its route, and its prefix if it has one", () => {
	expect(tableViewsKey("/(app)/orders")).toBe("/(app)/orders");
	expect(tableViewsKey("/(app)/customers/[code]", "orders")).toBe("/(app)/customers/[code]#orders");
});

test("only owners and admins share views", () => {
	expect(canShareViews(["owner"])).toBe(true);
	expect(canShareViews(["member", "admin"])).toBe(true);
	expect(canShareViews(["member"])).toBe(false);
	expect(canShareViews(["engineer"])).toBe(false);
});
