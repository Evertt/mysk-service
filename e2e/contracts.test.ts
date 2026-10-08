import { beforeAll, describe, expect, test } from "vite-plus/test";

import { cents, countIn, organizations, rows, useApp, value } from "./app.ts";
import { covered, priceOf, pricedOrders } from "./contracts-helpers.ts";

const { north, south } = organizations;
const app = useApp();
const year = new Date().getFullYear();

/** A contract and its coverage as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select c.*, (select group_concat(equipment_id) from contract_equipment
		 where contract_id = c.id) as units from contract c where id = ?`,
		[id],
	);
const contractId = (number: string, organizationId: string) =>
	value<number>(`select id from contract where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]);
/** An organization's next contract number: `CTR-<this year>-<highest sequence + 1>`. */
async function nextNumber(organizationId: string) {
	const last = await value<number | null>(
		`select max(cast(substr(number, 10) as integer)) from contract where organization_id = ?`,
		[organizationId],
	);
	return `CTR-${year}-${String((last ?? 0) + 1).padStart(4, "0")}`;
}
/** The contracts, coverage and modules of both organizations, to check the file leaves them as seeded. */
const state = () =>
	rows(
		`select 'contract' as kind, organization_id, count(*) as n from contract group by 2
		 union all select 'coverage', c.organization_id, count(*) from contract_equipment ce
		 join contract c on c.id = ce.contract_id group by 2
		 union all select 'module:' || module_id, organization_id, 1 from organization_module
		 order by 1, 2`,
	);

const sidebar = () => app.page.locator('[data-sidebar="content"]').innerText();
const units = () => app.page.locator('input[name^="equipmentIds"]');
const tableRows = () => app.page.locator('[data-slot="data-table"] tbody tr');
/** A card on the page, by its title. */
const card = (title: string) =>
	app.page.locator('main [data-slot="card"]', {
		has: app.page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }),
	});

// --- What contracts mean for orders, as `coverage.ts` defines it -------------------------------

interface CallOut {
	number: string;
	contract: string;
	level: string;
	response_hours: number;
	/** In seconds, like the database's timestamps. */
	due: number;
}

/** North's covered repairs waiting to be scheduled, by deadline. */
const callOuts = () =>
	rows<CallOut>(
		`with ${covered} select o.number, c.number as contract, c.level, c.response_hours,
		 o.created_at + c.response_hours * 3600 as due
		 from "order" o join covered c on c.order_id = o.id and c.n = 1
		 where o.organization_id = ? and o.type = 'repair' and o.status = 'quote' order by due, o.number`,
		[north.id],
	);

/** Overdue from the deadline on; at risk with less than a quarter of the response time left. */
function slaOf(callOut: CallOut, now = Date.now() / 1000) {
	const left = callOut.due - now;
	if (left <= 0) return "overdue";
	return left < callOut.response_hours * 3600 * 0.25 ? "at_risk" : "on_track";
}

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

/** The remote queries of the module's cards on core pages, as loaded in North. */
const moduleQueries: string[] = [];

let seeded: Awaited<ReturnType<typeof state>>;
/** A North customer without contracts that owns at least two units. */
let free: number;
/** A North contract that is active today, one of its units, and its customer. */
let busy: { id: number; number: string; customer_id: number; equipment_id: number };
/** A South customer with at least two units. */
let southCustomer: number;
/** A North unit covered by an active premium contract, with its customer and contract. */
let premium: { id: number; customer_id: number; number: string; response_hours: number };

beforeAll(async () => {
	seeded = await state();
	free = await value<number>(
		`select c.id from customer c where c.organization_id = ?
		 and not exists (select 1 from contract k where k.customer_id = c.id)
		 and (select count(*) from equipment e where e.customer_id = c.id) >= 2 order by c.id limit 1`,
		[north.id],
	);
	[busy] = await rows<typeof busy>(
		`select k.id, k.number, k.customer_id, ce.equipment_id from contract k
		 join contract_equipment ce on ce.contract_id = k.id where k.organization_id = ?
		 and k.starts_on <= unixepoch() and k.ends_on + 86400 > unixepoch() order by k.id limit 1`,
		[north.id],
	);
	southCustomer = await value<number>(
		`select c.id from customer c where c.organization_id = ?
		 and (select count(*) from equipment e where e.customer_id = c.id) >= 2 order by c.id limit 1`,
		[south.id],
	);
	[premium] = await rows<typeof premium>(
		`select e.id, e.customer_id, k.number, k.response_hours from contract k
		 join contract_equipment ce on ce.contract_id = k.id join equipment e on e.id = ce.equipment_id
		 where k.organization_id = ? and k.level = 'premium' and e.status != 'decommissioned'
		 and k.starts_on <= unixepoch() and k.ends_on + 86400 > unixepoch() order by k.id, e.id limit 1`,
		[north.id],
	);
});

describe("in North", () => {
	let number: string;

	test("the sidebar lists the module and the list shows North's contracts", async () => {
		await app.go("/contracts");
		expect(await sidebar()).toContain("Service contracts");
		expect(await app.rowCount()).toBe(await countIn("contract", north.id));
	});

	test("searching and filtering narrow the list", async () => {
		const { page } = app;
		await page.getByLabel("Search contracts…").fill(busy.number);
		await expect.poll(() => app.rowCount()).toBe(1);
		await page.getByLabel("Search contracts…").fill("");

		await page.locator('[data-slot="popover-trigger"]', { hasText: "Status" }).click();
		await page.getByRole("option", { name: /Active/ }).click();
		await page.keyboard.press("Escape");
		await page.locator('[data-slot="popover-trigger"]', { hasText: "Level" }).click();
		await page.getByRole("option", { name: /Premium/ }).click();
		await page.keyboard.press("Escape");
		const activePremium = Number(
			await value(
				`select count(*) from contract where organization_id = ? and level = 'premium'
				 and starts_on <= unixepoch() and ends_on + 86400 > unixepoch()`,
				[north.id],
			),
		);
		await expect.poll(() => app.rowCount()).toBe(activePremium);
		const badges = await tableRows().locator('[data-slot="badge"]').allInnerTexts();
		expect(badges).not.toContainEqual(expect.stringMatching(/Expired|Upcoming|Basic|Standard/));
	});

	test("sorting by monthly fee puts the highest first", async () => {
		await app.go("/contracts");
		await app.sortBy("Monthly fee", "descending");
		const highest = Number(
			await value(`select max(monthly_fee) from contract where organization_id = ?`, [north.id]),
		);
		const fees = async () =>
			(await tableRows().locator("td:nth-last-child(2)").allInnerTexts()).map((text) =>
				Math.round(Number(text.replace(/[^\d.]/g, "")) * 100),
			);
		await expect.poll(async () => (await fees())[0]).toBe(highest);
		const shown = await fees();
		expect(shown).toEqual(shown.toSorted((a, b) => b - a));
	});

	test("an unknown contract is a 404", async () => {
		expect((await app.go("/contracts/CTR-0000-0000"))?.status()).toBe(404);
	});

	test("a contract shows its customer and covered equipment", async () => {
		const { page } = app;
		await app.go(`/contracts/${busy.number}`);
		expect(await page.locator("h1").innerText()).toBe(busy.number);
		const [customer] = await rows<{ code: string; name: string }>(
			`select code, name from customer where id = ?`,
			[busy.customer_id],
		);
		expect(await page.locator("main").innerText()).toContain(customer.name);
		expect(await page.locator(`main a[href="/customers/${customer.code}"]`).count()).toBe(1);
		const serials = await rows<{ serial_number: string }>(
			`select e.serial_number from contract_equipment ce join equipment e on e.id = ce.equipment_id
			 where ce.contract_id = ?`,
			[busy.id],
		);
		const links = page.locator('main a[href^="/equipment/"]');
		expect((await links.allInnerTexts()).toSorted()).toEqual(
			serials.map((row) => row.serial_number).toSorted(),
		);
	});

	test("a covered unit can't move to another customer", async () => {
		const { page } = app;
		// One without orders, which would stop the move on their own.
		const [unit] = await rows<{ id: number; serial_number: string; customer_id: number }>(
			`select e.id, e.serial_number, e.customer_id from equipment e
			 where e.organization_id = ? and exists (select 1 from contract_equipment ce where ce.equipment_id = e.id)
			 and not exists (select 1 from "order" o where o.equipment_id = e.id) order by e.id limit 1`,
			[north.id],
		);
		const other = await value<number>(
			`select min(id) from customer where organization_id = ? and id != ?`,
			[north.id, unit.customer_id],
		);
		await app.go(`/equipment/${encodeURIComponent(unit.serial_number)}/edit`);
		await page.getByLabel("Customer").selectOption(String(other));
		await app.submit(page.getByRole("button", { name: "Save equipment" }));
		expect(await app.issues()).toContainEqual(expect.stringMatching(/service contract/));
		expect(await value(`select customer_id from equipment where id = ?`, [unit.id])).toBe(
			unit.customer_id,
		);
	});

	test("creating a contract validates it first", async () => {
		const { page } = app;
		await app.go("/contracts/new");
		await app.submit(page.getByRole("button", { name: "Create contract" }));
		expect(await app.issues()).not.toEqual([]);
		expect(app.path()).toBe("/contracts/new");
		const options = await page.getByLabel("Customer").locator("option").count();
		expect(options - 1).toBe(await countIn("customer", north.id));
	});

	test("choosing a level suggests its response time", async () => {
		const { page } = app;
		expect(await page.getByLabel("Response time (hours)").inputValue()).toBe("24");
		await page.getByLabel("Level").selectOption("premium");
		expect(await page.getByLabel("Response time (hours)").inputValue()).toBe("4");
	});

	test("a unit already covered in the same period is refused", async () => {
		const { page } = app;
		const before = await countIn("contract", north.id);
		await page.getByLabel("Customer").selectOption(String(busy.customer_id));
		await units()
			.and(page.locator(`[value="${busy.equipment_id}"]`))
			.check();
		await page.getByLabel("Starts on").fill(new Date().toISOString().slice(0, 10));
		await page.getByLabel("Monthly fee").fill("99");
		await app.submit(page.getByRole("button", { name: "Create contract" }));
		expect(await app.issues()).toContainEqual(
			expect.stringContaining(`already covered by ${busy.number}`),
		);
		expect(app.path()).toBe("/contracts/new");
		expect(await countIn("contract", north.id)).toBe(before);
	});

	test("changing the customer lists their units, none checked", async () => {
		const { page } = app;
		await page.getByLabel("Customer").selectOption(String(free));
		const owned = Number(
			await value(`select count(*) from equipment where customer_id = ?`, [free]),
		);
		expect(await units().count()).toBe(owned);
		expect(await units().and(page.locator(":checked")).count()).toBe(0);
	});

	test("the period must run forwards", async () => {
		const { page } = app;
		await units().nth(0).check();
		await units().nth(1).check();
		await page.getByLabel("Starts on").fill(`${year + 1}-01-01`);
		await page.getByLabel("Ends on").fill(`${year}-12-01`);
		await page.getByLabel("Monthly fee").fill("123.45");
		await page.getByLabel("Notes").fill("Test contract (e2e)");
		await app.submit(page.getByRole("button", { name: "Create contract" }));
		expect(await app.issues()).toContainEqual(expect.stringMatching(/after the start/));
		expect(app.path()).toBe("/contracts/new");
	});

	test("a new contract gets the next number and covers the chosen units", async () => {
		const { page } = app;
		const covering = await units().evaluateAll((boxes) =>
			(boxes as HTMLInputElement[]).filter((box) => box.checked).map((box) => Number(box.value)),
		);
		await page.getByLabel("Ends on").fill(`${year + 1}-12-31`);
		const expected = await nextNumber(north.id);
		await page.getByRole("button", { name: "Create contract" }).click();
		await page.waitForURL(/\/contracts\/CTR-/);
		await page.waitForLoadState("networkidle");
		number = app.path().split("/").pop()!;
		expect(number).toBe(expected);
		await app.toast("Contract created");

		const [stored] = await rows(
			`select organization_id, customer_id, level, monthly_fee, response_hours, notes
			 from contract where number = ? and organization_id = ?`,
			[number, north.id],
		);
		expect(stored).toMatchObject({
			organization_id: north.id,
			customer_id: free,
			level: "premium",
			monthly_fee: 12345,
			response_hours: 4,
			notes: "Test contract (e2e)",
		});
		const id = await contractId(number, north.id);
		const coverage = await rows<{ equipment_id: number }>(
			`select equipment_id from contract_equipment where contract_id = ? order by 1`,
			[id],
		);
		expect(coverage.map((row) => row.equipment_id)).toEqual(covering.toSorted((a, b) => a - b));

		const terms = await page.locator("dl").first().innerText();
		expect(terms).toContain("€123.45");
		expect(terms).toContain("Within 4 hours");
		expect(await page.locator("table").first().locator("tbody tr").count()).toBe(2);
	});

	test("editing it saves the changes", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		expect(await page.getByLabel("Monthly fee").inputValue()).toBe("123.45");
		expect(await units().and(page.locator(":checked")).count()).toBe(2);

		await page.getByLabel("Level").selectOption("basic");
		expect(await page.getByLabel("Response time (hours)").inputValue()).toBe("72");
		await units().and(page.locator(":checked")).first().uncheck();
		await page.getByRole("button", { name: "Save contract" }).click();
		await page.waitForURL((url) => url.pathname === `/contracts/${number}`);
		await page.waitForLoadState("networkidle");
		expect(await page.locator('h1 ~ [data-slot="badge"]').allInnerTexts()).toContain("Basic");

		const id = await contractId(number, north.id);
		const [stored] = await rows(`select level, response_hours from contract where id = ?`, [id]);
		expect(stored).toMatchObject({ level: "basic", response_hours: 72 });
		expect(await value(`select count(*) from contract_equipment where contract_id = ?`, [id])).toBe(
			1,
		);
	});

	test("deleting it removes it and its coverage, after which it's a 404", async () => {
		const { page } = app;
		const id = await contractId(number, north.id);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/contracts");
		expect(await contractId(number, north.id)).toBeUndefined();
		expect(await value(`select count(*) from contract_equipment where contract_id = ?`, [id])).toBe(
			0,
		);
		expect((await app.go(`/contracts/${number}`))?.status()).toBe(404);
	});
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
		expect(await listed.allInnerTexts()).toEqual(expected);
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
		expect(await listed.allInnerTexts()).toEqual(expected.map((row) => row.number));
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

	test("a covered order shows what its contract includes, and its total agrees everywhere", async () => {
		const { page } = app;
		// A premium-covered repair with both labour and materials, among its customer's ten latest
		// orders (which their page lists).
		const [order] = await pricing(
			`c.level = 'premium' and o.type = 'repair' and o.labor_hours > 0
			 and exists (select 1 from order_line l where l.order_id = o.id)
			 and o.id in (select r.id from "order" r where r.customer_id = o.customer_id
			 order by r.created_at desc, r.id desc limit 10)`,
		);
		const price = priceOf(order);
		expect(price.included).toBe(order.materials + price.labor);

		await app.go(`/orders/${order.number}`);
		const lines = card("Materials and labour");
		const adjustment = lines.locator("tbody tr", { hasText: "Covered by" });
		expect(await adjustment.innerText()).toContain(
			`Covered by ${order.contract} (Premium)\nLabour and materials included`,
		);
		expect(cents(await adjustment.locator("td").last().innerText())).toBe(-price.included);
		expect(cents(await lines.locator("tfoot td").last().innerText())).toBe(price.total);

		await app.go("/orders");
		await page.getByLabel("Search orders…").fill(order.number);
		await expect.poll(() => app.rowCount()).toBe(1);
		expect(cents(await tableRows().first().locator("td:nth-last-child(2)").innerText())).toBe(
			price.total,
		);

		// The unit's service history shows the same total, and what the contract took off.
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

		// And so does the customer's recent activity.
		await app.go(`/customers/${order.customer}`);
		const activity = page
			.getByRole("list", { name: "Recent activity" })
			.locator(":scope > li")
			.filter({ has: page.getByRole("link", { name: order.number }) });
		expect(cents(await activity.locator('[data-cost="total"]').innerText())).toBe(price.total);
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
		expect(await items.locator('a[href^="/contracts/"]').allInnerTexts()).toEqual(
			covering.map((row) => row.number),
		);
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

	test("the cards load through the module's own queries", async () => {
		const { page } = app;
		const record = (request: { url(): string; method(): string }) => {
			if (
				/\/_app\/remote\/.*\/get(OrderCoverage|UnitCoverage|ContractsOverview)/.test(request.url())
			) {
				moduleQueries.push(request.url());
			}
		};
		page.on("request", record);
		// Client-side, so the pages load their data through remote queries.
		await app.go("/orders");
		await page.getByLabel("Search orders…").fill(overdue.number);
		await page.getByRole("link", { name: overdue.number }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${overdue.number}`);
		await card("Service contract").waitFor();
		await card("Equipment").locator('a[href^="/equipment/"]').click();
		await page.waitForURL((url) => url.pathname.startsWith("/equipment/"));
		await card("Service contracts").waitFor();
		await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Dashboard" }).click();
		await page.waitForURL((url) => url.pathname === "/");
		await card("Response times at risk").waitFor();
		page.off("request", record);
		const names = moduleQueries.map((url) => new URL(url).pathname.split("/").pop());
		expect([...new Set(names)].toSorted((a, b) => a!.localeCompare(b!))).toEqual([
			"getContractsOverview",
			"getOrderCoverage",
			"getUnitCoverage",
		]);
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
			await page.locator('[data-slot="badge"]', { hasText: /SLA (overdue|at risk)/ }).count(),
		).toBe(0);
		await app.go("/");
		expect(await card("Response times at risk").count()).toBe(0);
		expect(await card("Contracts ending soon").count()).toBe(0);

		await app.go("/settings");
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

describe("in South, which doesn't have the module", () => {
	/** The remote queries the contracts pages made in North, to replay them from South. */
	const queries: string[] = [];

	test("a contracts form left open in North is refused after switching to South elsewhere", async () => {
		const { page } = app;
		// Navigate client-side, so the pages load their data through remote queries.
		const record = (request: { url(): string; method(): string }) => {
			// Not the toolbar's saved views: a core query, which answers with South's own views.
			const url = request.url();
			if (
				url.includes("/_app/remote/") &&
				!url.includes("/getTableViews") &&
				request.method() === "GET"
			) {
				queries.push(url);
			}
		};
		page.on("request", record);
		await app.go("/");
		await page
			.locator('[data-sidebar="content"]')
			.getByRole("link", { name: "Service contracts" })
			.click();
		await page.waitForURL((url) => url.pathname === "/contracts");
		await page.waitForLoadState("networkidle");
		await page.getByLabel("Search contracts…").fill(busy.number);
		await page.getByRole("link", { name: busy.number }).first().click();
		await page.waitForURL((url) => url.pathname === `/contracts/${busy.number}`);
		await page.waitForLoadState("networkidle");
		await app.go("/contracts/new");
		page.off("request", record);
		expect(queries.length).toBeGreaterThanOrEqual(2);

		await page.getByLabel("Customer").selectOption(String(free));
		await units().first().check();
		await page.getByLabel("Starts on").fill(`${year + 1}-01-01`);
		await page.getByLabel("Ends on").fill(`${year + 1}-12-31`);
		await page.getByLabel("Monthly fee").fill("10");

		const other = await app.anotherTab();
		await other.goto(new URL("/", page.url()).href);
		await other.waitForLoadState("networkidle");
		await other.locator('[data-sidebar="header"] button').first().click();
		await other.getByRole("menuitem", { name: south.name }).click();
		await other.waitForURL((url) => url.pathname === "/");
		await other.context().close();

		const [northBefore, southBefore] = [
			await countIn("contract", north.id),
			await countIn("contract", south.id),
		];
		const result = await app.expectingErrors(() =>
			app.submit(page.getByRole("button", { name: "Create contract" })),
		);
		expect(result).toMatch(/"status":404/);
		expect(await countIn("contract", north.id)).toBe(northBefore);
		expect(await countIn("contract", south.id)).toBe(southBefore);
	});

	test("the sidebar lacks the module and the contracts pages are 404s", async () => {
		await app.go("/");
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		expect(await sidebar()).not.toContain("Service contracts");
		for (const path of [
			"/contracts",
			"/contracts/new",
			`/contracts/${busy.number}`,
			`/contracts/${busy.number}/edit`,
		]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
	});

	test("North's remote queries are refused", async () => {
		for (const url of queries) {
			const response = await app.page.context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
			expect(body).not.toContain("CTR-");
		}
	});

	test("orders, equipment and the dashboard show none of it, and its queries are refused", async () => {
		await app.go("/");
		expect(await card("Response times at risk").count()).toBe(0);
		expect(await card("Contracts ending soon").count()).toBe(0);
		const [order] = await rows<{ number: string; serial_number: string }>(
			`select o.number, e.serial_number from "order" o join equipment e on e.id = o.equipment_id
			 where o.organization_id = ? and o.type = 'repair' order by o.id limit 1`,
			[south.id],
		);
		await app.go(`/orders/${order.number}`);
		expect(await card("Service contract").count()).toBe(0);
		const lines = card("Materials and labour");
		expect(await lines.locator("tbody tr", { hasText: "Covered by" }).count()).toBe(0);
		await app.go(`/equipment/${encodeURIComponent(order.serial_number)}`);
		expect(await card("Service contracts").count()).toBe(0);

		expect(moduleQueries.length).toBeGreaterThanOrEqual(3);
		for (const url of moduleQueries) {
			const response = await app.page.context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
			expect(body).not.toContain("CTR-");
		}
	});
});

describe("in South, with the module enabled", () => {
	let number: string;

	test("enabling the module adds it to the sidebar", async () => {
		const { page } = app;
		await app.go("/settings");
		const row = page.locator("div.rounded-lg.border", { hasText: "Service contracts" });
		await row.getByRole("button", { name: "Enable" }).click();
		await row.getByText(/Enabled since/).waitFor();
		expect(
			await rows(
				`select module_id from organization_module where organization_id = ? order by module_id`,
				[south.id],
			),
		).toEqual([{ module_id: "contracts" }, { module_id: "invoicing" }]);
		await app.go("/settings");
		expect(await sidebar()).toContain("Service contracts");
	});

	test("the list is empty and North's contracts are 404s", async () => {
		const { page } = app;
		await app.go("/contracts");
		expect(await countIn("contract", south.id)).toBe(0);
		expect(await app.rowCount()).toBe(0);
		expect(await page.getByText("No contracts found").count()).toBe(1);
		expect((await app.go(`/contracts/${busy.number}`))?.status()).toBe(404);
		expect((await app.go(`/contracts/${busy.number}/edit`))?.status()).toBe(404);
	});

	test("the module's cards show South's (none), and North's orders and units stay out of reach", async () => {
		await app.go("/");
		expect(await card("Response times at risk").innerText()).toContain("All on track");
		expect(await card("Contracts ending soon").innerText()).toContain("Nothing ending soon");
		for (const url of moduleQueries) {
			const response = await app.page.context().request.get(url);
			const body = await response.text();
			if (!url.includes("getContractsOverview")) {
				expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
			}
			expect(body).not.toContain("CTR-");
		}
	});

	test("the form only offers South's customers", async () => {
		await app.go("/contracts/new");
		const offered = await app.page
			.getByLabel("Customer")
			.locator("option")
			.evaluateAll((options) =>
				options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
			);
		const customers = await rows<{ id: number }>(
			`select id from customer where organization_id = ? order by id`,
			[south.id],
		);
		expect(offered.map(Number).toSorted((a, b) => a - b)).toEqual(customers.map((c) => c.id));
	});

	/** Fills in a valid contract for South's customer, covering their first unit. */
	async function fillIn() {
		const { page } = app;
		await page.getByLabel("Customer").selectOption(String(southCustomer));
		await units().first().check();
		await page.getByLabel("Starts on").fill(`${year + 1}-01-01`);
		await page.getByLabel("Ends on").fill(`${year + 1}-12-31`);
		await page.getByLabel("Monthly fee").fill("50");
	}

	test("a North unit is refused", async () => {
		const { page } = app;
		await fillIn();
		await units()
			.nth(1)
			.evaluate((box, unit) => ((box as HTMLInputElement).value = String(unit)), busy.equipment_id);
		await units().nth(1).check();
		await app.submit(page.getByRole("button", { name: "Create contract" }));
		expect(await app.issues()).toContainEqual(expect.stringMatching(/own customer/));
		expect(app.path()).toBe("/contracts/new");
		expect(await countIn("contract", south.id)).toBe(0);
	});

	test("a North customer is refused", async () => {
		const { page } = app;
		await app.go("/contracts/new");
		await fillIn();
		// Swap in a North customer and unit after choosing, as a tampered request would.
		await page.evaluate(
			(customerId) =>
				document
					.querySelector<HTMLSelectElement>('select[name^="customerId"]')!
					.add(new Option("North customer", customerId)),
			String(busy.customer_id),
		);
		// Separately: Svelte puts the select back on its value when its options change.
		await page.evaluate(
			({ customerId, unitId }) => {
				document.querySelector<HTMLSelectElement>('select[name^="customerId"]')!.value = customerId;
				document.querySelector<HTMLInputElement>('input[name^="equipmentIds"]:checked')!.value =
					unitId;
			},
			{ customerId: String(busy.customer_id), unitId: String(busy.equipment_id) },
		);
		await app.submit(page.getByRole("button", { name: "Create contract" }));
		expect(await app.issues()).toContainEqual(expect.stringMatching(/Unknown customer/));
		expect(app.path()).toBe("/contracts/new");
		expect(await countIn("contract", south.id)).toBe(0);
	});

	test("a new contract gets South's first number", async () => {
		const { page } = app;
		await app.go("/contracts/new");
		await fillIn();
		await page.getByRole("button", { name: "Create contract" }).click();
		await page.waitForURL(/\/contracts\/CTR-/);
		await page.waitForLoadState("networkidle");
		number = app.path().split("/").pop()!;
		expect(number).toBe(`CTR-${year}-0001`);
		const id = await contractId(number, south.id);
		expect(
			await rows(
				`select distinct e.organization_id from contract_equipment ce
				 join equipment e on e.id = ce.equipment_id where ce.contract_id = ?`,
				[id],
			),
		).toEqual([{ organization_id: south.id }]);
		await app.go("/contracts");
		expect(await app.rowCount()).toBe(1);
	});

	test("saving with the id of a North contract is refused", async () => {
		const { page } = app;
		const own = await contractId(number, south.id);
		const [victimBefore, ownBefore] = [await snapshot(busy.id), await snapshot(own)];

		await app.go(`/contracts/${number}/edit`);
		await page.getByLabel("Monthly fee").fill("1");
		// Cover another unit, so the check for overlaps (which skips the contract being saved)
		// doesn't stop the request before it gets to the contract.
		await units().and(page.locator(":checked")).uncheck();
		await units().and(page.locator(":not(:checked)")).last().check();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('form input[type="hidden"][name^="id"]')!.value =
					String(id);
			}, busy.id);
			return app.submit(page.getByRole("button", { name: "Save contract" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/contracts/${number}/edit`);
		expect(await snapshot(busy.id)).toEqual(victimBefore);
		expect(await snapshot(own)).toEqual(ownBefore);
	});

	test("deleting with the id of a North contract is refused", async () => {
		const { page } = app;
		const own = await contractId(number, south.id);
		const [victimBefore, ownBefore] = [await snapshot(busy.id), await snapshot(own)];

		await app.go(`/contracts/${number}`);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id"]')!.value =
					String(id);
			}, busy.id);
			return app.submit(dialog.getByRole("button", { name: "Delete" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/contracts/${number}`);
		expect(await snapshot(busy.id)).toEqual(victimBefore);
		expect(await snapshot(own)).toEqual(ownBefore);
	});

	test("deleting South's contract and disabling the module restores the seeded state", async () => {
		const { page } = app;
		await app.go(`/contracts/${number}`);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/contracts");
		expect(await countIn("contract", south.id)).toBe(0);

		await app.go("/settings");
		const row = page.locator("div.rounded-lg.border", { hasText: "Service contracts" });
		await row.getByRole("button", { name: "Disable" }).click();
		await row.getByText("Disabled").waitFor();
		await app.go("/settings");
		expect(await sidebar()).not.toContain("Service contracts");
		expect((await app.go("/contracts"))?.status()).toBe(404);
		expect(await state()).toEqual(seeded);
	});
});
