import { isHttpError } from "@sveltejs/kit";
import { and, eq, inArray, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { defineList, extendList, oneOf } from "#lib/components/data-table/list-definition.ts";
import { listColumns } from "#lib/equipment/extensions.ts";
import { inTenant, type Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import {
	type ColumnSqlContribution,
	columnSql,
	moduleFacets,
	moduleValues,
	withModuleColumns,
} from "#lib/server/lists/module-columns.ts";
import { type ListSql, planList } from "#lib/server/lists/plan.ts";
import { gadgetsRating, widgetsNote } from "#unit/lib/modules/fakes.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// An in-memory database instead of the app's, which needs `DATABASE_URL`.
vi.mock("#lib/server/db/index.ts", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	return { db: drizzle(createClient({ url: ":memory:" }), { schema }) };
});

/** A made-up module's table: each unit's rating. */
const rating = sqliteTable("rating", {
	organizationId: text("organization_id").notNull(),
	equipmentId: integer("equipment_id").notNull(),
	score: integer("score").notNull(),
});

const tenantOf = (organizationId: string, modules: string[] = []): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules,
});

beforeAll(async () => {
	await db.run(sql`create table equipment (
		id integer primary key, organization_id text, serial_number text, status text
	)`);
	await db.run(
		sql`create table rating (organization_id text, equipment_id integer, score integer)`,
	);
	await db.run(sql`insert into equipment (id, organization_id, serial_number, status) values
		(1, 'north', 'SN-A', 'operational'),
		(2, 'north', 'SN-B', 'operational'),
		(3, 'north', 'SN-C', 'operational'),
		(4, 'south', 'SN-D', 'operational')`);
	// SN-C has no rating; South's unit is rated, but that's not North's to see.
	await db.run(sql`insert into rating values ('north', 1, 3), ('north', 2, 9), ('south', 4, 8)`);
});

beforeEach(() => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenantOf("north", ["gadgets", "widgets"]);
});

const units = defineList({
	columns: {
		serial: { sort: true },
		status: { filter: oneOf(["operational", "retired"]) },
	},
	defaults: { sort: [{ id: "serial", desc: false }] },
	moduleColumns: listColumns,
});

/** A unit's score, tenant-scoped. */
const score = () =>
	sql<number | null>`(select ${rating.score} from ${rating} where ${and(
		eq(rating.equipmentId, equipment.id),
		inTenant(rating),
	)})`;

/** The made-up modules' columns' SQL, as `columns.gen.ts` lists them. */
const registry: ColumnSqlContribution[] = [
	{
		module: "gadgets",
		point: listColumns,
		columns: [
			columnSql(gadgetsRating, () => {
				const bucket = sql`(case when ${score()} >= 5 then 'high' when ${score()} < 5 then 'low' end)`;
				return {
					value: score(),
					sort: score(),
					nullsLast: true,
					filter: (values) => inArray(bucket, values),
					facet: bucket,
				};
			}),
		],
	},
	{
		module: "widgets",
		point: listColumns,
		columns: [
			columnSql(widgetsNote, () => ({
				value: sql<string>`'note ' || ${equipment.serialNumber}`,
			})),
		],
	},
	{ module: "others", point: { id: "orders.list", kind: "columns" }, columns: [] },
];

/** The list's SQL, built per request like a real list's, with the modules' columns. */
const unitSql = (modules?: string[]): ListSql<typeof units.columns> =>
	withModuleColumns(
		{
			list: units,
			from: (fields) => db.select(fields).from(equipment).$dynamic(),
			columns: {
				serial: { sort: equipment.serialNumber },
				status: { filter: (statuses) => inArray(sql`${equipment.status}`, statuses) },
			},
			search: [equipment.serialNumber],
			id: equipment.id,
			scope: () => inTenant(equipment),
		},
		modules,
		registry,
	);

const page = (filters: Record<string, unknown[]>, sort: { id: string; desc: boolean }[]) =>
	({ q: "", filters, sort, group: null, pageIndex: 0, pageSize: 20 }) as never;

/** The serial numbers of a page of the list, as `listSql` plans `query`. */
const serials = async (listSql: ListSql<typeof units.columns>, query: never) => {
	const rows = await planList(listSql, query).paged(
		db.select({ serial: equipment.serialNumber }).from(equipment).$dynamic(),
	);
	return rows.map((row) => row.serial);
};

/** The status of what `run` throws, or `undefined` if it doesn't. */
const statusOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		if (isHttpError(error)) return error.status;
		throw error;
	}
};

describe("withModuleColumns", () => {
	test("adds the tenant's modules' columns to the list and its SQL", () => {
		const listSql = unitSql();
		expect(listSql.list).toBe(extendList(units, [gadgetsRating, widgetsNote]));
		expect(Object.keys(listSql.columns)).toEqual([
			"serial",
			"status",
			"gadgets.rating",
			"widgets.note",
		]);
		expect(Object.keys(listSql.modules ?? {})).toEqual(["gadgets.rating", "widgets.note"]);
	});

	test("adds nothing for a tenant without such modules", () => {
		locals.tenant = tenantOf("south", ["others"]);
		const listSql = unitSql();
		expect(listSql.list).toBe(units);
		expect(listSql.modules).toBeUndefined();
	});

	test("refuses a module's column that isn't named as its own", () => {
		const borrowed = [
			{
				module: "widgets",
				point: listColumns,
				columns: [columnSql(gadgetsRating, () => ({ value: score() }))],
			},
		];
		expect(() => withModuleColumns(unitSql([]), ["widgets"], borrowed)).toThrow(
			/must be called "widgets.<name>"/,
		);
	});
});

describe("planList with module columns", () => {
	test("sorts and filters by them like by the list's own", async () => {
		const listSql = unitSql();
		expect(await serials(listSql, page({}, [{ id: "gadgets.rating", desc: true }]))).toEqual([
			"SN-B",
			"SN-A",
			"SN-C",
		]);
		expect(await serials(listSql, page({}, [{ id: "gadgets.rating", desc: false }]))).toEqual([
			"SN-A",
			"SN-B",
			"SN-C",
		]);
		expect(await serials(listSql, page({ "gadgets.rating": ["high"] }, []))).toEqual(["SN-B"]);
	});

	test("refuses a column the tenant doesn't have, or a value the column doesn't take", () => {
		const without = unitSql(["widgets"]);
		expect(statusOf(() => planList(without, page({ "gadgets.rating": ["high"] }, [])))).toBe(400);
		expect(
			statusOf(() => planList(without, page({}, [{ id: "gadgets.rating", desc: true }]))),
		).toBe(400);
		expect(statusOf(() => planList(unitSql(), page({ "gadgets.rating": ["medium"] }, [])))).toBe(
			400,
		);
		expect(
			statusOf(() => planList(unitSql(), { q: "", filters: { "widgets.note": ["x"] } } as never)),
		).toBe(400);
		expect(
			statusOf(() => planList(unitSql(), page({ "gadgets.rating": ["low"] }, []))),
		).toBeUndefined();
	});
});

describe("moduleValues and moduleFacets", () => {
	test("give the page's values of the modules' columns, in the tenant", async () => {
		const values = await moduleValues(unitSql(), [1, 3, 4]);
		expect(Object.fromEntries(values)).toEqual({
			1: { "gadgets.rating": 3, "widgets.note": "note SN-A" },
			3: { "gadgets.rating": null, "widgets.note": "note SN-C" },
		});
		expect(await moduleValues(unitSql([]), [1])).toEqual(new Map());
	});

	test("count the rows under their filters' values", async () => {
		const listSql = unitSql();
		expect(
			await planList(listSql, { q: "", filters: {} }).facets(moduleFacets(listSql) as never),
		).toEqual({
			"gadgets.rating": { high: 1, low: 1, none: 1 },
		});
	});
});
