/**
 * The customers' pages: the list, a customer's page and its delete dialog, the form (creating,
 * editing, what's typed and not saved), deleting, South's list, North's customer a 404 and the
 * edit form with a North customer's id refused, and the list in Dutch. What the customers' remote
 * functions answer (the list's open orders, the revenue and latest orders as priced, the refusal to
 * delete a customer with equipment or orders, consecutive codes, another tenant's codes and ids)
 * is `customers/server/customers.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	afresh,
	baseURL,
	countIn,
	fitsWidth,
	hydrated,
	nextCode,
	organizations,
	rows,
	useApp,
	value,
	quiet,
} from "./app.ts";

const { north, south } = organizations;
const app = useApp();

const bodyRows = () => app.page.locator("table").first().locator("tbody tr");
const customer = (id: number) => rows(`select * from customer where id = ?`, [id]);
const customerId = (code: string, organizationId: string) =>
	value<number>(`select id from customer where code = ? and organization_id = ?`, [
		code,
		organizationId,
	]);
const byName = (a: string, b: string) => a.localeCompare(b);

/** The code of North's customer with the most orders (and some equipment), for its detail page. */
const busyCustomer = () =>
	value<string>(
		`select c.code from customer c where c.organization_id = ?
		 and exists (select 1 from equipment e where e.customer_id = c.id)
		 order by (select count(*) from "order" o where o.customer_id = c.id) desc, c.id limit 1`,
		[north.id],
	);

/** The order numbers in the detail page's recent activity. */
const activity = () =>
	app.page
		.getByRole("list", { name: "Recent activity" })
		.locator('a[href^="/orders/"]')
		.allInnerTexts();

/** A customer's latest ten orders across all their equipment, newest first. */
async function latestOrders(customerId: number) {
	const found = await rows<{ number: string }>(
		`select number from "order" where customer_id = ? order by created_at desc, id desc limit 10`,
		[customerId],
	);
	return found.map((row) => row.number);
}

/** A code that exists in North only (North has more customers than South). */
const northOnly = () =>
	value<string>(
		`select code from customer where organization_id = ? and code not in
		 (select code from customer where organization_id = ?) order by code limit 1`,
		[north.id, south.id],
	);

/** The customer created in North. */
let code: string;
let target: number;

describe("in North", () => {
	// That it's exactly North's customers, with their open orders, is `customers.spec.ts`'s.
	test("the list shows North's customers, by name, more as it scrolls", async () => {
		const { page } = app;
		await app.go("/customers");
		const total = await countIn("customer", north.id);
		expect(total).toBeGreaterThan(50);
		expect(await app.rowCount()).toBe(total);
		// A client-side table: the first fifty rendered, the next as the end comes into view.
		expect(await bodyRows().count()).toBe(50);
		const first = await bodyRows().locator("td:nth-child(2) a").allInnerTexts();
		expect(first).toEqual([...first].sort(byName));
		await app.loadAllRows();
		expect(await bodyRows().count()).toBe(total);
		expect(await page.locator('[data-slot="data-table-more"]').innerText()).toBe("End of the list");

		// Another sorting starts at the top again, with the first fifty.
		await app.sortBy("Customer", "descending");
		expect(await bodyRows().count()).toBe(50);
		await app.sortBy("Customer", "ascending");
	});

	// Searching (by code, email, city and phone) and the filters are the client-side table's:
	// `list/columns.spec.ts`, `table.svelte.spec.ts`, `cell-filter.svelte.spec.ts`. This is that
	// the list's location cell filters by its country.
	test("clicking a customer's country filters the list by it, and clicking it again stops", async () => {
		const { page } = app;
		const first = bodyRows()
			.first()
			.locator('[data-column-id="country"]')
			.getByRole("button", { name: /^Filter by / });
		const country = (await first.getAttribute("aria-label"))!.replace("Filter by ", "");
		await first.click();
		await page.waitForURL((url) => url.searchParams.has("country"));
		const code = new URL(page.url()).searchParams.get("country")!;
		await expect
			.poll(() => app.rowCount())
			.toBe(
				await value<number>(
					`select count(*) from customer where organization_id = ? and country = ?`,
					[north.id, code],
				),
			);
		await bodyRows()
			.first()
			.locator('[data-column-id="country"]')
			.getByRole("button", { name: `Stop filtering by ${country}`, exact: true })
			.click();
		await page.waitForURL((url) => !url.searchParams.has("country"));
		await expect.poll(() => app.rowCount()).toBe(await countIn("customer", north.id));
	});

	test("filtering by a range of open orders, from the Filter menu and from a link", async () => {
		const { page } = app;
		/** North's customers with at least `min` open orders. */
		const withOpen = (min: number) =>
			value<number>(
				`select count(*) from customer c where c.organization_id = ? and (
					select count(*) from "order" o where o.customer_id = c.id
					and o.status in ('quote', 'scheduled', 'in_progress')
				) >= ?`,
				[north.id, min],
			);
		await app.go(afresh("/customers"));
		await app.openFilter("Open orders");
		await page.getByLabel("Minimum", { exact: true }).fill("2");
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("open-orders") === "2..");
		const expected = await withOpen(2);
		expect(expected).toBeGreaterThan(0);
		await expect.poll(() => app.rowCount()).toBe(expected);
		expect(await app.filterPill("Open orders").innerText()).toContain("At least 2");
		// A link's ranges are the client-side table's (`ranges.spec.ts`, `url-state.spec.ts`).
		await app.go("/customers");
	});

	test("the column menu can show 'Customer since' but not the search column", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "View", exact: true }).click();
		await page.getByRole("menuitemcheckbox").first().waitFor();
		const columns = await page.getByRole("menuitemcheckbox").allInnerTexts();
		expect(columns).toContainEqual(expect.stringContaining("Customer since"));
		expect(columns.some((column) => /search/i.test(column))).toBe(false);
		await page.getByRole("menuitemcheckbox", { name: "Customer since" }).click();
		await page.keyboard.press("Escape");
		expect(await page.getByRole("columnheader", { name: "Customer since" }).count()).toBe(1);
	});

	// Compact rows and the keyboard are every table's: `density.svelte.spec.ts`,
	// `row-navigation.svelte.spec.ts`.

	test("the detail page shows the customer's equipment and orders", async () => {
		const { page } = app;
		const code = await busyCustomer();
		const id = await customerId(code, north.id);
		const units = await value<number>(`select count(*) from equipment where customer_id = ?`, [id]);
		const orders = await value<number>(`select count(*) from "order" where customer_id = ?`, [id]);
		const [{ name }] = await customer(id);

		await app.go(`/customers/${code}`);
		expect(await page.locator("h1").innerText()).toBe(name);
		const equipment = page.locator('[data-slot="card"]', { hasText: "Units installed" });
		expect(await equipment.locator("tbody tr").count()).toBe(units);
		expect(await equipment.locator("tbody tr a").first().getAttribute("href")).toMatch(
			/^\/equipment\/[^/]+$/,
		);
		expect(orders).toBeGreaterThan(10);
		expect(await activity()).toEqual(await latestOrders(id));
		expect(
			await page.getByRole("link", { name: `View all ${orders} orders` }).getAttribute("href"),
		).toBe(`/orders?customer=${code}`);
		expect(await page.locator('a[href^="mailto:"]').count()).toBe(1);
		expect(await page.locator('a[href^="tel:"]').count()).toBe(1);
	});

	test("going back closes the delete dialog, and going forward opens it again", async () => {
		const { page } = app;
		const path = app.path();
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		await page.goBack();
		await dialog.waitFor({ state: "hidden" });
		expect(app.path()).toBe(path);
		await page.goForward();
		await dialog.waitFor();
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "hidden" });
		expect(app.path()).toBe(path);
	});

	test("its recent activity links to all its orders in the orders list", async () => {
		const { page } = app;
		const code = await busyCustomer();
		const id = await customerId(code, north.id);
		const name = await value<string>(`select name from customer where id = ?`, [id]);
		const orders = await value<number>(`select count(*) from "order" where customer_id = ?`, [id]);

		await app.go(`/customers/${code}`);
		await page.getByRole("link", { name: `View all ${orders} orders` }).click();
		await page.waitForURL((url) => url.search === `?customer=${code}`);
		await quiet(page);
		await expect.poll(() => app.rowCount()).toBe(orders);
		const customers = await bodyRows().locator("td:nth-child(3)").allInnerTexts();
		expect(customers.length).toBeGreaterThan(0);
		expect(customers.every((cell) => cell.includes(code))).toBe(true);

		// The customer filter names the customer, and clears.
		const filter = app.filterPill("Customer");
		await expect.poll(() => filter.innerText()).toContain(name);
		await filter.locator('[data-slot="popover-trigger"]').click();
		await page.getByRole("option", { name: "Clear filters" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.pathname === "/orders" && url.search === "");
		await quiet(page);
		await expect.poll(() => app.rowCount()).toBe(await countIn("order", north.id));
	});

	test("the detail page fits a phone screen", async () => {
		const { page } = app;
		const code = await busyCustomer();
		await page.setViewportSize({ width: 390, height: 844 });
		try {
			await app.go(`/customers/${code}`);
			expect(await fitsWidth(page)).toBe(true);
		} finally {
			await page.setViewportSize({ width: 1440, height: 1000 });
		}
	});

	test("creating a customer validates it first", async () => {
		const { page } = app;
		await app.go("/customers/new");
		await app.submit(page.getByRole("button", { name: "Create customer" }));
		const issues = await app.issues();
		// The first site's address too.
		expect(issues).toHaveLength(8);
		expect(issues).toContain("Enter the street address");
		expect(issues.some((issue) => issue.includes("\n"))).toBe(false);
		expect(app.path()).toBe("/customers/new");

		await page.getByLabel("Name").fill("Test Klimaattechniek BV");
		await page.getByLabel("Segment").selectOption("mid_market");
		await page.getByLabel("Street address").fill("Croeselaan 18");
		await page.getByLabel("Postal code").fill("3521 CB");
		await page.getByLabel("City").fill("Utrecht");
		await page.getByLabel("Country").selectOption("Netherlands");
		await page.getByLabel("Contact person").fill("Femke de Vries");
		await page.getByLabel("Email").fill("femke@klimaat");
		await page.getByLabel("Phone").fill("call me");
		await app.submit(page.getByRole("button", { name: "Create customer" }));
		expect(await app.issues()).toEqual([
			expect.stringMatching(/valid email/i),
			expect.stringMatching(/valid phone/i),
		]);
		expect(app.path()).toBe("/customers/new");
	});

	test("a new customer gets North's next code", async () => {
		const { page } = app;
		await page.getByLabel("Email").fill("femke@klimaat.example");
		await page.getByLabel("Phone").fill("+31 30 123 4567");
		const expected = await nextCode("customer", "code", north.id);
		await page.getByRole("button", { name: "Create customer" }).click();
		await page.waitForURL(/\/customers\/CUST-\d{4}$/);
		await quiet(page);
		code = app.path().split("/").pop()!;
		expect(code).toBe(expected);
		await app.toast("Customer created");
		await page.getByRole("heading", { level: 1, name: "Test Klimaattechniek BV" }).waitFor();
		target = await customerId(code, north.id);
		expect(target).toBeDefined();
		expect(await page.getByText("No equipment").count()).toBe(1);
		expect(await page.getByText("No orders", { exact: true }).count()).toBe(1);
		expect(await page.locator("h1 ~ [data-slot=badge]").innerText()).toContain("Mid-market");
		// With their first site, at the address entered, named after their town.
		expect(
			await rows(
				`select organization_id, name, address, postal_code, city, country from customer_site
				 where customer_id = ?`,
				[target],
			),
		).toEqual([
			{
				organization_id: north.id,
				name: "Utrecht",
				address: "Croeselaan 18",
				postal_code: "3521 CB",
				city: "Utrecht",
				country: "Netherlands",
			},
		]);
		const sites = page.getByTestId("sites");
		expect(await sites.innerText()).toContain("Croeselaan 18");
		expect(await sites.innerText()).toContain("3521 CB Utrecht");
	});

	test("editing it validates and saves the changes", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await quiet(page);
		expect(await page.getByLabel("Name").inputValue()).toBe("Test Klimaattechniek BV");
		expect(await page.getByLabel("Country").inputValue()).toBe("Netherlands");

		await page.getByLabel("City").fill("");
		await app.submit(page.getByRole("button", { name: "Save customer" }));
		expect(await app.issues()).toEqual([expect.stringMatching(/city/i)]);
		expect(app.path()).toBe(`/customers/${code}/edit`);

		await page.getByLabel("City").fill("Amersfoort");
		await page.getByLabel("Segment").selectOption("enterprise");
		await page.getByRole("button", { name: "Save customer" }).click();
		await page.waitForURL((url) => url.pathname === `/customers/${code}`);
		// The redirect shows the cached customer first and refreshes it right after.
		await page.getByText(`${code} · Amersfoort, Netherlands`).waitFor();
		expect(await page.locator("h1 ~ [data-slot=badge]").innerText()).toContain("Enterprise");
		const [saved] = await rows(`select code, city, segment from customer where id = ?`, [target]);
		expect(saved).toEqual({ code, city: "Amersfoort", segment: "enterprise" });
	});

	test("what's typed and not saved comes back on going back and on reloading, not on a new visit", async () => {
		const { page } = app;
		await app.go("/customers/new");
		await page.getByLabel("Name").fill("Unsaved BV");
		await page.getByLabel("Country").selectOption("Belgium");
		await page.getByRole("link", { name: "Orders", exact: true }).first().click();
		await page.waitForURL((url) => url.pathname === "/orders");

		await page.goBack();
		await page.waitForURL((url) => url.pathname === "/customers/new");
		await page.getByLabel("Name").waitFor();
		expect(await page.getByLabel("Name").inputValue()).toBe("Unsaved BV");
		expect(await page.getByLabel("Country").inputValue()).toBe("Belgium");
		expect(await page.getByLabel("City").inputValue()).toBe("");

		await page.reload();
		await hydrated(page);
		expect(await page.getByLabel("Name").inputValue()).toBe("Unsaved BV");

		await page.getByRole("link", { name: "Customers", exact: true }).first().click();
		await page.waitForURL((url) => url.pathname === "/customers");
		await page.getByRole("link", { name: "New customer" }).click();
		await page.waitForURL((url) => url.pathname === "/customers/new");
		await page.getByLabel("Name").waitFor();
		expect(await page.getByLabel("Name").inputValue()).toBe("");
	});

	test("deleting one removes it, after which it's a 404", async () => {
		const { page } = app;
		const made = code;
		await app.go(`/customers/${made}`);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/customers");
		expect(await customerId(made, north.id)).toBeUndefined();
		expect((await app.go(`/customers/${made}`))?.status()).toBe(404);
	});
});

describe("in South", () => {
	test("switching organization shows South's customers", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		await app.go("/customers");
		expect(await app.rowCount()).toBe(await countIn("customer", south.id));
	});

	test("North's customers are a 404, as is an unknown code", async () => {
		const only = await northOnly();
		for (const path of [`/customers/${only}`, `/customers/${only}/edit`]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
		expect((await app.go("/customers/CUST-9999"))?.status()).toBe(404);
		expect(await app.page.locator("body").innerText()).toContain("CUST-9999");
	});

	test("saving with the id of a North customer is refused", async () => {
		const { page } = app;
		const own = await customerId("CUST-0001", south.id);
		const victim = await customerId(await northOnly(), north.id);
		const [victimBefore, ownBefore] = [await customer(victim), await customer(own)];

		await app.go("/customers/CUST-0001/edit");
		const hidden = page.locator('form input[type="hidden"][name^="id/"]');
		expect(await hidden.count()).toBe(1);
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), victim);
			await page.getByLabel("City").fill("Tampered");
			return app.submit(page.getByRole("button", { name: "Save customer" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe("/customers/CUST-0001/edit");
		expect(await customer(victim)).toEqual(victimBefore);
		expect(await customer(own)).toEqual(ownBefore);
	});

	// A new customer in South gets South's next code: `numbering.spec.ts` ("only counts the current
	// tenant's records").
});

// One page in Dutch: the messages are complete in both languages (`messages.spec.ts`), and
// i18n.test has the switching and Dutch validation.
describe("in Dutch", () => {
	test("the customers list is in Dutch", async () => {
		const { page } = app;
		await app.page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: "nl", url: baseURL }]);
		await app.go("/customers");
		await page.getByRole("heading", { level: 1, name: "Klanten" }).waitFor();
		expect(await page.title()).toBe("Klanten");
		expect(await page.getByPlaceholder("Klanten zoeken…").count()).toBe(1);
		const headers = (await page.locator("thead").allInnerTexts()).join(" ");
		for (const name of ["Klant", "Locatie", "Open opdrachten"]) {
			expect(headers, name).toContain(name);
		}
		expect(await page.getByRole("link", { name: "Nieuwe klant" }).count()).toBe(1);
	});
});
