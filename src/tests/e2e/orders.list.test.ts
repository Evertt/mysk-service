/**
 * The orders list's page: a link with filters and sorting, its layout, its paging as it scrolls,
 * its filters' searches, and how it shows that rows are loading. What `getOrders` and
 * `getOrderFacets` return for a search, filters and sorting is `orders/server/list.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "#lib/i18n/format.ts";

import {
	afresh,
	countIn,
	fitsWidth,
	isRemote,
	onPhone,
	organizations,
	rows,
	useApp,
	value,
} from "./app.ts";
import { shownNumbers } from "./orders-helpers.ts";
import { remoteErrorStatus, tamperWithQuery } from "./remote-functions.ts";

const { north } = organizations;
const app = useApp();

describe("in North", () => {
	test("a link with filters and sorting opens the list that way", async () => {
		const { page } = app;
		// The customer with the most open orders.
		const [{ code }] = await rows<{ code: string }>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
			 group by c.id order by count(*) desc, c.code limit 1`,
			[north.id],
		);
		const open = await rows<{ name: string }>(
			`select c.name from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and c.code = ?
			 and o.status in ('quote', 'scheduled', 'in_progress')`,
			[north.id, code],
		);
		expect(open.length).toBeGreaterThan(0);

		// What the list sends for it, in which order, is `orders/server/list.spec.ts`'s.
		const filtered = "status=quote,scheduled,in_progress&sort=-priority,number";
		await app.go(`/orders?customer=${code}&${filtered}`);
		expect(await app.rowCount()).toBe(open.length);
		const headers = await page.locator("thead").innerText();
		expect(headers).toMatch(/Priority\s*1/);
		expect(headers).toMatch(/Order\s*2/);

		// The customer filter shows the customer by name, and clears that filter only.
		const customerFilter = app.filterPill("Customer");
		await expect.poll(() => customerFilter.innerText()).toContain(open[0].name);
		await customerFilter.locator('[data-slot="popover-trigger"]').click();
		await page.getByRole("option", { name: "Clear filters" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.search === `?${filtered}`);
		await app.tableSettled();
		const all = await rows(
			`select 1 from "order" where organization_id = ? and status in ('quote', 'scheduled', 'in_progress')`,
			[north.id],
		);
		expect(await app.rowCount()).toBe(all.length);
	});

	test("the rows scroll inside the table on a desktop screen; on a phone, the page does", async () => {
		const container = app.page.locator('[data-slot="data-table"] [data-slot="table-container"]');
		const overflowY = () => container.evaluate((element) => getComputedStyle(element).overflowY);
		await app.go(afresh("/orders"));
		expect(await overflowY()).toBe("auto");
		await onPhone(app.page, async () => {
			await app.go(afresh("/orders"));
			// Sideways only, so it never catches the page's scrolling.
			expect(await overflowY()).toBe("hidden");
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});

	test("the server sends a page of rows at a time, in the database's order, as the table scrolls", async () => {
		const { page } = app;
		const total = await countIn("order", north.id);
		const numbers = (
			await rows<{ number: string }>(
				`select number from "order" where organization_id = ?
				 order by created_at desc, id limit 100`,
				[north.id],
			)
		).map((row) => row.number);
		await app.go(afresh("/orders"));
		expect(await app.rowCount()).toBe(total);
		expect(await shownNumbers(app)).toEqual(numbers.slice(0, 50));
		const [response] = await Promise.all([
			page.waitForResponse((r) => isRemote(r.url(), "getOrders")),
			page.locator('[data-slot="data-table-more"]').scrollIntoViewIfNeeded(),
		]);
		// Just the next page's orders came, not all of them.
		const sent = new Set((await response.text()).match(/ORD-\d{4}-\d{5}/g));
		expect([...sent].sort()).toEqual(numbers.slice(50).sort());
		// Added under those shown.
		await expect.poll(() => shownNumbers(app)).toEqual(numbers);
		expect(await app.rowCount()).toBe(total);
	});

	// The one test of the suite that SvelteKit applies a remote query's schema: what the schema
	// refuses is `list-definition.spec.ts`'s.
	test("a malformed query for the list is refused with a 400", async () => {
		await app.go(afresh("/orders"));
		await tamperWithQuery<Record<string, unknown>>(app.page, "getOrders", (arg) => ({
			...arg,
			filters: { status: ["bogus"] },
		}));
		const [response] = await app.expectingErrors(() =>
			Promise.all([
				app.page.waitForResponse((r) => isRemote(r.url(), "getOrders")),
				app.page.locator('[data-slot="data-table-more"]').scrollIntoViewIfNeeded(),
			]),
		);
		expect(await remoteErrorStatus(response)).toBe(400);
	});

	test("filtering by customer and engineer, finding them by searching the filters", async () => {
		const { page } = app;
		// The customer and engineer with the most orders together.
		const [busy] = await rows<{
			code: string;
			name: string;
			engineer: number;
			engineer_name: string;
		}>(
			`select c.code, c.name, e.id as engineer, e.name as engineer_name from "order" o
			 join customer c on c.id = o.customer_id join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? group by c.id, e.id order by count(*) desc, c.id, e.id limit 1`,
			[north.id],
		);
		await app.go(afresh("/orders"));

		// Found by searching the filter (what the search finds is `orders/server/list.spec.ts`'s).
		await app.openFilter("Customer");
		await page.getByPlaceholder("Search customers…").fill(busy.code);
		await page.getByRole("option").filter({ hasText: busy.name }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("customer") === busy.code);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			await value<number>(
				`select count(*) from "order" o join customer c on c.id = o.customer_id
				 where o.organization_id = ? and c.code = ?`,
				[north.id, busy.code],
			),
		);
		expect(await app.filterPill("Customer").innerText()).toContain(busy.name);

		await app.openFilter("Engineer");
		await page.getByPlaceholder("Search engineers…").fill(busy.engineer_name);
		await page.getByRole("option", { name: busy.engineer_name }).first().click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("engineer") === String(busy.engineer));
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			await value<number>(
				`select count(*) from "order" o join customer c on c.id = o.customer_id
				 where o.organization_id = ? and c.code = ? and o.engineer_id = ?`,
				[north.id, busy.code, busy.engineer],
			),
		);
		const engineers = await page.locator("tbody td:nth-child(8)").allInnerTexts();
		expect(new Set(engineers)).toEqual(new Set([busy.engineer_name]));
	});

	test("the customer filter shows each customer's orders, most first, under the other filters", async () => {
		const { page } = app;
		/** North's customers with the most orders `where` (on `o`), and how many. */
		const busiest = (where = "1") =>
			rows<{ name: string; n: number }>(
				`select c.name, count(o.id) as n from customer c
				 left join "order" o on o.customer_id = c.id and ${where}
				 where c.organization_id = ? group by c.id order by n desc, c.name collate nocase, c.id
				 limit 5`,
				[north.id],
			);
		/** The filter's first options, as "name count". */
		const shown = async () => {
			await app.openFilter("Customer");
			const options = page.getByRole("option");
			await options.nth(4).waitFor();
			const texts = await options.evaluateAll((items: HTMLElement[]) =>
				items.slice(0, 5).map((item) => item.innerText.replace(/\s+/g, " ").trim()),
			);
			await page.keyboard.press("Escape");
			await page.keyboard.press("Escape");
			return texts;
		};
		const asShown = (expected: { name: string; n: number }[]) =>
			expected.map((row) => `${row.name} ${formatNumber(row.n)}`);

		await app.go(afresh("/orders"));
		expect(await shown()).toEqual(asShown(await busiest()));
		// Narrowed by status, the counts (and so the order) are the completed orders'.
		await app.go("/orders?status=completed&row=1");
		expect(await shown()).toEqual(asShown(await busiest("o.status = 'completed'")));
	});

	test("while another sorting loads, the rows shown stay, dimmed", async () => {
		const { page } = app;
		await app.go(afresh("/orders"));
		const before = await shownNumbers(app);
		const table = page.locator('[data-slot="data-table"]');
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route("**/_app/remote/**", async (route) => {
			await held;
			await route.continue();
		});
		try {
			await page.locator("thead").getByRole("button", { name: "Order" }).click();
			await expect.poll(() => table.getAttribute("aria-busy")).toBe("true");
			expect(await shownNumbers(app)).toEqual(before);
			// The bar shows once the wait has taken a moment (see `progress-bar.svelte`).
			await expect.poll(() => table.getByRole("progressbar").count()).toBe(1);
			await expect
				.poll(() => table.locator("tbody").evaluate((tbody) => getComputedStyle(tbody).opacity))
				.toBe("0.5");
		} finally {
			release();
			// Once the held requests have gone on.
			await page.unrouteAll({ behavior: "wait" });
		}
		await app.tableSettled();
		expect(await table.getAttribute("aria-busy")).toBeNull();
		expect(await table.getByRole("progressbar").count()).toBe(0);
		expect(await shownNumbers(app)).not.toEqual(before);
	});

	test("a link to the list sorted otherwise shows the table loading until its rows are in", async () => {
		const { page } = app;
		await app.go(afresh("/orders"));
		const first = await shownNumbers(app);
		const table = page.locator('[data-slot="data-table"]');
		// A link elsewhere in the app to this list, sorted in a way whose rows aren't loaded yet. (In
		// a corner on top: the page fills the viewport, so the end of the body is out of view.)
		await page.evaluate(() => {
			const link = Object.assign(document.createElement("a"), { href: "/orders?sort=number" });
			link.textContent = "By number";
			link.style.cssText = "position: fixed; top: 0; left: 0; z-index: 100";
			document.body.append(link);
		});
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route("**/_app/remote/**", async (route) => {
			await held;
			await route.continue();
		});
		try {
			await page.getByRole("link", { name: "By number" }).click();
			// The URL asks for other rows, those shown are still the newest: the table says so.
			await expect.poll(() => table.getAttribute("aria-busy")).toBe("true");
			expect(await shownNumbers(app)).toEqual(first);
		} finally {
			release();
			await page.unrouteAll({ behavior: "wait" });
		}
		await app.tableSettled();
		expect(await table.getAttribute("aria-busy")).toBeNull();
		expect(await shownNumbers(app)).not.toEqual(first);
	});
});
