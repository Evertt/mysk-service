import type { TableState } from "@tanstack/svelte-table";
import { expect, test } from "vite-plus/test";

import { urlGrammar } from "#lib/components/data-table/server-table.svelte.js";
import { createAppTable } from "#lib/components/data-table/table.svelte.js";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.js";

import { columns, type EquipmentRow } from "./columns.ts";
import { equipmentList } from "./equipment-list.ts";

const unit = (serialNumber: string, fields: Partial<EquipmentRow> = {}): EquipmentRow => ({
	id: 1,
	serialNumber,
	manufacturer: "Caterpillar",
	model: "C15",
	category: "generator",
	status: "operational",
	installedAt: new Date(2025, 4, 1),
	warrantyUntil: new Date(2028, 3, 30),
	customer: { id: 1, code: "CUS-001", name: "Acme" },
	openOrders: 0,
	...fields,
});

/** The serial numbers the table shows for `rows` in the given state. */
const shown = (rows: EquipmentRow[], state: Partial<TableState<never>>) =>
	createAppTable({ columns, data: rows, initialState: state })
		.getRowModel()
		.rows.map((row) => row.original.serialNumber);

test("the unit sorts by manufacturer, then model", () => {
	const rows = [
		unit("GEN-1", { manufacturer: "Daikin", model: "A1" }),
		unit("GEN-2", { manufacturer: "Caterpillar", model: "C18" }),
		unit("GEN-3", { manufacturer: "Caterpillar", model: "C15" }),
	];
	expect(shown(rows, { sorting: [{ id: "unit", desc: false }] })).toEqual([
		"GEN-3",
		"GEN-2",
		"GEN-1",
	]);
});

test("the search finds units by manufacturer and model, serial number and customer", () => {
	const rows = [
		unit("GEN-1"),
		unit("CHL-9", {
			manufacturer: "Daikin",
			model: "XR9",
			customer: { id: 2, code: "CUS-002", name: "Bolt Logistics" },
		}),
	];
	for (const search of ["daikin xr9", "chl-9", "bolt"]) {
		expect(shown(rows, { globalFilter: search }), search).toEqual(["CHL-9"]);
	}
});

test("the manufacturer, category and status filters keep the chosen values", () => {
	const rows = [
		unit("GEN-1"),
		unit("CHL-1", { manufacturer: "Daikin", category: "chiller" }),
		unit("CHL-2", { manufacturer: "Daikin", category: "chiller", status: "needs_service" }),
	];
	const filters = [
		{ id: "manufacturer", value: ["Daikin"] },
		{ id: "category", value: ["chiller"] },
		{ id: "status", value: ["needs_service", "out_of_service"] },
	];
	expect(shown(rows, { columnFilters: filters })).toEqual(["CHL-2"]);
});

test("the table reads and writes the URL as the equipment list says", () => {
	const table = createAppTable({
		columns,
		data: [],
		initialState: { ...equipmentList.urlSpec.defaults },
	});
	expect(urlGrammar(tableUrlSpec(table))).toEqual(urlGrammar(equipmentList.urlSpec));
});
