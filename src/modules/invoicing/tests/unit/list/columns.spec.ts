import type { TableState } from "@tanstack/svelte-table";
import { expect, test } from "vite-plus/test";

import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { columns, type InvoiceRow } from "#modules/invoicing/list/columns.ts";
import { at, day } from "#unit/temporal-support.ts";

const invoice = (number: string, fields: Partial<InvoiceRow> = {}): InvoiceRow => ({
	id: 1,
	number,
	status: "sent",
	state: "sent",
	issuedOn: day("2026-10-01"),
	dueOn: day("2026-10-31"),
	paidOn: null,
	vatRate: 21,
	createdAt: at("2026-10-01 00:00"),
	customer: { id: 1, code: "CUST-0001", name: "Acme" },
	lineCount: 1,
	subtotal: 10_000,
	vat: 2100,
	total: 12_100,
	...fields,
});

/** The invoice numbers the table shows for `rows` in the given state. */
const shown = (rows: InvoiceRow[], state: Partial<TableState<never>>) =>
	createAppTable({ columns, data: rows, initialState: state })
		.getRowModel()
		.rows.map((row) => row.original.number);

const draft = { status: "draft", state: "draft", issuedOn: null, dueOn: null } as const;

test("the status filter tells overdue invoices from other sent ones", () => {
	const rows = [
		invoice("INV-1"),
		invoice("INV-2", { state: "overdue" }),
		invoice("INV-3", { status: "paid", state: "paid" }),
	];
	expect(shown(rows, { columnFilters: [{ id: "status", value: ["overdue"] }] })).toEqual(["INV-2"]);
	expect(shown(rows, { columnFilters: [{ id: "status", value: ["sent", "paid"] }] })).toEqual([
		"INV-1",
		"INV-3",
	]);
});

test("the status sorts in the order an invoice goes through", () => {
	const rows = [
		invoice("INV-1", { status: "void", state: "void" }),
		invoice("INV-2", { state: "overdue" }),
		invoice("INV-3", draft),
		invoice("INV-4"),
	];
	expect(shown(rows, { sorting: [{ id: "status", desc: false }] })).toEqual([
		"INV-3",
		"INV-4",
		"INV-2",
		"INV-1",
	]);
});

test("drafts, without dates yet, sort last by date either way", () => {
	const rows = [
		invoice("INV-1", draft),
		invoice("INV-2", { issuedOn: day("2026-09-01") }),
		invoice("INV-3"),
	];
	expect(shown(rows, { sorting: [{ id: "issuedOn", desc: false }] })).toEqual([
		"INV-2",
		"INV-3",
		"INV-1",
	]);
	expect(shown(rows, { sorting: [{ id: "dueOn", desc: true }] }).at(-1)).toBe("INV-1");
});

test("the search finds invoices by number and customer", () => {
	const rows = [
		invoice("INV-2026-00001"),
		invoice("INV-2026-00002", { customer: { id: 2, code: "CUST-0002", name: "Bolt Logistics" } }),
	];
	expect(shown(rows, { globalFilter: "00002" })).toEqual(["INV-2026-00002"]);
	expect(shown(rows, { globalFilter: "bolt" })).toEqual(["INV-2026-00002"]);
});
