import { describe, expect, test } from "vite-plus/test";

import { cents, organizations, rows, useApp, value } from "#e2e/app.ts";

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

/**
 * A tenant without materials: South, with the module switched off here and on again at the end,
 * so the file leaves South as it was seeded (both demo tenants have materials).
 */
describe("in South, with materials switched off", () => {
	test("an owner switches materials off in settings", async () => {
		await app.go("/");
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

	// The other pages' and the queries' 404s are the module route guard's and `moduleRemote`'s
	// (`route-guard.spec.ts`, `remote-functions.spec.ts`).
	test("the sidebar has no Materials, and its pages are 404s", async () => {
		await expect.poll(records).toEqual(["Customers", "Equipment", "Engineers"]);
		const sku = await value<string>(
			`select sku from material where organization_id = ? order by id limit 1`,
			[south.id],
		);
		const response = await app.expectingErrors(() => app.go(`/materials/${sku}`));
		expect(response?.status()).toBe(404);
		// The app's own 404 page, inside its layout.
		expect(await app.page.locator('[data-sidebar="content"]').count()).toBe(1);
	});

	test("the dashboard has no low-stock tile", async () => {
		await app.go("/");
		await app.page.getByText("Open orders").first().waitFor();
		expect(await app.page.getByText("Low stock").count()).toBe(0);
	});

	// That a tampered form's materials are refused, and its order's labour priced alone, is
	// `tests/unit/server/orders.spec.ts`'s.
	test("the order form has no materials", async () => {
		await app.go("/orders/new");
		await app.page.getByLabel("Customer").waitFor();
		expect(await app.page.getByRole("button", { name: "Add material" }).count()).toBe(0);
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
