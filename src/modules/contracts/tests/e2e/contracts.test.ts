/**
 * Contracts' pages: the list, a contract's page, its form (what it suggests and offers as it's
 * filled in), creating, editing and deleting one, and the dashboard's part failing. What the server
 * decides (the checks the schema can't make, the numbers, the coverage stored, what's logged, a
 * covered unit staying with its customer, tenant isolation) is `../unit/server/contracts.spec.ts`'s.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { countIn, isRemote, organizations, rows, useApp, value, quiet } from "#e2e/app.ts";

import {
	activeContract,
	type ActiveContract,
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

		await app.openFilter("Level");
		await page.getByRole("option", { name: /Premium/ }).click();
		await page.keyboard.press("Escape");
		const premium = Number(
			await value(`select count(*) from contract where organization_id = ? and level = 'premium'`, [
				north.id,
			]),
		);
		await expect.poll(() => app.rowCount()).toBe(premium);
		const badges = await tableRows().locator('[data-slot="badge"]').allInnerTexts();
		expect(badges).not.toContainEqual(expect.stringMatching(/Basic|Standard/));
	});

	test("a contract shows its customer and covered equipment; an unknown one is a 404", async () => {
		const { page } = app;
		expect((await app.go("/contracts/CTR-0000-0000"))?.status()).toBe(404);
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
		// The covered equipment's: other cards (a module's plans, say) may link to units too.
		const links = card("Covered equipment").locator('a[href^="/equipment/"]');
		expect((await links.allInnerTexts()).toSorted()).toEqual(
			serials.map((row) => row.serial_number).toSorted(),
		);
	});

	test("choosing a level suggests its response time", async () => {
		const { page } = app;
		await app.go("/contracts/new");
		expect(await page.getByLabel("Response time (hours)").inputValue()).toBe("24");
		await page.getByLabel("Level").selectOption("premium");
		expect(await page.getByLabel("Response time (hours)").inputValue()).toBe("4");
	});

	test("choosing the customer lists their units, none checked", async () => {
		const { page } = app;
		await page.getByLabel("Customer").selectOption(String(free));
		const owned = Number(
			await value(`select count(*) from equipment where customer_id = ?`, [free]),
		);
		expect(await units().count()).toBe(owned);
		expect(await units().and(page.locator(":checked")).count()).toBe(0);
	});

	test("a new contract gets the next number, and shows its terms and units", async () => {
		const { page } = app;
		await units().nth(0).check();
		await units().nth(1).check();
		await page.getByLabel("Starts on").fill(`${year + 1}-01-01`);
		await page.getByLabel("Ends on").fill(`${year + 1}-12-31`);
		await page.getByLabel("Monthly fee").fill("123.45");
		await page.getByLabel("Notes").fill("Test contract (e2e)");
		const expected = await nextNumber(north.id);
		await page.getByRole("button", { name: "Create contract" }).click();
		await page.waitForURL(/\/contracts\/CTR-/);
		await quiet(page);
		number = app.path().split("/").pop()!;
		expect(number).toBe(expected);
		await app.toast("Contract created");

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
		expect(await page.locator("table").first().locator("tbody tr").count()).toBe(1);
	});

	test("deleting it goes back to the list, without it", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/contracts");
		await quiet(page);
		expect(await app.rowCount()).toBe(await countIn("contract", north.id));
		expect(await page.getByRole("link", { name: number }).count()).toBe(0);
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
