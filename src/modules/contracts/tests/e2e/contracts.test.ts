import { beforeAll, describe, expect, test } from "vite-plus/test";

import { countIn, isRemote, organizations, rows, useApp, value, quiet } from "#e2e/app.ts";

import {
	activeContract,
	type ActiveContract,
	contractId,
	customerWithoutContracts,
	pageLocators,
	year,
} from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { sidebar, units, tableRows, card } = pageLocators(app);

/** An organization's next contract number: `CTR-<this year>-<highest sequence + 1>`. */
async function nextNumber(organizationId: string) {
	const last = await value<number | null>(
		`select max(cast(substr(number, 10) as integer)) from contract where organization_id = ?`,
		[organizationId],
	);
	return `CTR-${year}-${String((last ?? 0) + 1).padStart(4, "0")}`;
}

/** A North customer without contracts that owns at least two units. */
let free: number;
/** A North contract that is active today, one of its units, and its customer. */
let busy: ActiveContract;

beforeAll(async () => {
	free = await customerWithoutContracts();
	busy = await activeContract();
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

		await app.openFilter("Status");
		await page.getByRole("option", { name: /Active/ }).click();
		await page.keyboard.press("Escape");
		await app.openFilter("Level");
		await page.getByRole("option", { name: /Premium/ }).click();
		await page.keyboard.press("Escape");
		const activePremium = Number(
			await value(
				`select count(*) from contract where organization_id = ? and level = 'premium'
				 and starts_on <= date('now', 'localtime') and ends_on >= date('now', 'localtime')`,
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
		await quiet(page);
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
		await quiet(page);
		expect(await page.getByLabel("Monthly fee").inputValue()).toBe("123.45");
		expect(await units().and(page.locator(":checked")).count()).toBe(2);

		await page.getByLabel("Level").selectOption("basic");
		expect(await page.getByLabel("Response time (hours)").inputValue()).toBe("72");
		await units().and(page.locator(":checked")).first().uncheck();
		await page.getByRole("button", { name: "Save contract" }).click();
		await page.waitForURL((url) => url.pathname === `/contracts/${number}`);
		await quiet(page);
		// The page shows once its parts are in, the modules' cards among them.
		await expect
			.poll(() => page.locator('h1 ~ [data-slot="badge"]').allInnerTexts())
			.toContain("Basic");

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

describe("when its part of the dashboard fails", () => {
	const notice = () => app.page.getByText("Couldn't load what Service contracts adds here.");
	const failing = (url: URL) => isRemote(url.href, "getContractsOverview");

	test("the rest of the dashboard shows, with a notice in its place", async () => {
		const { page } = app;
		await app.go("/orders");
		// Its query fails on the way, as when the server can't answer it.
		await page.route(failing, (route) => route.fulfill({ status: 500, body: "" }));
		await app.expectingErrors(async () => {
			await page
				.locator('[data-sidebar="content"]')
				.getByRole("link", { name: "Dashboard" })
				.click();
			await page.waitForURL((url) => url.pathname === "/");
			await notice().waitFor();
		});
		expect(await card("Response times at risk").count()).toBe(0);
		expect(await page.getByText("Revenue, last 30 days", { exact: true }).count()).toBe(1);
	});

	test("trying again shows its cards once its query answers", async () => {
		const { page } = app;
		await page.unroute(failing);
		await page.getByRole("button", { name: "Try again" }).click();
		await card("Response times at risk").waitFor();
		expect(await notice().count()).toBe(0);
	});
});
