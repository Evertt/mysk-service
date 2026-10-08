import type { TableState } from "@tanstack/svelte-table";
import { expect, test } from "vite-plus/test";

import { createAppTable } from "#lib/components/data-table/table.svelte.ts";

import { type CustomerRow, columns } from "./columns.ts";

const customer = (name: string, fields: Partial<CustomerRow> = {}): CustomerRow => ({
	id: 1,
	organizationId: "north",
	code: "CUS-001",
	name,
	segment: "mid_market",
	contactName: "Jo de Vries",
	email: "jo@example.com",
	phone: "+31 20 123 4567",
	city: "Utrecht",
	country: "Netherlands",
	createdAt: new Date(2025, 0, 1),
	equipmentCount: 0,
	openOrders: 0,
	...fields,
});

/** The customer names the table shows for `rows` in the given state. */
const shown = (rows: CustomerRow[], state: Partial<TableState<never>>) =>
	createAppTable({ columns, data: rows, initialState: state })
		.getRowModel()
		.rows.map((row) => row.original.name);

test("the location sorts by country, then city", () => {
	const rows = [
		customer("Acme", { country: "Netherlands", city: "Utrecht" }),
		customer("Bolt", { country: "Belgium", city: "Antwerp" }),
		customer("Cogs", { country: "Netherlands", city: "Amsterdam" }),
	];
	expect(shown(rows, { sorting: [{ id: "country", desc: false }] })).toEqual([
		"Bolt",
		"Cogs",
		"Acme",
	]);
});

test("the segment sorts by size rather than alphabetically", () => {
	const rows = [
		customer("Acme", { segment: "small_business" }),
		customer("Bolt", { segment: "enterprise" }),
		customer("Cogs", { segment: "mid_market" }),
	];
	expect(shown(rows, { sorting: [{ id: "segment", desc: false }] })).toEqual([
		"Bolt",
		"Cogs",
		"Acme",
	]);
});

test("the country filter keeps the chosen countries", () => {
	const rows = [
		customer("Acme", { country: "Netherlands" }),
		customer("Bolt", { country: "Belgium" }),
		customer("Cogs", { country: "Germany" }),
	];
	const filters = [{ id: "country", value: ["Belgium", "Germany"] }];
	expect(shown(rows, { columnFilters: filters })).toEqual(["Bolt", "Cogs"]);
});

test("unchecking every country shows all customers again", () => {
	const rows = [customer("Acme"), customer("Bolt", { country: "Belgium" })];
	const table = createAppTable({ columns, data: rows });
	const country = table.getColumn("country")!;
	country.setFilterValue(["Belgium"]);
	expect(table.getRowModel().rows).toHaveLength(1);
	country.setFilterValue([]);
	expect(table.getRowModel().rows).toHaveLength(2);
	expect(country.getIsFiltered()).toBe(false);
});

test("the search also finds customers by code, email, city and phone", () => {
	const rows = [
		customer("Acme"),
		customer("Bolt", {
			code: "CUS-042",
			email: "an@bolt.be",
			city: "Antwerp",
			phone: "+32 3 555 0199",
		}),
	];
	for (const search of ["cus-042", "an@bolt", "antwerp", "555 0199"]) {
		expect(shown(rows, { globalFilter: search }), search).toEqual(["Bolt"]);
	}
});
