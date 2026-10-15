import { describe, expect, test } from "vite-plus/test";

import { parseTableUrl, type TableUrlSpec } from "#lib/components/data-table/url-state.ts";
import {
	canShareViews,
	matchingViews,
	tableViewsKey,
	viewQuery,
	viewState,
} from "#lib/components/data-table/views.ts";

const spec: TableUrlSpec = {
	columns: [
		{ id: "number", sortable: true },
		{
			id: "status",
			sortable: true,
			groupable: true,
			filter: "set",
			values: ["quote", "scheduled", "completed"],
		},
		{ id: "priority", sortable: true, filter: "set", values: ["low", "high"] },
	],
	defaults: {
		sorting: [{ id: "number", desc: true }],
	},
};

const state = (search: string, using = spec) => parseTableUrl(new URLSearchParams(search), using);

describe("viewQuery", () => {
	test("saves the search, filters, sorting and grouping, but not the position", () => {
		expect(viewQuery(state("?q=boiler&status=quote&sort=priority&group=status&row=30"), spec)).toBe(
			"?q=boiler&status=quote&sort=priority&group=status",
		);
	});

	test("leaves out the defaults, so an untouched table saves nothing", () => {
		expect(viewQuery(state("?row=2"), spec)).toBe("");
		expect(viewQuery(state("?sort=-number&size=20&page=2"), spec)).toBe("");
	});

	test("keeps that the table was unsorted or unfiltered against its defaults", () => {
		expect(viewQuery(state("?sort="), spec)).toBe("?sort=");
	});

	test("uses the table's prefix", () => {
		const prefixed = { ...spec, prefix: "orders" };
		expect(viewQuery(state("?orders.status=quote&orders.row=21", prefixed), prefixed)).toBe(
			"?orders.status=quote",
		);
	});
});

describe("viewState", () => {
	test("reads a saved query as the table would (one saved with a page size still works)", () => {
		expect(viewState("?status=quote,paid&sort=-priority&size=50&page=4", spec)).toEqual({
			globalFilter: "",
			sorting: [{ id: "priority", desc: true }],
			columnFilters: [{ id: "status", value: ["quote"] }],
			grouping: [],
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

	test("finds the views that show the table as it is, wherever it's scrolled to", () => {
		expect(ids("?status=quote,scheduled&row=40")).toEqual([1, 4]);
		expect(ids("?row=3")).toEqual([3]);
	});

	test("doesn't mind the order of a filter's values", () => {
		expect(ids("?status=scheduled,quote")).toEqual([1, 4]);
		expect(ids("?sort=priority&status=quote,scheduled")).toEqual([2]);
	});

	test("finds none when the table shows something else", () => {
		expect(ids("?status=quote")).toEqual([]);
		expect(ids("?status=quote,scheduled&sort=number")).toEqual([]);
	});

	describe("with the table's columns", () => {
		const defaults = { customer: true, total: true, createdAt: false };
		const withColumns: { id: number; query: string; columns: Record<string, boolean> | null }[] = [
			{ id: 1, query: "", columns: { customer: true, total: false, createdAt: false } },
			// Saved before the table had `createdAt`: it gets its default.
			{ id: 2, query: "", columns: { customer: true, total: true } },
			// Saved before views had columns: whatever the columns.
			{ id: 3, query: "", columns: null },
		];
		const shown = (current: Record<string, boolean>) =>
			matchingViews(withColumns, state(""), spec, { current, defaults }).map((view) => view.id);

		test("finds the views that show the same columns", () => {
			expect(shown({ customer: true, total: false, createdAt: false })).toEqual([1, 3]);
			expect(shown(defaults)).toEqual([2, 3]);
		});

		test("reads a column a view doesn't know as its default", () => {
			expect(shown({ customer: true, total: true, createdAt: true })).toEqual([3]);
		});
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
