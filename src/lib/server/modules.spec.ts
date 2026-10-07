import { expect, test, vi } from "vite-plus/test";

import { contracts } from "./contracts.ts";
import {
	billableItems,
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
vi.mock("#lib/components/invoicing/invoicing.remote.js", () => ({
	getOrderInvoice: (number: string) => ({
		refresh: async () => void refreshed.push(`invoice:${number}`),
	}),
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

test("the invoicing module refreshes the invoice card of a saved order", () => {
	orderSaved("ORD-2026-00003", enabledServerModules(["invoicing"]));
	expect(refreshed).toContain("invoice:ORD-2026-00003");
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
		async billableItems(customerId, at) {
			asked.push([customerId, at]);
			return [item("fees:2", new Date(2026, 8, 1)), item("fees:1", new Date(2026, 7, 1))];
		},
	};
	const rentals: ServerModule = {
		billableItems: async () => [item("rentals:1", new Date(2026, 7, 15))],
	};
	const items = await billableItems(7, period, [fees, {}, rentals]);
	expect(items.map((i) => i.reference)).toEqual(["fees:1", "rentals:1", "fees:2"]);
	expect(asked).toEqual([[7, period]]);
	expect(await billableItems(7, period, [{}])).toEqual([]);
});
