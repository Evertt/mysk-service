import { describe, expect, test } from "vite-plus/test";

import { groupKey, groupsFirst, pageGroups, sumOf } from "./grouping.ts";

interface Item {
	name: string;
	category: string | null;
}

const item = (name: string, category: string | null): Item => ({ name, category });
const keyOf = (row: Item) => groupKey(row.category);
const names = (rows: Item[]) => rows.map((row) => row.name);

describe("group keys", () => {
	test("are the value as text, and empty for none", () => {
		expect(groupKey("chiller")).toBe("chiller");
		expect(groupKey(12)).toBe("12");
		expect(groupKey(false)).toBe("false");
		expect(groupKey(null)).toBe("");
		expect(groupKey(undefined)).toBe("");
	});
});

describe("a page's groups", () => {
	const page = [
		item("A", "boiler"),
		item("B", "boiler"),
		item("C", "chiller"),
		item("D", null),
		item("E", null),
	];

	test("follow the rows, counting the rows on the page if nothing else is known", () => {
		expect(pageGroups(page, keyOf)).toEqual([
			{ key: "boiler", rows: page.slice(0, 2), count: 2, continued: false, continues: false },
			{ key: "chiller", rows: page.slice(2, 3), count: 1, continued: false, continues: false },
			{ key: "", rows: page.slice(3), count: 2, continued: false, continues: false },
		]);
	});

	test("count every row of the group, on any page", () => {
		const groups = pageGroups(page, keyOf, { counts: { boiler: 7, chiller: 1, "": 3 } });
		expect(groups.map((group) => group.count)).toEqual([7, 1, 3]);
	});

	test("never count fewer rows than the page shows", () => {
		expect(pageGroups(page, keyOf, { counts: { boiler: 1 } })[0].count).toBe(2);
	});

	test("say when the first group started on an earlier page, and the last goes on", () => {
		const groups = pageGroups(page, keyOf, { previous: "boiler", next: "" });
		expect(groups.map(({ continued, continues }) => ({ continued, continues }))).toEqual([
			{ continued: true, continues: false },
			{ continued: false, continues: false },
			{ continued: false, continues: true },
		]);
		const neither = pageGroups(page, keyOf, { previous: "pump", next: "pump" });
		expect(neither.some((group) => group.continued || group.continues)).toBe(false);
	});

	test("a group across the whole page can do both", () => {
		const [group] = pageGroups(page.slice(0, 2), keyOf, { previous: "boiler", next: "boiler" });
		expect(group).toMatchObject({ key: "boiler", continued: true, continues: true });
	});

	test("rows of a group that aren't together join its first rows", () => {
		const scattered = [item("A", "boiler"), item("B", "chiller"), item("C", "boiler")];
		const groups = pageGroups(scattered, keyOf);
		expect(groups.map((group) => [group.key, names(group.rows)])).toEqual([
			["boiler", ["A", "C"]],
			["chiller", ["B"]],
		]);
	});

	test("an empty page has no groups", () => {
		expect(pageGroups([], keyOf, { previous: "boiler" })).toEqual([]);
	});
});

describe("sorting groups first", () => {
	/** Rows as TanStack's, of a column sorted as text, with `undefined` for no category. */
	const rowsOf = (items: Item[]) =>
		items.map((original) => ({
			original,
			getValue: () => original.category ?? undefined,
			getGroupingValue: () => original.category ?? undefined,
		}));
	type Row = ReturnType<typeof rowsOf>[number];
	const column = (sortUndefined?: "last") => ({
		id: "category",
		getCanSort: () => true,
		getSortFn: () =>
			((a: Row, b: Row) => String(a.getValue()).localeCompare(String(b.getValue()))) as never,
		columnDef: { sortUndefined },
	});
	const sorted = (rows: Row[]) => rows.map((row) => row.original.name);

	// As sorted by name.
	const rows = rowsOf([
		item("A", "chiller"),
		item("B", null),
		item("C", "boiler"),
		item("D", "chiller"),
		item("E", "boiler"),
	]);

	test("keeps each group's rows together, in their order, the groups ascending", () => {
		expect(sorted(groupsFirst(rows, column("last"), false))).toEqual(["C", "E", "A", "D", "B"]);
	});

	test("or descending, rows without a value still last", () => {
		expect(sorted(groupsFirst(rows, column("last"), true))).toEqual(["A", "D", "C", "E", "B"]);
	});

	test("a column that can't be sorted keeps the groups in the order they come", () => {
		const unsortable = { ...column(), getCanSort: () => false };
		expect(sorted(groupsFirst(rows, unsortable, false))).toEqual(["A", "D", "B", "C", "E"]);
	});
});

describe("sums", () => {
	test("add up the numbers, ignoring what isn't one", () => {
		expect(sumOf([1, 2.5, null, "3", Number.NaN, 4], (value) => value)).toBe(7.5);
		expect(sumOf([], (value) => value)).toBe(0);
	});
});
