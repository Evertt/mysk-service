import { createClient } from "@libsql/client";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
	defineCollector,
	defineEvent,
	defineSaveHook,
	defineVote,
} from "#lib/extensions/define.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import { drizzleQueued } from "#lib/server/db/serialize.ts";
import {
	collect,
	collectNow,
	contribute,
	defineServerModule,
	emit,
	save,
	type ServerModule,
	vote,
} from "#lib/server/extensions.ts";

// The kernel's default tenant needs a request; these tests pass the modules that are on.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
// Made-up modules `a`, `b` and `c` instead of the ones in `src/modules`, in this registry order.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));
// The app's module ids are the made-up ones too, so a point named `a.…` is owned by module `a`
// (`test.…` is no module's: the core's).
vi.mock("#lib/modules/ids.gen.ts", () => {
	const node = { requires: [], enhances: [], alwaysOn: false };
	const ids = ["a", "b", "c", "faulty"] as const;
	return {
		generatedModuleIds: ids,
		generatedModuleGraph: Object.fromEntries(ids.map((id) => [id, node])),
	};
});

afterEach(() => vi.restoreAllMocks());

const point = defineCollector<number, string>("test.point", { onError: "fail" });
const skipping = defineCollector<number, string>("test.skipping", { onError: "skip" });
const failing = defineCollector<number, string>("test.failing", { onError: "fail" });
const immediate = defineCollector<number, string>("test.immediate", { onError: "fail", now: true });
const lenient = defineCollector<number, string>("test.lenient", { onError: "skip", now: true });
const voting = defineVote<number>("test.voting");
const happened = defineEvent<string>("test.happened");
const saving = defineSaveHook<{ saved: string[]; refuse: string[] }, string>("test.saving");
// Points that module `a` owns, which `b` enhances.
const offered = defineCollector<number, string>("a.offered", { onError: "fail" });
const announced = defineEvent<string>("a.announced");
const allowed = defineVote<number>("a.allowed");

const broken = (id: string) => () => Promise.reject(new Error(`${id} is broken`));
const told: string[] = [];

/** A made-up module (`ModuleId` only knows the real ones). */
const fake = (id: string, contributions: Parameters<typeof defineServerModule>[1]) =>
	defineServerModule(id as ModuleId, contributions);

registry.modules = [
	fake("a", [
		contribute(point, async (n) => `a:${n}`),
		contribute(skipping, async (n) => `a:${n}`),
		contribute(immediate, (n) => `a:${n}`),
		contribute(lenient, (n) => `a:${n}`),
		contribute(failing, async (n) => `a:${n}`),
		contribute(voting, async () => undefined),
		contribute(happened, (what) => void told.push(`a ${what}`)),
		contribute(saving, async ({ saved, refuse }) => {
			saved.push("a");
			return refuse.includes("a") ? ["a refuses"] : undefined;
		}),
	]),
	fake("b", [
		contribute(skipping, broken("b")),
		contribute(immediate, () => {
			throw new Error("b is broken");
		}),
		// Not at once: a mistake the type check refuses, so it's cast here.
		contribute(lenient, (async () => "b") as unknown as (n: number) => string),
		contribute(failing, broken("b")),
		contribute(voting, async (n) => (n > 0 ? "b refuses" : undefined)),
		contribute(offered, async (n) => `b:${n}`),
		contribute(announced, (what) => void told.push(`b ${what}`)),
		contribute(allowed, async () => "b refuses"),
	]),
	fake("c", [
		contribute(point, async (n) => `c:${n}`),
		contribute(immediate, (n) => `c:${n}`),
		contribute(voting, async () => undefined),
		contribute(happened, async (what) => void told.push(`c ${what}`)),
		contribute(saving, async ({ saved, refuse }) => {
			saved.push("c");
			return refuse.includes("c") ? ["c refuses", "c refuses again"] : [];
		}),
	]),
];

test("collect asks the modules that are on, in registry order", async () => {
	expect(await collect(point, 1, ["c", "a"])).toEqual(["a:1", "c:1"]);
});

test("collectNow answers at once, in registry order", () => {
	expect(collectNow(immediate, 1, ["c", "a"])).toEqual(["a:1", "c:1"]);
	expect(() => collectNow(immediate, 1, ["a", "b"])).toThrow("b is broken");
});

test("an immediate skip collector leaves out a module that answers with a promise", () => {
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	expect(collectNow(lenient, 1, ["a", "b"])).toEqual(["a:1"]);
	expect(String(errors.mock.calls[0])).toContain("with a promise");
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

test("save lets the modules that are on save their part, one after another", async () => {
	const input = { saved: [] as string[], refuse: [] as string[] };
	expect(await save(saving, input, ["c", "b", "a"])).toEqual([]);
	expect(input.saved).toEqual(["a", "c"]);
});

test("save stops at the first module that answers problems", async () => {
	const first = { saved: [] as string[], refuse: ["a", "c"] };
	expect(await save(saving, first, ["a", "c"])).toEqual(["a refuses"]);
	expect(first.saved).toEqual(["a"]);
	const later = { saved: [] as string[], refuse: ["c"] };
	expect(await save(saving, later, ["a", "c"])).toEqual(["c refuses", "c refuses again"]);
	// Not asked while off.
	expect(await save(saving, { saved: [], refuse: ["c"] }, ["a"])).toEqual([]);
});

test("a module's point isn't dispatched while its owner is off", async () => {
	expect(await collect(offered, 1, ["b"])).toEqual([]);
	expect(await vote(allowed, 1, ["b", "c"])).toEqual([]);
	told.length = 0;
	emit(announced, "news", ["b"]);
	await new Promise((resolve) => setTimeout(resolve));
	expect(told).toEqual([]);

	expect(await collect(offered, 1, ["a", "b"])).toEqual(["b:1"]);
	expect(await vote(allowed, 1, ["a", "b"])).toEqual(["b refuses"]);
	emit(announced, "news", ["a", "b"]);
	await new Promise((resolve) => setTimeout(resolve));
	expect(told).toEqual(["b news"]);
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
