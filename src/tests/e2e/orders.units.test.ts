/**
 * Orders about several units: the form chooses them in their order, the order's page shows them
 * all and the log names those added and removed. The list, the units' service history, the
 * engineer portal and the refusal of another customer's or tenant's units are
 * `orders/server/units.spec.ts`'s and `changes.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, quiet } from "./app.ts";
import { addUnits, formUnits, orderId, orderUnits } from "./orders-helpers.ts";

const { north } = organizations;
const app = useApp();

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
});
