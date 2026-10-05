import { describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

const bodyRows = () => app.page.locator('[data-slot="data-table"] tbody tr');
const unit = (id: number) => rows(`select * from equipment where id = ?`, [id]);
const unitId = (serial: string, organizationId: string) =>
	value<number>(`select id from equipment where serial_number = ? and organization_id = ?`, [
		serial,
		organizationId,
	]);
const orderCount = (id: number) =>
	value<number>(`select count(*) from "order" where equipment_id = ?`, [id]);

/** An organization's unit with the most orders. */
async function busiest(organizationId: string) {
	const [found] = await rows<{ id: number; serial: string; orders: number }>(
		`select e.id, e.serial_number as serial, count(o.id) as orders from equipment e
		 join "order" o on o.equipment_id = e.id where e.organization_id = ?
		 group by e.id order by count(o.id) desc, e.id limit 1`,
		[organizationId],
	);
	return found;
}

/** A North unit without orders (so an unscoped delete would remove it) whose serial South lacks. */
async function northOnly() {
	const [found] = await rows<{ id: number; serial: string }>(
		`select id, serial_number as serial from equipment e where organization_id = ?
		 and not exists (select 1 from "order" o where o.equipment_id = e.id)
		 and serial_number not in (select serial_number from equipment where organization_id = ?)
		 order by id limit 1`,
		[north.id, south.id],
	);
	return found;
}

/** The serial numbers of an organization's units, sorted. */
async function serialsIn(organizationId: string) {
	const found = await rows<{ serial: string }>(
		`select serial_number as serial from equipment where organization_id = ?`,
		[organizationId],
	);
	return found.map((row) => row.serial).sort();
}

/** The ids of an organization's customers, sorted. */
async function customersIn(organizationId: string) {
	const found = await rows<{ id: number }>(`select id from customer where organization_id = ?`, [
		organizationId,
	]);
	return found.map((row) => String(row.id)).sort();
}

/** The serial numbers on the shown page of the list. */
const shownSerials = () =>
	bodyRows().evaluateAll((trs) =>
		trs.map((tr) =>
			decodeURIComponent(
				tr.querySelector('a[href^="/equipment/"]')!.getAttribute("href")!.split("/")[2],
			),
		),
	);

/** The serial numbers on every page of the list, 100 per page, sorted. */
async function listedSerials() {
	const { page } = app;
	await app.go("/equipment");
	await page.getByLabel("Rows per page").click();
	await page.getByRole("option", { name: "100", exact: true }).click();
	const found: string[] = [];
	for (;;) {
		found.push(...(await shownSerials()));
		const next = page.getByRole("button", { name: "Go to next page" });
		if (await next.isDisabled()) break;
		await next.click();
	}
	return found.sort();
}

/** The values the form's customer select offers, sorted. */
const customerOptions = () =>
	app.page
		.getByLabel("Customer")
		.locator("option")
		.evaluateAll((options: HTMLOptionElement[]) =>
			options
				.map((option) => option.value)
				.filter(Boolean)
				.sort(),
		);

/** Opens a faceted filter of the toolbar and picks one of its options. */
async function filter(title: string, option: string) {
	const { page } = app;
	await page.getByRole("button", { name: title, exact: true }).first().click();
	await page.getByRole("option", { name: new RegExp(`^${option}\\s*\\d+$`) }).click();
	await page.keyboard.press("Escape");
}

const count = (where: string, args: (string | number)[] = []) =>
	value<number>(`select count(*) from equipment where organization_id = ? and ${where}`, [
		north.id,
		...args,
	]);

const serial = "ZZ-TEST-0001";

describe("in North", () => {
	test("the list shows exactly North's units, 20 per page", async () => {
		expect(await listedSerials()).toEqual(await serialsIn(north.id));
		await app.go("/equipment");
		expect(await app.rowCount()).toBe(await countIn("equipment", north.id));
		expect(await bodyRows().count()).toBe(20);
	});

	test("searching finds a unit by its serial number, case-insensitively", async () => {
		const { page } = app;
		const { serial: busy } = await busiest(north.id);
		const search = page.getByLabel("Search equipment…");
		await search.fill(busy.toLowerCase());
		await expect.poll(() => shownSerials()).toEqual([busy]);
		await search.fill("");
		await expect.poll(() => bodyRows().count()).toBe(20);
	});

	test("filtering by category, status and manufacturer", async () => {
		const { page } = app;
		const reset = async () => {
			await page.getByRole("button", { name: "Reset" }).click();
			await expect.poll(() => app.rowCount()).toBe(await countIn("equipment", north.id));
		};

		await filter("Category", "Chiller");
		await expect.poll(() => app.rowCount()).toBe(await count(`category = 'chiller'`));
		const chillers = await bodyRows().allInnerTexts();
		expect(chillers.length).toBeGreaterThan(0);
		expect(chillers.every((row) => row.includes("Chiller"))).toBe(true);
		await reset();

		await filter("Status", "Operational");
		await expect.poll(() => app.rowCount()).toBe(await count(`status = 'operational'`));
		const operational = await bodyRows().allInnerTexts();
		expect(operational.length).toBeGreaterThan(0);
		expect(operational.every((row) => row.includes("Operational"))).toBe(true);
		await reset();

		// A hidden column: the unit column shows it.
		const manufacturer = await value<string>(
			`select manufacturer from equipment where organization_id = ?
			 group by manufacturer order by count(*) desc, manufacturer limit 1`,
			[north.id],
		);
		await filter("Manufacturer", manufacturer);
		await expect.poll(() => app.rowCount()).toBe(await count(`manufacturer = ?`, [manufacturer]));
		const made = await bodyRows().allInnerTexts();
		expect(made.length).toBeGreaterThan(0);
		expect(made.every((row) => row.includes(manufacturer))).toBe(true);
		await reset();
	});

	test("sorting by warranty, paging, and sorting by open orders", async () => {
		const { page } = app;
		const sort = async (column: string, direction: "Ascending" | "Descending") => {
			await page.locator("thead").getByRole("button", { name: column }).click();
			await page.getByRole("menuitem", { name: direction }).click();
		};
		// The warranty cell's date is followed by its covered/expired badge.
		const warranties = () =>
			bodyRows()
				.locator("time")
				.evaluateAll((times) =>
					times
						.filter((time) => time.nextElementSibling)
						.map((time) => time.getAttribute("datetime")!),
				);

		await sort("Warranty", "Ascending");
		const ascending = await warranties();
		expect(ascending).toHaveLength(20);
		expect(ascending).toEqual([...ascending].sort());
		await sort("Warranty", "Descending");
		const descending = await warranties();
		expect(descending).toEqual([...descending].sort().reverse());
		const first = await bodyRows().first().innerText();
		expect(first).toMatch(/Covered|Expired/);

		await page.getByRole("button", { name: "Go to next page" }).click();
		expect(await page.getByText(/^Page \d+ of \d+$/).innerText()).toMatch(/^Page 2 of/);
		expect(await bodyRows().first().innerText()).not.toBe(first);

		const busiest = await rows<{ serial: string }>(
			`with open as (
				select e.serial_number as serial, count(*) as n from equipment e
				join "order" o on o.equipment_id = e.id
				where e.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
				group by e.id
			)
			select serial from open where n = (select max(n) from open)`,
			[north.id],
		);
		await sort("Open orders", "Descending");
		expect(await page.getByText(/^Page \d+ of \d+$/).innerText()).toMatch(/^Page 1 of/);
		const [top] = await shownSerials();
		expect(busiest.map((row) => row.serial)).toContain(top);
	});

	test("the detail page shows the unit's service history, most recent first", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		const numbers = await rows<{ number: string }>(
			`select number from "order" where equipment_id = ? order by created_at desc, id desc`,
			[busy.id],
		);
		await app.go(`/equipment/${busy.serial}`);
		const history = page.locator("table").first().locator("tbody tr td:first-child");
		expect(await history.allInnerTexts()).toEqual(numbers.map((row) => row.number));
		expect(await page.getByText("Last service").count()).toBeGreaterThan(0);
		expect(await page.getByText("Open orders").count()).toBeGreaterThan(0);
	});

	test("deleting a unit with orders is refused", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Delete" }));
		expect(await dialog.locator('[data-slot="field-error"]').innerText()).toContain(
			`${busy.orders} orders refer to it`,
		);
		expect(app.path()).toBe(`/equipment/${busy.serial}`);
		expect(await unitId(busy.serial, north.id)).toBe(busy.id);
		await page.keyboard.press("Escape");
	});

	test("moving a unit with orders to another customer is refused", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		const [before] = await unit(busy.id);
		await app.go(`/equipment/${busy.serial}/edit`);
		const options = await customerOptions();
		expect(options).toEqual(await customersIn(north.id));

		await page
			.getByLabel("Customer")
			.selectOption(options.find((id) => id !== String(before.customer_id))!);
		await app.submit(page.getByRole("button", { name: "Save equipment" }));
		expect(await app.issues()).toContainEqual(expect.stringContaining("Can't move this unit"));
		expect(app.path()).toBe(`/equipment/${busy.serial}/edit`);
		expect(await unit(busy.id)).toEqual([before]);
	});

	test("an unknown serial number is a 404", async () => {
		expect((await app.go("/equipment/NOPE-404"))?.status()).toBe(404);
	});

	test("registering a unit validates it first", async () => {
		const { page } = app;
		const before = await countIn("equipment", north.id);
		await app.go("/equipment/new");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));
		expect((await app.issues()).length).toBeGreaterThanOrEqual(5);

		// A serial number North already has, in lower case, and a warranty ending before installation.
		const { serial: busy } = await busiest(north.id);
		await page.getByLabel("Serial number").fill(busy.toLowerCase());
		await page.getByLabel("Manufacturer").fill("Testco");
		await page.getByLabel("Model").fill("TX-1");
		await page.getByLabel("Category").selectOption("chiller");
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Installed on").fill("2026-01-10");
		await page.getByLabel("Warranty until").fill("2025-01-10");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));
		const issues = await app.issues();
		expect(issues).toContainEqual(expect.stringContaining("already has this serial"));
		expect(issues).toContainEqual(expect.stringContaining("can't end before"));

		await page.getByLabel("Serial number").fill("zz test!");
		await page.getByLabel("Warranty until").fill("2029-01-10");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));
		expect(await app.issues()).toContainEqual(
			expect.stringContaining("letters, digits and dashes"),
		);
		expect(app.path()).toBe("/equipment/new");
		expect(await countIn("equipment", north.id)).toBe(before);
	});

	test("a new unit is stored with its serial number in upper case", async () => {
		const { page } = app;
		await page.getByLabel("Serial number").fill(serial.toLowerCase());
		await page.getByRole("button", { name: "Register equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${serial}`);
		await page.getByRole("heading", { name: "Testco TX-1" }).waitFor();
		expect(
			await rows(`select organization_id from equipment where serial_number = ?`, [serial]),
		).toEqual([{ organization_id: north.id }]);
		expect(await page.getByText("No orders yet").count()).toBe(1);
	});

	test("editing it saves the changes, including another customer", async () => {
		const { page } = app;
		const id = await unitId(serial, north.id);
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		expect(await page.getByLabel("Model").inputValue()).toBe("TX-1");
		expect(await page.getByLabel("Installed on").inputValue()).toBe("2026-01-10");
		const customer = await page.getByLabel("Customer").inputValue();

		await page.getByLabel("Model").fill("TX-2");
		await page.getByLabel("Status").selectOption("needs_service");
		await page.getByLabel("Customer").selectOption({ index: 2 });
		const moved = await page.getByLabel("Customer").inputValue();
		expect(moved).not.toBe(customer);
		await page.getByRole("button", { name: "Save equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${serial}`);
		await page.getByRole("heading", { name: "Testco TX-2" }).waitFor();
		const [saved] = await rows(`select model, status, customer_id from equipment where id = ?`, [
			id,
		]);
		expect(saved).toEqual({ model: "TX-2", status: "needs_service", customer_id: Number(moved) });
	});

	test("deleting it removes it, after which it's a 404", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/equipment");
		expect(await unitId(serial, north.id)).toBeUndefined();
		expect((await app.go(`/equipment/${serial}`))?.status()).toBe(404);
	});
});

describe("in South", () => {
	test("switching organization shows exactly South's units", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		expect(await listedSerials()).toEqual(await serialsIn(south.id));
		expect(await app.rowCount()).toBe(await countIn("equipment", south.id));
	});

	test("North's units are a 404", async () => {
		const { serial } = await northOnly();
		expect((await app.go(`/equipment/${serial}`))?.status()).toBe(404);
		expect((await app.go(`/equipment/${serial}/edit`))?.status()).toBe(404);
	});

	test("saving with the id of a North unit is refused", async () => {
		const { page } = app;
		const target = await northOnly();
		const own = await busiest(south.id);
		const [targetBefore, ownBefore] = [await unit(target.id), await unit(own.id)];

		await app.go(`/equipment/${own.serial}/edit`);
		const hidden = page.locator('form input[type="hidden"][name^="id/"]');
		expect(await hidden.inputValue()).toBe(String(own.id));
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target.id);
			await page.getByLabel("Model").fill("TAMPERED");
			return app.submit(page.getByRole("button", { name: "Save equipment" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/equipment/${own.serial}/edit`);
		expect(await unit(target.id)).toEqual(targetBefore);
		expect(await unit(own.id)).toEqual(ownBefore);
	});

	test("deleting with the id of a North unit is refused", async () => {
		const { page } = app;
		const target = await northOnly();
		const own = await busiest(south.id);
		const [targetBefore, ownBefore] = [await unit(target.id), await unit(own.id)];

		await app.go(`/equipment/${own.serial}`);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		const result = await app.expectingErrors(async () => {
			await dialog
				.locator('input[type="hidden"][name^="id/"]')
				.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target.id);
			return app.submit(dialog.getByRole("button", { name: "Delete" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/equipment/${own.serial}`);
		expect(targetBefore).toHaveLength(1);
		expect(await unit(target.id)).toEqual(targetBefore);
		expect(await unit(own.id)).toEqual(ownBefore);
	});

	test("a North customer and a serial number South already has are rejected", async () => {
		const { page } = app;
		const before = await countIn("equipment", south.id);
		const own = await busiest(south.id);
		const northCustomer = String(
			await value(`select min(id) from customer where organization_id = ?`, [north.id]),
		);

		await app.go("/equipment/new");
		expect(await customerOptions()).toEqual(await customersIn(south.id));
		const customer = page.getByLabel("Customer");
		await customer.evaluate(
			(select: HTMLSelectElement, id) => select.add(new Option("North customer", id)),
			northCustomer,
		);
		// Select it like a user would, so the form's own state follows.
		await customer.selectOption(northCustomer);
		await page.getByLabel("Serial number").fill(own.serial);
		await page.getByLabel("Manufacturer").fill("Testco");
		await page.getByLabel("Model").fill("TX-S");
		await page.getByLabel("Category").selectOption("chiller");
		await page.getByLabel("Installed on").fill("2026-01-10");
		await page.getByLabel("Warranty until").fill("2029-01-10");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));

		const issues = await app.issues();
		expect(issues).toContainEqual(expect.stringContaining("Unknown customer"));
		expect(issues).toContainEqual(expect.stringContaining("already has this serial"));
		expect(app.path()).toBe("/equipment/new");
		expect(await countIn("equipment", south.id)).toBe(before);
	});

	test("a serial number only North has can be reused, in South", async () => {
		const { page } = app;
		const { serial: shared } = await busiest(north.id);
		expect(await unitId(shared, south.id)).toBeUndefined();

		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Serial number").fill(shared.toLowerCase());
		await page.getByRole("button", { name: "Register equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${shared}`);
		await page.getByRole("heading", { name: "Testco TX-S" }).waitFor();
		expect(await page.getByText("No orders yet").count()).toBe(1);

		const stored = await rows(
			`select e.organization_id as unit, c.organization_id as customer, e.model from equipment e
			 join customer c on c.id = e.customer_id where e.serial_number = ? order by e.organization_id`,
			[shared],
		);
		expect(stored).toEqual([
			{ unit: north.id, customer: north.id, model: expect.not.stringMatching("TX-S") },
			{ unit: south.id, customer: south.id, model: "TX-S" },
		]);
	});

	test("the shared serial number shows South's unit", async () => {
		const { serial: shared } = await busiest(north.id);
		await app.go(`/equipment/${shared}/edit`);
		expect(await app.page.getByLabel("Model").inputValue()).toBe("TX-S");
	});

	test("deleting it leaves North's unit with that serial number", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		await app.go(`/equipment/${busy.serial}`);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/equipment");
		expect(await unitId(busy.serial, south.id)).toBeUndefined();
		expect(await unitId(busy.serial, north.id)).toBe(busy.id);
		expect(await orderCount(busy.id)).toBe(busy.orders);
	});
});
