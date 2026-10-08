import { invalid } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { db } from "#lib/server/db/index.js";
import { equipment } from "#lib/server/db/schema.js";

import { bulkChange, REQUESTED_PAGES, refreshRequested } from "./bulk.ts";
import type { Tenant } from "./session.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const refreshAll = vi.fn();
const requested = vi.fn((_query: unknown, _limit: number) => ({ refreshAll }));

vi.mock("$app/server", () => ({
	getRequestEvent: () => ({ locals }),
	requested: (query: unknown, limit: number) => requested(query, limit),
}));

// An in-memory database instead of the app's, which needs `DATABASE_URL`.
vi.mock("#lib/server/db/index.js", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.js");
	return { db: drizzle(createClient({ url: ":memory:" }), { schema }) };
});

const tenantOf = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules: [],
});

beforeAll(async () => {
	await db.run(sql`create table equipment (
		id integer primary key, organization_id text, serial_number text, status text
	)`);
	await db.run(sql`insert into equipment (id, organization_id, serial_number, status) values
		(1, 'north', 'SN-B', 'active'),
		(2, 'north', 'SN-A', 'active'),
		(3, 'north', 'SN-C', 'decommissioned'),
		(4, 'south', 'SN-D', 'active')`);
});

beforeEach(() => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenantOf("north");
	requested.mockClear();
	refreshAll.mockClear();
});

describe("bulkChange", () => {
	test("changes each of the tenant's records in order of their label", async () => {
		const seen: unknown[] = [];
		const result = await bulkChange(
			{ ids: [1, 2, 3] },
			{
				table: equipment,
				label: equipment.serialNumber,
				columns: { status: equipment.status },
				change: async (unit) => void seen.push(unit),
			},
		);
		expect(seen).toEqual([
			{ id: 2, label: "SN-A", status: "active" },
			{ id: 1, label: "SN-B", status: "active" },
			{ id: 3, label: "SN-C", status: "decommissioned" },
		]);
		expect(result).toEqual({ done: 3, skipped: [], missing: 0 });
	});

	test("doesn't find another tenant's records, or ones that don't exist", async () => {
		const seen: number[] = [];
		const result = await bulkChange(
			{ ids: [1, 4, 99] },
			{
				table: equipment,
				label: equipment.serialNumber,
				change: async (unit) => void seen.push(unit.id),
			},
		);
		expect(seen).toEqual([1]);
		expect(result).toEqual({ done: 1, skipped: [], missing: 2 });
	});

	test("skips what the change refuses, with the reason and the record's label", async () => {
		const result = await bulkChange(
			{ ids: [1, 2] },
			{
				table: equipment,
				label: equipment.serialNumber,
				change: async (unit) => {
					if (unit.id === 1) invalid("Still in use");
				},
			},
		);
		expect(result).toEqual({
			done: 1,
			skipped: [{ label: "SN-B", reason: "Still in use" }],
			missing: 0,
		});
	});

	test("takes the ids matching a list's filters, if it has such a query", async () => {
		const matching = vi.fn(async () => [2, 3]);
		const seen: number[] = [];
		const result = await bulkChange(
			{ matching: "status=active" },
			{
				table: equipment,
				label: equipment.serialNumber,
				matching,
				change: async (unit) => void seen.push(unit.id),
			},
		);
		expect(matching).toHaveBeenCalledWith("status=active", expect.any(Number));
		expect(seen).toEqual([2, 3]);
		expect(result.done).toBe(2);
	});

	test("refuses a list's filters when the table has no such query", async () => {
		const attempt = bulkChange(
			{ matching: "status=active" },
			{ table: equipment, label: equipment.serialNumber, change: async () => {} },
		);
		await expect(attempt).rejects.toMatchObject({ status: 400 });
	});

	test("refuses outside a tenant", async () => {
		delete locals.tenant;
		const attempt = bulkChange(
			{ ids: [1] },
			{ table: equipment, label: equipment.serialNumber, change: async () => {} },
		);
		await expect(attempt).rejects.toMatchObject({ status: 403 });
	});
});

describe("refreshRequested", () => {
	test("refreshes the requested pages of each query", async () => {
		const first = () => {};
		const second = () => {};
		await refreshRequested(first as never, second as never);
		expect(requested.mock.calls).toEqual([
			[first, REQUESTED_PAGES],
			[second, REQUESTED_PAGES],
		]);
		expect(refreshAll).toHaveBeenCalledTimes(2);
	});
});
