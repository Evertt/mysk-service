import { describe, expect, test } from "vite-plus/test";

import { countryName } from "#lib/customers/countries.ts";
import { formatDate } from "#lib/i18n/format.ts";

import {
	baseURL,
	cents,
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
import { priceOf, pricedOrders } from "./contracts-helpers.ts";

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

/** The names of an organization's customers, sorted. */
async function namesIn(organizationId: string) {
	const found = await rows<{ name: string }>(
		`select name from customer where organization_id = ?`,
		[organizationId],
	);
	return found.map((row) => row.name).sort(byName);
}

/** The customer names in the list, scrolled to its end, sorted. */
async function listedNames() {
	await app.loadAllRows();
	return (await bodyRows().locator("td:nth-child(2) a").allInnerTexts()).sort(byName);
}

/** Opens a faceted filter of the toolbar and picks one of its options. */
async function filter(title: string, option: string) {
	const { page } = app;
	await app.openFilter(title);
	await page.getByRole("option", { name: new RegExp(`^${option}`) }).click();
	await page.keyboard.press("Escape");
}

/** A code that exists in North only (North has more customers than South). */
const northOnly = () =>
	value<string>(
		`select code from customer where organization_id = ? and code not in
		 (select code from customer where organization_id = ?) order by code limit 1`,
		[north.id, south.id],
	);

/** The customer created in North: it has no equipment or orders, so an unscoped delete would
 * remove it, which makes it the target of the tampering in South. */
let code: string;
let target: number;

describe("in North", () => {
	test("the list shows exactly North's customers, by name, more as it scrolls", async () => {
		const { page } = app;
		await app.go("/customers");
		const total = await countIn("customer", north.id);
		expect(total).toBeGreaterThan(50);
		expect(await app.rowCount()).toBe(total);
		// A client-side table: the first fifty rendered, the next as the end comes into view.
		expect(await bodyRows().count()).toBe(50);
		const first = await bodyRows().locator("td:nth-child(2) a").allInnerTexts();
		expect(first).toEqual([...first].sort(byName));
		expect(await listedNames()).toEqual(await namesIn(north.id));
		expect(await bodyRows().count()).toBe(total);
		expect(await page.locator('[data-slot="data-table-more"]').innerText()).toBe("End of the list");

		// Another sorting starts at the top again, with the first fifty.
		await app.sortBy("Customer", "descending");
		expect(await bodyRows().count()).toBe(50);
		await app.sortBy("Customer", "ascending");
	});

	test("searching finds customers by code and phone", async () => {
		const { page } = app;
		const search = page.getByLabel("Search customers…");
		await search.fill("CUST-0007");
		await expect.poll(() => bodyRows().count()).toBe(1);
		expect(await bodyRows().first().innerText()).toContain("CUST-0007");

		const phone = await value<string>(
			`select phone from customer where organization_id = ? and code = 'CUST-0007'`,
			[north.id],
		);
		await search.fill(phone);
		await expect.poll(() => bodyRows().first().innerText()).toContain("CUST-0007");

		await search.fill("zzzz-no-match");
		await page.getByText("No customers found").waitFor();

		await page.getByRole("button", { name: "Reset" }).click();
		expect(await search.inputValue()).toBe("");
		expect(await bodyRows().count()).toBe(50);
	});

	test("filtering by segment and country", async () => {
		const { page } = app;
		const count = (where: string) =>
			value<number>(`select count(*) from customer where organization_id = ? and ${where}`, [
				north.id,
			]);

		await filter("Segment", "Enterprise");
		await expect.poll(() => app.rowCount()).toBe(await count("segment = 'enterprise'"));
		const segments = await bodyRows().locator('[data-slot="badge"]').allInnerTexts();
		expect(segments.length).toBeGreaterThan(0);
		expect(segments.every((segment) => segment.includes("Enterprise"))).toBe(true);

		await filter("Country", "Belgium");
		await expect
			.poll(() => app.rowCount())
			.toBe(await count("segment = 'enterprise' and country = 'Belgium'"));

		await page.getByRole("button", { name: "Reset" }).click();
		await filter("Country", "Belgium");
		await expect.poll(() => app.rowCount()).toBe(await count("country = 'Belgium'"));
		await page.getByRole("button", { name: "Reset" }).click();
		await expect.poll(() => app.rowCount()).toBe(await countIn("customer", north.id));
	});

	test("filtering by a range of open orders, from the Filter menu and from a link", async () => {
		const { page } = app;
		/** North's customers with open orders from `min` up to `max`. */
		const withOpen = (min: number, max = 1e9) =>
			value<number>(
				`select count(*) from customer c where c.organization_id = ? and (
					select count(*) from "order" o where o.customer_id = c.id
					and o.status in ('quote', 'scheduled', 'in_progress')
				) between ? and ?`,
				[north.id, min, max],
			);
		await app.go("/customers");
		await app.openFilter("Open orders");
		await page.getByLabel("Minimum", { exact: true }).fill("2");
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("open-orders") === "2..");
		const expected = await withOpen(2);
		expect(expected).toBeGreaterThan(0);
		await expect.poll(() => app.rowCount()).toBe(expected);
		expect(await app.filterPill("Open orders").innerText()).toContain("At least 2");

		// From a link, with both ends; one that isn't a range is ignored.
		await app.go("/customers?open-orders=0..1");
		await expect.poll(() => app.rowCount()).toBe(await withOpen(0, 1));
		await app.go("/customers?open-orders=many");
		await expect.poll(() => app.rowCount()).toBe(await countIn("customer", north.id));
		await app.go("/customers");
	});

	test("sorting by open orders puts the busiest customer first", async () => {
		const busiest = await rows<{ name: string }>(
			`with open as (
				select c.name, count(*) as n from customer c join "order" o on o.customer_id = c.id
				where c.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
				group by c.id
			)
			select name from open where n = (select max(n) from open)`,
			[north.id],
		);
		await app.sortBy("Open orders", "descending");
		const top = await bodyRows().first().locator("td:nth-child(2) a").innerText();
		expect(busiest.map((row) => row.name)).toContain(top);
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

	test("compact rows are remembered after a reload", async () => {
		const { page } = app;
		const density = () => page.locator("html").getAttribute("data-table-density");
		const cellPadding = () =>
			bodyRows()
				.first()
				.locator("td")
				.nth(2)
				.evaluate((cell) => getComputedStyle(cell).paddingTop);
		expect(await density()).toBe("comfortable");
		expect(await cellPadding()).toBe("8px");

		await page.getByRole("button", { name: "View", exact: true }).click();
		await page.getByRole("menuitemradio", { name: "Compact" }).click();
		await page.keyboard.press("Escape");
		expect(await density()).toBe("compact");
		expect(await cellPadding()).toBe("4px");

		await page.reload();
		await hydrated(page);
		expect(await density()).toBe("compact");
		expect(await cellPadding()).toBe("4px");

		await page.getByRole("button", { name: "View", exact: true }).click();
		await page.getByRole("menuitemradio", { name: "Comfortable" }).click();
		await page.keyboard.press("Escape");
		expect(await cellPadding()).toBe("8px");
	});

	test("the keyboard moves between rows and Enter opens one", async () => {
		const { page } = app;
		await bodyRows().first().focus();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		const third = bodyRows().nth(2);
		expect(await third.evaluate((row) => row === document.activeElement)).toBe(true);
		const href = await third.locator("td:nth-child(2) a").getAttribute("href");
		expect(href).toMatch(/^\/customers\/[^/]+$/);

		await page.keyboard.press("Enter");
		await page.waitForURL((url) => url.pathname === href);
		await page.goBack();
		await hydrated(page);
	});

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

	test("deleting a customer with equipment and orders is refused", async () => {
		const { page } = app;
		const code = await busyCustomer();
		const id = await customerId(code, north.id);
		const units = await value<number>(`select count(*) from equipment where customer_id = ?`, [id]);
		const orders = await value<number>(`select count(*) from "order" where customer_id = ?`, [id]);

		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Delete" }));
		const refusal = await dialog.locator('[data-slot="field-error"]').innerText();
		expect(refusal).toContain(`${units} equipment unit`);
		expect(refusal).toContain(`${orders} order`);
		expect(app.path()).toBe(`/customers/${code}`);
		expect(await customerId(code, north.id)).toBe(id);
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await dialog.waitFor({ state: "hidden" });
		expect(app.path()).toBe(`/customers/${code}`);
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

	test("completing an order shows in the customer's recent activity", async () => {
		const { page } = app;
		const [open] = await rows<{ number: string; code: string }>(
			`with recent as (
				select o.*, row_number() over (
					partition by o.customer_id order by o.created_at desc, o.id desc
				) as position from "order" o where o.organization_id = ?
			)
			select r.number, c.code from recent r join customer c on c.id = r.customer_id
			where r.position <= 10 and r.status in ('scheduled', 'in_progress') order by r.id limit 1`,
			[north.id],
		);
		const row = () =>
			page
				.getByRole("list", { name: "Recent activity" })
				.locator("li")
				.filter({ has: page.getByRole("link", { name: open.number }) });
		await app.go(`/customers/${open.code}`);
		expect(await row().locator('[data-slot="badge"]').innerText()).not.toContain("Completed");

		await app.go(`/orders/${open.number}/edit`);
		await page.getByLabel("Status").selectOption("completed");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${open.number}`);
		expect(
			await value(`select status from "order" where number = ? and organization_id = ?`, [
				open.number,
				north.id,
			]),
		).toBe("completed");

		await app.go(`/customers/${open.code}`);
		const shown = await row().innerText();
		expect(shown).toContain("Completed");
		expect(shown).toContain(`Completed ${formatDate(new Date())}`);
	});

	test("revenue and recent activity cost what the orders' own pages say, less what contracts include", async () => {
		const { page } = app;
		// A customer with a contract-covered, done order among their ten latest.
		const [covered] = await pricedOrders(
			north.id,
			`c.level = 'premium' and o.status in ('completed', 'invoiced')
			 and o.labor_hours > 0 and o.id in (select r.id from "order" r
			 where r.customer_id = o.customer_id order by r.created_at desc, r.id desc limit 10)`,
		);
		expect(covered).toBeDefined();
		const orders = await pricedOrders(
			north.id,
			`o.customer_id = (select id from customer where code = ? and organization_id = ?)`,
			[covered.customer, north.id],
		);
		const done = orders.filter((order) => ["completed", "invoiced"].includes(order.status));

		await app.go(`/customers/${covered.customer}`);
		const revenue = page.locator('[data-slot="card"]', { hasText: "Lifetime revenue" });
		expect(cents(await revenue.locator('[data-slot="card-title"]').innerText())).toBe(
			done.reduce((sum, order) => sum + priceOf(order).total, 0),
		);
		expect(await revenue.innerText()).toContain(`From ${done.length} completed or invoiced`);

		const listed = await activity();
		expect(listed).toContain(covered.number);
		for (const number of listed) {
			const order = orders.find((candidate) => candidate.number === number)!;
			const row = page
				.getByRole("list", { name: "Recent activity" })
				.locator(":scope > li")
				.filter({ has: page.getByRole("link", { name: number }) });
			expect(cents(await row.locator('[data-cost="total"]').innerText())).toBe(
				priceOf(order).total,
			);
		}
		expect(priceOf(covered).total).toBe(0);
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

	test("an unknown code is a 404", async () => {
		expect((await app.go("/customers/CUST-9999"))?.status()).toBe(404);
		expect(await app.page.locator("body").innerText()).toContain("CUST-9999");
	});

	test("creating a customer validates it first", async () => {
		const { page } = app;
		await app.go("/customers/new");
		await app.submit(page.getByRole("button", { name: "Create customer" }));
		const issues = await app.issues();
		expect(issues).toHaveLength(6);
		expect(issues.some((issue) => issue.includes("\n"))).toBe(false);
		expect(app.path()).toBe("/customers/new");

		await page.getByLabel("Name").fill("Test Klimaattechniek BV");
		await page.getByLabel("Segment").selectOption("mid_market");
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

	test("customers created at the same moment get consecutive codes", async () => {
		const { page } = app;
		await app.go("/customers/new");
		await page.getByLabel("Name").fill("Simultaneous BV");
		await page.getByLabel("Segment").selectOption("small_business");
		await page.getByLabel("City").fill("Zwolle");
		await page.getByLabel("Country").selectOption("Netherlands");
		await page.getByLabel("Contact person").fill("Sam Jansen");
		await page.getByLabel("Email").fill("sam@simultaneous.example");
		await page.getByLabel("Phone").fill("+31 38 123 4567");
		const first = await nextCode("customer", "code", north.id);

		// Submitted all at once, the way a browser without JavaScript would, so they overlap.
		const form = page.locator("form", {
			has: page.getByRole("button", { name: "Create customer" }),
		});
		const outcomes = await form.evaluate(async (form: HTMLFormElement) => {
			const fields = [...new FormData(form)] as [string, string][];
			const submit = (i: number) =>
				fetch(form.action, {
					method: "POST",
					headers: { accept: "text/html" },
					redirect: "manual",
					body: new URLSearchParams(
						fields.map(([name, value]) => [
							name,
							name.startsWith("name") ? `${value} ${i}` : value,
						]),
					),
				}).then((response) => (response.type === "opaqueredirect" ? "created" : response.status));
			return Promise.all(Array.from({ length: 8 }, (_, i) => submit(i + 1)));
		});
		expect(outcomes).toEqual(Array(8).fill("created"));

		const stored = await rows<{ code: string }>(
			`select code from customer where organization_id = ? and name like 'Simultaneous BV %'
			 order by code`,
			[north.id],
		);
		const start = Number(first.slice(5));
		expect(stored.map((row) => row.code)).toEqual(
			Array.from({ length: 8 }, (_, i) => `CUST-${String(start + i).padStart(4, "0")}`),
		);
	});
});

describe("in South", () => {
	test("switching organization shows exactly South's customers", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		await app.go("/customers");
		expect(await app.rowCount()).toBe(await countIn("customer", south.id));
		expect(await listedNames()).toEqual(await namesIn(south.id));
	});

	test("North's customers are a 404", async () => {
		const only = await northOnly();
		for (const path of [`/customers/${only}`, `/customers/${only}/edit`, `/customers/${code}`]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
	});

	test("the orders list doesn't show North's customers' orders by their code", async () => {
		const only = await northOnly();
		await app.go(`/orders?customer=${only}`);
		expect(await app.rowCount()).toBe(0);
	});

	test("a code both have shows South's customer", async () => {
		const [own] = await customer(await customerId("CUST-0001", south.id));
		await app.go("/customers/CUST-0001");
		expect(await app.page.locator("h1").innerText()).toBe(own.name);
		expect(await activity()).toEqual(await latestOrders(own.id as number));
		await app.go("/customers/CUST-0001/edit");
		expect(await app.page.getByLabel("Name").inputValue()).toBe(own.name);
	});

	test("saving with the id of a North customer is refused", async () => {
		const { page } = app;
		const own = await customerId("CUST-0001", south.id);
		const [targetBefore, ownBefore] = [await customer(target), await customer(own)];

		const hidden = page.locator('form input[type="hidden"][name^="id/"]');
		expect(await hidden.count()).toBe(1);
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target);
			await page.getByLabel("City").fill("Tampered");
			return app.submit(page.getByRole("button", { name: "Save customer" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe("/customers/CUST-0001/edit");
		expect(await customer(target)).toEqual(targetBefore);
		expect(await customer(own)).toEqual(ownBefore);
	});

	test("deleting with the id of a North customer is refused", async () => {
		const { page } = app;
		const own = await customerId("CUST-0001", south.id);
		const [targetBefore, ownBefore] = [await customer(target), await customer(own)];

		await app.go("/customers/CUST-0001");
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		const hidden = dialog.locator('input[type="hidden"][name^="id/"]');
		await expect.poll(() => hidden.count()).toBe(1);
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target);
			return app.submit(dialog.getByRole("button", { name: "Delete" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe("/customers/CUST-0001");
		expect(await customer(target)).toEqual(targetBefore);
		expect(await customer(own)).toEqual(ownBefore);
	});

	test("a new customer gets South's next code", async () => {
		const { page } = app;
		await app.go("/customers/new");
		await page.getByLabel("Name").fill("Test Zuid Installaties BV");
		await page.getByLabel("Segment").selectOption("small_business");
		await page.getByLabel("City").fill("Eindhoven");
		await page.getByLabel("Country").selectOption("Netherlands");
		await page.getByLabel("Contact person").fill("Joris Bakker");
		await page.getByLabel("Email").fill("joris@zuid.example");
		await page.getByLabel("Phone").fill("+31 40 123 4567");
		const expected = await nextCode("customer", "code", south.id);
		await page.getByRole("button", { name: "Create customer" }).click();
		await page.waitForURL(/\/customers\/CUST-\d{4}$/);
		await quiet(page);
		expect(app.path()).toBe(`/customers/${expected}`);
		await page.getByRole("heading", { level: 1, name: "Test Zuid Installaties BV" }).waitFor();
		expect(
			await rows(`select organization_id from customer where name = 'Test Zuid Installaties BV'`),
		).toEqual([{ organization_id: south.id }]);
	});

	test("deleting it removes it, after which it's a 404", async () => {
		const { page } = app;
		const created = app.path().split("/").pop()!;
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/customers");
		expect(await customerId(created, south.id)).toBeUndefined();
		expect((await app.go(`/customers/${created}`))?.status()).toBe(404);
	});
});

describe("in Dutch", () => {
	/** Sets the language as the language switchers do, in Paraglide's cookie. */
	const useLanguage = (locale: string) =>
		app.page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: locale, url: baseURL }]);

	test("the customers list is in Dutch", async () => {
		const { page } = app;
		await useLanguage("nl");
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

	test("a customer's page is in Dutch, with the country's Dutch name", async () => {
		const { page } = app;
		const [own] = await rows<{ name: string; country: string }>(
			`select name, country from customer where code = 'CUST-0001' and organization_id = ?`,
			[south.id],
		);
		await app.go("/customers/CUST-0001");
		await page.getByRole("heading", { level: 1, name: own.name }).waitFor();
		for (const text of ["Totale omzet", "Klant sinds", "Recente activiteit", "Contactpersoon"]) {
			expect(await page.getByText(text, { exact: true }).count(), text).toBeGreaterThan(0);
		}
		expect(await page.getByRole("link", { name: "Bewerken" }).count()).toBeGreaterThan(0);
		expect(await page.locator("main").innerText()).toContain(countryName(own.country, "nl"));
	});

	test("an equipment page is in Dutch", async () => {
		const { page } = app;
		const serial = await value<string>(
			`select serial_number from equipment where organization_id = ? order by id limit 1`,
			[south.id],
		);
		await app.go(`/equipment/${serial}`);
		for (const text of ["Servicegeschiedenis", "Specificaties", "Eigenaar", "Laatste onderhoud"]) {
			expect(await page.getByText(text, { exact: true }).count(), text).toBeGreaterThan(0);
		}
		// The warranty badge.
		expect(await page.locator("main").innerText()).toMatch(/\b(Gedekt|Verlopen)\b/);
	});

	test("validation messages are in Dutch", async () => {
		const { page } = app;
		await app.go("/customers/new");
		await app.submit(page.getByRole("button", { name: "Klant aanmaken" }));
		expect(await app.issues()).toContain("Vul de bedrijfsnaam in");
	});

	test("switching back to English", async () => {
		await useLanguage("en");
		await app.go("/customers");
		await app.page.getByRole("heading", { level: 1, name: "Customers" }).waitFor();
		expect(await app.page.title()).toBe("Customers");
	});
});
