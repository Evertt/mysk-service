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
import { day } from "#unit/temporal-support.ts";

const unit = (serialNumber: string, fields: Partial<EquipmentRow> = {}): EquipmentRow => ({
	id: 1,
	serialNumber,
	name: null,
	manufacturer: "Caterpillar",
	model: "C15",
	location: null,
	category: { id: 1, name: "Aggregaat" },
	status: "operational",
	installedAt: day("2025-05-01"),
	warrantyUntil: day("2028-04-30"),
	customer: { id: 1, code: "CUS-001", name: "Acme" },
	site: { id: 1, name: "Utrecht", city: "Utrecht" },
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

test("a unit with a name of its own is shown, sorted and found by it", () => {
	const rows = [
		unit("GEN-1", { manufacturer: "Daikin" }),
		unit("DR-3", { name: "Automatische deur kantine BES-3", manufacturer: "Hörmann" }),
	];
	expect(shown(rows, { sorting: [{ id: "unit", desc: false }] })).toEqual(["DR-3", "GEN-1"]);
	expect(shown(rows, { globalFilter: "kantine" })).toEqual(["DR-3"]);
});

test("units sort by their site and their location there, those without one last", () => {
	const rows = [
		unit("GEN-1", {
			site: { id: 2, name: "Zwolle", city: "Zwolle" },
			location: { id: 7, name: "Dak" },
		}),
		unit("GEN-2", { site: { id: 1, name: "Ede", city: "Ede" } }),
		unit("GEN-3", {
			site: { id: 1, name: "Ede", city: "Ede" },
			location: { id: 3, name: "Ketelhuis" },
		}),
	];
	expect(shown(rows, { sorting: [{ id: "site", desc: false }] }).slice(0, 2)).toEqual(
		expect.arrayContaining(["GEN-2", "GEN-3"]),
	);
	expect(shown(rows, { sorting: [{ id: "location", desc: false }] })).toEqual([
		"GEN-1",
		"GEN-3",
		"GEN-2",
	]);
});

const chiller = { id: 2, name: "Koelmachine" };

test("the manufacturer, category and status filters keep the chosen values", () => {
	const rows = [
		unit("GEN-1"),
		unit("CHL-1", { manufacturer: "Daikin", category: chiller }),
		unit("CHL-2", { manufacturer: "Daikin", category: chiller, status: "needs_service" }),
	];
	const filters = [
		{ id: "manufacturer", value: ["Daikin"] },
		// By the category's id, as the URL has it.
		{ id: "category", value: ["2"] },
		{ id: "status", value: ["needs_service", "out_of_service"] },
	];
	expect(shown(rows, { columnFilters: filters })).toEqual(["CHL-2"]);
});

test("the location filter keeps the units at the locations chosen, by id, or (`none`) at none", () => {
	const dock = { id: 4, name: "Dock 03" };
	const rows = [
		unit("GEN-1", { location: dock }),
		unit("GEN-2", { location: { id: 5, name: "Hal A" } }),
		unit("GEN-3"),
	];
	const by = (value: string[]) => shown(rows, { columnFilters: [{ id: "location", value }] });
	expect(by(["4"])).toEqual(["GEN-1"]);
	expect(by(["none", "5"])).toEqual(["GEN-2", "GEN-3"]);
	// Shown by name.
	const [row] = createAppTable({ columns, data: rows }).getRowModel().rows;
	expect(row.getValue("location")).toBe("Dock 03");
});

test("the category shows the tenant's name for it, and groups by its id", () => {
	const rows = [unit("GEN-1"), unit("CHL-1", { category: chiller })];
	const [, row] = createAppTable({ columns, data: rows }).getRowModel().rows;
	expect(row.getValue("category")).toBe("Koelmachine");
	expect(row.getGroupingValue("category")).toBe(2);
	expect(shown(rows, { globalFilter: "koelmachine" })).toEqual(["CHL-1"]);
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
