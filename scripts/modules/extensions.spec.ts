import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import {
	type ExtensionPoint,
	extensionProblems,
	findPoints,
	renderColumnSql,
	renderContributions,
	renderFormParts,
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
				`export const saving = defineSaveHook<OrderSaving, OrderProblem>("orders.saving");`,
				`export const notAPoint = somethingElse("orders.nope");`,
			].join("\n"),
		);
		put(
			"src/modules/invoices/api/extensions.ts",
			[
				`export const billableItems = defineCollector<`,
				`\t{ customerId: number; period: BillingPeriod },`,
				`\tBillableItem[]`,
				`>("invoices.billableItems", { onError: "fail" });`,
			].join("\n"),
		);
		put("src/modules/invoices/extensions.ts", `export const x = defineSlot("invoices.x");`);
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
				id: "orders.saving",
				kind: "save",
				owner: "orders",
				file: orders,
				exportName: "saving",
			},
			{
				id: "invoices.billableItems",
				kind: "collector",
				owner: "invoices",
				file: "src/modules/invoices/api/extensions.ts",
				exportName: "billableItems",
			},
		]);
	});

	test("reads a list that takes columns", () => {
		put(
			"src/lib/equipment/extensions.ts",
			`export const listColumns = defineListColumns("equipment.list");`,
		);
		expect(findPoints(root)).toEqual([
			{
				id: "equipment.list",
				kind: "columns",
				owner: "equipment",
				file: "src/lib/equipment/extensions.ts",
				exportName: "listColumns",
			},
		]);
	});

	test("reads a form slot", () => {
		put(
			"src/lib/orders/extensions.ts",
			`export const form = defineFormSlot<{ order: { id: number } | undefined }>("orders.form");`,
		);
		expect(findPoints(root)).toEqual([
			{
				id: "orders.form",
				kind: "form",
				owner: "orders",
				file: "src/lib/orders/extensions.ts",
				exportName: "form",
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
		point("invoices.side", "slot", "invoices", "src/modules/invoices/api/extensions.ts", "side"),
	];
	const modules = [
		module("invoices", {
			slotFiles: ["slots/dashboard.cards/invoices.svelte"],
			bulkFiles: ["bulk-actions/orders.list.ts"],
		}),
		module("contracts", {
			enhances: ["invoices"],
			slotFiles: [
				"slots/dashboard.cards/contracts.svelte",
				"slots/invoices.side/fees.svelte",
				"slots/orders.detail.side/coverage.svelte",
			],
		}),
	];

	test("renders typed contributions in registry order", () => {
		const file = renderContributions(points, modules);
		expect(file).toContain(
			`slotContribution(ordersDetailSide, "contracts", "coverage", () => import("#modules/contracts/slots/orders.detail.side/coverage.svelte"))`,
		);
		const calls = [...file.matchAll(/^\t(\w+Contribution\(\w+, "[\w-]+"(?:, "[\w-]+")?)/gm)].map(
			(match) => match[1],
		);
		expect(calls).toEqual([
			`slotContribution(dashboardCards, "invoices", "invoices"`,
			`slotContribution(dashboardCards, "contracts", "contracts"`,
			`slotContribution(invoicesSide, "contracts", "fees"`,
			`slotContribution(ordersDetailSide, "contracts", "coverage"`,
			`bulkContribution(ordersList, "invoices"`,
		]);
		expect(file).toContain(
			`bulkContribution(ordersList, "invoices", () => import("#modules/invoices/bulk-actions/orders.list.ts"))`,
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
			`import { side as invoicesSide } from "#modules/invoices/api/extensions.ts";`,
		);
		expect(file).not.toContain("adjustPrices");
	});

	test("is valid and empty with no contributions", () => {
		const file = renderContributions(points, []);
		expect(file).toMatch(/^\/\/ Generated by scripts\/modules\.ts/);
		expect(file).toContain("export const slotContributions: readonly AnySlotContribution[] = [];");
		expect(file).toContain("export const bulkContributions: readonly AnyBulkContribution[] = [];");
		expect(file).toContain(
			"export const columnContributions: readonly ColumnsContribution[] = [];",
		);
		expect(file).not.toContain(`/extensions.ts"`);
	});
});

describe("a list's columns", () => {
	const listPoint = point(
		"equipment.list",
		"columns",
		"equipment",
		"src/lib/equipment/extensions.ts",
		"listColumns",
	);
	const both = {
		columnFiles: ["columns/equipment.list.ts"],
		serverColumnFiles: ["server/columns/equipment.list.ts"],
	};

	test("come in two halves, the definitions and their SQL, named after the list", () => {
		expect(extensionProblems([listPoint], [module("a", both)])).toEqual([]);
		expect(
			extensionProblems(
				[listPoint],
				[
					module("a", { columnFiles: ["columns/equipment.list.ts"] }),
					module("b", { serverColumnFiles: ["server/columns/equipment.list.ts"] }),
					module("c", {
						columnFiles: ["columns/equipment.list/x.ts"],
						serverColumnFiles: ["server/columns/equipment.list/x.ts"],
					}),
				],
			),
		).toEqual([
			"src/modules/a/columns/equipment.list.ts: its columns' SQL is missing, in server/columns/equipment.list.ts.",
			"src/modules/b/server/columns/equipment.list.ts: the columns it's the SQL of are missing, in columns/equipment.list.ts.",
			"src/modules/c/columns/equipment.list/x.ts: a list's columns are columns/<point id>.ts.",
			"src/modules/c/server/columns/equipment.list/x.ts: a list's columns' SQL is server/columns/<point id>.ts.",
		]);
	});

	test("go to a list that takes columns, whose owner the module may contribute to", () => {
		const points = [
			listPoint,
			point("equipment.detail.side", "slot", "equipment"),
			point("b.list", "columns", "b"),
		];
		expect(
			extensionProblems(points, [
				module("a", {
					columnFiles: ["columns/equipment.detail.side.ts", "columns/b.list.ts"],
					serverColumnFiles: [
						"server/columns/equipment.detail.side.ts",
						"server/columns/b.list.ts",
					],
				}),
				module("b"),
			]),
		).toEqual([
			"src/modules/a/columns/equipment.detail.side.ts: equipment.detail.side is a slot, not a list that takes columns.",
			"src/modules/a/columns/b.list.ts: a neither requires nor enhances b.",
		]);
	});

	test("are listed for the client, loaded per tenant, and for the server, imported", () => {
		const modules = [module("maintenance", both)];
		expect(renderContributions([listPoint], modules)).toContain(
			`columnsContribution(equipmentList, "maintenance", () => import("#modules/maintenance/columns/equipment.list.ts"))`,
		);
		const server = renderColumnSql([listPoint], modules);
		expect(server).toContain(
			`import { listColumns as equipmentList } from "#lib/equipment/extensions.ts";`,
		);
		expect(server).toContain(
			`import maintenanceEquipmentList from "#modules/maintenance/server/columns/equipment.list.ts";`,
		);
		expect(server).toContain(
			`{ module: "maintenance", point: equipmentList, columns: maintenanceEquipmentList },`,
		);
		expect(renderColumnSql([listPoint], [])).toContain("return [];");
	});
});

describe("a form's parts", () => {
	const formPoint = point("orders.form", "form", "orders", "src/lib/orders/extensions.ts", "form");
	const both = {
		slotFiles: ["slots/orders.form/lines.svelte"],
		formPartFiles: ["form-parts/orders.form.ts"],
	};

	test("come with the schema of the module's part, named after the form", () => {
		expect(extensionProblems([formPoint], [module("a", both)])).toEqual([]);
		expect(
			extensionProblems(
				[formPoint],
				[
					module("a", { slotFiles: ["slots/orders.form/lines.svelte"] }),
					module("b", { formPartFiles: ["form-parts/orders.form.ts"] }),
					module("c", { ...both, formPartFiles: ["form-parts/orders.form/x.ts"] }),
				],
			),
		).toEqual([
			"src/modules/a/slots/orders.form/lines.svelte: its part's schema is missing, in form-parts/orders.form.ts.",
			"src/modules/b/form-parts/orders.form.ts: no component renders the part, in slots/orders.form/<name>.svelte.",
			"src/modules/c/form-parts/orders.form/x.ts: a form's part's schema is form-parts/<point id>.ts.",
			"src/modules/c/slots/orders.form/lines.svelte: its part's schema is missing, in form-parts/orders.form.ts.",
		]);
	});

	test("go to a form slot, whose owner the module may contribute to", () => {
		const points = [
			formPoint,
			point("orders.detail.side", "slot", "orders"),
			point("b.form", "form", "b"),
		];
		expect(
			extensionProblems(points, [
				module("a", {
					slotFiles: ["slots/orders.detail.side/x.svelte", "slots/b.form/x.svelte"],
					formPartFiles: ["form-parts/orders.detail.side.ts", "form-parts/b.form.ts"],
					bulkFiles: ["bulk-actions/orders.form.ts"],
				}),
				module("b"),
			]),
		).toEqual([
			"src/modules/a/slots/b.form/x.svelte: a neither requires nor enhances b.",
			"src/modules/a/bulk-actions/orders.form.ts: orders.form is a form slot, not a bulk table.",
			"src/modules/a/form-parts/orders.detail.side.ts: orders.detail.side is a slot, not a form slot.",
			"src/modules/a/form-parts/b.form.ts: a neither requires nor enhances b.",
		]);
	});

	test("are listed with their schema's type for the client, and imported for the forms' schemas", () => {
		const customers = point(
			"customers.form",
			"form",
			"customers",
			"src/lib/customers/extensions.ts",
			"form",
		);
		const modules = [module("materials", both), module("my-module", both)];
		const contributions = renderContributions([formPoint, customers], modules);
		expect(contributions).toContain(
			`import type materialsOrdersFormPart from "#modules/materials/form-parts/orders.form.ts";`,
		);
		expect(contributions).toContain(
			`formSlotContribution<typeof ordersForm, typeof materialsOrdersFormPart>(ordersForm, "materials", "lines", () => import("#modules/materials/slots/orders.form/lines.svelte"))`,
		);
		expect(contributions).toContain(
			`import { form as ordersForm } from "#lib/orders/extensions.ts";`,
		);

		const parts = renderFormParts([formPoint, customers], modules);
		expect(parts).toMatch(/^\/\/ Generated by scripts\/modules\.ts/);
		expect(parts).toContain(
			`import materialsOrdersFormPart from "#modules/materials/form-parts/orders.form.ts";`,
		);
		expect(parts).toContain(
			`import myModuleOrdersFormPart from "#modules/my-module/form-parts/orders.form.ts";`,
		);
		// By the key its fields are under: the id in camel case (`formPartKey()`).
		expect(parts).toContain(
			`"orders.form": { "materials": materialsOrdersFormPart, "myModule": myModuleOrdersFormPart },`,
		);
		expect(parts).toContain(`"customers.form": {},`);
		expect(renderFormParts([], [])).toContain("export const formParts = {};");
	});
});
