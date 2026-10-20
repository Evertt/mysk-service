import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { daily } from "#lib/jobs/extensions.ts";
import { currentTenant, inTenant, requireTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { contribute, defineServerModule, type ServerModule } from "#lib/server/extensions.ts";
import { mayRunDaily, runDaily } from "#lib/server/jobs/daily.ts";
import { day } from "#unit/temporal-support.ts";

// No request: a member's request would have a user; the daily run must not need one.
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
const env = vi.hoisted(() => ({
	CRON_SECRET: undefined as string | undefined,
	OPS_TOKEN: undefined as string | undefined,
}));
vi.mock(import("$app/env/private"), async (importOriginal) => ({
	...(await importOriginal()),
	get CRON_SECRET() {
		return env.CRON_SECRET;
	},
	get OPS_TOKEN() {
		return env.OPS_TOKEN;
	},
}));
// Made-up modules `a` and `b` instead of the ones in `src/modules`.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));
vi.mock("#lib/modules/ids.gen.ts", () => {
	const node = { requires: [], enhances: [], alwaysOn: false };
	const ids = ["a", "b"] as const;
	return {
		generatedModuleIds: ids,
		generatedModuleGraph: Object.fromEntries(ids.map((id) => [id, node])),
	};
});

// A temporary database with the organizations and the modules they have on.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "daily-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table organization (
			id text primary key, name text not null, slug text not null, logo text,
			created_at integer not null, metadata text
		);
		create table organization_module (
			organization_id text not null, module_id text not null, enabled_at integer not null
		);
		create table order_type_setting (
			organization_id text not null, type text not null, names text not null, hidden integer not null
		);
		insert into organization values ('north', 'North', 'north', null, 1, null);
		insert into organization values ('south', 'South', 'south', null, 2, null);
		insert into organization_module values ('north', 'a', 0), ('north', 'b', 0), ('south', 'b', 0);
		insert into order_type_setting values ('north', 'survey', '{"nl":"Offerte-opname"}', 0);
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

beforeEach(() => {
	registry.modules = [];
	env.CRON_SECRET = undefined;
	env.OPS_TOKEN = undefined;
});

describe("runDaily", () => {
	test("each organization's modules that are on do their job in it, as the system", async () => {
		const seen: unknown[] = [];
		registry.modules = [
			defineServerModule("a" as never, [
				contribute(daily, async ({ today }) => {
					const tenant = currentTenant();
					seen.push({
						module: "a",
						organization: tenant.organizationId,
						today,
						user: tenant.user.id,
					});
					// The tenant's scope works as in a member's request.
					expect(inTenant({ organizationId: {} as never })).toBeDefined();
					return { "a.done": 1 };
				}),
			]),
			defineServerModule("b" as never, [
				contribute(daily, async () => {
					seen.push({ module: "b", organization: requireTenant().organizationId });
					return { "b.done": 2 };
				}),
			]),
		];
		const results = await runDaily(day("2026-10-15"));
		expect(results).toEqual([
			{ organization: { id: "north", slug: "north" }, report: { "a.done": 1, "b.done": 2 } },
			{ organization: { id: "south", slug: "south" }, report: { "b.done": 2 } },
		]);
		expect(seen).toEqual(
			expect.arrayContaining([
				{ module: "a", organization: "north", today: day("2026-10-15"), user: "system" },
				{ module: "b", organization: "north" },
				{ module: "b", organization: "south" },
			]),
		);
		expect(seen).toHaveLength(3);
		// Outside the run, there's no tenant again.
		expect(() => requireTenant()).toThrow();
	});

	test("the jobs see the organization's order types as its members do", async () => {
		const seen = new Map<string, unknown>();
		registry.modules = [
			defineServerModule("b" as never, [
				contribute(daily, async () => {
					const { organizationId, orderTypes } = currentTenant();
					seen.set(organizationId, orderTypes);
					return {};
				}),
			]),
		];
		await runDaily(day("2026-10-15"));
		expect(Object.fromEntries(seen)).toEqual({
			north: { survey: { names: { nl: "Offerte-opname" }, hidden: false } },
			south: {},
		});
	});

	test("a job that fails is left out, and the others go on", async () => {
		registry.modules = [
			defineServerModule("a" as never, [
				contribute(daily, async () => {
					throw new Error("broken");
				}),
			]),
			defineServerModule("b" as never, [contribute(daily, async () => ({ "b.done": 1 }))]),
		];
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const results = await runDaily(day("2026-10-15"));
		expect(results.map((result) => result.report)).toEqual([{ "b.done": 1 }, { "b.done": 1 }]);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});

describe("mayRunDaily", () => {
	const request = (authorization?: string) =>
		new Request("http://localhost/_ops/daily", {
			headers: authorization ? { authorization } : {},
		});

	test("never without a token set", () => {
		expect(mayRunDaily(request())).toBe(false);
		expect(mayRunDaily(request("Bearer "))).toBe(false);
		expect(mayRunDaily(request("Bearer undefined"))).toBe(false);
	});

	test("with the cron secret or the ops token", () => {
		env.CRON_SECRET = "cron";
		env.OPS_TOKEN = "ops";
		expect(mayRunDaily(request("Bearer cron"))).toBe(true);
		expect(mayRunDaily(request("Bearer ops"))).toBe(true);
		expect(mayRunDaily(request("Bearer other"))).toBe(false);
		expect(mayRunDaily(request("cron"))).toBe(false);
	});
});
