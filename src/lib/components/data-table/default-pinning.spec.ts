import { describe, expect, test } from "vite-plus/test";

import { defaultColumnPinning } from "./default-pinning.js";
import { createAppColumnHelper, createAppTable } from "./table.svelte.js";

describe("defaultColumnPinning", () => {
	test("pins the selection and identifying columns to the start, the actions to the end", () => {
		expect(
			defaultColumnPinning([
				{ id: "select" },
				{ accessorKey: "number" },
				{ id: "customer" },
				{ id: "actions" },
			]),
		).toEqual({ start: ["select", "number"], end: ["actions"] });
	});

	test("without a selection column, pins the first column", () => {
		expect(defaultColumnPinning([{ accessorKey: "name" }, { accessorKey: "email" }])).toEqual({
			start: ["name"],
			end: [],
		});
	});

	test("a column with `enablePinning: false` stays unpinned", () => {
		expect(
			defaultColumnPinning([
				{ id: "select" },
				{ accessorKey: "number", enablePinning: false },
				{ id: "actions", enablePinning: false },
			]),
		).toEqual({ start: [], end: [] });
	});

	test("an actions column that isn't last isn't pinned", () => {
		expect(defaultColumnPinning([{ id: "name" }, { id: "actions" }, { id: "notes" }])).toEqual({
			start: ["name"],
			end: [],
		});
	});

	test("takes the leaves of grouped columns", () => {
		expect(
			defaultColumnPinning([
				{ id: "who", columns: [{ accessorKey: "name" }, { accessorKey: "email" }] },
				{ id: "actions" },
			]),
		).toEqual({ start: ["name"], end: ["actions"] });
	});

	test("pins nothing in a table without columns", () => {
		expect(defaultColumnPinning([])).toEqual({ start: [], end: [] });
	});
});

describe("app tables", () => {
	const column = createAppColumnHelper<{ id: number; name: string }>();
	const columns = column.columns([
		column.display({ id: "select" }),
		column.accessor("name", {}),
		column.accessor("id", {}),
		column.display({ id: "actions" }),
	]);
	const data = [{ id: 1, name: "Boiler service" }];

	test("start with the default pinning, and reset to it", () => {
		const table = createAppTable({ columns, data });
		const pinning = { start: ["select", "name"], end: ["actions"] };
		expect(table.atoms.columnPinning.get()).toEqual(pinning);
		expect(table.getColumn("name")?.getIsPinned()).toBe("start");

		table.setColumnPinning({ start: [], end: [] });
		table.resetColumnPinning();
		expect(table.atoms.columnPinning.get()).toEqual(pinning);
	});

	test("can start with pinning of their own, or turn it off", () => {
		const none = { start: [], end: [] };
		expect(
			createAppTable({
				columns,
				data,
				initialState: { columnPinning: none },
			}).atoms.columnPinning.get(),
		).toEqual(none);
		expect(
			createAppTable({ columns, data, enableColumnPinning: false }).atoms.columnPinning.get(),
		).toEqual(none);
	});
});
