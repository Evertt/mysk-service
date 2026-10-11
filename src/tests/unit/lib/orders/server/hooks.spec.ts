import { expect, test, vi } from "vite-plus/test";

import type { ModuleId } from "#lib/modules/ids.ts";
import { committed, type OrderFacts, tag } from "#lib/orders/extensions.ts";
import { orderCommitted, tagOrders } from "#lib/orders/server/hooks.ts";
import { contribute, defineServerModule, type ServerModule } from "#lib/server/extensions.ts";

// The modules' server code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({
	getRequestEvent: () => ({
		locals: {
			user: { id: "u1" },
			tenant: { organizationId: "north", roles: ["member"], modules: ["late"] },
		},
	}),
}));
// Made-up modules instead of the ones in `src/modules`, in this registry order.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));

const order = (id: number): OrderFacts => ({
	id,
	type: "repair",
	status: "quote",
	equipmentId: id,
	createdAt: new Date(2026, 9, 7),
});

const asked: unknown[] = [];
const saved: string[] = [];
registry.modules = [
	defineServerModule("late" as ModuleId, [
		contribute(tag, async ({ now }) => {
			asked.push(now);
			return new Map([[2, [{ label: "Late", tone: "danger" }]]]);
		}),
		contribute(committed, ({ number }) => void saved.push(`late ${number}`)),
	]),
	defineServerModule("broken" as ModuleId, [
		contribute(tag, () => Promise.reject(new Error("Broken"))),
	]),
	defineServerModule("vip" as ModuleId, [
		contribute(
			tag,
			async () =>
				new Map([
					[1, [{ label: "Soon", tone: "warning" }]],
					[2, [{ label: "VIP", tone: "warning", detail: "Gold customer" }]],
				]),
		),
		contribute(committed, async ({ number }) => void saved.push(`vip ${number}`)),
	]),
];

/** Lets the promises that hooks run in settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve));

test("tags come from each module, in the modules' order, for the orders they name", async () => {
	const now = new Date(2026, 9, 7, 12);
	expect(await tagOrders([order(1), order(2), order(3)], now, ["vip", "late"])).toEqual([
		[{ label: "Soon", tone: "warning" }],
		[
			{ label: "Late", tone: "danger" },
			{ label: "VIP", tone: "warning", detail: "Gold customer" },
		],
		[],
	]);
	expect(asked).toEqual([now]);
});

test("by default, the current tenant's modules tag", async () => {
	expect(await tagOrders([order(2)])).toEqual([[{ label: "Late", tone: "danger" }]]);
});

test("a module that fails to tag is left out, and logged", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		expect(await tagOrders([order(2)], new Date(), ["late", "broken"])).toEqual([
			[{ label: "Late", tone: "danger" }],
		]);
		expect(String(log.mock.calls[0])).toContain("broken");
	} finally {
		log.mockRestore();
	}
});

test("no orders, no questions", async () => {
	asked.length = 0;
	expect(await tagOrders([], new Date(), ["late"])).toEqual([]);
	expect(asked).toEqual([]);
});

test("a saved order lets the modules refresh what they show about it, in the modules' order", async () => {
	orderCommitted({ number: "ORD-2026-00001" }, ["vip", "broken", "late"]);
	await flush();
	expect(saved).toEqual(["late ORD-2026-00001", "vip ORD-2026-00001"]);
});
