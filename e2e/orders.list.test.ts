import { describe, expect, test } from "vite-plus/test";

import { countIn, isRemote, organizations, rows, useApp, value } from "./app.ts";
import { shownNumbers } from "./orders-helpers.ts";
import { remoteErrorStatus, tamperWithQuery } from "./remote-functions.ts";

const { north } = organizations;
const app = useApp();

describe("in North", () => {
	test("the list shows North's orders", async () => {
		await app.go("/orders");
		expect(await app.rowCount()).toBe(await countIn("order", north.id));
	});

	test("a link with filters and sorting opens the list that way", async () => {
		const { page } = app;
		// The customer with the most open orders.
		const [{ code }] = await rows<{ code: string }>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
			 group by c.id order by count(*) desc, c.code limit 1`,
			[north.id],
		);
		const open = await rows<{ number: string; priority: string; name: string }>(
			`select o.number, o.priority, c.name from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and c.code = ?
			 and o.status in ('quote', 'scheduled', 'in_progress')`,
			[north.id, code],
		);
		expect(open.length).toBeGreaterThan(0);
		const urgency = ["low", "normal", "high", "urgent"];
		const expected = open
			.toSorted(
				(a, b) =>
					urgency.indexOf(b.priority) - urgency.indexOf(a.priority) ||
					a.number.localeCompare(b.number),
			)
			.map((row) => row.number);

		const filtered = "status=quote,scheduled,in_progress&sort=-priority,number";
		await app.go(`/orders?customer=${code}&${filtered}`);
		expect(await app.rowCount()).toBe(open.length);
		expect(await page.locator("tbody td:nth-child(2)").allInnerTexts()).toEqual(
			expected.slice(0, 20),
		);
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
		await app.go("/orders");
	});

	test("the server sends one page at a time, in the database's order", async () => {
		const { page } = app;
		const total = await countIn("order", north.id);
		const second = await rows<{ number: string }>(
			`select number from "order" where organization_id = ?
			 order by created_at desc, id limit 20 offset 20`,
			[north.id],
		);
		await app.go("/orders");
		expect(await app.rowCount()).toBe(total);
		const [response] = await Promise.all([
			page.waitForResponse((r) => isRemote(r.url(), "getOrders")),
			page.getByRole("button", { name: "Go to next page" }).click(),
		]);
		// Just that page's orders came, not all of them.
		const sent = new Set((await response.text()).match(/ORD-\d{4}-\d{5}/g));
		expect([...sent].sort()).toEqual(second.map((row) => row.number).sort());
		await app.tableSettled();
		expect(await shownNumbers(app)).toEqual(second.map((row) => row.number));
		expect(await app.rowCount()).toBe(total);
		expect(await page.getByText(/^Page \d+ of \d+$/).innerText()).toBe(
			`Page 2 of ${Math.ceil(total / 20)}`,
		);
	});

	test("a malformed query for the list is refused with a 400", async () => {
		const { page } = app;
		type Query = Record<string, unknown>;
		/** The error status of the response to the next `name` request, with its argument changed. */
		const statusOf = async (
			name: string,
			change: (arg: Query) => Query,
			trigger: () => unknown,
		) => {
			await app.go("/orders");
			await tamperWithQuery<Query>(page, name, change);
			const [response] = await app.expectingErrors(() =>
				Promise.all([page.waitForResponse((r) => isRemote(r.url(), name)), trigger()]),
			);
			return remoteErrorStatus(response);
		};
		const nextPage = () => page.getByRole("button", { name: "Go to next page" }).click();
		const search = () => page.getByLabel("Search orders…").fill("ORD");

		// An unknown status, a filter the list doesn't have, a string for an id, a page size it
		// doesn't offer.
		const rowsWith = (change: Query) => (arg: Query) => ({ ...arg, ...change });
		for (const change of [
			{ filters: { status: ["bogus"] } },
			{ filters: { total: [1] } },
			{ filters: { engineer: ["1"] } },
			{ pageSize: 5000 },
		]) {
			expect(await statusOf("getOrders", rowsWith(change), nextPage), JSON.stringify(change)).toBe(
				400,
			);
		}
		// The counts in the filters take the same care.
		expect(
			await statusOf("getOrderFacets", rowsWith({ filters: { status: ["bogus"] } }), search),
		).toBe(400);

		// The list works as before once the request is right.
		await app.go("/orders");
		expect(await app.rowCount()).toBe(await countIn("order", north.id));
	});

	test("searching, filtering and sorting happen in the database", async () => {
		const { page } = app;
		// A word of the name of the customer with the most scheduled or running orders.
		const [{ word }] = await rows<{ word: string }>(
			`select substr(c.name, 1, instr(c.name || ' ', ' ') - 1) as word
			 from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in ('scheduled', 'in_progress')
			 group by c.id order by count(*) desc, c.id limit 1`,
			[north.id],
		);
		const like = `%${word}%`;
		const expected = await rows<{ number: string }>(
			`select o.number from "order" o join customer c on c.id = o.customer_id
			 left join equipment u on u.id = o.equipment_id left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and o.status in ('scheduled', 'in_progress')
			 and (o.number like ? or c.name like ? or c.code like ? or u.manufacturer like ?
			   or u.model like ? or u.serial_number like ? or e.name like ?)
			 order by case o.priority when 'low' then 0 when 'normal' then 1 when 'high' then 2 else 3 end desc,
			   o.scheduled_for is null, o.scheduled_for, o.id`,
			[north.id, like, like, like, like, like, like, like],
		);
		expect(expected.length).toBeGreaterThan(0);

		await app.go(`/orders?status=scheduled,in_progress&sort=-priority,scheduled`);
		const search = page.getByLabel("Search orders…");
		await search.fill(word);
		await page.waitForURL((url) => url.searchParams.get("q") === word);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected.length);
		expect(await shownNumbers(app)).toEqual(expected.slice(0, 20).map((row) => row.number));

		// The status filter counts what the search and the other filters leave.
		const counts = await rows<{ status: string; n: number }>(
			`select o.status, count(*) as n from "order" o join customer c on c.id = o.customer_id
			 left join equipment u on u.id = o.equipment_id left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and (o.number like ? or c.name like ? or c.code like ?
			   or u.manufacturer like ? or u.model like ? or u.serial_number like ? or e.name like ?)
			 group by o.status`,
			[north.id, like, like, like, like, like, like, like],
		);
		await app.openFilter("Status");
		for (const { status, n } of counts) {
			const label =
				{ in_progress: "In progress" }[status] ?? status[0].toUpperCase() + status.slice(1);
			expect(await page.getByRole("option", { name: label }).innerText()).toMatch(
				new RegExp(`${n}$`),
			);
		}
		await page.keyboard.press("Escape");
		await app.go("/orders");
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
		await app.go("/orders");

		// Searching the customers finds them by name or code, North's only, at most 20.
		await app.openFilter("Customer");
		const box = page.getByPlaceholder("Search customers…");
		const fragment = busy.name.slice(1, 4).toLowerCase();
		await box.fill(fragment);
		const like = `%${fragment}%`;
		const matching = await rows<{ code: string }>(
			`select code from customer where organization_id = ? and (name like ? or code like ?)
			 order by name collate nocase, id limit 20`,
			[north.id, like, like],
		);
		await expect
			.poll(() => page.getByRole("option").allInnerTexts())
			.toEqual(matching.map((row) => expect.stringContaining(row.code)));
		await box.fill(busy.code);
		await page.getByRole("option", { name: new RegExp(busy.code) }).click();
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
		await app.go("/orders");
	});

	test("while the next page loads, the rows shown stay, dimmed", async () => {
		const { page } = app;
		await app.go("/orders");
		const before = await shownNumbers(app);
		const table = page.locator('[data-slot="data-table"]');
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route("**/_app/remote/**", async (route) => {
			await held;
			await route.continue();
		});
		try {
			await page.getByRole("button", { name: "Go to next page" }).click();
			await expect.poll(() => table.getAttribute("aria-busy")).toBe("true");
			expect(await shownNumbers(app)).toEqual(before);
			expect(await table.getByRole("progressbar").count()).toBe(1);
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
		await app.go("/orders");
	});
});
