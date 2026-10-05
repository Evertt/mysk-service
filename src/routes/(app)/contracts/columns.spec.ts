import type { TableState } from "@tanstack/svelte-table";
import { expect, test } from "vite-plus/test";

import { createAppTable } from "#lib/components/data-table/table.svelte.js";

import { type ContractRow, columns } from "./columns.ts";

const year = new Date().getFullYear();

const contract = (number: string, fields: Partial<ContractRow> = {}): ContractRow => ({
	id: 1,
	number,
	level: "standard",
	startsOn: new Date(year, 0, 1),
	endsOn: new Date(year, 11, 31),
	monthlyFee: 10_000,
	responseHours: 24,
	createdAt: new Date(year - 1, 11, 1),
	customer: { id: 1, code: "CUS-001", name: "Acme" },
	units: 1,
	...fields,
});

/** The contract numbers the table shows for `rows` in the given state. */
const shown = (rows: ContractRow[], state: Partial<TableState<never>>) =>
	createAppTable({ columns, data: rows, initialState: state })
		.getRowModel()
		.rows.map((row) => row.original.number);

const lastYear = { startsOn: new Date(year - 1, 0, 1), endsOn: new Date(year - 1, 11, 31) };
const nextYear = { startsOn: new Date(year + 1, 0, 1), endsOn: new Date(year + 1, 11, 31) };

test("the level sorts from basic to premium rather than alphabetically", () => {
	const rows = [
		contract("CTR-1", { level: "standard" }),
		contract("CTR-2", { level: "premium" }),
		contract("CTR-3", { level: "basic" }),
	];
	expect(shown(rows, { sorting: [{ id: "level", desc: false }] })).toEqual([
		"CTR-3",
		"CTR-1",
		"CTR-2",
	]);
});

test("the status follows from the period and filters like a stored value", () => {
	const rows = [contract("CTR-1", lastYear), contract("CTR-2"), contract("CTR-3", nextYear)];
	expect(shown(rows, { columnFilters: [{ id: "status", value: ["active"] }] })).toEqual(["CTR-2"]);
	expect(shown(rows, { columnFilters: [{ id: "status", value: ["expired"] }] })).toEqual(["CTR-1"]);
});

test("the status sorts from upcoming through active to expired", () => {
	const rows = [contract("CTR-1", lastYear), contract("CTR-2"), contract("CTR-3", nextYear)];
	expect(shown(rows, { sorting: [{ id: "status", desc: false }] })).toEqual([
		"CTR-3",
		"CTR-2",
		"CTR-1",
	]);
});

test("the period sorts by the first day", () => {
	const rows = [contract("CTR-1"), contract("CTR-2", nextYear), contract("CTR-3", lastYear)];
	expect(shown(rows, { sorting: [{ id: "period", desc: false }] })).toEqual([
		"CTR-3",
		"CTR-1",
		"CTR-2",
	]);
});

test("the search finds contracts by number and customer", () => {
	const rows = [
		contract("CTR-2026-0001"),
		contract("CTR-2026-0002", { customer: { id: 2, code: "CUS-002", name: "Bolt Logistics" } }),
	];
	expect(shown(rows, { globalFilter: "0002" })).toEqual(["CTR-2026-0002"]);
	expect(shown(rows, { globalFilter: "bolt" })).toEqual(["CTR-2026-0002"]);
});
