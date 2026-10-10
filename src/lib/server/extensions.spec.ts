import { createClient } from "@libsql/client";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { defineCollector, defineEvent, defineVote } from "#lib/extensions/define.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import { drizzleQueued } from "#lib/server/db/serialize.ts";

import {
	collect,
	contribute,
	defineServerModule,
	emit,
	type ServerModule,
	vote,
} from "./extensions.ts";

// The kernel's default tenant needs a request; these tests pass the modules that are on.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
// Made-up modules `a`, `b` and `c` instead of the ones in `src/modules`, in this registry order.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));

afterEach(() => vi.restoreAllMocks());

const point = defineCollector<number, string>("test.point", { onError: "fail" });
const skipping = defineCollector<number, string>("test.skipping", { onError: "skip" });
const failing = defineCollector<number, string>("test.failing", { onError: "fail" });
const voting = defineVote<number>("test.voting");
const happened = defineEvent<string>("test.happened");

const broken = (id: string) => () => Promise.reject(new Error(`${id} is broken`));
const told: string[] = [];

/** A made-up module (`ModuleId` only knows the real ones). */
const fake = (id: string, contributions: Parameters<typeof defineServerModule>[1]) =>
	defineServerModule(id as ModuleId, contributions);

registry.modules = [
	fake("a", [
		contribute(point, async (n) => `a:${n}`),
		contribute(skipping, async (n) => `a:${n}`),
		contribute(failing, async (n) => `a:${n}`),
		contribute(voting, async () => undefined),
		contribute(happened, (what) => void told.push(`a ${what}`)),
	]),
	fake("b", [
		contribute(skipping, broken("b")),
		contribute(failing, broken("b")),
		contribute(voting, async (n) => (n > 0 ? "b refuses" : undefined)),
	]),
	fake("c", [
		contribute(point, async (n) => `c:${n}`),
		contribute(voting, async () => undefined),
		contribute(happened, async (what) => void told.push(`c ${what}`)),
	]),
];

test("collect asks the modules that are on, in registry order", async () => {
	expect(await collect(point, 1, ["c", "a"])).toEqual(["a:1", "c:1"]);
});

test("a skip collector leaves out a module that throws, and logs it", async () => {
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	expect(await collect(skipping, 1, ["a", "b"])).toEqual(["a:1"]);
	expect(errors).toHaveBeenCalledOnce();
	expect(String(errors.mock.calls[0])).toContain("b");
	expect(String(errors.mock.calls[0])).toContain("test.skipping");
});

test("a fail collector rejects when a module throws", async () => {
	await expect(collect(failing, 1, ["a", "b"])).rejects.toThrow("b is broken");
});

test("a module that isn't on isn't asked", async () => {
	expect(await collect(point, 1, ["a"])).toEqual(["a:1"]);
	// `b` would fail it, but isn't on.
	expect(await collect(failing, 1, ["a", "c"])).toEqual(["a:1"]);
	expect(await collect(point, 1, [])).toEqual([]);
});

test("vote returns every refusal", async () => {
	expect(await vote(voting, 1, ["a", "b", "c"])).toEqual(["b refuses"]);
	expect(await vote(voting, 0, ["a", "b", "c"])).toEqual([]);
	expect(await vote(voting, 1, ["a", "c"])).toEqual([]);
});

test("emit runs after commit, in registry order", async () => {
	told.length = 0;
	const queued = drizzleQueued(createClient({ url: ":memory:" }));

	await queued.transaction(async () => {
		emit(happened, "saved", ["c", "b", "a"]);
		expect(told).toEqual([]);
	});
	expect(told).toEqual(["a saved", "c saved"]);

	await queued
		.transaction(async () => {
			emit(happened, "undone", ["a", "c"]);
			throw new Error("Changed my mind");
		})
		.catch(() => {});
	expect(told).toEqual(["a saved", "c saved"]);
});

test("a handler that throws is logged with its module, and the others still run", async () => {
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	const queued = drizzleQueued(createClient({ url: ":memory:" }));
	const ran: string[] = [];
	registry.modules = [
		fake("faulty", [
			contribute(happened, () => {
				throw new Error("Broken");
			}),
		]),
		fake("c", [contribute(happened, (what) => void ran.push(what))]),
	];

	await queued.transaction(async () => emit(happened, "saved", ["faulty", "c"]));
	expect(ran).toEqual(["saved"]);
	expect(errors).toHaveBeenCalledOnce();
	expect(String(errors.mock.calls[0])).toContain("faulty");
	expect(String(errors.mock.calls[0])).toContain("test.happened");
});
