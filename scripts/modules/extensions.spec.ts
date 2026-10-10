import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import {
	type ExtensionPoint,
	extensionProblems,
	findPoints,
	renderContributions,
} from "./extensions.ts";
import { module } from "./test-helpers.ts";

/** A made-up point, declared in its owner's core `extensions.ts` unless a file is named. */
const point = (
	id: string,
	kind: ExtensionPoint["kind"],
	owner: string,
	file = `src/lib/${owner}/extensions.ts`,
	exportName = id.split(".").at(-1) ?? id,
): ExtensionPoint => ({ id, kind, owner, file, exportName });

describe("findPoints", () => {
	let root: string;
	const put = (path: string, content: string) => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	};
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "extensions-spec-"));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	test("reads the points that core's domains and the modules' APIs declare", () => {
		put(
			"src/lib/orders/extensions.ts",
			[
				`/** E.g. \`export const x = defineSlot<{}>("orders.example")\`. */`,
				`import { defineCollector, defineSlot } from "#lib/extensions/define.ts";`,
				`export const detailSide = defineSlot<{ number: string }>("orders.detail.side");`,
				`export const list = defineBulkTable<OrderBulkRow>('orders.list');`,
				`export const adjustPrices = defineCollector<PricedOrderFacts[], Map<number, PriceAdjustment[]>>(`,
				`\t"orders.adjustPrices",`,
				`\t{ onError: "fail" },`,
				`);`,
				`// export const old = defineEvent("orders.old");`,
				`export const committed = defineEvent<OrderChange>("orders.committed");`,
				`export const refuseDelete = defineVote<{ f: (x: number) => void }>("orders.refuseDelete");`,
				`export const notAPoint = somethingElse("orders.nope");`,
			].join("\n"),
		);
		put(
			"src/modules/invoicing/api/extensions.ts",
			[
				`export const billableItems = defineCollector<`,
				`\t{ customerId: number; period: BillingPeriod },`,
				`\tBillableItem[]`,
				`>("invoicing.billableItems", { onError: "fail" });`,
			].join("\n"),
		);
		put("src/modules/invoicing/extensions.ts", `export const x = defineSlot("invoicing.x");`);
		put("src/lib/orders/other.ts", `export const x = defineSlot("orders.other");`);

		const orders = "src/lib/orders/extensions.ts";
		expect(findPoints(root)).toEqual([
			{
				id: "orders.detail.side",
				kind: "slot",
				owner: "orders",
				file: orders,
				exportName: "detailSide",
			},
			{ id: "orders.list", kind: "bulk", owner: "orders", file: orders, exportName: "list" },
			{
				id: "orders.adjustPrices",
				kind: "collector",
				owner: "orders",
				file: orders,
				exportName: "adjustPrices",
			},
			{
				id: "orders.committed",
				kind: "event",
				owner: "orders",
				file: orders,
				exportName: "committed",
			},
			{
				id: "orders.refuseDelete",
				kind: "vote",
				owner: "orders",
				file: orders,
				exportName: "refuseDelete",
			},
			{
				id: "invoicing.billableItems",
				kind: "collector",
				owner: "invoicing",
				file: "src/modules/invoicing/api/extensions.ts",
				exportName: "billableItems",
			},
		]);
	});

	test("finds nothing without extensions files", () => {
		expect(findPoints(root)).toEqual([]);
	});
});

describe("extensionProblems", () => {
	test("a point's id starts with its owner", () => {
		expect(
			extensionProblems(
				[point("orders.detail.side", "slot", "orders"), point("x.y", "slot", "orders")],
				[],
			),
		).toEqual([
			"src/lib/orders/extensions.ts declares x.y: an extension point's id starts with its owner, orders.",
		]);
	});

	test("no two points have one id", () => {
		expect(
			extensionProblems(
				[
					point("orders.list", "bulk", "orders"),
					point("orders.list", "slot", "orders", "src/lib/orders/extensions.ts", "other"),
				],
				[],
			),
		).toEqual([
			"src/lib/orders/extensions.ts declares orders.list twice: an extension point's id is unique.",
		]);
	});

	test("a contribution names an existing point of its kind, whose owner it requires or enhances", () => {
		const modules = [
			module("a", {
				slotFiles: ["slots/b.side/x.svelte", "slots/nope/x.svelte"],
				bulkFiles: ["bulk-actions/orders.detail.side.ts"],
			}),
			module("b"),
		];
		expect(
			extensionProblems(
				[point("b.side", "slot", "b"), point("orders.detail.side", "slot", "orders")],
				modules,
			),
		).toEqual([
			"src/modules/a/slots/b.side/x.svelte: a neither requires nor enhances b.",
			"src/modules/a/slots/nope/x.svelte: there is no extension point nope.",
			"src/modules/a/bulk-actions/orders.detail.side.ts: orders.detail.side is a slot, not a bulk table.",
		]);
	});

	test("a module contributes to core's points, its own, and those of the modules it requires or enhances", () => {
		const points = [
			point("orders.list", "bulk", "orders"),
			point("orders.adjustPrices", "collector", "orders"),
			point("a.side", "slot", "a"),
			point("b.side", "slot", "b"),
			point("c.side", "slot", "c"),
		];
		const modules = [
			module("a", { slotFiles: ["slots/a.side/own.svelte"] }),
			module("b"),
			module("c"),
			module("d", {
				requires: ["b"],
				enhances: ["c"],
				slotFiles: ["slots/b.side/x.svelte", "slots/c.side/x.svelte"],
				bulkFiles: ["bulk-actions/orders.list.ts"],
			}),
			module("a2", { slotFiles: ["slots/a.side/x.svelte"] }),
		];
		expect(extensionProblems(points, modules)).toEqual([
			"src/modules/a2/slots/a.side/x.svelte: a2 neither requires nor enhances a.",
		]);
		expect(
			extensionProblems(points, [
				module("e", {
					slotFiles: ["slots/orders.adjustPrices/x.svelte"],
					bulkFiles: ["bulk-actions/orders.adjustPrices.ts"],
				}),
			]),
		).toEqual([
			"src/modules/e/slots/orders.adjustPrices/x.svelte: orders.adjustPrices is a collector, not a slot.",
			"src/modules/e/bulk-actions/orders.adjustPrices.ts: orders.adjustPrices is a collector, not a bulk table.",
		]);
	});

	test("contribution files are where their point's name says", () => {
		expect(
			extensionProblems(
				[point("orders.detail.side", "slot", "orders")],
				[
					module("a", {
						slotFiles: ["slots/loose.svelte", "slots/orders.detail.side/deep/x.svelte"],
						bulkFiles: ["bulk-actions/orders.list/x.ts"],
					}),
				],
			),
		).toEqual([
			"src/modules/a/slots/loose.svelte: a slot's component is slots/<point id>/<name>.svelte.",
			"src/modules/a/slots/orders.detail.side/deep/x.svelte: a slot's component is slots/<point id>/<name>.svelte.",
			"src/modules/a/bulk-actions/orders.list/x.ts: a table's bulk actions are bulk-actions/<point id>.ts.",
		]);
	});
});

describe("renderContributions", () => {
	const points = [
		point("dashboard.cards", "slot", "dashboard", "src/lib/dashboard/extensions.ts", "cards"),
		point("orders.detail.side", "slot", "orders", "src/lib/orders/extensions.ts", "detailSide"),
		point("orders.list", "bulk", "orders", "src/lib/orders/extensions.ts", "list"),
		point("orders.adjustPrices", "collector", "orders"),
		point("invoicing.side", "slot", "invoicing", "src/modules/invoicing/api/extensions.ts", "side"),
	];
	const modules = [
		module("invoicing", {
			slotFiles: ["slots/dashboard.cards/invoices.svelte"],
			bulkFiles: ["bulk-actions/orders.list.ts"],
		}),
		module("contracts", {
			enhances: ["invoicing"],
			slotFiles: [
				"slots/dashboard.cards/contracts.svelte",
				"slots/invoicing.side/fees.svelte",
				"slots/orders.detail.side/coverage.svelte",
			],
		}),
	];

	test("renders typed contributions in registry order", () => {
		const file = renderContributions(points, modules);
		expect(file).toContain(
			`slotContribution(ordersDetailSide, "contracts", "coverage", () => import("../../modules/contracts/slots/orders.detail.side/coverage.svelte"))`,
		);
		const calls = [...file.matchAll(/^\t(\w+Contribution\(\w+, "[\w-]+"(?:, "[\w-]+")?)/gm)].map(
			(match) => match[1],
		);
		expect(calls).toEqual([
			`slotContribution(dashboardCards, "invoicing", "invoices"`,
			`slotContribution(dashboardCards, "contracts", "contracts"`,
			`slotContribution(invoicingSide, "contracts", "fees"`,
			`slotContribution(ordersDetailSide, "contracts", "coverage"`,
			`bulkContribution(ordersList, "invoicing"`,
		]);
		expect(file).toContain(
			`bulkContribution(ordersList, "invoicing", () => import("../../modules/invoicing/bulk-actions/orders.list.ts"))`,
		);
	});

	test("imports the points it names from their owners", () => {
		const file = renderContributions(points, modules);
		expect(file).toContain(
			`import { cards as dashboardCards } from "#lib/dashboard/extensions.ts";`,
		);
		expect(file).toContain(
			`import { detailSide as ordersDetailSide, list as ordersList } from "#lib/orders/extensions.ts";`,
		);
		expect(file).toContain(
			`import { side as invoicingSide } from "#modules/invoicing/api/extensions.ts";`,
		);
		expect(file).not.toContain("adjustPrices");
	});

	test("is valid and empty with no contributions", () => {
		const file = renderContributions(points, []);
		expect(file).toMatch(/^\/\/ Generated by scripts\/modules\.ts/);
		expect(file).toContain("export const slotContributions: readonly AnySlotContribution[] = [];");
		expect(file).toContain("export const bulkContributions: readonly AnyBulkContribution[] = [];");
		expect(file).not.toContain(`/extensions.ts"`);
	});
});
