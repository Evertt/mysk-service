import { describe, expect, test } from "vite-plus/test";

import { formatCents } from "../src/lib/format.ts";
import { countIn, nextCode, organizations, rows, useApp, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

interface Material {
	id: number;
	organization_id: string;
	sku: string;
	name: string;
	unit: string;
	unit_price: number;
	stock: number;
}

/** A material as stored, by SKU in an organization. */
const material = async (sku: string, organizationId: string) =>
	(
		await rows<Material>(`select * from material where sku = ? and organization_id = ?`, [
			sku,
			organizationId,
		])
	)[0];
/** A material as stored, by id, to check that a refused request changed nothing. */
const snapshot = (id: number) => rows(`select * from material where id = ?`, [id]);
/** The number of orders that use a material. */
const ordersUsing = async (id: number) =>
	Number(
		await value(`select count(distinct order_id) from order_line where material_id = ?`, [id]),
	);

const testName = "Test gasket (materials check)";

/** The names in the table, in order. */
const names = () => app.page.locator("tbody td a").allInnerTexts();
const tableRows = () => app.page.locator("tbody tr");
const search = () => app.page.getByLabel("Search materials…");
const main = async () => (await app.page.locator("main").innerText()).replace(/\s+/g, " ");

/** Opens a faceted filter and ticks options. */
async function filter(title: string, ...options: RegExp[]) {
	const { page } = app;
	await page.locator('[data-slot="popover-trigger"]', { hasText: title }).click();
	for (const option of options) await page.getByRole("option", { name: option }).click();
	await page.keyboard.press("Escape");
}

/** Sorts the table by a column through its header menu. */
async function sortBy(column: string, direction: "Ascending" | "Descending") {
	const { page } = app;
	await page.locator("thead").getByRole("button", { name: column }).click();
	await page.getByRole("menuitem", { name: direction }).click();
}

/** Checks that searching the list for MAT-0001 shows the organization's price and usage. */
async function expectFirstMaterial(organizationId: string) {
	const first = await material("MAT-0001", organizationId);
	await search().fill("MAT-0001");
	const text = (await tableRows().allInnerTexts()).map((row) => row.replace(/\s+/g, " "));
	expect(text).toHaveLength(1);
	expect(text[0]).toContain(first.name);
	expect(text[0]).toContain(formatCents(first.unit_price));
	const used = await ordersUsing(first.id);
	expect(text[0]).toContain(`${used} ${used === 1 ? "order" : "orders"}`);
	await app.page.getByRole("button", { name: "Reset" }).click();
}

describe("in North", () => {
	let busy: Material;
	let sku: string;

	test("the list shows North's materials by name, 20 per page", async () => {
		await app.go("/materials");
		const total = await countIn("material", north.id);
		expect(await app.rowCount()).toBe(total);
		const shown = await names();
		expect(shown).toHaveLength(Math.min(20, total));
		expect(shown).toEqual(shown.toSorted((a, b) => a.localeCompare(b)));
		await expectFirstMaterial(north.id);
	});

	test("the list pages", async () => {
		const { page } = app;
		const total = await countIn("material", north.id);
		const pages = Math.ceil(total / 20);
		expect(await page.getByText(`Page 1 of ${pages}`).count()).toBe(1);
		await page.getByRole("button", { name: "Go to next page" }).click();
		expect(await page.getByText(`Page 2 of ${pages}`).count()).toBe(1);
		expect(await tableRows().count()).toBe(Math.min(20, total - 20));
		await page.getByRole("button", { name: "Go to previous page" }).click();
	});

	test("searching finds materials by SKU and by name", async () => {
		const { page } = app;
		const third = await material("MAT-0003", north.id);
		await search().fill("MAT-0003");
		expect(await names()).toEqual([third.name]);

		await search().fill("refrigerant");
		const refrigerants = await rows<{ name: string }>(
			`select name from material where organization_id = ? and name like '%refrigerant%' order by name`,
			[north.id],
		);
		expect(refrigerants.length).toBeGreaterThan(0);
		expect((await names()).toSorted()).toEqual(refrigerants.map((row) => row.name).toSorted());
		await page.getByRole("button", { name: "Reset" }).click();
	});

	test("filtering by unit shows only those", async () => {
		await filter("Unit", /Litres/);
		const litres = Number(
			await value(`select count(*) from material where organization_id = ? and unit = 'l'`, [
				north.id,
			]),
		);
		expect(litres).toBeGreaterThan(0);
		expect(await app.rowCount()).toBe(litres);
		for (const row of await tableRows().allInnerTexts()) expect(row).toContain("Litres");
		await app.page.getByRole("button", { name: "Reset" }).click();
	});

	test("filtering by stock level shows the low and out of stock ones", async () => {
		await filter("Stock level", /Out of stock/, /^Low/);
		const low = Number(
			await value(
				`select count(*) from material where organization_id = ?
				 and stock < case unit when 'pcs' then 10 else 50 end`,
				[north.id],
			),
		);
		expect(await app.rowCount()).toBe(low);
		for (const row of await tableRows().allInnerTexts()) {
			expect(row).toMatch(/Out of stock|Low/);
		}
		await app.page.getByRole("button", { name: "Reset" }).click();
	});

	test("sorting by unit price puts the most expensive first", async () => {
		await sortBy("Unit price", "Descending");
		const prices = (await tableRows().allInnerTexts()).map((row) =>
			Number(/€([\d,]+\.\d\d)/.exec(row)![1].replaceAll(",", "")),
		);
		expect(prices).toEqual(prices.toSorted((a, b) => b - a));
		const highest = await value<number>(
			`select max(unit_price) from material where organization_id = ?`,
			[north.id],
		);
		expect(prices[0]).toBe(highest / 100);
	});

	test("sorting by usage puts the busiest first, whose page lists its orders", async () => {
		const { page } = app;
		await sortBy("Used on", "Descending");
		const [most] = await rows<{ orders: number }>(
			`select count(distinct l.order_id) as orders from material m
			 join order_line l on l.material_id = m.id where m.organization_id = ?
			 group by m.id order by orders desc limit 1`,
			[north.id],
		);
		expect(await tableRows().first().innerText()).toContain(`${most.orders} orders`);

		await tableRows().first().locator("td a").click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await page.waitForLoadState("networkidle");
		busy = await material(app.path().split("/").pop()!, north.id);
		expect(await ordersUsing(busy.id)).toBe(most.orders);
		await page.getByRole("heading", { name: busy.name }).waitFor();
		const usage = page.locator("table").first().locator("tbody tr");
		expect(await usage.count()).toBe(most.orders);
		expect(await usage.first().locator('a[href^="/orders/"]').innerText()).toMatch(/^ORD-/);
	});

	test("a material that's used on orders can't be deleted", async () => {
		const { page } = app;
		const before = await snapshot(busy.id);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Delete" }));
		expect(await dialog.locator('[data-slot="field-error"]').innerText()).toContain(
			`This material is used on ${await ordersUsing(busy.id)} orders`,
		);
		expect(app.path()).toBe(`/materials/${busy.sku}`);
		expect(await snapshot(busy.id)).toEqual(before);
		await page.keyboard.press("Escape");
	});

	test("nor can its unit change", async () => {
		const { page } = app;
		const before = await snapshot(busy.id);
		await app.go(`/materials/${busy.sku}/edit`);
		const unit = page.getByLabel("Unit", { exact: true });
		expect(await unit.inputValue()).toBe(busy.unit);
		await unit.selectOption(busy.unit === "kg" ? "l" : "kg");
		await app.submit(page.getByRole("button", { name: "Save material" }));
		expect(await app.issues()).toContainEqual(
			`Can't change the unit: ${await ordersUsing(busy.id)} orders count this material in ${busy.unit}`,
		);
		expect(app.path()).toBe(`/materials/${busy.sku}/edit`);
		expect(await snapshot(busy.id)).toEqual(before);
	});

	test("creating a material validates it first", async () => {
		const { page } = app;
		const before = await countIn("material", north.id);
		await app.go("/materials/new");
		await page.getByLabel("Unit price").fill("");
		await page.getByLabel("Stock", { exact: true }).fill("-3");
		// The browser's own checks stop the form first.
		await page.getByRole("button", { name: "Create material" }).click();
		expect(await page.locator("form :invalid").count()).toBeGreaterThan(0);
		expect(app.path()).toBe("/materials/new");

		// Without them, the server's.
		await page
			.locator("form")
			.last()
			.evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await page.getByLabel("Name", { exact: true }).fill("   ");
		await app.submit(page.getByRole("button", { name: "Create material" }));
		expect((await app.issues()).toSorted()).toEqual(
			["Can't be negative", "Enter a price", "Name the material"].toSorted(),
		);
		expect(app.path()).toBe("/materials/new");
		expect(await countIn("material", north.id)).toBe(before);
	});

	test("a name that's taken (in any case) is refused", async () => {
		const { page } = app;
		const before = await countIn("material", north.id);
		await page.getByLabel("Name", { exact: true }).fill(busy.name.toUpperCase());
		await page.getByLabel("Unit price").fill("12.5");
		await page.getByLabel("Stock", { exact: true }).fill("4");
		await app.submit(page.getByRole("button", { name: "Create material" }));
		expect(await app.issues()).toEqual([`${busy.sku} already has this name`]);
		expect(await countIn("material", north.id)).toBe(before);
	});

	test("a new material gets the next SKU", async () => {
		const { page } = app;
		await page.getByLabel("Name", { exact: true }).fill(testName);
		await page.getByLabel("Unit", { exact: true }).selectOption("pcs");
		const expected = await nextCode("material", "sku", north.id);
		await page.getByRole("button", { name: "Create material" }).click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await page.waitForLoadState("networkidle");
		sku = app.path().split("/").pop()!;
		expect(sku).toBe(expected);
		await app.toast("Material created");
		expect(await material(sku, north.id)).toMatchObject({
			name: testName,
			unit: "pcs",
			unit_price: 1250,
			stock: 4,
		});

		await page.getByRole("heading", { name: testName }).waitFor();
		const text = await main();
		expect(text).toContain("€12.50");
		expect(text).toContain("4 pcs");
		expect(text).toContain("Low");
		expect(text).toContain("Not used yet");
	});

	test("editing it saves the changes, including the unit while it's unused", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		expect(await page.getByLabel("Name", { exact: true }).inputValue()).toBe(testName);
		expect(await page.getByLabel("Unit", { exact: true }).inputValue()).toBe("pcs");
		expect(Number(await page.getByLabel("Unit price").inputValue())).toBe(12.5);
		expect(await page.getByLabel("Stock", { exact: true }).inputValue()).toBe("4");

		await page.getByLabel("Unit", { exact: true }).selectOption("m");
		await page.getByLabel("Unit price").fill("3.99");
		await page.getByLabel("Stock", { exact: true }).fill("0");
		await page.getByRole("button", { name: "Save material" }).click();
		await page.waitForURL((url) => url.pathname === `/materials/${sku}`);
		await page.waitForLoadState("networkidle");
		await app.toast("Material saved");
		expect(await material(sku, north.id)).toMatchObject({ unit: "m", unit_price: 399, stock: 0 });
		const text = await main();
		expect(text).toContain("€3.99");
		expect(text).toContain("0 m");
		expect(text).toContain("Out of stock");
	});

	test("metres take decimals, pieces only whole numbers", async () => {
		const { page } = app;
		await app.go(`/materials/${sku}/edit`);
		await page.getByLabel("Stock", { exact: true }).fill("12.75");
		await page.getByRole("button", { name: "Save material" }).click();
		await page.waitForURL((url) => url.pathname === `/materials/${sku}`);
		await page.getByText("12.75 m").first().waitFor();
		expect(await material(sku, north.id)).toMatchObject({ unit: "m", stock: 12.75 });

		await app.go(`/materials/${sku}/edit`);
		await page.getByLabel("Unit", { exact: true }).selectOption("pcs");
		expect(await page.getByLabel("Stock", { exact: true }).getAttribute("step")).toBe("1");
		// Past the browser's own check of the step, to see the app's.
		await page
			.locator("form")
			.last()
			.evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await app.submit(page.getByRole("button", { name: "Save material" }));
		expect(await app.issues()).toEqual(["Whole pieces only"]);
		expect(await material(sku, north.id)).toMatchObject({ unit: "m", stock: 12.75 });
	});

	test("an unknown SKU is a 404", async () => {
		expect((await app.go("/materials/MAT-9999"))?.status()).toBe(404);
		expect((await app.go("/materials/MAT-9999/edit"))?.status()).toBe(404);
	});
});

describe("in South", () => {
	/** The material created in North, which South doesn't have. */
	let northOnly: Material;

	test("switching organization shows South's materials", async () => {
		[northOnly] = await rows<Material>(
			`select * from material where name = ? and organization_id = ?`,
			[testName, north.id],
		);
		await app.switchOrganization(south.name);
		await app.go("/materials");
		expect(await app.rowCount()).toBe(await countIn("material", south.id));
		await expectFirstMaterial(south.id);
	});

	test("North's own SKU is a 404", async () => {
		expect(northOnly.name).toBe(testName);
		expect(await material(northOnly.sku, south.id)).toBeUndefined();
		expect((await app.go(`/materials/${northOnly.sku}`))?.status()).toBe(404);
		expect((await app.go(`/materials/${northOnly.sku}/edit`))?.status()).toBe(404);
	});

	test("a SKU both have shows South's material", async () => {
		const { page } = app;
		const own = await material("MAT-0001", south.id);
		const other = await material("MAT-0001", north.id);
		expect(own.unit_price).not.toBe(other.unit_price);
		await app.go("/materials/MAT-0001");
		const text = await main();
		expect(text).toContain(formatCents(own.unit_price));
		expect(text).not.toContain(formatCents(other.unit_price));
		expect(await page.locator("table").first().locator("tbody tr").count()).toBe(
			await ordersUsing(own.id),
		);
		await app.go("/materials/MAT-0001/edit");
		expect(await page.getByLabel("Stock", { exact: true }).inputValue()).toBe(String(own.stock));
	});

	test("saving with the id of a North material is refused", async () => {
		const { page } = app;
		const own = await material("MAT-0002", south.id);
		const [victimBefore, ownBefore] = [await snapshot(northOnly.id), await snapshot(own.id)];

		await app.go("/materials/MAT-0002/edit");
		await page.getByLabel("Name", { exact: true }).fill("Tampered name");
		await page.getByLabel("Stock", { exact: true }).fill("777");
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('form input[type="hidden"][name^="id"]')!.value =
					String(id);
			}, northOnly.id);
			return app.submit(page.getByRole("button", { name: "Save material" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe("/materials/MAT-0002/edit");
		expect(await snapshot(northOnly.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});

	test("deleting with the id of a North material is refused", async () => {
		const { page } = app;
		const own = await material("MAT-0001", south.id);
		const [victimBefore, ownBefore] = [await snapshot(northOnly.id), await snapshot(own.id)];

		await app.go("/materials/MAT-0001");
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id"]')!.value =
					String(id);
			}, northOnly.id);
			return app.submit(dialog.getByRole("button", { name: "Delete" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe("/materials/MAT-0001");
		expect(await snapshot(northOnly.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});

	test("a new material gets South's next SKU, and may use a name only North has", async () => {
		const { page } = app;
		const expected = await nextCode("material", "sku", south.id);
		await app.go("/materials/new");
		await page.getByLabel("Name", { exact: true }).fill(testName);
		await page.getByLabel("Unit", { exact: true }).selectOption("pcs");
		await page.getByLabel("Unit price").fill("8.25");
		await page.getByLabel("Stock", { exact: true }).fill("12");
		await page.getByRole("button", { name: "Create material" }).click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await page.waitForLoadState("networkidle");
		expect(app.path()).toBe(`/materials/${expected}`);
		expect(await material(expected, south.id)).toMatchObject({
			name: testName,
			unit_price: 825,
			stock: 12,
		});
		await page.getByRole("heading", { name: testName }).waitFor();
		const text = await main();
		expect(text).toContain("€8.25");
		expect(text).toContain("12 pcs");
	});

	test("deleting it removes only South's, after which it's a 404", async () => {
		const { page } = app;
		const deleted = app.path().split("/").pop()!;
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/materials");
		expect(await material(deleted, south.id)).toBeUndefined();
		expect(await snapshot(northOnly.id)).toHaveLength(1);
		expect((await app.go(`/materials/${deleted}`))?.status()).toBe(404);
	});
});
