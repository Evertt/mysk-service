import { createClient } from "@libsql/client";
import { expect, test, vi } from "vite-plus/test";

import { drizzleQueued } from "./db/serialize.ts";
import {
	billableItems,
	enabledServerModules,
	type OrderFacts,
	orderCommitted,
	type ServerModule,
	tagOrders,
} from "./modules.ts";

// The modules' server code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({
	getRequestEvent: () => ({
		locals: {
			user: { id: "u1" },
			tenant: { organizationId: "north", roles: ["member"], modules: ["widgets"] },
		},
	}),
}));
// Made-up modules instead of the ones in `src/modules`.
const widgets = vi.hoisted(() => ({ id: "widgets", orders: {} }));
const gadgets = vi.hoisted(() => ({ id: "gadgets", orders: {} }));
vi.mock("./modules.gen.ts", () => ({ generatedServerModules: () => [gadgets, widgets] }));

/** Lets the promises that hooks run in settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve));

const order = (id: number): OrderFacts => ({
	id,
	type: "repair",
	status: "quote",
	equipmentId: id,
	createdAt: new Date(2026, 9, 7),
});

test("only the enabled modules take part", () => {
	expect(enabledServerModules(["widgets"])).toEqual([widgets]);
	expect(enabledServerModules(["widgets", "gadgets"])).toEqual([gadgets, widgets]);
	expect(enabledServerModules([])).toEqual([]);
	expect(enabledServerModules(["something-else"])).toEqual([]);
});

test("by default, the current tenant's modules take part", () => {
	expect(enabledServerModules()).toEqual([widgets]);
});

test("tags come from each module, in the modules' order, for the orders they name", async () => {
	const now = new Date(2026, 9, 7, 12);
	const asked: unknown[] = [];
	const first: ServerModule = {
		orders: {
			async tag(orders, at) {
				asked.push(at);
				return new Map([[2, [{ label: "Late", tone: "danger" }]]]);
			},
		},
	};
	const second: ServerModule = {
		orders: {
			async tag() {
				return new Map([
					[1, [{ label: "Soon", tone: "warning" }]],
					[2, [{ label: "VIP", tone: "warning", detail: "Gold customer" }]],
				]);
			},
		},
	};
	const pricesOnly: ServerModule = { orders: { adjustPrices: async () => new Map() } };

	expect(await tagOrders([order(1), order(2), order(3)], now, [first, pricesOnly, second])).toEqual(
		[
			[{ label: "Soon", tone: "warning" }],
			[
				{ label: "Late", tone: "danger" },
				{ label: "VIP", tone: "warning", detail: "Gold customer" },
			],
			[],
		],
	);
	expect(asked).toEqual([now]);
});

test("no orders, no questions", async () => {
	const module: ServerModule = {
		orders: { tag: () => Promise.reject(new Error("Shouldn't be asked")) },
	};
	expect(await tagOrders([], new Date(), [module])).toEqual([]);
});

test("a saved order lets the modules refresh what they show about it, in the modules' order", async () => {
	const saved: string[] = [];
	orderCommitted({ number: "ORD-2026-00001" }, [
		{ orders: { committed: ({ number }) => void saved.push(`first ${number}`) } },
		{},
		{ orders: { committed: async ({ number }) => void saved.push(`second ${number}`) } },
	]);
	await flush();
	expect(saved).toEqual(["first ORD-2026-00001", "second ORD-2026-00001"]);
});

test("a module that fails to refresh is logged, and doesn't stop the others", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		const saved: string[] = [];
		orderCommitted({ number: "ORD-2026-00001" }, [
			{
				orders: {
					committed: () => {
						throw new Error("Broken");
					},
				},
			},
			{ orders: { committed: ({ number }) => void saved.push(number) } },
		]);
		await flush();
		expect(saved).toEqual(["ORD-2026-00001"]);
		expect(log).toHaveBeenCalledOnce();
	} finally {
		log.mockRestore();
	}
});

test("the modules are told once the transaction has committed, and not when it rolls back", async () => {
	const base = createClient({ url: ":memory:" });
	const queued = drizzleQueued(base);
	const saved: string[] = [];
	const modules = [
		{ orders: { committed: ({ number }: { number: string }) => void saved.push(number) } },
	];

	await queued.transaction(async () => {
		orderCommitted({ number: "ORD-2026-00001" }, modules);
		expect(saved).toEqual([]);
	});
	expect(saved).toEqual(["ORD-2026-00001"]);

	await queued
		.transaction(async () => {
			orderCommitted({ number: "ORD-2026-00002" }, modules);
			throw new Error("Changed my mind");
		})
		.catch(() => {});
	expect(saved).toEqual(["ORD-2026-00001"]);
});

test("billable items come from each module that has any, by date", async () => {
	const period = { from: new Date(2026, 0, 1), until: new Date(2026, 9, 7) };
	const asked: unknown[] = [];
	const item = (reference: string, date: Date) => ({
		reference,
		description: reference,
		quantity: 1,
		unitPrice: 100,
		date,
	});
	const fees: ServerModule = {
		billing: {
			async billableItems(customerId, at) {
				asked.push([customerId, at]);
				return [item("fees:2", new Date(2026, 8, 1)), item("fees:1", new Date(2026, 7, 1))];
			},
		},
	};
	const rentals: ServerModule = {
		billing: { billableItems: async () => [item("rentals:1", new Date(2026, 7, 15))] },
	};
	const items = await billableItems(7, period, [fees, {}, rentals]);
	expect(items.map((i) => i.reference)).toEqual(["fees:1", "rentals:1", "fees:2"]);
	expect(asked).toEqual([[7, period]]);
	expect(await billableItems(7, period, [{}])).toEqual([]);
});
