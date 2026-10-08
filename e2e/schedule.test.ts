import type { Locator } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, unbalancedStock, useApp, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

// --- This week, in the local time zone the app and the tests share ---------------------------

const monday = new Date();
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

/** A day of this week (0 is Monday), at a time of day. */
const weekday = (index: number, hours = 0, minutes = 0) => {
	const date = new Date(monday);
	date.setDate(date.getDate() + index);
	date.setHours(hours, minutes, 0, 0);
	return date;
};
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (date: Date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const longDay = (date: Date) =>
	new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(date);
/** Timestamps are stored in seconds. */
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

// --- Database ----------------------------------------------------------------------------------

interface Order {
	id: number;
	number: string;
	status: string;
	engineer_id: number | null;
	scheduled_for: number | null;
}

const orderByNumber = async (number: string, organizationId: string) =>
	(
		await rows<Order>(
			`select id, number, status, engineer_id, scheduled_for from "order"
			 where number = ? and organization_id = ?`,
			[number, organizationId],
		)
	)[0];
/** An order as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) => rows(`select * from "order" where id = ?`, [id]);
const scheduledAt = (order: Order) =>
	order.scheduled_for === null ? null : new Date(Number(order.scheduled_for) * 1000);

const thisWeeksOrders = async (organizationId: string) =>
	Number(
		await value(
			`select count(*) from "order" where organization_id = ? and status != 'cancelled'
			 and scheduled_for >= ? and scheduled_for < ?`,
			[organizationId, seconds(weekday(0)), seconds(weekday(7))],
		),
	);
const backlogSize = async (organizationId: string) =>
	Number(
		await value(
			`select count(*) from "order" where organization_id = ? and scheduled_for is null
			 and status in ('quote', 'scheduled', 'in_progress')`,
			[organizationId],
		),
	);
const activeEngineers = (organizationId: string) =>
	rows<{ id: number; name: string }>(
		`select id, name from engineer where organization_id = ? and active = 1 order by name, id`,
		[organizationId],
	);

// --- Page --------------------------------------------------------------------------------------

const board = () => app.page.locator('section[aria-label="Week"]');
const backlog = () => app.page.getByRole("region", { name: "Backlog" });
/** The cards on the board (in the view the screen size shows). */
const cards = (within: Locator) => within.locator("[data-order]:visible");
const cell = (row: string, day: Date) =>
	app.page.getByRole("group", { name: `${row} on ${longDay(day)}`, exact: true });

/** Drags `source` onto `target` and waits for the server's answer to the move. */
async function drag(source: Locator, target: Locator) {
	const { page } = app;
	const [response] = await Promise.all([
		page.waitForResponse(
			(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
		),
		source.dragTo(target),
	]);
	await page.waitForLoadState("networkidle");
	return response.text();
}

/** Opens the schedule dialog for an order on the page. */
async function openDialog(number: string) {
	await app.page
		.getByRole("button", { name: `Schedule ${number}`, exact: true })
		.first()
		.click();
	const dialog = app.page.getByRole("dialog");
	await dialog.waitFor();
	return dialog;
}

describe("in North", () => {
	let planned: Order;
	let engineers: { id: number; name: string }[];

	test("the week shows North's engineers and this week's orders, with today highlighted", async () => {
		const { page } = app;
		await app.go("/schedule");
		await expect.poll(() => app.path()).toBe("/schedule");
		engineers = await activeEngineers(north.id);
		for (const engineer of engineers) {
			expect(await cell(engineer.name, weekday(0)).count()).toBe(1);
		}
		expect(await cell("Unassigned", weekday(6)).count()).toBe(1);
		expect(await cards(board()).count()).toBe(await thisWeeksOrders(north.id));
		expect(await board().locator('[aria-current="date"]:visible').innerText()).toContain(
			new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(new Date()),
		);

		const waiting = await backlogSize(north.id);
		expect(waiting).toBeGreaterThan(1);
		expect(await cards(backlog()).count()).toBe(waiting);
		expect(await backlog().innerText()).toContain(`${waiting} open orders without a date`);
		// Most urgent first.
		const priorities = await backlog().locator("[data-order] [title$=' priority']").all();
		const ranks = await Promise.all(
			priorities.map(async (icon) =>
				["Low", "Normal", "High", "Urgent"].indexOf(
					(await icon.getAttribute("title"))!.replace(" priority", ""),
				),
			),
		);
		expect(ranks).toEqual(ranks.toSorted((a, b) => b - a));
		expect(await page.getByRole("link", { name: "This week" }).getAttribute("aria-disabled")).toBe(
			"true",
		);
	});

	test("the row of days stays at the top of the board, above the cards, when it scrolls", async () => {
		const { page } = app;
		/** Scrolls the board (not the page) and says where a day's header ends up. */
		const scrollBoard = (date: Date, to: { top: number; left: number }) =>
			page.evaluate(
				({ day, label, to }) => {
					const header = document.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
					let area = header.parentElement!;
					while (getComputedStyle(area).overflowY !== "auto") area = area.parentElement!;
					area.scrollTo(to);
					const box = header.getBoundingClientRect();
					const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
					// A cell in that day's column, further down.
					const cell = document.querySelector(`[role="group"][aria-label$=" on ${label}"]`)!;
					return {
						scrolled: { top: area.scrollTop, left: area.scrollLeft },
						page: document.scrollingElement!.scrollTop,
						offset: box.top - area.getBoundingClientRect().top - area.clientTop,
						covered: !header.contains(hit),
						misaligned: cell.getBoundingClientRect().left - box.left,
					};
				},
				{ day: dayKey(date), label: longDay(date), to },
			);
		const thursday = weekday(3);

		// On a desktop screen the board is taller than the screen, and scrolls inside.
		const down = await scrollBoard(thursday, { top: 600, left: 0 });
		expect(down).toMatchObject({ page: 0, offset: 0, covered: false, misaligned: 0 });
		expect(down.scrolled.top).toBe(600);

		// On a narrower one it scrolls sideways too, and the days go along with their columns.
		await page.setViewportSize({ width: 1100, height: 900 });
		try {
			const across = await scrollBoard(thursday, { top: 600, left: 150 });
			expect(across).toMatchObject({ page: 0, offset: 0, covered: false, misaligned: 0 });
			expect(across.scrolled.left).toBe(150);
		} finally {
			await page.setViewportSize({ width: 1440, height: 1000 });
			await scrollBoard(thursday, { top: 0, left: 0 });
		}
	});

	test("the week is in the URL, and can be paged through", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Next week" }).click();
		await page.waitForURL((url) => url.searchParams.get("week") === dayKey(weekday(7)));
		await cell("Unassigned", weekday(7)).waitFor();
		expect(await cards(board()).count()).toBe(
			Number(
				await value(
					`select count(*) from "order" where organization_id = ? and status != 'cancelled'
					 and scheduled_for >= ? and scheduled_for < ?`,
					[north.id, seconds(weekday(7)), seconds(weekday(14))],
				),
			),
		);

		for (const week of [0, -7]) {
			await page.getByRole("link", { name: "Previous week" }).click();
			await page.waitForURL((url) => url.searchParams.get("week") === dayKey(weekday(week)));
			await cell("Unassigned", weekday(week)).waitFor();
		}
		await cell("Unassigned", weekday(-7)).waitFor();

		// Any day of a week stands for that week.
		await app.go(`/schedule?week=${dayKey(weekday(-4))}`);
		await cell("Unassigned", weekday(-7)).waitFor();

		await page.getByRole("link", { name: "This week" }).click();
		await page.waitForURL((url) => url.pathname === "/schedule" && !url.search);
		await cell("Unassigned", weekday(0)).waitFor();
	});

	test("a backlog order is scheduled through the dialog", async () => {
		const number = (await cards(backlog()).first().getAttribute("data-order"))!;
		const before = await orderByNumber(number, north.id);
		expect(before).toMatchObject({ status: "quote", engineer_id: null, scheduled_for: null });
		const [engineer] = engineers;

		const dialog = await openDialog(number);
		expect(await dialog.getByLabel("Time").inputValue()).toBe("09:00");
		await dialog.getByLabel("Engineer").selectOption(String(engineer.id));
		await dialog.getByLabel("Date").fill(dayKey(weekday(2)));
		await dialog.getByLabel("Time").fill("13:30");
		await app.submit(dialog.getByRole("button", { name: "Schedule" }));
		await app.toast(`${number} scheduled`);
		await dialog.waitFor({ state: "hidden" });

		planned = await orderByNumber(number, north.id);
		expect(planned).toMatchObject({ status: "scheduled", engineer_id: engineer.id });
		expect(scheduledAt(planned)).toEqual(weekday(2, 13, 30));
		// Scheduled, the quote's lines take their materials from stock.
		const consumed = await rows(
			`select material_id, -quantity as quantity from stock_movement
			 where order_id = ? and kind = 'consumption' order by material_id`,
			[planned.id],
		);
		expect(consumed).toEqual(
			await rows(
				`select material_id, quantity from order_line where order_id = ? order by material_id`,
				[planned.id],
			),
		);
		expect(consumed.length).toBeGreaterThan(0);
		expect(await unbalancedStock(north.id)).toEqual([]);
		await cell(engineer.name, weekday(2)).locator(`[data-order="${number}"]`).waitFor();
		expect(await backlog().locator(`[data-order="${number}"]`).count()).toBe(0);
	});

	test("dragging an order to another engineer and day keeps its time", async () => {
		const [, engineer] = engineers;
		const card = cell(engineers[0].name, weekday(2)).locator(`[data-order="${planned.number}"]`);
		const target = cell(engineer.name, weekday(4));

		const result = await drag(card, target);
		expect(result).not.toMatch(/"type":"error"/);
		await target.locator(`[data-order="${planned.number}"]`).waitFor();
		const moved = await orderByNumber(planned.number, north.id);
		expect(moved).toMatchObject({ status: "scheduled", engineer_id: engineer.id });
		expect(scheduledAt(moved)).toEqual(weekday(4, 13, 30));

		// The cell's load indicator counts its orders.
		const count = Number(
			await value(
				`select count(*) from "order" where organization_id = ? and engineer_id = ?
				 and status != 'cancelled' and scheduled_for >= ? and scheduled_for < ?`,
				[north.id, engineer.id, seconds(weekday(4)), seconds(weekday(5))],
			),
		);
		expect(await target.locator('[data-slot="badge"]').innerText()).toBe(
			`${count} ${count === 1 ? "order" : "orders"}`,
		);
	});

	test("a backlog order dropped on Unassigned gets a date at 9:00 but no engineer", async () => {
		const card = cards(backlog()).first();
		const number = (await card.getAttribute("data-order"))!;
		const target = cell("Unassigned", weekday(3));

		await drag(card, target);
		await target.locator(`[data-order="${number}"]`).waitFor();
		const moved = await orderByNumber(number, north.id);
		// Without an engineer, a quote stays a quote.
		expect(moved).toMatchObject({ status: "quote", engineer_id: null });
		expect(scheduledAt(moved)).toEqual(weekday(3, 9));
	});

	test("orders that aren't open can't be scheduled", async () => {
		const { page } = app;
		const done = (
			await rows<Order>(
				`select id, number, status, engineer_id, scheduled_for from "order"
				 where organization_id = ? and status = 'completed' limit 1`,
				[north.id],
			)
		)[0];
		const before = await snapshot(done.id);

		const dialog = await openDialog(planned.number);
		await page.evaluate((id) => {
			document.querySelector<HTMLInputElement>('[role="dialog"] input[name^="id"]')!.value =
				String(id);
		}, done.id);
		await app.submit(dialog.getByRole("button", { name: "Schedule" }));
		expect(await app.issues()).toContain("Only open orders can be scheduled");
		expect(await snapshot(done.id)).toEqual(before);
		await page.keyboard.press("Escape");
	});
});

describe("in South", () => {
	let own: Order;

	test("switching organization shows South's engineers and orders only", async () => {
		await app.switchOrganization(south.name);
		await app.go("/schedule");
		const southEngineers = await activeEngineers(south.id);
		const rowLinks = await board()
			.locator('a[href^="/engineers/"]:visible')
			.evaluateAll((links) =>
				links.map((link) => Number(link.getAttribute("href")!.split("/").pop())),
			);
		const southIds = (
			await rows<{ id: number }>(`select id from engineer where organization_id = ?`, [south.id])
		).map((row) => row.id);
		expect(rowLinks.length).toBeGreaterThanOrEqual(southEngineers.length);
		expect(rowLinks.every((id) => southIds.includes(id))).toBe(true);
		expect(await cards(board()).count()).toBe(await thisWeeksOrders(south.id));
		expect(await cards(backlog()).count()).toBe(await backlogSize(south.id));
		const numbers = await cards(backlog()).evaluateAll((els) =>
			els.map((el) => el.getAttribute("data-order")!),
		);
		const southNumbers = (
			await rows<{ number: string }>(
				`select number from "order" where organization_id = ? and scheduled_for is null`,
				[south.id],
			)
		).map((row) => row.number);
		expect(numbers.every((number) => southNumbers.includes(number))).toBe(true);
		own = await orderByNumber(numbers[0], south.id);
	});

	test("scheduling North's order by its id is refused", async () => {
		const { page } = app;
		const victim = (
			await rows<Order>(
				`select id, number, status, engineer_id, scheduled_for from "order"
				 where organization_id = ? and status = 'quote' limit 1`,
				[north.id],
			)
		)[0];
		const [victimBefore, ownBefore] = [await snapshot(victim.id), await snapshot(own.id)];

		const dialog = await openDialog(own.number);
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="dialog"] input[name^="id"]')!.value =
					String(id);
			}, victim.id);
			return app.submit(dialog.getByRole("button", { name: "Schedule" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(await snapshot(victim.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
		await page.keyboard.press("Escape");
	});

	test("North's engineers and inactive engineers can't be assigned", async () => {
		const { page } = app;
		const before = await snapshot(own.id);
		const northEngineer = String(
			await value(`select min(id) from engineer where organization_id = ?`, [north.id]),
		);
		const [inactive] = await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 0 limit 1`,
			[south.id],
		);

		await app.go("/schedule");
		for (const [id, message] of [
			[northEngineer, "Unknown engineer"],
			[String(inactive.id), `${inactive.name} is no longer active`],
		]) {
			const dialog = await openDialog(own.number);
			await page.evaluate((id) => {
				document
					.querySelector<HTMLSelectElement>('[role="dialog"] select')!
					.add(new Option("Someone else", id));
			}, id);
			await dialog.getByLabel("Engineer").selectOption(id);
			await app.submit(dialog.getByRole("button", { name: "Schedule" }));
			expect(await app.issues()).toContain(message);
			expect(await snapshot(own.id)).toEqual(before);
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "hidden" });
		}
	});
});
