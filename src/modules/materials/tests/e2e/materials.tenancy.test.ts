import { describe, expect, test } from "vite-plus/test";

import { cents, countIn, organizations, rows, useApp, value } from "#e2e/app.ts";

const { south } = organizations;
const app = useApp();

/** The tenant's module switches of materials since `since`. */
const switches = (since: number) =>
	rows<{ action: string }>(
		`select action from activity where organization_id = ? and subject_type = 'module'
		 and subject_id = 'materials' and id > ? order by id`,
		[south.id, since],
	);
/** The links of the sidebar's Records group. */
const records = () =>
	app.page
		.locator('[data-sidebar="group"]', { hasText: "Records" })
		.getByRole("link")
		.allInnerTexts();
const settingsCard = () => app.page.locator('[data-module="materials"]');
/** The order page's price card. */
const priceCard = () => app.page.locator('[data-slot="card"]', { hasText: "Unit price" });
/** One of South's completed orders that has material lines, with what it costs. */
const pricedOrder = async () =>
	(
		await rows<{ id: number; number: string; labor: number; materials: number }>(
			`select o.id, o.number, round(o.labor_hours * e.hourly_rate) as labor,
				(select sum(round(l.quantity * l.unit_price)) from order_line l where l.order_id = o.id)
				as materials
			 from "order" o join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and o.status = 'completed'
			 and exists (select 1 from order_line l where l.order_id = o.id)
			 order by o.id limit 1`,
			[south.id],
		)
	)[0];

/** The last activity entry before this file switched South's materials off. */
let since = 0;
/** The URL of the materials list's query, as loaded in North. */
let query: string;

/**
 * A tenant without materials: South, with the module switched off here and on again at the end,
 * so the file leaves South as it was seeded (both demo tenants have materials).
 */
describe("in South, with materials switched off", () => {
	test("an owner switches materials off in settings", async () => {
		const { page } = app;
		// Client-side in North, so the list loads its rows through a remote query.
		await app.go("/");
		const record = (request: { url(): string }) => {
			if (/\/_app\/remote\/.*\/getMaterials/.test(request.url())) query = request.url();
		};
		page.on("request", record);
		await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Materials" }).click();
		await page.waitForURL((url) => url.pathname === "/materials");
		await app.tableSettled();
		page.off("request", record);
		expect(query).toBeDefined();

		await app.switchOrganization(south.name);
		await app.go("/settings");
		since = await value<number>("select coalesce(max(id), 0) from activity");
		await app.submit(settingsCard().getByRole("button", { name: "Disable" }));
		await settingsCard().getByText("Disabled").waitFor();
		expect(
			await rows(
				`select module_id from organization_module where organization_id = ? and module_id = 'materials'`,
				[south.id],
			),
		).toEqual([]);
		expect(await switches(since)).toEqual([{ action: "module_disabled" }]);
	});

	test("the sidebar has no Materials, and its pages are 404s", async () => {
		await expect.poll(records).toEqual(["Customers", "Equipment", "Engineers"]);
		const sku = await value<string>(
			`select sku from material where organization_id = ? order by id limit 1`,
			[south.id],
		);
		for (const path of [
			"/materials",
			"/materials/new",
			`/materials/${sku}`,
			`/materials/${sku}/edit`,
		]) {
			const response = await app.expectingErrors(() => app.go(path));
			expect(response?.status(), path).toBe(404);
			// The app's own 404 page, inside its layout.
			expect(await app.page.locator('[data-sidebar="content"]').count(), path).toBe(1);
		}
	});

	test("the materials list's query is refused", async () => {
		const response = await app.page.context().request.get(query);
		const body = await response.text();
		expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
		expect(body).not.toContain("MAT-");
	});

	test("the dashboard has no low-stock tile", async () => {
		await app.go("/");
		await app.page.getByText("Open orders").first().waitFor();
		expect(await app.page.getByText("Low stock").count()).toBe(0);
	});

	test("an order costs its labour, on its page and in the list", async () => {
		const order = await pricedOrder();
		await app.go(`/orders/${order.number}`);
		await priceCard().waitFor();
		expect(await priceCard().locator('[data-slot="card-title"]').innerText()).toBe("Labour");
		expect(await priceCard().getByText("Materials").count()).toBe(0);
		expect(cents(await priceCard().locator("tfoot td").last().innerText())).toBe(order.labor);

		await app.go("/orders");
		await app.page.getByLabel("Search orders…").fill(order.number);
		await app.tableSettled();
		await expect.poll(() => app.rowCount()).toBe(1);
		const row = app.page.locator('[data-slot="data-table"] tbody tr').first();
		expect(cents(await row.locator("td:nth-last-child(2)").innerText())).toBe(order.labor);
	});

	test("the order form has no materials, and a tampered part of it stores none", async () => {
		const { page } = app;
		const movements = await countIn("stock_movement", south.id);
		const materialId = await value<number>(
			`select id from material where organization_id = ? order by id limit 1`,
			[south.id],
		);
		await app.go("/orders/new");
		expect(await page.getByRole("button", { name: "Add material" }).count()).toBe(0);
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Type").selectOption("repair");
		await page.getByLabel("Description").fill("Without materials (test order)");
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByLabel("Engineer").selectOption({ index: 1 });
		await page.getByLabel("Labour (hours)").fill("2");
		// What the materials' part would submit, were it there, posted the way a browser without
		// JavaScript would (the enhanced form wouldn't send fields it didn't make): refused, as a
		// field the form doesn't have, and nothing is stored.
		const description = "Without materials (test order)";
		const status = await app.expectingErrors(() =>
			page.evaluate(async (id) => {
				const form = document.querySelector<HTMLFormElement>("form:has(button[type=submit])")!;
				const body = new URLSearchParams(
					[...new FormData(form)].map(([name, value]) => [name, String(value)]),
				);
				body.append("modules.materials.lines[0].materialId", String(id));
				body.append("n:modules.materials.lines[0].quantity", "1");
				const headers = { accept: "text/html" };
				return (await fetch(form.action, { method: "POST", body, headers })).status;
			}, materialId),
		);
		expect(status).toBeGreaterThanOrEqual(400);
		const created = () =>
			rows<{ id: number; number: string }>(
				`select id, number from "order" where organization_id = ? and description = ?`,
				[south.id, description],
			);
		expect(await created()).toEqual([]);

		// The form as it is makes the order, with no lines and no stock moved.
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await page.waitForLoadState("networkidle");
		const [{ id, number }] = await created();
		expect(await value(`select count(*) from order_line where order_id = ?`, [id])).toBe(0);
		expect(await countIn("stock_movement", south.id)).toBe(movements);

		// Cancelling and deleting it move no stock either.
		await app.go(`/orders/${number}/edit`);
		await page.getByLabel("Status").selectOption("cancelled");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		expect(await value(`select count(*) from "order" where id = ?`, [id])).toBe(0);
		expect(await countIn("stock_movement", south.id)).toBe(movements);
	});
});

describe("switching materials on again in South", () => {
	test("brings back its pages, and its orders' materials and prices", async () => {
		await app.go("/settings");
		await app.submit(settingsCard().getByRole("button", { name: "Enable" }));
		await settingsCard()
			.getByText(/Enabled since/)
			.waitFor();
		expect(await switches(since)).toEqual([
			{ action: "module_disabled" },
			{ action: "module_enabled" },
		]);
		await expect.poll(records).toEqual(["Customers", "Equipment", "Engineers", "Materials"]);
		expect((await app.go("/materials"))?.status()).toBe(200);

		const order = await pricedOrder();
		await app.go(`/orders/${order.number}`);
		await priceCard().waitFor();
		expect(await priceCard().locator('[data-slot="card-title"]').innerText()).toBe(
			"Materials and labour",
		);
		expect(cents(await priceCard().locator("tfoot td").last().innerText())).toBe(
			order.labor + order.materials,
		);
	});
});
