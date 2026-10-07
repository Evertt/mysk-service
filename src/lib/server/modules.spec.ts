import { expect, test, vi } from "vite-plus/test";

import { contracts } from "./contracts.ts";
import {
	enabledServerModules,
	type OrderFacts,
	orderSaved,
	type ServerModule,
	tagOrders,
} from "./modules.ts";

// The modules' server code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.js", () => ({ db: {} }));
vi.mock("$app/server", () => ({
	getRequestEvent: () => ({
		locals: {
			user: { id: "u1" },
			tenant: { organizationId: "north", roles: ["member"], modules: ["contracts"] },
		},
	}),
}));
const refreshed = vi.hoisted(() => [] as string[]);
vi.mock("#lib/components/contracts/coverage.remote.js", () => ({
	getOrderCoverage: (number: string) => ({ refresh: async () => void refreshed.push(number) }),
}));

const order = (id: number): OrderFacts => ({
	id,
	type: "repair",
	status: "quote",
	equipmentId: id,
	createdAt: new Date(2026, 9, 7),
});

test("only the enabled modules take part", () => {
	expect(enabledServerModules(["contracts"])).toEqual([contracts]);
	expect(enabledServerModules([])).toEqual([]);
	expect(enabledServerModules(["something-else"])).toEqual([]);
});

test("by default, the current tenant's modules take part", () => {
	expect(enabledServerModules()).toEqual([contracts]);
});

test("tags come from each module, in the modules' order, for the orders they name", async () => {
	const now = new Date(2026, 9, 7, 12);
	const asked: unknown[] = [];
	const first: ServerModule = {
		async tagOrders(orders, at) {
			asked.push(at);
			return new Map([[2, [{ label: "Late", tone: "danger" }]]]);
		},
	};
	const second: ServerModule = {
		async tagOrders() {
			return new Map([
				[1, [{ label: "Soon", tone: "warning" }]],
				[2, [{ label: "VIP", tone: "warning", detail: "Gold customer" }]],
			]);
		},
	};
	const pricesOnly: ServerModule = { adjustPrices: async () => new Map() };

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
		tagOrders: () => Promise.reject(new Error("Shouldn't be asked")),
	};
	expect(await tagOrders([], new Date(), [module])).toEqual([]);
});

test("a saved order lets the modules refresh what they show about it", () => {
	const saved: string[] = [];
	orderSaved("ORD-2026-00001", [{ orderSaved: (number) => void saved.push(number) }, {}]);
	expect(saved).toEqual(["ORD-2026-00001"]);
});

test("the contracts module refreshes the order's coverage", () => {
	orderSaved("ORD-2026-00002", enabledServerModules(["contracts"]));
	expect(refreshed).toEqual(["ORD-2026-00002"]);
});
