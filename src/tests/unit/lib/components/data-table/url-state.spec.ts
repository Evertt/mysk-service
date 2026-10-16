import { describe, expect, test } from "vite-plus/test";

import {
	joinValues,
	parseTablePosition,
	parseTableUrl,
	searchString,
	splitValues,
	tableUrlKey,
	tableUrlParams,
	type TableUrlSpec,
	type TableUrlState,
	writeTablePosition,
	writeTableUrl,
} from "#lib/components/data-table/url-state.ts";

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
		{ id: "region", filter: "set", groupable: true },
		{ id: "engineerId", param: "engineer", groupable: true },
		{ id: "scheduledFor", param: "scheduled", sortable: true },
		{ id: "notes" },
	],
	defaults: {
		sorting: [{ id: "number", desc: true }],
	},
};

const defaults: TableUrlState = {
	globalFilter: "",
	sorting: [{ id: "number", desc: true }],
	columnFilters: [],
	grouping: [],
};

const parse = (search: string, using = spec) => parseTableUrl(new URLSearchParams(search), using);
const write = (state: TableUrlState, search = "", using = spec) =>
	searchString(writeTableUrl(new URLSearchParams(search), state, using));

describe("parsing", () => {
	test("no parameters are the defaults", () => {
		expect(parse("")).toEqual(defaults);
	});

	test("reads the search, filters, sorting and grouping (old links' page and size are ignored)", () => {
		expect(
			parse("q=boiler&status=quote,scheduled&sort=-priority,scheduled&group=region&page=3&size=50"),
		).toEqual({
			globalFilter: "boiler",
			sorting: [
				{ id: "priority", desc: true },
				{ id: "scheduledFor", desc: false },
			],
			columnFilters: [{ id: "status", value: ["quote", "scheduled"] }],
			grouping: ["region"],
		});
	});

	test("groups by one groupable column, named by its parameter", () => {
		expect(parse("group=status").grouping).toEqual(["status"]);
		expect(parse("group=engineer").grouping).toEqual(["engineerId"]);
		// Not by its id, nor by a column that isn't groupable, nor by several.
		expect(parse("group=engineerId").grouping).toEqual([]);
		expect(parse("group=priority").grouping).toEqual([]);
		expect(parse("group=status,region").grouping).toEqual([]);
		expect(parse("group=").grouping).toEqual([]);
	});

	test("a repeated filter adds its values", () => {
		expect(parse("status=quote&status=scheduled,quote").columnFilters).toEqual([
			{ id: "status", value: ["quote", "scheduled"] },
		]);
	});

	test("an empty sort is unsorted, overriding the default", () => {
		expect(parse("sort=").sorting).toEqual([]);
	});

	test("unknown columns, values and parameters are ignored", () => {
		expect(parse("sort=-bogus,scheduled,notes")).toMatchObject({
			sorting: [{ id: "scheduledFor", desc: false }],
		});
		expect(parse("sort=bogus").sorting).toEqual(defaults.sorting);
		// The filter is named by its parameter, not the column's id.
		expect(parse("scheduledFor=x&notes=y").columnFilters).toEqual([]);
		expect(parse("status=quote,cancelled").columnFilters).toEqual([
			{ id: "status", value: ["quote"] },
		]);
		expect(parse("status=cancelled").columnFilters).toEqual([]);
		expect(parse("region=North,,West").columnFilters).toEqual([
			{ id: "region", value: ["North", "West"] },
		]);
	});

	test("a column sorted twice counts once, in its first place", () => {
		expect(parse("sort=priority,-number,-priority").sorting).toEqual([
			{ id: "priority", desc: false },
			{ id: "number", desc: true },
		]);
	});

	test("reads the position, 1-based in the URL; a malformed one is the top", () => {
		const position = (search: string, using = spec) =>
			parseTablePosition(new URLSearchParams(search), using);
		expect(position("")).toBe(0);
		expect(position("row=121")).toBe(120);
		for (const row of ["0", "-1", "two", "1.5", "", "99999999999"]) {
			expect(position(`row=${row}`), row).toBe(0);
		}
		expect(position("history.row=5", { ...spec, prefix: "history" })).toBe(4);
	});

	test("unescapes commas and backslashes in values", () => {
		expect(parse(`region=${encodeURIComponent("Smith\\, Jones,A\\\\B")}`).columnFilters).toEqual([
			{ id: "region", value: ["Smith, Jones", "A\\B"] },
		]);
	});
});

describe("writing", () => {
	test("the defaults leave the URL clean", () => {
		expect(write(defaults)).toBe("");
		expect(tableUrlKey(defaults, spec)).toBe("");
	});

	test("writes readable parameters", () => {
		const state: TableUrlState = {
			globalFilter: "boiler room",
			sorting: [
				{ id: "priority", desc: true },
				{ id: "scheduledFor", desc: false },
			],
			columnFilters: [{ id: "status", value: ["quote", "scheduled"] }],
			grouping: ["engineerId"],
		};
		expect(write(state)).toBe(
			"?q=boiler+room&status=quote,scheduled&sort=-priority,scheduled&group=engineer",
		);
	});

	test("writes the position, and leaves it out at the top", () => {
		const position = (row: number, search = "") =>
			searchString(writeTablePosition(new URLSearchParams(search), row, spec));
		expect(position(120, "status=quote")).toBe("?status=quote&row=121");
		expect(position(0, "status=quote&row=121")).toBe("?status=quote");
	});

	test("grouping by a column that isn't groupable stays out", () => {
		expect(write({ ...defaults, grouping: ["priority"] })).toBe("");
	});

	test("unsorted, against a default sort, is an empty sort", () => {
		expect(write({ ...defaults, sorting: [] })).toBe("?sort=");
	});

	test("keeps the page's other parameters and replaces its own", () => {
		const state = { ...defaults, columnFilters: [{ id: "priority", value: ["high"] }] };
		expect(write(state, "tab=history&status=quote&row=40")).toBe("?tab=history&priority=high");
	});

	test("escapes commas and backslashes in values", () => {
		const state = {
			...defaults,
			columnFilters: [{ id: "region", value: ["Smith, Jones", "A\\B"] }],
		};
		expect(write(state)).toBe("?region=Smith%5C,+Jones,A%5C%5CB");
		expect(joinValues(["a,b", "c"])).toBe("a\\,b,c");
		expect(splitValues("a\\,b,c")).toEqual(["a,b", "c"]);
	});

	test("filters and sorting on columns outside the spec stay out", () => {
		const state = {
			...defaults,
			sorting: [{ id: "notes", desc: false }],
			columnFilters: [{ id: "notes", value: ["x"] }],
		};
		expect(write(state)).toBe("?sort=");
	});
});

describe("round trips", () => {
	const states: TableUrlState[] = [
		defaults,
		{ ...defaults, globalFilter: 'pump, 3/4"' },
		{ ...defaults, sorting: [] },
		{
			...defaults,
			sorting: [
				{ id: "scheduledFor", desc: true },
				{ id: "status", desc: false },
				{ id: "number", desc: false },
			],
		},
		{
			...defaults,
			columnFilters: [
				{ id: "status", value: ["completed"] },
				{ id: "priority", value: ["low", "high"] },
				{ id: "region", value: ["Noord, Oost", "Zuid\\West", "a&b=c"] },
			],
		},
		{ ...defaults, grouping: ["region"], sorting: [{ id: "status", desc: true }] },
	];

	test.each(states)("parsing what was written gives the state back (%#)", (state) => {
		const url = new URL(`https://example.com/orders${write(state)}`);
		expect(parseTableUrl(url.searchParams, spec)).toEqual(state);
	});
});

describe("defaults", () => {
	const filtered: TableUrlSpec = {
		...spec,
		defaults: { ...spec.defaults, columnFilters: [{ id: "status", value: ["quote"] }] },
	};

	test("a default filter is left out, and an empty parameter clears it", () => {
		expect(parse("", filtered).columnFilters).toEqual([{ id: "status", value: ["quote"] }]);
		expect(parse("status=", filtered).columnFilters).toEqual([]);
		const unfiltered = { ...defaults, columnFilters: [] };
		expect(write(unfiltered, "", filtered)).toBe("?status=");
		expect(write(parse("", filtered), "", filtered)).toBe("");
	});

	test("the same values in another order are still the default", () => {
		const both: TableUrlSpec = {
			...spec,
			defaults: { columnFilters: [{ id: "status", value: ["quote", "scheduled"] }] },
		};
		const state = parse("status=scheduled,quote", both);
		expect(write(state, "", both)).toBe("");
	});

	test("a default grouping is left out, and an empty parameter ungroups", () => {
		const grouped: TableUrlSpec = { ...spec, defaults: { ...spec.defaults, grouping: ["status"] } };
		expect(parse("", grouped).grouping).toEqual(["status"]);
		expect(parse("group=", grouped).grouping).toEqual([]);
		expect(parse("group=region", grouped).grouping).toEqual(["region"]);
		expect(write({ ...defaults, grouping: [] }, "", grouped)).toBe("?group=");
		expect(write(parse("", grouped), "", grouped)).toBe("");
	});
});

describe("prefixes", () => {
	const prefixed: TableUrlSpec = { ...spec, prefix: "history" };

	test("every parameter gets the prefix", () => {
		expect(tableUrlParams(prefixed)).toEqual([
			"history.q",
			"history.sort",
			"history.group",
			"history.row",
			"history.status",
			"history.priority",
			"history.region",
		]);
		const state = { ...defaults, globalFilter: "x" };
		expect(write(state, "history.row=3", prefixed)).toBe("?history.q=x");
	});

	test("two tables on a page leave each other's parameters alone", () => {
		const search = "status=quote&row=3&history.status=completed&history.sort=scheduled";
		expect(parse(search).columnFilters).toEqual([{ id: "status", value: ["quote"] }]);
		expect(parse(search, prefixed)).toMatchObject({
			columnFilters: [{ id: "status", value: ["completed"] }],
			sorting: [{ id: "scheduledFor", desc: false }],
		});
		expect(write(defaults, search, prefixed)).toBe("?status=quote&row=3");
	});
});

describe("specs", () => {
	test("names that collide or can't be written are refused", () => {
		const refused = (columns: TableUrlSpec["columns"]) => () =>
			parseTableUrl(new URLSearchParams(), { columns });
		expect(
			refused([
				{ id: "a", param: "x", sortable: true },
				{ id: "x", sortable: true },
			]),
		).toThrow();
		expect(refused([{ id: "q", filter: "set" }])).toThrow();
		expect(refused([{ id: "a", param: "-a", sortable: true }])).toThrow();
		expect(refused([{ id: "a", param: "a,b", filter: "set" }])).toThrow();
		expect(
			refused([
				{ id: "a", param: "x", groupable: true },
				{ id: "x", groupable: true },
			]),
		).toThrow();
		// A filter and a sortable column can share a name.
		expect(
			refused([
				{ id: "a", param: "x", filter: "set" },
				{ id: "x", sortable: true },
			]),
		).not.toThrow();
	});
});

describe("range filters", () => {
	const ranged: TableUrlSpec = {
		columns: [
			{ id: "scheduledFor", param: "scheduled", sortable: true, filter: "dateRange", none: true },
			{ id: "stock", param: "quantity", filter: "numberRange" },
		],
	};
	const filtersOf = (search: string) => parse(search, ranged).columnFilters;

	test("read one range, a preset kept as it is", () => {
		expect(filtersOf("scheduled=this-week&quantity=..10")).toEqual([
			{ id: "scheduledFor", value: ["this-week"] },
			{ id: "stock", value: ["..10"] },
		]);
		expect(filtersOf("scheduled=2026-10-01..2026-10-07")).toEqual([
			{ id: "scheduledFor", value: ["2026-10-01..2026-10-07"] },
		]);
	});

	test("keep several values, `none` among them, and drop only what isn't one", () => {
		expect(filtersOf("scheduled=bogus&quantity=10..5")).toEqual([]);
		expect(filtersOf("scheduled=2026-02-30..&quantity=abc")).toEqual([]);
		expect(filtersOf("scheduled=soon,none,today,tomorrow..&quantity=x,5..,..3,5..")).toEqual([
			{ id: "scheduledFor", value: ["none", "today", "tomorrow.."] },
			{ id: "stock", value: ["5..", "..3"] },
		]);
		expect(filtersOf("scheduled=this-week..next-month,before-today..")).toEqual([
			{ id: "scheduledFor", value: ["this-week..next-month"] },
		]);
		// A number isn't a day, nor a day a number.
		expect(filtersOf("scheduled=5..10&quantity=2026-10-01")).toEqual([]);
	});

	test("take `none` only on a column that can be empty", () => {
		expect(filtersOf("scheduled=none&quantity=none")).toEqual([
			{ id: "scheduledFor", value: ["none"] },
		]);
		expect(filtersOf("quantity=none,..10")).toEqual([{ id: "stock", value: ["..10"] }]);
	});

	test("are written as they are, readable", () => {
		const state = {
			...parse("", ranged),
			columnFilters: [
				{ id: "scheduledFor", value: ["2026-10-01..2026-10-07"] },
				{ id: "stock", value: ["..10"] },
			],
		};
		const search = write(state, "", ranged);
		expect(search).toBe("?scheduled=2026-10-01..2026-10-07&quantity=..10");
		expect(parse(search.slice(1), ranged)).toEqual(state);
	});
});

test("a money range filter reads amounts in euros, at most two decimals", () => {
	const spec: TableUrlSpec = { columns: [{ id: "total", filter: "moneyRange" }] };
	expect(parse("total=500..,..12.50,1.234,2..1,0.5", spec).columnFilters).toEqual([
		{ id: "total", value: ["500..", "..12.50", "0.5"] },
	]);
	const state = { ...parse("", spec), columnFilters: [{ id: "total", value: ["none", "..9.99"] }] };
	expect(write(state, "", spec)).toBe("?total=none,..9.99");
});
