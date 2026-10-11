import type { TableState } from "@tanstack/svelte-table";
import { expect, test } from "vite-plus/test";

import { extendList } from "#lib/components/data-table/list-definition.ts";
import { withModuleTableColumns } from "#lib/components/data-table/module-table-columns.ts";
import { urlGrammar } from "#lib/components/data-table/server-table.svelte.ts";
import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.ts";
import { columns, type EquipmentRow } from "#lib/equipment/list/columns.ts";
import { equipmentList } from "#lib/equipment/list/equipment-list.ts";
import { gadgetsRating, widgetsNote } from "#unit/lib/modules/fakes.ts";

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
	moduleValues: {},
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

test("with the tenant's modules' columns, the table and the merged list agree on the URL", () => {
	const modules = [gadgetsRating, widgetsNote];
	const list = extendList(equipmentList, modules);
	const withModules = withModuleTableColumns<EquipmentRow, (typeof columns)[number]>(
		columns,
		modules,
	);
	const table = createAppTable({
		columns: withModules,
		data: [unit("GEN-1", { moduleValues: { "gadgets.rating": 7 } })],
		initialState: { ...list.urlSpec.defaults },
	});
	expect(urlGrammar(tableUrlSpec(table))).toEqual(urlGrammar(list.urlSpec));
	// After the list's own columns, before the row actions.
	expect(
		table
			.getAllLeafColumns()
			.map((column) => column.id)
			.slice(-3),
	).toEqual(["gadgets.rating", "widgets.note", "actions"]);
	const [row] = table.getRowModel().rows;
	expect(row.getValue("gadgets.rating")).toBe(7);
	expect(row.getValue("widgets.note")).toBeNull();
});
