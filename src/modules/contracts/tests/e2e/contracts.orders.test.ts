/**
 * What contracts add to core's pages: an order's coverage card and SLA badge, the orders list's
 * badge, the dashboard's cards, a covered order's adjustment line, a unit's contracts, and a new
 * call-out's deadline through the order form. What the server decides (which contract covers an
 * order, the deadlines and their order, the prices everywhere and in the revenue, all of it gone
 * with the module off) is `../unit/server/orders.spec.ts`'s; South without the module is
 * `contracts.tenancy.test.ts`'s.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { cents, organizations, rows, useApp, value, quiet } from "#e2e/app.ts";
import { priceOf, pricedOrders } from "#e2e/contracts-helpers.ts";
import { addUnits } from "#e2e/orders-helpers.ts";

import {
	activeContract,
	type ActiveContract,
	type CallOut,
	callOuts,
	pageLocators,
	slaOf,
} from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { tableRows, card } = pageLocators(app);

/** North's orders matching `where`, with what goes into their price. */
const pricing = (where: string, args: (string | number)[] = []) =>
	pricedOrders(north.id, where, args);

const dateTime = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});
/** A deadline as shown, e.g. `7 Oct 2026, 14:05`. */
const formatDue = (seconds: number) => dateTime.format(new Date(seconds * 1000));
const levelLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** A North contract that is active today, one of its units, and its customer. */
let busy: ActiveContract;
/** A North unit covered by an active premium contract, with its customer and contract. */
let premium: { id: number; customer_id: number; number: string; response_hours: number };

beforeAll(async () => {
	busy = await activeContract();
	[premium] = await rows<typeof premium>(
		`select e.id, e.customer_id, k.number, k.response_hours from contract k
		 join contract_equipment ce on ce.contract_id = k.id join equipment e on e.id = ce.equipment_id
		 where k.organization_id = ? and k.level = 'premium' and e.status != 'decommissioned'
		 and k.starts_on <= date('now', 'localtime') and k.ends_on >= date('now', 'localtime') order by k.id, e.id limit 1`,
		[north.id],
	);
});

describe("in North, contracts count on orders", () => {
	/** The seeded call-outs that are overdue and at risk (see the seed). */
	let overdue: CallOut;
	let atRisk: CallOut;

	beforeAll(async () => {
		const waiting = await callOuts();
		overdue = waiting.find((callOut) => slaOf(callOut) === "overdue")!;
		atRisk = waiting.find((callOut) => slaOf(callOut) === "at_risk")!;
	});

	/** The badges next to the order's title. */
	const badges = () => app.page.locator('h1 ~ [data-slot="badge"]').allInnerTexts();

	test("an overdue call-out shows its contract, deadline and badge, and one at risk says so", async () => {
		expect(overdue).toBeDefined();
		await app.go(`/orders/${overdue.number}`);
		expect(await badges()).toContain("SLA overdue");
		const coverage = card("Service contract");
		const text = await coverage.innerText();
		expect(text).toContain(`Covered by ${overdue.contract} (${levelLabel(overdue.level)})`);
		expect(text).toContain(`· respond by ${formatDue(overdue.due)}`);
		expect(await coverage.locator('[data-slot="badge"]').allInnerTexts()).toEqual(["Overdue"]);
		expect(await coverage.getByRole("link", { name: overdue.contract }).count()).toBe(1);

		// One at risk says so.
		expect(atRisk).toBeDefined();
		await app.go(`/orders/${atRisk.number}`);
		expect(await badges()).toContain("SLA at risk");
		const atRiskCoverage = card("Service contract");
		expect(await atRiskCoverage.innerText()).toContain(`· respond by ${formatDue(atRisk.due)}`);
		expect(await atRiskCoverage.locator('[data-slot="badge"]').allInnerTexts()).toEqual([
			"At risk",
		]);
	});

	test("the orders table shows the badge", async () => {
		await app.go("/orders");
		await app.page.getByLabel("Search orders…").fill(overdue.number);
		await app.tableSettled();
		await expect.poll(() => app.rowCount()).toBe(1);
		expect(await tableRows().first().locator('[data-slot="badge"]').allInnerTexts()).toContain(
			"SLA overdue",
		);
	});

	test("the dashboard lists the call-outs at risk or overdue, and the contracts ending soon", async () => {
		await app.go("/");
		const listed = card("Response times at risk").locator('a[href^="/orders/"]');
		await expect.poll(() => listed.allInnerTexts()).toContain(overdue.number);
		const ending = card("Contracts ending soon").locator('a[href^="/contracts/CTR-"]');
		await expect.poll(() => ending.count()).toBeGreaterThan(0);
	});

	test("a covered order shows what its contract includes, on its page", async () => {
		// A premium-covered repair with both labour and materials.
		const [order] = await pricing(
			`c.level = 'premium' and o.type = 'repair' and o.labor_hours > 0
			 and exists (select 1 from order_line l where l.order_id = o.id)`,
		);
		const price = priceOf(order);
		await app.go(`/orders/${order.number}`);
		const lines = card("Materials and labour");
		const adjustment = lines.locator("tbody tr", { hasText: "Covered by" });
		expect(await adjustment.innerText()).toContain(
			`Covered by ${order.contract} (Premium)\nLabour and materials included`,
		);
		expect(cents(await adjustment.locator("td").last().innerText())).toBe(-price.included);
		expect(cents(await lines.locator("tfoot td").last().innerText())).toBe(price.total);
	});

	test("a unit's page lists the contracts covering it, with their level and end", async () => {
		const [unit] = await rows<{ serial_number: string }>(
			`select serial_number from equipment where id = ?`,
			[busy.equipment_id],
		);
		const covering = await rows<{ number: string; level: string; ends_on: string }>(
			`select k.number, k.level, k.ends_on from contract_equipment ce
			 join contract k on k.id = ce.contract_id where ce.equipment_id = ? order by k.starts_on desc`,
			[busy.equipment_id],
		);
		await app.go(`/equipment/${encodeURIComponent(unit.serial_number)}`);
		const contracts = card("Service contracts");
		const items = contracts.locator("li");
		// The card is the contracts module's part of the page, which comes with its own query.
		await expect
			.poll(() => items.locator('a[href^="/contracts/"]').allInnerTexts())
			.toEqual(covering.map((row) => row.number));
		const date = new Intl.DateTimeFormat("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
		for (const [i, row] of covering.entries()) {
			const text = await items.nth(i).innerText();
			expect(text).toContain(levelLabel(row.level));
			expect(text).toContain(date.format(Temporal.PlainDate.from(row.ends_on)));
		}
	});

	test("a new call-out on a covered unit gets the contract's deadline, met once scheduled", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await page.getByLabel("Customer").selectOption(String(premium.customer_id));
		await addUnits(app, { id: premium.id });
		await page.getByLabel("Type").selectOption("repair");
		await page.getByLabel("Description").fill("Pressure drops overnight (test call-out)");
		await page.getByLabel("Labour (hours)").fill("1.5");
		await page.getByRole("button", { name: "Add material" }).click();
		await page.locator("tbody tr").last().getByLabel("Material").selectOption({ index: 1 });
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await quiet(page);
		await app.toast("Order created");
		const number = app.path().split("/").pop()!;

		const createdAt = await value<number>(
			`select created_at from "order" where number = ? and organization_id = ?`,
			[number, north.id],
		);
		const coverage = card("Service contract");
		const text = await coverage.innerText();
		expect(text).toContain(`Covered by ${premium.number} (Premium)`);
		expect(text).toContain(`· respond by ${formatDue(createdAt + premium.response_hours * 3600)}`);
		expect(await coverage.locator('[data-slot="badge"]').allInnerTexts()).toEqual(["On track"]);
		expect(await badges()).not.toContainEqual(expect.stringMatching(/^SLA/));
		// Premium: labour and materials included, so nothing to pay.
		const lines = card("Materials and labour");
		expect(cents(await lines.locator("tfoot td").last().innerText())).toBe(0);

		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await quiet(page);
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByLabel("Engineer").selectOption({ index: 1 });
		await page.getByLabel("Scheduled for").fill(new Date().toISOString().slice(0, 10));
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await quiet(page);
		await expect
			.poll(() => card("Service contract").locator('[data-slot="badge"]').allInnerTexts())
			.toEqual(["Responded"]);

		// As it was, for the files after this one on its database.
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
	});
});
