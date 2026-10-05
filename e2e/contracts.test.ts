import { beforeAll, describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, value } from "./app.ts";

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

let seeded: Awaited<ReturnType<typeof state>>;
/** A North customer without contracts that owns at least two units. */
let free: number;
/** A North contract that is active today, one of its units, and its customer. */
let busy: { id: number; number: string; customer_id: number; equipment_id: number };
/** A South customer with at least two units. */
let southCustomer: number;

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
		const { page } = app;
		await app.go("/contracts");
		await page.locator('[data-slot="dropdown-menu-trigger"]', { hasText: "Monthly fee" }).click();
		await page.getByRole("menuitem", { name: "Descending" }).click();
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

describe("in South, which doesn't have the module", () => {
	/** The remote queries the contracts pages made in North, to replay them from South. */
	const queries: string[] = [];

	test("a contracts form left open in North is refused after switching to South elsewhere", async () => {
		const { page } = app;
		// Navigate client-side, so the pages load their data through remote queries.
		const record = (request: { url(): string; method(): string }) => {
			if (request.url().includes("/_app/remote/") && request.method() === "GET") {
				queries.push(request.url());
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

		// Another tab of the same session (the page has a context of its own, so: its cookies).
		const context = await page
			.context()
			.browser()!
			.newContext({ storageState: await page.context().storageState() });
		const other = await context.newPage();
		await other.goto(new URL("/", page.url()).href);
		await other.waitForLoadState("networkidle");
		await other.locator('[data-sidebar="header"] button').first().click();
		await other.getByRole("menuitem", { name: south.name }).click();
		await other.waitForURL((url) => url.pathname === "/");
		await context.close();

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

	test("the sidebar has no modules and the contracts pages are 404s", async () => {
		await app.go("/");
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		expect(await sidebar()).not.toMatch(/Modules|Service contracts/);
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
			await rows(`select module_id from organization_module where organization_id = ?`, [south.id]),
		).toEqual([{ module_id: "contracts" }]);
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
