import { beforeAll, describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, value } from "#e2e/app.ts";

import {
	activeContract,
	type ActiveContract,
	type CallOut,
	callOuts,
	contractId,
	customerWithoutContracts,
	pageLocators,
	slaOf,
	year,
} from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { sidebar, units, card } = pageLocators(app);

/** A contract and its coverage as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select c.*, (select group_concat(equipment_id) from contract_equipment
		 where contract_id = c.id) as units from contract c where id = ?`,
		[id],
	);
/** The contracts, coverage and modules of both organizations, to check the file leaves them as seeded. */
const state = () =>
	rows(
		`select 'contract' as kind, organization_id, count(*) as n from contract group by 2
		 union all select 'coverage', c.organization_id, count(*) from contract_equipment ce
		 join contract c on c.id = ce.contract_id group by 2
		 union all select 'module:' || module_id, organization_id, 1 from organization_module
		 order by 1, 2`,
	);

/** The remote queries of the module's cards on core pages, as loaded in North. */
const moduleQueries: string[] = [];

let seeded: Awaited<ReturnType<typeof state>>;
/** A North customer without contracts that owns at least two units. */
let free: number;
/** A North contract that is active today, one of its units, and its customer. */
let busy: ActiveContract;
/** A South customer with at least two units. */
let southCustomer: number;

beforeAll(async () => {
	seeded = await state();
	free = await customerWithoutContracts();
	busy = await activeContract();
	southCustomer = await value<number>(
		`select c.id from customer c where c.organization_id = ?
		 and (select count(*) from equipment e where e.customer_id = c.id) >= 2 order by c.id limit 1`,
		[south.id],
	);
});

describe("in North, the module's cards on core pages", () => {
	/** The seeded call-out that is overdue (see the seed). */
	let overdue: CallOut;

	beforeAll(async () => {
		overdue = (await callOuts()).find((callOut) => slaOf(callOut) === "overdue")!;
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
	}, 60_000); // several page loads, each waiting for the network to settle

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
