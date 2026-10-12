import { describe, expect, test } from "vite-plus/test";

import {
	changedVisibility,
	currentVisibility,
	defaultVisibility,
	sameVisibility,
	showColumns,
	withSaved,
} from "#lib/components/data-table/column-visibility.ts";

/** A table with a column that can't be hidden, a display column, and three hideable ones. */
function fakeTable(initial: Record<string, boolean>, state: Record<string, boolean> = {}) {
	const column = (id: string, { hideable = true, data = true } = {}) => ({
		id,
		getCanHide: () => hideable,
		accessorFn: data ? () => null : undefined,
	});
	const table = {
		state,
		initialState: { columnVisibility: initial },
		getAllLeafColumns: () => [
			column("number", { hideable: false }),
			column("customer"),
			column("total"),
			column("createdAt"),
			column("actions", { data: false }),
		],
		atoms: { columnVisibility: { get: () => table.state } },
		setColumnVisibility(visibility: Record<string, boolean>) {
			table.state = visibility;
		},
	};
	return table;
}

describe("defaultVisibility", () => {
	test("is the initial state's for the hideable data columns, else shown", () => {
		expect(defaultVisibility(fakeTable({ createdAt: false }))).toEqual({
			customer: true,
			total: true,
			createdAt: false,
		});
	});
});

test("currentVisibility is the table's state for the hideable columns", () => {
	expect(currentVisibility(fakeTable({ createdAt: false }, { total: false }))).toEqual({
		customer: true,
		total: false,
		createdAt: true,
	});
});

describe("withSaved", () => {
	const defaults = { customer: true, total: true, createdAt: false };

	test("takes the saved visibility of the columns it has, the default of the others", () => {
		expect(withSaved(defaults, { total: false })).toEqual({
			customer: true,
			total: false,
			createdAt: false,
		});
	});

	test("ignores columns the table no longer has", () => {
		expect(withSaved(defaults, { gone: true, createdAt: true })).toEqual({
			customer: true,
			total: true,
			createdAt: true,
		});
	});

	test("is the defaults without a saved visibility", () => {
		expect(withSaved(defaults, null)).toEqual(defaults);
	});
});

test("sameVisibility compares the first's columns, missing ones shown", () => {
	expect(sameVisibility({ a: true, b: false }, { b: false })).toBe(true);
	expect(sameVisibility({ a: true, b: false }, { a: true, b: true })).toBe(false);
});

test("changedVisibility is null for the defaults, else all of it", () => {
	const defaults = { customer: true, total: true };
	expect(changedVisibility(defaults, { customer: true, total: true })).toBeNull();
	expect(changedVisibility(defaults, { customer: true, total: false })).toEqual({
		customer: true,
		total: false,
	});
});

test("showColumns shows a saved visibility, with the defaults for what it doesn't say", () => {
	const table = fakeTable({ createdAt: false }, { number: true, total: false });
	showColumns(table, { customer: false });
	expect(table.state).toEqual({ number: true, customer: false, total: true, createdAt: false });
});
