import { describe, expect, test } from "vite-plus/test";

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

/** What the search finds an order `o` by of its units, any of them (four parameters). */
const anyUnitLike = `exists (select 1 from order_unit x join equipment u on u.id = x.equipment_id
	where x.order_id = o.id and (u.manufacturer like ? or u.model like ? or u.serial_number like ?
	or u.name like ?))`;

describe("in North", () => {
	test("the list shows North's orders", async () => {
		await app.go(afresh("/orders"));
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
			expected.slice(0, 50),
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
		await app.go(afresh("/orders"));
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

	// One test per request, each loading the page afresh: in one test, the six page loads took up
	// half its time under the load of a full run.
	describe("a malformed query for the list is refused with a 400", () => {
		type Query = Record<string, unknown>;
		/** The error status of the response to the next `name` request, with its argument changed. */
		const statusOf = async (
			name: string,
			change: (arg: Query) => Query,
			trigger: () => unknown,
		) => {
			await app.go(afresh("/orders"));
			await tamperWithQuery<Query>(app.page, name, change);
			const [response] = await app.expectingErrors(() =>
				Promise.all([app.page.waitForResponse((r) => isRemote(r.url(), name)), trigger()]),
			);
			return remoteErrorStatus(response);
		};
		const rowsWith = (change: Query) => (arg: Query) => ({ ...arg, ...change });

		// An unknown status, a filter the list doesn't have, a string for an id, a page size it
		// doesn't have.
		test.each<Query>([
			{ filters: { status: ["bogus"] } },
			{ filters: { total: [1] } },
			{ filters: { engineer: ["1"] } },
			{ pageSize: 5000 },
		])("in the rows' query: %j", async (change) => {
			const more = () => app.page.locator('[data-slot="data-table-more"]').scrollIntoViewIfNeeded();
			expect(await statusOf("getOrders", rowsWith(change), more)).toBe(400);
		});

		test("in the filters' counts", async () => {
			const search = () => app.page.getByLabel("Search orders…").fill("ORD");
			expect(
				await statusOf("getOrderFacets", rowsWith({ filters: { status: ["bogus"] } }), search),
			).toBe(400);
		});

		test("while the list works as before once the request is right", async () => {
			await app.go(afresh("/orders"));
			expect(await app.rowCount()).toBe(await countIn("order", north.id));
		});
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
			 left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and o.status in ('scheduled', 'in_progress')
			 and (o.number like ? or c.name like ? or c.code like ? or ${anyUnitLike} or e.name like ?)
			 order by case o.priority when 'low' then 0 when 'normal' then 1 when 'high' then 2 else 3 end desc,
			   o.scheduled_for is null, o.scheduled_for, o.id`,
			[north.id, like, like, like, like, like, like, like, like],
		);
		expect(expected.length).toBeGreaterThan(0);

		await app.go(`/orders?status=scheduled,in_progress&sort=-priority,scheduled`);
		const search = page.getByLabel("Search orders…");
		await search.fill(word);
		await page.waitForURL((url) => url.searchParams.get("q") === word);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected.length);
		expect(await shownNumbers(app)).toEqual(expected.slice(0, 50).map((row) => row.number));

		// The status filter counts what the search and the other filters leave.
		const counts = await rows<{ status: string; n: number }>(
			`select o.status, count(*) as n from "order" o join customer c on c.id = o.customer_id
			 left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and (o.number like ? or c.name like ? or c.code like ?
			   or ${anyUnitLike} or e.name like ?)
			 group by o.status`,
			[north.id, like, like, like, like, like, like, like, like],
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
		await app.go(afresh("/orders"));
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
		await app.go(afresh("/orders"));
	});

	test("filtering on the unassigned orders and the new installations, by the filter and the URL", async () => {
		const { page } = app;
		const engineerPill = app.filterPill("Engineer");
		const unassigned = await value<number>(
			`select count(*) from "order" where organization_id = ? and engineer_id is null`,
			[north.id],
		);
		expect(unassigned).toBeGreaterThan(0);
		await app.go(afresh("/orders"));

		// The engineer filter offers "Unassigned" first, with how many there are.
		await app.openFilter("Engineer");
		const option = page.getByRole("option", { name: /^Unassigned/ });
		await expect
			.poll(() => option.innerText())
			.toMatch(new RegExp(`^Unassigned\\s+${unassigned}$`));
		expect(await page.getByRole("option").first().innerText()).toMatch(/^Unassigned/);
		await option.click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("engineer") === "none");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(unassigned);
		const engineers = await page.locator("tbody td:nth-child(8)").allInnerTexts();
		expect(new Set(engineers)).toEqual(new Set(["Unassigned"]));
		expect(await engineerPill.innerText()).toContain("Unassigned");

		// From a link, with an engineer: theirs and the unassigned ones.
		const [busy] = await rows<{ id: number; name: string; n: number }>(
			`select e.id, e.name, count(*) as n from "order" o join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? group by e.id order by n desc, e.id limit 1`,
			[north.id],
		);
		await app.go(`/orders?engineer=none,${busy.id}`);
		expect(await app.rowCount()).toBe(unassigned + busy.n);
		await expect.poll(() => engineerPill.innerText()).toContain(busy.name);
		expect(await engineerPill.innerText()).toContain("Unassigned");

		// The equipment filter likewise keeps the orders without a unit: the new installations.
		const installations = await value<number>(
			`select count(*) from "order" o where organization_id = ?
			 and not exists (select 1 from order_unit x where x.order_id = o.id)`,
			[north.id],
		);
		expect(installations).toBeGreaterThan(0);
		await app.go("/orders?equipment=none");
		expect(await app.rowCount()).toBe(installations);
		const units = await page.locator("tbody td:nth-child(4)").allInnerTexts();
		expect(new Set(units)).toEqual(new Set(["New installation"]));
		await app.go(afresh("/orders"));
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
		await app.go(afresh("/orders"));
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
		await app.go(afresh("/orders"));
	});
});
