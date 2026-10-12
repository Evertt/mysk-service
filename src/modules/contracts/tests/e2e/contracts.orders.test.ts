import { beforeAll, describe, expect, test } from "vite-plus/test";

import { cents, organizations, rows, useApp, value } from "#e2e/app.ts";
import { priceOf, pricedOrders } from "#e2e/contracts-helpers.ts";

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
		 and k.starts_on <= unixepoch() and k.ends_on + 86400 > unixepoch() order by k.id, e.id limit 1`,
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

	test("an overdue call-out shows its contract, deadline and badge", async () => {
		expect(overdue).toBeDefined();
		await app.go(`/orders/${overdue.number}`);
		expect(await badges()).toContain("SLA overdue");
		const coverage = card("Service contract");
		const text = await coverage.innerText();
		expect(text).toContain(`Covered by ${overdue.contract} (${levelLabel(overdue.level)})`);
		expect(text).toContain(`· respond by ${formatDue(overdue.due)}`);
		expect(await coverage.locator('[data-slot="badge"]').allInnerTexts()).toEqual(["Overdue"]);
		expect(await coverage.getByRole("link", { name: overdue.contract }).count()).toBe(1);
	});

	test("one at risk says so", async () => {
		expect(atRisk).toBeDefined();
		await app.go(`/orders/${atRisk.number}`);
		expect(await badges()).toContain("SLA at risk");
		const coverage = card("Service contract");
		expect(await coverage.innerText()).toContain(`· respond by ${formatDue(atRisk.due)}`);
		expect(await coverage.locator('[data-slot="badge"]').allInnerTexts()).toEqual(["At risk"]);
	});

	test("the orders table shows the same badges", async () => {
		const { page } = app;
		await app.go("/orders");
		for (const [callOut, badge] of [
			[overdue, "SLA overdue"],
			[atRisk, "SLA at risk"],
		] as const) {
			await page.getByLabel("Search orders…").fill(callOut.number);
			await app.tableSettled();
			await expect.poll(() => app.rowCount()).toBe(1);
			expect(await tableRows().first().locator('[data-slot="badge"]').allInnerTexts()).toContain(
				badge,
			);
		}
		await page.getByLabel("Search orders…").fill("");
		await app.tableSettled();
		await expect.poll(() => tableRows().count()).toBeGreaterThan(1);
		// The first page shows the latest orders: the call-outs among them that are overdue or at
		// risk have their badge (the at-risk one may be older than the first page's orders).
		const shown = await tableRows().locator('a[href^="/orders/"]').allInnerTexts();
		const urgent = (await callOuts()).filter(
			(callOut) => shown.includes(callOut.number) && slaOf(callOut) !== "on_track",
		);
		expect(urgent.length).toBeGreaterThan(0);
		await expect
			.poll(() => page.locator('[data-slot="badge"]', { hasText: /SLA (overdue|at risk)/ }).count())
			.toBeGreaterThanOrEqual(urgent.length);
	});

	test("the dashboard lists the call-outs at risk or overdue, most urgent first", async () => {
		await app.go("/");
		const expected = (await callOuts())
			.filter((callOut) => slaOf(callOut) !== "on_track")
			.map((callOut) => callOut.number);
		const listed = card("Response times at risk").locator('a[href^="/orders/"]');
		await expect.poll(() => listed.allInnerTexts()).toEqual(expected);
	});

	test("and the contracts ending in the next 60 days that weren't renewed", async () => {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
		const expected = await rows<{ number: string }>(
			`select number from contract k where organization_id = ? and starts_on <= unixepoch()
			 and ends_on >= ? and ends_on < ? and not exists (select 1 from contract later
			 where later.customer_id = k.customer_id and later.starts_on > k.ends_on)
			 order by ends_on, number`,
			[north.id, today.getTime() / 1000, horizon.getTime() / 1000],
		);
		expect(expected.length).toBeGreaterThan(0);
		const listed = card("Contracts ending soon").locator('a[href^="/contracts/CTR-"]');
		await expect.poll(() => listed.allInnerTexts()).toEqual(expected.map((row) => row.number));
	});

	test("the dashboard's revenue takes off what contracts include", async () => {
		const done = await pricing(`o.status in ('completed', 'invoiced') and o.completed_at >= ?`, [
			Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
		]);
		expect(done.some((order) => priceOf(order).included > 0)).toBe(true);
		const expected = done.reduce((sum, order) => sum + priceOf(order).total, 0);
		const revenue = app.page
			.getByText("Revenue, last 30 days", { exact: true })
			.locator("..")
			.locator('[data-slot="card-title"]');
		expect(cents(await revenue.innerText())).toBe(expected);
	});

	describe("a covered order shows what its contract includes, and its total agrees everywhere", () => {
		/**
		 * A premium-covered repair with both labour and materials, among its customer's ten latest
		 * orders (which their page lists), and its price.
		 */
		const covered = async () => {
			const [order] = await pricing(
				`c.level = 'premium' and o.type = 'repair' and o.labor_hours > 0
				 and exists (select 1 from order_line l where l.order_id = o.id)
				 and o.id in (select r.id from "order" r where r.customer_id = o.customer_id
				 order by r.created_at desc, r.id desc limit 10)`,
			);
			return { order, price: priceOf(order) };
		};

		// One test per page: the four of them took up half a test's time under the load of a full
		// run.
		test("on its page", async () => {
			const { order, price } = await covered();
			expect(price.included).toBe(order.materials + price.labor);
			await app.go(`/orders/${order.number}`);
			const lines = card("Materials and labour");
			const adjustment = lines.locator("tbody tr", { hasText: "Covered by" });
			expect(await adjustment.innerText()).toContain(
				`Covered by ${order.contract} (Premium)\nLabour and materials included`,
			);
			expect(cents(await adjustment.locator("td").last().innerText())).toBe(-price.included);
			expect(cents(await lines.locator("tfoot td").last().innerText())).toBe(price.total);
		});

		test("in the orders list", async () => {
			const { order, price } = await covered();
			await app.go("/orders");
			await app.page.getByLabel("Search orders…").fill(order.number);
			await expect.poll(() => app.rowCount()).toBe(1);
			expect(cents(await tableRows().first().locator("td:nth-last-child(2)").innerText())).toBe(
				price.total,
			);
		});

		test("in the unit's service history, with what the contract took off", async () => {
			const { page } = app;
			const { order, price } = await covered();
			await app.go(`/equipment/${encodeURIComponent(order.equipment!)}`);
			const entry = page
				.getByRole("list", { name: "Service history" })
				.locator(":scope > li")
				.filter({ has: page.getByRole("link", { name: order.number }) });
			expect(cents(await entry.locator('[data-cost="total"]').innerText())).toBe(price.total);
			const adjustments = entry.getByRole("list", { name: "Adjustments" });
			expect(await adjustments.innerText()).toContain(
				`Covered by ${order.contract} (Premium)\nLabour and materials included`,
			);
			expect(cents(await adjustments.locator('[data-cost="adjustment"]').innerText())).toBe(
				-price.included,
			);
		});

		test("in the customer's recent activity", async () => {
			const { page } = app;
			const { order, price } = await covered();
			await app.go(`/customers/${order.customer}`);
			const activity = page
				.getByRole("list", { name: "Recent activity" })
				.locator(":scope > li")
				.filter({ has: page.getByRole("link", { name: order.number }) });
			expect(cents(await activity.locator('[data-cost="total"]').innerText())).toBe(price.total);
		});
	});

	test("a standard contract includes the labour only", async () => {
		const [order] = await pricing(
			`c.level = 'standard' and o.labor_hours > 0
			 and exists (select 1 from order_line l where l.order_id = o.id)`,
		);
		const price = priceOf(order);
		await app.go(`/orders/${order.number}`);
		const lines = card("Materials and labour");
		const adjustment = lines.locator("tbody tr", { hasText: "Covered by" });
		expect(await adjustment.innerText()).toContain("Labour included");
		expect(cents(await adjustment.locator("td").last().innerText())).toBe(-price.labor);
		expect(cents(await lines.locator("tfoot td").last().innerText())).toBe(order.materials);
	});

	test("a unit's page lists the contracts covering it, with their level and end", async () => {
		const [unit] = await rows<{ serial_number: string }>(
			`select serial_number from equipment where id = ?`,
			[busy.equipment_id],
		);
		const covering = await rows<{ number: string; level: string; ends_on: number }>(
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
			expect(text).toContain(date.format(new Date(row.ends_on * 1000)));
		}
	});

	test("a new call-out on a covered unit gets the contract's deadline, met once scheduled", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await page.getByLabel("Customer").selectOption(String(premium.customer_id));
		await page.getByLabel("Equipment").selectOption(String(premium.id));
		await page.getByLabel("Type").selectOption("repair");
		await page.getByLabel("Description").fill("Pressure drops overnight (test call-out)");
		await page.getByLabel("Labour (hours)").fill("1.5");
		await page.getByRole("button", { name: "Add material" }).click();
		await page.locator("tbody tr").last().getByLabel("Material").selectOption({ index: 1 });
		const before = Math.floor(Date.now() / 1000);
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await page.waitForLoadState("networkidle");
		await app.toast("Order created");
		const number = app.path().split("/").pop()!;

		const [stored] = await rows<{ created_at: number }>(
			`select created_at from "order" where number = ? and organization_id = ?`,
			[number, north.id],
		);
		expect(stored.created_at).toBeGreaterThanOrEqual(before);
		const coverage = card("Service contract");
		const text = await coverage.innerText();
		expect(text).toContain(`Covered by ${premium.number} (Premium)`);
		expect(text).toContain(
			`· respond by ${formatDue(stored.created_at + premium.response_hours * 3600)}`,
		);
		expect(await coverage.locator('[data-slot="badge"]').allInnerTexts()).toEqual(["On track"]);
		expect(await badges()).not.toContainEqual(expect.stringMatching(/^SLA/));
		// Premium: labour and materials included, so nothing to pay.
		const [order] = await pricing(`o.number = ?`, [number]);
		expect(priceOf(order).total).toBe(0);
		const lines = card("Materials and labour");
		expect(cents(await lines.locator("tfoot td").last().innerText())).toBe(0);

		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByLabel("Engineer").selectOption({ index: 1 });
		await page.getByLabel("Scheduled for").fill(new Date().toISOString().slice(0, 10));
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await page.waitForLoadState("networkidle");
		await expect
			.poll(() => card("Service contract").locator('[data-slot="badge"]').allInnerTexts())
			.toEqual(["Responded"]);

		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		expect(
			await value(`select count(*) from "order" where number = ? and organization_id = ?`, [
				number,
				north.id,
			]),
		).toBe(0);
	});

	test("with the module switched off, orders are priced in full and nothing of it shows", async () => {
		const { page } = app;
		const [order] = await pricing(
			`c.level = 'premium' and o.labor_hours > 0
			 and exists (select 1 from order_line l where l.order_id = o.id)`,
		);
		await app.go("/settings");
		const row = page.locator("div.rounded-lg.border", { hasText: "Service contracts" });
		await row.getByRole("button", { name: "Disable" }).click();
		await row.getByText("Disabled").waitFor();

		await app.go(`/orders/${order.number}`);
		expect(await card("Service contract").count()).toBe(0);
		const lines = card("Materials and labour");
		expect(await lines.locator("tbody tr", { hasText: "Covered by" }).count()).toBe(0);
		expect(cents(await lines.locator("tfoot td").last().innerText())).toBe(
			order.materials + priceOf(order).labor,
		);
		await app.go(`/orders/${overdue.number}`);
		expect(await badges()).not.toContainEqual(expect.stringMatching(/^SLA/));
		await app.go(`/equipment/${encodeURIComponent(order.equipment!)}`);
		expect(await card("Service contracts").count()).toBe(0);
		await app.go("/orders");
		expect(
			// The page's rows (not the hidden ones that keep the columns wide, see `column-widths.svelte.ts`).
			await page
				.locator('[data-slot="table-body"] [data-slot="badge"]', {
					hasText: /SLA (overdue|at risk)/,
				})
				.count(),
		).toBe(0);
		await app.go("/");
		expect(await card("Response times at risk").count()).toBe(0);
		expect(await card("Contracts ending soon").count()).toBe(0);
	});

	// A test of its own, so that it switches the module back on for the tests after it (which share
	// the database) even when the one before ran out of time.
	test("switched on again, it shows again", async () => {
		const { page } = app;
		await app.go("/settings");
		const row = page.locator("div.rounded-lg.border", { hasText: "Service contracts" });
		await row.getByRole("button", { name: "Enable" }).click();
		await row.getByText(/Enabled since/).waitFor();
		await app.go(`/orders/${overdue.number}`);
		expect(await badges()).toContain("SLA overdue");
	});

	test("in Dutch, the contracts and materials pages are translated", async () => {
		const { page } = app;
		const locale = (value: string) =>
			page
				.context()
				.addCookies([{ name: "PARAGLIDE_LOCALE", value, url: new URL(page.url()).origin }]);
		await locale("nl");
		try {
			await app.go("/contracts");
			await page.getByRole("heading", { name: "Servicecontracten" }).waitFor();
			expect(await page.getByLabel("Contracten zoeken…").count()).toBe(1);
			expect(await page.getByRole("link", { name: "Nieuw contract" }).count()).toBe(1);

			await app.go(`/contracts/${busy.number}`);
			expect(await page.title()).toBe(`${busy.number} · Servicecontracten`);
			expect(await card("Gedekte apparatuur").count()).toBe(1);
			const terms = await card("Voorwaarden").innerText();
			expect(terms).toMatch(/\d+ (dag|dagen|maand|maanden|jaar)\b/);
			expect(terms).toMatch(/Binnen \d+ uur/);

			await app.go("/contracts/new");
			await app.submit(page.getByRole("button", { name: "Contract aanmaken" }));
			expect(await app.issues()).toEqual(
				expect.arrayContaining(["Kies een klant", "Kies minstens één apparaat"]),
			);

			const sku = await value<string>(
				`select sku from material m where organization_id = ? and exists (select 1
				 from stock_movement s where s.material_id = m.id and s.kind = 'opening_balance')
				 order by id limit 1`,
				[north.id],
			);
			await app.go(`/materials/${sku}`);
			await card("Voorraadhistorie").waitFor();
			expect(await page.getByRole("button", { name: "Voorraad ontvangen" }).count()).toBe(1);
			expect(await page.getByRole("columnheader", { name: "Mutatie" }).count()).toBe(1);
			expect(await card("Voorraadhistorie").innerText()).toContain("Beginvoorraad");
		} finally {
			await locale("en");
		}
		await app.go("/contracts");
		await page.getByRole("heading", { name: "Service contracts" }).waitFor();
	});
});
