import { describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, value } from "./app.ts";
import {
	busiest,
	customersIn,
	equipmentPage,
	northOnly,
	orderCount,
	serialsIn,
	unit,
	unitId,
} from "./equipment-helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, customerOptions, listedSerials, shownTimeline, timeline } = equipmentPage(app);

describe("in South", () => {
	test("switching organization shows exactly South's units", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		expect(await listedSerials()).toEqual(await serialsIn(south.id));
		expect(await app.rowCount()).toBe(await countIn("equipment", south.id));
	});

	test("the list never shows North's units, whatever its filters say", async () => {
		const { page } = app;
		const northCode = await value<string>(
			`select code from customer where organization_id = ?
			 and code not in (select code from customer where organization_id = ?) order by code limit 1`,
			[north.id, south.id],
		);
		await app.go(`/equipment?customer=${northCode}`);
		expect(await app.rowCount()).toBe(0);

		// The filters count South's units only.
		await app.go("/equipment");
		await app.openFilter("Category");
		// Polled: the menu shows the filters' titles until it has switched to the picked one's values.
		const counted = async () =>
			(await page.getByRole("option").allInnerTexts())
				.map((text) => Number(/(\d+)$/.exec(text.trim())?.[1]))
				.reduce((sum, n) => sum + n, 0);
		await expect.poll(counted).toBe(await countIn("equipment", south.id));
		// South's own categories, none of North's.
		const southCategories = await rows<{ name: string; n: number }>(
			`select c.name, count(e.id) as n from equipment_category c
			 left join equipment e on e.category_id = c.id
			 where c.organization_id = ? group by c.id order by c.position, c.id`,
			[south.id],
		);
		expect(
			(await page.getByRole("option").allInnerTexts()).map((text) => text.trim().split(/\s+/)[0]),
		).toEqual(southCategories.map((category) => category.name));
		await page.keyboard.press("Escape");
	});

	test("grouped, the categories count South's units only", async () => {
		const expected = Object.fromEntries(
			(
				await rows<{ category: string; n: number }>(
					`select cast(category_id as text) as category, count(*) as n from equipment
					 where organization_id = ? group by category_id`,
					[south.id],
				)
			).map((row) => [row.category, row.n]),
		);
		await app.go("/equipment?group=category");
		await app.loadAllRows();
		const counts: Record<string, number> = {};
		for (const group of await app.groups()) counts[group.key] = group.count;
		expect(counts).toEqual(expected);
	});

	test("North's units are a 404", async () => {
		const { serial } = await northOnly();
		expect((await app.go(`/equipment/${serial}`))?.status()).toBe(404);
		expect((await app.go(`/equipment/${serial}/edit`))?.status()).toBe(404);
	});

	test("North's unit history is a 404", async () => {
		const busy = await busiest(north.id);
		expect(await unitId(busy.serial, south.id)).toBeUndefined();
		expect((await app.go(`/equipment/${busy.serial}`))?.status()).toBe(404);
		expect(await timeline().count()).toBe(0);
		const numbers = await rows<{ number: string }>(
			`select number from "order" where equipment_id = ?`,
			[busy.id],
		);
		const body = await app.page.locator("body").innerText();
		for (const { number } of numbers) expect(body).not.toContain(number);
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
		const inSouth = await customersIn(south.id);
		await expect.poll(customerOptions).toEqual(inSouth);
		const customer = page.getByLabel("Customer");
		await customer.evaluate(
			(select: HTMLSelectElement, id) => select.add(new Option("North customer", id)),
			northCustomer,
		);
		// Select it like a user would, so the form's own state follows.
		await customer.selectOption(northCustomer);
		// And one of its sites, which South's form doesn't know either.
		const northSite = String(
			await value(`select min(id) from customer_site where customer_id = ?`, [northCustomer]),
		);
		const site = page.getByLabel("Site", { exact: true });
		await site.evaluate(
			(select: HTMLSelectElement, id) => select.add(new Option("North site", id)),
			northSite,
		);
		await site.selectOption(northSite);
		await page.getByLabel("Serial number").fill(own.serial);
		await page.getByLabel("Manufacturer").fill("Testco");
		await page.getByLabel("Model").fill("TX-S");
		// And one of North's categories, by its id.
		const northCategory = String(
			await value(`select min(id) from equipment_category where organization_id = ?`, [north.id]),
		);
		const category = page.getByLabel("Category");
		await category.evaluate(
			(select: HTMLSelectElement, id) => select.add(new Option("North category", id)),
			northCategory,
		);
		await category.selectOption(northCategory);
		await page.getByLabel("Installed on").fill("2026-01-10");
		await page.getByLabel("Warranty until").fill("2029-01-10");
		await app.submit(page.getByRole("button", { name: "Register equipment" }));

		const issues = await app.issues();
		expect(issues).toContainEqual(expect.stringContaining("Unknown customer"));
		expect(issues).toContainEqual(expect.stringContaining("already has this serial"));
		expect(issues).toContain("Choose one of your organization's categories");
		expect(app.path()).toBe("/equipment/new");
		expect(await countIn("equipment", south.id)).toBe(before);
		// South's own one, for the next test.
		await category.selectOption({ label: "Koelmachine" });
	});

	test("a serial number only North has can be reused, in South", async () => {
		const { page } = app;
		const { serial: shared } = await busiest(north.id);
		expect(await unitId(shared, south.id)).toBeUndefined();

		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Site", { exact: true }).selectOption({ index: 1 });
		await page.getByLabel("Serial number").fill(shared.toLowerCase());
		await page.getByRole("button", { name: "Register equipment" }).click();
		await page.waitForURL((url) => url.pathname === `/equipment/${shared}`);
		await page.getByRole("heading", { name: "Testco TX-S" }).waitFor();
		// North's unit with this serial number has orders; South's new one has none.
		expect(await page.getByText("No orders yet").count()).toBe(1);
		expect(await shownTimeline()).toEqual(["warranty", "installation"]);
		expect(await card("Orders")).toMatch(/^Orders 0 /);

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

	test("a unit can't be put at a North site, nor at another customer's", async () => {
		const { page } = app;
		const own = await busiest(south.id);
		const before = await unit(own.id);
		const owner = before[0].customer_id as number;
		const northSite = await value<number>(
			`select min(id) from customer_site where organization_id = ?`,
			[north.id],
		);
		const otherCustomers = await value<number>(
			`select min(id) from customer_site where organization_id = ? and customer_id != ?`,
			[south.id, owner],
		);

		await app.go(`/equipment/${own.serial}/edit`);
		const site = page.getByLabel("Site", { exact: true });
		// Only its own customer's sites to choose from.
		const offered = await site
			.locator("option")
			.evaluateAll((options) =>
				options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
			);
		const byId = (a: number, b: number) => a - b;
		expect(offered.map(Number).sort(byId)).toEqual(
			(await rows<{ id: number }>(`select id from customer_site where customer_id = ?`, [owner]))
				.map((row) => row.id)
				.sort(byId),
		);
		for (const tampered of [northSite, otherCustomers]) {
			await site.evaluate(
				(select: HTMLSelectElement, id) => select.add(new Option("Elsewhere", id)),
				String(tampered),
			);
			await site.selectOption(String(tampered));
			await app.submit(page.getByRole("button", { name: "Save equipment" }));
			expect(await app.issues()).toContainEqual("Choose one of the customer's sites");
			expect(app.path()).toBe(`/equipment/${own.serial}/edit`);
			expect(await unit(own.id)).toEqual(before);
		}
	});
});
