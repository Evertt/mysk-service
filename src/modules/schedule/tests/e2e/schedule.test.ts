import { describe, expect, test } from "vite-plus/test";

import {
	fitsWidth,
	onPhone,
	organizations,
	rows,
	unbalancedStock,
	useApp,
	value,
} from "#e2e/app.ts";

import {
	activeEngineers,
	backlogSize,
	dayKey,
	longDay,
	type Order,
	orderByNumber,
	pageLocators,
	scheduledAt,
	seconds,
	snapshot,
	thisWeeksOrders,
	weekday,
} from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { board, backlog, cards, cell, drag, openDialog } = pageLocators(app);

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
		expect(await page.getByRole("link", { name: "Today" }).getAttribute("aria-disabled")).toBe(
			"true",
		);
	});

	test("its band has the title, the week's orders in a pill and the view switch, phone-wide too, and nothing hangs below the board", async () => {
		const { page } = app;
		const band = page.locator("[data-toolbar-band]");
		expect(await band.getByRole("heading", { level: 1 }).innerText()).toBe("Schedule");
		// Its full height above the board that fills the screen.
		expect(await band.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(
			true,
		);
		const count = await thisWeeksOrders(north.id);
		expect(await band.locator("[data-band-count]").innerText()).toBe(
			`${count} order${count === 1 ? "" : "s"}`,
		);
		const views = band.getByRole("navigation", { name: "View" });
		expect(await views.getByRole("link", { name: "Week" }).getAttribute("aria-current")).toBe(
			"page",
		);
		// The page itself doesn't scroll.
		const room = await page.evaluate(() =>
			[document.documentElement, document.querySelector("main")!].map(
				(element) => element.scrollHeight - element.clientHeight,
			),
		);
		expect(room).toEqual([0, 0]);
		await onPhone(page, async () => {
			await page.reload();
			await band.waitFor();
			expect(await fitsWidth(page)).toBe(true);
		});
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

		await page.getByRole("link", { name: "Today" }).click();
		await page.waitForURL((url) => url.pathname === "/schedule" && !url.search);
		await cell("Unassigned", weekday(0)).waitFor();
	});

	test("the dialog lists the engineers who service the order's first unit first", async () => {
		// A backlog order whose first unit's category has a specialty that the alphabetically first
		// engineer hasn't, so the order of the names alone wouldn't put them first.
		const [order] = await rows<{ number: string; specialty: string }>(
			`select o.number, c.specialty from "order" o
			 join order_unit u on u.order_id = o.id
			  and u.position = (select min(position) from order_unit where order_id = o.id)
			 join equipment e on e.id = u.equipment_id
			 join equipment_category c on c.id = e.category_id
			 where o.organization_id = ? and o.scheduled_for is null
			  and o.status in ('quote', 'scheduled', 'in_progress')
			  and c.specialty != (select specialty from engineer
			   where organization_id = o.organization_id and active = 1 order by name, id limit 1)
			  and exists (select 1 from engineer
			   where organization_id = o.organization_id and specialty = c.specialty and active = 1)
			 order by o.id limit 1`,
			[north.id],
		);
		expect(order).toBeDefined();
		const fitting = await rows<{ name: string }>(
			`select name from engineer where organization_id = ? and specialty = ? and active = 1
			 order by name, id`,
			[north.id, order.specialty],
		);

		const dialog = await openDialog(order.number);
		const firstGroup = await dialog
			.getByLabel("Engineer")
			.locator("optgroup")
			.first()
			.locator("option")
			.allInnerTexts();
		expect(firstGroup).toEqual(fitting.map((engineer) => engineer.name));
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await dialog.waitFor({ state: "hidden" });
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

	test("going back closes the dialog, and going forward opens it again", async () => {
		const { page } = app;
		const number = (await cards(backlog()).first().getAttribute("data-order"))!;
		const dialog = await openDialog(number);
		await page.goBack();
		await dialog.waitFor({ state: "hidden" });
		expect(app.path()).toBe("/schedule");
		await page.goForward();
		await dialog.waitFor();
		expect(await dialog.getByRole("heading").innerText()).toBe(`Schedule ${number}`);
		// Cancelling goes back too, so going back again leaves the page.
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await dialog.waitFor({ state: "hidden" });
		expect(await page.evaluate(() => history.state["sveltekit:metadata"].state)).toBe("[{}]");
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

	test("planned for another week, the board goes there, and back to this week without the dialog", async () => {
		const { page } = app;
		const number = (await cards(backlog()).first().getAttribute("data-order"))!;
		const dialog = await openDialog(number);
		await dialog.getByLabel("Date").fill(dayKey(weekday(8)));
		await app.submit(dialog.getByRole("button", { name: "Schedule" }));
		await page.waitForURL((url) => url.searchParams.get("week") === dayKey(weekday(7)));
		await cell("Unassigned", weekday(8)).locator(`[data-order="${number}"]`).waitFor();
		await dialog.waitFor({ state: "hidden" });

		await page.goBack();
		await page.waitForURL((url) => url.pathname === "/schedule" && !url.search);
		await cell("Unassigned", weekday(0)).waitFor();
		expect(await dialog.isVisible()).toBe(false);
	});
});
