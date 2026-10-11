import type { TableState } from "@tanstack/svelte-table";
import { expect, test } from "vite-plus/test";

import { urlGrammar } from "#lib/components/data-table/server-table.svelte.ts";
import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.ts";
import { columns, type MaterialRow } from "#lib/materials/list/columns.ts";
import { materialsList } from "#lib/materials/list/materials-list.ts";

const material = (sku: string, fields: Partial<MaterialRow> = {}): MaterialRow => ({
	id: 1,
	sku,
	name: "Copper pipe",
	unit: "pcs",
	unitPrice: 435,
	stock: 100,
	orderCount: 0,
	...fields,
});

/** The SKUs the table shows for `rows` in the given state. */
const shown = (rows: MaterialRow[], state: Partial<TableState<never>>) =>
	createAppTable({ columns, data: rows, initialState: state })
		.getRowModel()
		.rows.map((row) => row.original.sku);

const rows = [
	material("MAT-001", { stock: 200 }),
	material("MAT-002", { stock: 0 }),
	material("MAT-003", { stock: 30, unit: "m" }),
	material("MAT-004", { stock: 30, unit: "pcs" }),
];

test("the stock level filter judges the stock by its unit", () => {
	expect(shown(rows, { columnFilters: [{ id: "stockLevel", value: ["low"] }] })).toEqual([
		"MAT-003",
	]);
	expect(shown(rows, { columnFilters: [{ id: "stockLevel", value: ["out", "low"] }] })).toEqual([
		"MAT-002",
		"MAT-003",
	]);
});

test("the stock level sorts from out of stock to in stock", () => {
	expect(shown(rows, { sorting: [{ id: "stockLevel", desc: false }] }).slice(0, 2)).toEqual([
		"MAT-002",
		"MAT-003",
	]);
});

test("the search finds materials by name and SKU", () => {
	const named = [material("MAT-001"), material("MAT-777", { name: "Pump seal kit" })];
	expect(shown(named, { globalFilter: "seal" })).toEqual(["MAT-777"]);
	expect(shown(named, { globalFilter: "mat-777" })).toEqual(["MAT-777"]);
});

test("the table reads and writes the URL as the materials list says", () => {
	const table = createAppTable({
		columns,
		data: [],
		initialState: { ...materialsList.urlSpec.defaults },
	});
	expect(urlGrammar(tableUrlSpec(table))).toEqual(urlGrammar(materialsList.urlSpec));
});
