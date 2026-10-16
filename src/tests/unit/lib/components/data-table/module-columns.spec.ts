import type { Component } from "svelte";
import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import {
	code,
	defineList,
	extendList,
	oneOf,
	toListQuery,
} from "#lib/components/data-table/list-definition.ts";
import { checkModuleColumn, listColumn } from "#lib/components/data-table/module-columns.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { listColumns } from "#lib/equipment/extensions.ts";
import { loadListColumns } from "#lib/extensions/list-columns.ts";
import { fakeColumnContributions, gadgetsRating, widgetsNote } from "#unit/lib/modules/fakes.ts";

const units = defineList({
	columns: {
		serial: { sort: true },
		status: { sort: true, group: true, filter: oneOf(["active", "retired"]) },
		customer: { filter: code },
	},
	defaults: { sort: [{ id: "serial", desc: false }] },
	moduleColumns: listColumns,
});

/** A page of rows, with filters and sorting. */
const query = (filters: Record<string, unknown[]>, sort: { id: string; desc: boolean }[] = []) => ({
	q: "",
	filters,
	sort,
	group: null,
	pageIndex: 0,
	pageSize: 50,
});

describe("extendList", () => {
	const extended = extendList(units, [gadgetsRating, widgetsNote]);

	test("adds the modules' columns to what the list sorts and filters by, and to its URL", () => {
		expect(extended.sortIds).toEqual(["serial", "status", "gadgets.rating"]);
		expect(Object.keys(extended.filterKinds)).toEqual(["status", "customer", "gadgets.rating"]);
		expect(extended.urlSpec.columns.find((column) => column.id === "gadgets.rating")).toEqual({
			id: "gadgets.rating",
			param: "rating",
			sortable: true,
			filter: "set",
			values: ["high", "low"],
		});
		expect(extended.moduleColumns).toEqual([gadgetsRating, widgetsNote]);
		// What the list was defined with stays as it was.
		expect(extended.urlSpec.defaults).toEqual(units.urlSpec.defaults);
		expect(extended.point).toBe(listColumns);
	});

	test("reads the URL's parameters of the modules' columns into the query", () => {
		const state = parseTableUrl(
			new URLSearchParams("rating=low,bogus&sort=-rating,serial&note=x"),
			extended.urlSpec,
		);
		expect(toListQuery(extended, state)).toMatchObject({
			filters: { "gadgets.rating": ["low"] },
			sort: [
				{ id: "gadgets.rating", desc: true },
				{ id: "serial", desc: false },
			],
		});
		// The list without them doesn't read them.
		const plain = parseTableUrl(new URLSearchParams("rating=low&sort=-rating"), units.urlSpec);
		expect(toListQuery(units, plain)).toMatchObject({
			filters: {},
			sort: [{ id: "serial", desc: false }],
		});
	});

	test("is the same list for the same columns, and the list itself for none", () => {
		expect(extendList(units, [gadgetsRating, widgetsNote])).toBe(extended);
		expect(extendList(units, [gadgetsRating])).not.toBe(extended);
		expect(extendList(units, [])).toBe(units);
	});

	test("holds the tenant's queries to its own columns, strictly", () => {
		const own = query({ "gadgets.rating": ["high"], status: ["active"] }, [
			{ id: "gadgets.rating", desc: false },
		]);
		expect(v.is(extended.strict.query, own)).toBe(true);
		expect(v.is(units.strict.query, own)).toBe(false);
		expect(v.is(extended.strict.query, query({ "gadgets.rating": ["medium"] }))).toBe(false);
		expect(v.is(extended.strict.query, query({ "others.thing": ["x"] }))).toBe(false);
		expect(v.is(extended.strict.where, { q: "", filters: { "gadgets.rating": ["low"] } })).toBe(
			true,
		);
		// Neither sorted nor filtered by the note.
		expect(v.is(extended.strict.query, query({}, [{ id: "widgets.note", desc: false }]))).toBe(
			false,
		);
	});

	test("lets any module's column through at the boundary, and nothing else", () => {
		// For the remote function's schema: `planList()` checks against the tenant's list.
		expect(
			v.is(
				units.query,
				query({ "any.column": ["x", 1, null] }, [{ id: "any.column", desc: true }]),
			),
		).toBe(true);
		expect(v.is(units.query, query({ notModule: ["x"] }))).toBe(false);
		expect(v.is(units.query, query({ status: ["bogus"] }))).toBe(false);
		expect(v.is(units.query, query({}, [{ id: "nope", desc: true }]))).toBe(false);
		expect(v.is(units.where, { q: "", filters: { "any.column": [{ not: "a value" }] } })).toBe(
			false,
		);
		// A list modules don't add to takes nothing of the kind.
		const closed = defineList({ columns: { serial: { sort: true } } });
		expect(v.is(closed.query, query({ "any.column": ["x"] }))).toBe(false);
		expect(closed.strict).toEqual({ query: closed.query, where: closed.where });
	});

	test("refuses a column that isn't named as a module's, or that the list has", () => {
		const cell = {} as Component<{ value: unknown }>;
		expect(() =>
			extendList(units, [listColumn({ id: "status" as "a.b", param: "s", label: () => "", cell })]),
		).toThrow();
		expect(() =>
			extendList(units, [
				listColumn({ id: "a.b", param: "status", label: () => "", sort: true, cell }),
			]),
		).toThrow();
	});
});

describe("module columns", () => {
	test("are named as their module's", () => {
		expect(() => checkModuleColumn(gadgetsRating, "gadgets")).not.toThrow();
		expect(() => checkModuleColumn(gadgetsRating, "widgets")).toThrow(
			`The widgets module's column "gadgets.rating" must be called "widgets.<name>".`,
		);
	});

	test("load for the modules that are on, in registry order", async () => {
		const load = (modules: string[]) =>
			loadListColumns(listColumns, modules, fakeColumnContributions);
		expect(await load(["widgets", "gadgets"])).toEqual([gadgetsRating, widgetsNote]);
		expect(await load(["widgets"])).toEqual([widgetsNote]);
		expect(await load([])).toEqual([]);
		expect(
			await loadListColumns(
				{ id: "orders.list", kind: "columns" },
				["gadgets"],
				fakeColumnContributions,
			),
		).toEqual([]);
	});
});
