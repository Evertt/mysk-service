import { describe, expect, test } from "vite-plus/test";

import { createAppColumnHelper, createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { type BadgeDisplay, withLabels } from "#lib/i18n/labels.ts";
import { type OrderPriority, orderPriorities } from "#lib/models.ts";

interface Row {
	id: number;
	priority: OrderPriority;
	other: OrderPriority | null;
}

const display = withLabels("orderPriority", {
	low: { tone: "neutral" },
	normal: { tone: "info" },
	high: { tone: "warning" },
	urgent: { tone: "danger" },
} satisfies Record<OrderPriority, BadgeDisplay>);

const column = createAppColumnHelper<Row>();
const columns = column.columns([
	column.enum("priority", {
		values: orderPriorities,
		display,
		sortByOrder: true,
		meta: { label: () => "Priority" },
	}),
	column.enum((row) => row.other, {
		id: "other",
		values: orderPriorities,
		label: (priority) => `(${priority})`,
		clickFilter: false,
		enableGrouping: false,
		meta: { label: () => "Other", param: "o" },
	}),
]);

const rows: Row[] = [
	{ id: 1, priority: "high", other: null },
	{ id: 2, priority: "low", other: "urgent" },
	{ id: 3, priority: "urgent", other: "low" },
	{ id: 4, priority: "normal", other: "low" },
];
const table = (state = {}) => createAppTable({ columns, data: rows, initialState: state });

describe("column.enum", () => {
	test("filters by a set of the values, and names each for clicking and the search", () => {
		const [priority, other] = columns;
		expect(priority.filterFn).toBe("oneOf");
		expect(priority.enableGrouping).toBe(true);
		expect(priority.meta?.filterValues).toEqual(orderPriorities);
		expect(priority.meta?.clickFilter?.("urgent")).toBe("Urgent");
		expect(priority.meta?.clickFilter?.("unknown")).toBe("unknown");
		expect(other.meta).toEqual({
			filterValues: orderPriorities,
			filterOptions: orderPriorities.map((value) => ({ value, label: `(${value})` })),
			label: other.meta?.label,
			param: "o",
		});
		// The filter's options, with the badges' icons.
		expect(priority.meta?.filterOptions?.find((option) => option.value === "urgent")).toMatchObject(
			{ value: "urgent", label: "Urgent" },
		);
		expect(other.enableGrouping).toBe(false);
	});

	test("sorts by the values' order with sortByOrder, else as the table does", () => {
		const ids = (sorting: { id: string; desc: boolean }[]) =>
			table({ sorting })
				.getRowModel()
				.rows.map((row) => row.original.id);
		expect(ids([{ id: "priority", desc: false }])).toEqual([2, 4, 1, 3]);
		expect(ids([{ id: "priority", desc: true }])).toEqual([3, 1, 4, 2]);
	});

	test("keeps the rows with the values filtered by, `none` those without one", () => {
		const ids = (id: string, value: string[]) =>
			table({ columnFilters: [{ id, value }] })
				.getRowModel()
				.rows.map((row) => row.original.id);
		expect(ids("priority", ["low", "urgent"])).toEqual([2, 3]);
		expect(ids("other", ["none"])).toEqual([1]);
	});

	test("shows a value as its badge, or as its label, and nothing for none", () => {
		const cells = table().getRowModel().rows[0].getAllCells();
		const cell = (id: string) => cells.find((each) => each.column.id === id)!;
		const render = (id: string) => {
			const def = cell(id).column.columnDef.cell as (context: unknown) => unknown;
			return def(cell(id).getContext());
		};
		expect(render("priority")).toMatchObject({ props: { display, value: "high" } });
		expect(render("other")).toBe("");
		const second = table()
			.getRowModel()
			.rows[1].getAllCells()
			.find((each) => each.column.id === "other")!;
		expect(
			(second.column.columnDef.cell as (context: unknown) => unknown)(second.getContext()),
		).toBe("(urgent)");
	});
});
