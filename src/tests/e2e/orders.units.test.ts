/**
 * Orders about several units: the form chooses them in their order, the order's page, the list,
 * the units' service history and the engineer portal show them all, the log names those added and
 * removed, and no unit of another tenant or customer gets on an order, also by a tampered form.
 */
import { describe, expect, test } from "vite-plus/test";

import { afresh, organizations, rows, useApp, users, value, quiet } from "./app.ts";
import { equipmentPage } from "./equipment-helpers.ts";
import { addUnits, formUnits, orderId, orderUnits, snapshot } from "./orders-helpers.ts";
import { signedInPage } from "./portal-helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { timeline } = equipmentPage(app);

interface Unit {
	id: number;
	serial: string;
	title: string;
	site: string;
	access: string | null;
}

/** A unit's columns as the tests need them: what it's called as the app calls it, and its site. */
const unitColumns = `e.id, e.serial_number as serial,
	coalesce(e.name, e.manufacturer || ' ' || e.model) as title, s.name as site,
	s.access_notes as access`;

/** North's customer with the most units, and four of them. */
async function customerWithUnits() {
	const [owner] = await rows<{ id: number; code: string }>(
		`select c.id, c.code from customer c where c.organization_id = ?
		 order by (select count(*) from equipment e where e.customer_id = c.id) desc, c.id limit 1`,
		[north.id],
	);
	const units = await rows<Unit>(
		`select ${unitColumns} from equipment e join customer_site s on s.id = e.site_id
		 where e.customer_id = ? order by e.id limit 4`,
		[owner.id],
	);
	expect(units).toHaveLength(4);
	return { owner, units };
}

/** The units on the order's page, in their order, by serial number. */
const shownUnits = () =>
	app.page
		.getByRole("list", { name: "Units" })
		.locator(":scope > li")
		.evaluateAll((items) =>
			items.map((item) => item.querySelector('a[href^="/equipment/"]')!.getAttribute("href")!),
		);

/** The rows of the units chosen in the order form. */
const chosen = () => app.page.getByRole("list", { name: "Units" }).locator(":scope > li");

describe("in North, an order about several units", () => {
	let owner: { id: number; code: string };
	let units: Unit[];
	let number: string;
	let id: number;

	test("is created with the units chosen, in the order they're put in", async () => {
		const { page } = app;
		({ owner, units } = await customerWithUnits());
		const [a, b, c] = units;
		await app.go("/orders/new");
		await page.getByLabel("Customer").selectOption(String(owner.id));
		await addUnits(app, { id: a.id }, { id: b.id }, { id: c.id });
		expect(await formUnits(app)).toEqual([a.id, b.id, c.id]);
		expect(await page.getByText("3 units", { exact: true }).count()).toBe(1);
		// The last one up: it comes before the second.
		await chosen().nth(2).getByRole("button", { name: /up$/ }).click();
		expect(await formUnits(app)).toEqual([a.id, c.id, b.id]);

		await page.getByLabel("Type").selectOption("inspection");
		await page.getByLabel("Description").fill("Yearly inspection of the doors (test order)");
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await quiet(page);
		await app.toast("Order created");
		number = app.path().split("/").pop()!;
		id = await orderId(number, north.id);
		expect(await orderUnits(id)).toEqual([a.id, c.id, b.id]);
	});

	test("its page shows each unit, linked to its page, and the sites they're at", async () => {
		const [a, b, c] = units;
		expect(await shownUnits()).toEqual(
			[a, c, b].map((unit) => `/equipment/${encodeURIComponent(unit.serial)}`),
		);
		const card = app.page.locator('[data-slot="card"]', {
			has: app.page.getByRole("list", { name: "Units" }),
		});
		const text = await card.innerText();
		expect(text).toContain("3 units");
		for (const unit of [a, b, c]) {
			expect(text).toContain(unit.title);
			expect(text).toContain(unit.serial);
			expect(text).toContain(unit.site);
		}
		// A card for each of their sites.
		const sites = await app.page.locator("[data-site]").allInnerTexts();
		expect(sites).toHaveLength(new Set([a, b, c].map((unit) => unit.site)).size);
		for (const unit of [a, b, c]) expect(sites.join("\n")).toContain(unit.site);
		// Other orders for any of them.
		expect(await app.page.getByText("Other orders for any of these 3 units.").count()).toBe(1);
	});

	test("editing takes a unit off and puts another on, and the log names them", async () => {
		const { page } = app;
		const [a, b, c, d] = units;
		await app.go(`/orders/${number}/edit`);
		expect(await formUnits(app)).toEqual([a.id, c.id, b.id]);
		await chosen()
			.nth(2)
			.getByRole("button", { name: /^Remove/ })
			.click();
		await addUnits(app, { id: d.id });
		expect(await formUnits(app)).toEqual([a.id, c.id, d.id]);
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await quiet(page);
		expect(await orderUnits(id)).toEqual([a.id, c.id, d.id]);

		const activity = page.locator('[data-card="activity"]');
		await activity.getByText("units:").waitFor();
		const logged = await activity.getByText("units:").innerText();
		expect(logged).toContain(`added ${d.title} (${d.serial})`);
		expect(logged).toContain(`removed ${b.title} (${b.serial})`);
	});

	test("the list shows its first unit and how many more, and finds it by any of them", async () => {
		const { page } = app;
		const [a, c] = [units[0], units[2]];
		await app.go(`/orders?q=${encodeURIComponent(number)}`);
		const row = page.locator("tbody tr", { hasText: number });
		const cell = await row.locator("td:nth-child(4)").innerText();
		expect(cell).toContain(a.title);
		expect(cell).toContain("+2");

		// By the serial number of its second unit, in the search and in the filter.
		await app.go(`/orders?q=${encodeURIComponent(c.serial)}`);
		expect(await page.locator("tbody tr", { hasText: number }).count()).toBe(1);
		await app.go(`/orders?equipment=${encodeURIComponent(c.serial)}`);
		const withUnit = await value<number>(
			`select count(*) from order_unit u join "order" o on o.id = u.order_id
			 where u.equipment_id = ? and o.organization_id = ?`,
			[c.id, north.id],
		);
		expect(await app.rowCount()).toBe(withUnit);
		await app.loadAllRows();
		expect(await page.locator("tbody tr", { hasText: number }).count()).toBe(1);
		await app.go(afresh("/orders"));
	});

	test("it's in the service history of each of its units, at its share of the cost", async () => {
		const { page } = app;
		const d = units[3];
		await app.go(`/equipment/${encodeURIComponent(d.serial)}`);
		const entry = timeline().filter({ has: page.getByRole("link", { name: number }) });
		expect(await entry.locator('[data-cost="share"]').innerText()).toMatch(
			/^One of 3 units on this order; this unit's share is /,
		);
	});

	test("the engineer it's planned for sees all its units, and their sites' access notes", async () => {
		const { page } = app;
		const [a, , c, d] = units;
		const [engineer] = await rows<{ name: string }>(
			`select e.name from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[users.engineer, north.id],
		);
		await app.go(`/orders/${number}/edit`);
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByLabel("Engineer").selectOption({ label: engineer.name });
		const tomorrow = Temporal.Now.plainDateISO().add({ days: 1 });
		await page.getByLabel("Scheduled for").fill(tomorrow.toString());
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await quiet(page);

		const portal = await signedInPage(app, users.engineer);
		try {
			await portal.page.goto(new URL(`/my/${number}`, page.url()).href);
			await portal.page.getByRole("list", { name: "Equipment" }).waitFor();
			const listed = await portal.page
				.getByRole("list", { name: "Equipment" })
				.locator(":scope > li")
				.allInnerTexts();
			expect(listed).toHaveLength(3);
			for (const [i, unit] of [a, c, d].entries()) {
				expect(listed[i]).toContain(unit.title);
				expect(listed[i]).toContain(unit.serial);
			}
			const sites = (await portal.page.locator("[data-site]").allInnerTexts()).join("\n");
			for (const unit of [a, c, d]) {
				expect(sites).toContain(unit.site);
				if (unit.access) expect(sites).toContain(unit.access);
			}
		} finally {
			await portal.page.context().close();
		}
	});

	test("a unit of another customer or of South can't be put on it, also by a tampered form", async () => {
		const { page } = app;
		const [others] = await rows<{ id: number }>(
			`select id from equipment where organization_id = ? and customer_id != ? order by id limit 1`,
			[north.id, owner.id],
		);
		const [southern] = await rows<{ id: number }>(
			`select id from equipment where organization_id = ? order by id limit 1`,
			[south.id],
		);
		const before = await snapshot(id);
		for (const unit of [others.id, southern.id]) {
			await app.go(`/orders/${number}/edit`);
			// The first chosen unit's checkbox, with the other unit's id.
			await page
				.locator('input[type="checkbox"][name*="equipmentIds"]')
				.first()
				.evaluate((box, value) => ((box as HTMLInputElement).value = String(value)), unit);
			await app.expectingErrors(() => app.submit(page.getByRole("button", { name: "Save order" })));
			expect(await app.issues()).toContain("One of the units belongs to another customer");
			expect(app.path()).toBe(`/orders/${number}/edit`);
			expect(await snapshot(id)).toEqual(before);
		}
		// Nor on a new order.
		const count = await value<number>(`select count(*) from "order" where organization_id = ?`, [
			north.id,
		]);
		await app.go("/orders/new");
		await page.getByLabel("Customer").selectOption(String(owner.id));
		await addUnits(app, { id: units[0].id });
		await page
			.locator('input[type="checkbox"][name*="equipmentIds"]')
			.first()
			.evaluate((box, value) => ((box as HTMLInputElement).value = String(value)), southern.id);
		await page.getByLabel("Description").fill("Tampered (test order)");
		await app.expectingErrors(() => app.submit(page.getByRole("button", { name: "Create order" })));
		expect(await app.issues()).toContain("One of the units belongs to another customer");
		expect(
			await value<number>(`select count(*) from "order" where organization_id = ?`, [north.id]),
		).toBe(count);
	});
});
