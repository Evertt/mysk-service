import type { TableState } from "@tanstack/svelte-table";
import { expect, test } from "vite-plus/test";

import { createAppTable } from "#lib/components/data-table/table.svelte.js";

import { columns, type EngineerRow } from "./columns.ts";

const engineer = (name: string, fields: Partial<EngineerRow> = {}): EngineerRow => ({
	id: 1,
	name,
	email: "sam@example.com",
	phone: "06 1234 5678",
	specialty: "hvac",
	region: "North",
	hourlyRate: 6000,
	active: true,
	hiredAt: new Date(2024, 2, 1),
	openOrders: 0,
	...fields,
});

/** The names the table shows for `rows` in the given state. */
const shown = (rows: EngineerRow[], state: Partial<TableState<never>>) =>
	createAppTable({ columns, data: rows, initialState: state })
		.getRowModel()
		.rows.map((row) => row.original.name);

test("the status filter tells active from inactive engineers", () => {
	const rows = [engineer("Ann"), engineer("Bo", { active: false })];
	expect(shown(rows, { columnFilters: [{ id: "status", value: ["inactive"] }] })).toEqual(["Bo"]);
	expect(shown(rows, { columnFilters: [{ id: "status", value: ["active"] }] })).toEqual(["Ann"]);
});

test("the specialty and region filters keep the chosen values", () => {
	const rows = [
		engineer("Ann", { specialty: "hvac", region: "North" }),
		engineer("Bo", { specialty: "electrical", region: "North" }),
		engineer("Cas", { specialty: "hvac", region: "South" }),
	];
	const filters = [
		{ id: "specialty", value: ["hvac"] },
		{ id: "region", value: ["North", "East"] },
	];
	expect(shown(rows, { columnFilters: filters })).toEqual(["Ann"]);
});

test("the search finds engineers by name, email and region", () => {
	const rows = [
		engineer("Ann"),
		engineer("Bo Smit", { email: "b.smit@example.com", region: "West" }),
	];
	for (const search of ["smit", "b.smit@", "west"]) {
		expect(shown(rows, { globalFilter: search }), search).toEqual(["Bo Smit"]);
	}
});
