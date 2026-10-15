import { describe, expect, test } from "vite-plus/test";

import {
	groupedPage,
	groupKey,
	groupRowId,
	groupsFirst,
	pageGroups,
	sumOf,
} from "#lib/components/data-table/grouping.ts";

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

describe("a grouped table's page", () => {
	interface Priced extends Item {
		amount: number;
	}
	const priced = (name: string, category: string | null, amount: number): Priced => ({
		name,
		category,
		amount,
	});
	const row = (original: Priced) => ({
		original,
		getValue: (id: string) => (id === "amount" ? original.amount : original.category),
		getGroupingValue: () => original.category ?? undefined,
	});
	type Row = ReturnType<typeof row>;
	const column = (
		id: string,
		extra: { grouped?: boolean; groupSum?: (sum: number) => string } = {},
	) => ({
		id,
		getIsGrouped: () => extra.grouped ?? false,
		accessorFn: (data: Priced) => data.category,
		columnDef: { meta: { groupSum: extra.groupSum } },
	});
	const columns = [
		column("category", { grouped: true }),
		column("name"),
		column("amount", { groupSum: (sum) => `${sum} cents` }),
	];

	// All the rows, as sorted, and the first of them, which the table shows.
	const all = [
		row(priced("A", "boiler", 100)),
		row(priced("B", "boiler", 250)),
		row(priced("C", "chiller", 40)),
		row(priced("D", "chiller", 60)),
		row(priced("E", null, 5)),
	];
	const tableOn = (shown: number, grouping = ["category"]) => ({
		atoms: { grouping: { get: () => grouping } },
		getColumn: (id: string) => columns.find((column) => column.id === id),
		getVisibleLeafColumns: () => columns,
		getRowModel: () => ({ rows: all.slice(0, shown) }),
		getPrePaginatedRowModel: () => ({ rows: all }),
	});
	const nameOf = (rows: Row[]) => rows.map((row) => row.original.name);
	const summary = (
		groups: { key: string; count: number; continued: boolean; continues: boolean }[],
	) => groups.map(({ key, count, continued, continues }) => [key, count, continued, continues]);

	test("is nothing while the table isn't grouped", () => {
		expect(groupedPage(tableOn(5, []))).toBeUndefined();
		expect(groupedPage(tableOn(5, ["nothing"]))).toBeUndefined();
	});

	test("groups the page's rows by the grouped column", () => {
		const page = groupedPage(tableOn(5))!;
		expect(page.column.id).toBe("category");
		expect(page.groups.map((group) => [group.key, nameOf(group.rows)])).toEqual([
			["boiler", ["A", "B"]],
			["chiller", ["C", "D"]],
			["", ["E"]],
		]);
	});

	test("counts every row of a group, also those not shown yet, and says where it goes on", () => {
		expect(summary(groupedPage(tableOn(3))!.groups)).toEqual([
			["boiler", 2, false, false],
			["chiller", 2, false, true],
		]);
		expect(summary(groupedPage(tableOn(5))!.groups)).toEqual([
			["boiler", 2, false, false],
			["chiller", 2, false, false],
			["", 1, false, false],
		]);
	});

	test("sums the groupSum columns over all of a group's rows", () => {
		const page = groupedPage(tableOn(3))!;
		const sums = (key: string) => page.sums(key).map((sum) => [sum.column.id, sum.sum]);
		expect(sums("boiler")).toEqual([["amount", 350]]);
		expect(sums("chiller")).toEqual([["amount", 100]]);
		expect(sums("nothing")).toEqual([["amount", 0]]);
	});

	test("leaves out the sums of hidden columns", () => {
		const table = { ...tableOn(5), getVisibleLeafColumns: () => columns.slice(0, 2) };
		expect(groupedPage(table)!.sums("boiler")).toEqual([]);
	});

	describe("of a server-side table", () => {
		// The rows from the fourth on (opened partway down), and what the server knows of the groups.
		const laterRows = { ...tableOn(3), getRowModel: () => ({ rows: all.slice(3, 6) }) };
		const known = { counts: { boiler: 4, chiller: 9, "": 1 }, previous: priced("Z", "boiler", 1) };

		test("takes the counts, and the rows around the page, from the server", () => {
			expect(summary(groupedPage(laterRows, known)!.groups)).toEqual([
				["chiller", 9, false, false],
				["", 1, false, false],
			]);
			const next = priced("Y", "chiller", 1);
			const page = groupedPage(tableOn(3), { counts: known.counts, next })!;
			expect(summary(page.groups)).toEqual([
				["boiler", 4, false, false],
				["chiller", 9, false, true],
			]);
		});

		test("reads the key of a row around the page from the column", () => {
			const before = groupedPage(tableOn(3), {
				counts: {},
				previous: priced("Z", "boiler", 1),
			})!;
			expect(before.groups[0].continued).toBe(true);
			// A column with a grouping value of its own, here the name.
			const grouped = column("category", { grouped: true });
			const table = {
				...tableOn(3),
				getColumn: () => ({
					...grouped,
					columnDef: { ...grouped.columnDef, getGroupingValue: (data: Priced) => data.name },
				}),
			};
			const byName = groupedPage(table, { counts: {}, previous: priced("boiler", "x", 1) })!;
			expect(byName.groups[0].continued).toBe(true);
		});

		test("has no sums", () => {
			expect(groupedPage(laterRows, known)!.sums("chiller")).toEqual([]);
		});
	});
});

describe("group row ids", () => {
	test("tell group rows from rows", () => {
		expect(groupRowId("boiler")).toBe("group:boiler");
		expect(groupRowId("")).toBe("group:");
	});
});
