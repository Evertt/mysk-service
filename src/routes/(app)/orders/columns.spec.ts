import type { TableState } from "@tanstack/svelte-table";
import { describe, expect, test } from "vite-plus/test";

import { urlGrammar } from "#lib/components/data-table/server-table.svelte.js";
import { createAppTable } from "#lib/components/data-table/table.svelte.js";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.js";

import { columns, type OrderRow } from "./columns.ts";
import { ordersList } from "./orders-list.ts";

const order = (number: string, fields: Partial<OrderRow> = {}): OrderRow => ({
	id: Number(number.slice(-3)),
	number,
	type: "repair",
	status: "scheduled",
	priority: "normal",
	description: "Replace the seal",
	scheduledFor: new Date(2026, 9, 20),
	completedAt: null,
	createdAt: new Date(2026, 9, 1),
	laborHours: 1,
	customer: { id: 1, code: "CUS-001", name: "Acme" },
	equipment: { id: 1, model: "C15", manufacturer: "Caterpillar", serialNumber: "GEN-1" },
	engineer: { id: 1, name: "Sam", hourlyRate: 6000 },
	lineCount: 0,
	materialsTotal: 0,
	laborTotal: 6000,
	total: 6000,
	tags: [],
	...fields,
});

/** The order numbers the table shows for `rows` in the given state. */
const shown = (rows: OrderRow[], state: Partial<TableState<never>>) =>
	createAppTable({ columns, data: rows, initialState: state })
		.getRowModel()
		.rows.map((row) => row.original.number);

describe("priority", () => {
	const rows = [
		order("ORD-001", { priority: "normal" }),
		order("ORD-002", { priority: "urgent" }),
		order("ORD-003", { priority: "low" }),
		order("ORD-004", { priority: "high" }),
	];

	test("sorts by urgency rather than alphabetically", () => {
		expect(shown(rows, { sorting: [{ id: "priority", desc: false }] })).toEqual([
			"ORD-003",
			"ORD-001",
			"ORD-004",
			"ORD-002",
		]);
		expect(shown(rows, { sorting: [{ id: "priority", desc: true }] })[0]).toBe("ORD-002");
	});

	test("filters on the chosen priorities", () => {
		const filters = [{ id: "priority", value: ["high", "urgent"] }];
		expect(shown(rows, { columnFilters: filters })).toEqual(["ORD-002", "ORD-004"]);
	});
});

describe("orders still to be assigned or scheduled", () => {
	const rows = [
		order("ORD-001", { engineer: null, scheduledFor: null }),
		order("ORD-002", { engineer: { id: 2, name: "Bo", hourlyRate: 6000 } }),
		order("ORD-003", { engineer: { id: 3, name: "Ann", hourlyRate: 6000 } }),
	];

	test.each([false, true])("come last when sorting by engineer (descending: %s)", (desc) => {
		expect(shown(rows, { sorting: [{ id: "engineer", desc }] }).at(-1)).toBe("ORD-001");
	});

	test.each([false, true])("come last when sorting by date (descending: %s)", (desc) => {
		expect(shown(rows, { sorting: [{ id: "scheduledFor", desc }] }).at(-1)).toBe("ORD-001");
	});
});

test.each([false, true])(
	"new installations come last when sorting by equipment (descending: %s)",
	(desc) => {
		const rows = [
			order("ORD-001", { equipment: null }),
			order("ORD-002", {
				equipment: { id: 2, model: "XR9", manufacturer: "Daikin", serialNumber: "CHL-9" },
			}),
			order("ORD-003"),
		];
		expect(shown(rows, { sorting: [{ id: "equipment", desc }] }).at(-1)).toBe("ORD-001");
	},
);

test("the search finds orders by number, customer, equipment and engineer", () => {
	const rows = [
		order("ORD-001"),
		order("ORD-002", {
			customer: { id: 2, code: "CUS-002", name: "Bolt Logistics" },
			equipment: { id: 2, model: "XR9", manufacturer: "Daikin", serialNumber: "CHL-9" },
			engineer: { id: 2, name: "Priya", hourlyRate: 6000 },
		}),
	];
	for (const search of ["ord-002", "bolt", "daikin xr9", "priya"]) {
		expect(shown(rows, { globalFilter: search }), search).toEqual(["ORD-002"]);
	}
});

test("the type and status filters keep the chosen values", () => {
	const rows = [
		order("ORD-001", { type: "repair", status: "quote" }),
		order("ORD-002", { type: "inspection", status: "completed" }),
		order("ORD-003", { type: "repair", status: "completed" }),
	];
	const filters = [
		{ id: "type", value: ["repair"] },
		{ id: "status", value: ["completed", "invoiced"] },
	];
	expect(shown(rows, { columnFilters: filters })).toEqual(["ORD-003"]);
});

test("the table reads and writes the URL as the orders list says", () => {
	const table = createAppTable({
		columns,
		data: [],
		initialState: { ...ordersList.urlSpec.defaults },
	});
	expect(urlGrammar(tableUrlSpec(table))).toEqual(urlGrammar(ordersList.urlSpec));
});
