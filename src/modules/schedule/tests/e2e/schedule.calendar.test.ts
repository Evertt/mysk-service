import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, rows, useApp } from "#e2e/app.ts";

import {
	calendarDays,
	dayKey,
	longDay,
	monthName,
	monthStart,
	orderByNumber,
	ordersByDay,
	pageLocators,
	scheduledAt,
} from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { board, month, monthCell, backlog, cards, cell, openDialog } = pageLocators(app);

const nextDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const viewLink = (name: string) =>
	app.page.getByRole("navigation", { name: "View" }).getByRole("link", { name, exact: true });
const time = (date: Date) =>
	new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);

/** What the calendar's cells show: the day, its orders' numbers and its "+N more" line. */
const cellContents = () =>
	month()
		.getByRole("group")
		.evaluateAll((cells) =>
			cells.map((cell) => ({
				day: cell.getAttribute("data-day")!,
				orders: [...cell.querySelectorAll("[data-order]")].map((a) =>
					a.getAttribute("data-order")!,
				),
				more: cell.querySelector('a[aria-label*=" more on "]')?.textContent?.trim() ?? null,
			})),
		);

describe("the month", () => {
	test("is six weeks from a Monday, with each day's orders, the days around it muted and today marked", async () => {
		const { page } = app;
		await app.go("/schedule");
		await viewLink("Month").click();
		await page.waitForURL(
			(url) =>
				url.searchParams.get("view") === "month" &&
				url.searchParams.get("date") === dayKey(monthStart()),
		);
		await month().waitFor();
		expect(await viewLink("Month").getAttribute("aria-current")).toBe("page");

		const days = calendarDays(monthStart());
		expect(days[0].getDay()).toBe(1);
		const contents = await cellContents();
		expect(contents.map((cell) => cell.day)).toEqual(days.map(dayKey));
		expect(
			await month()
				.getByRole("group")
				.evaluateAll((cells) => cells.map((cell) => cell.getAttribute("aria-label"))),
		).toEqual(days.map(longDay));
		expect(
			await month()
				.locator("[data-outside]")
				.evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-day"))),
		).toEqual(days.filter((day) => day.getMonth() !== monthStart().getMonth()).map(dayKey));
		expect(
			await month().locator('[role=group][aria-current="date"]').getAttribute("data-day"),
		).toBe(dayKey(new Date()));

		// Up to three orders a day, by time; else two, and how many more.
		const orders = await ordersByDay(north.id, days[0], nextDay(days[41]));
		let overflowing = 0;
		for (const { day, orders: shown, more } of contents) {
			const all = orders.get(day) ?? [];
			const fits = all.length <= 3;
			expect(shown.length, day).toBe(fits ? all.length : 2);
			expect(
				shown.every((number) => all.includes(number)),
				day,
			).toBe(true);
			expect(more, day).toBe(fits ? null : `+${all.length - 2} more`);
			if (!fits) overflowing++;
		}
		// The seed plans enough for some days to overflow.
		expect(overflowing).toBeGreaterThan(0);

		const inMonth = [...orders.entries()]
			.filter(([day]) => day.startsWith(dayKey(monthStart()).slice(0, 8)))
			.reduce((sum, [, numbers]) => sum + numbers.length, 0);
		expect(await page.locator("main").innerText()).toContain(
			`${monthName(monthStart())}: ${inMonth} orders scheduled.`,
		);
		// The legend names each type.
		expect(
			await month()
				.getByRole("list", { name: "Order types" })
				.getByRole("listitem")
				.allInnerTexts(),
		).toEqual([
			"Breakdown",
			"Repair",
			"Maintenance",
			"Inspection",
			"Installation",
			"Survey",
			"Damage",
			"Project",
			"Other",
		]);
	});

	test("an order shows its time, customer and type, in its type's colour, and opens its page", async () => {
		const { page } = app;
		const entry = month().locator("[role=group] [data-order]").first();
		const number = (await entry.getAttribute("data-order"))!;
		const [order] = await rows<{ type: string; customer: string; scheduled_for: number }>(
			`select o.type, c.name as customer, o.scheduled_for from "order" o
			 join customer c on c.id = o.customer_id where o.number = ? and o.organization_id = ?`,
			[number, north.id],
		);
		const type = order.type[0].toUpperCase() + order.type.slice(1);
		expect(await entry.getAttribute("data-type")).toBe(order.type);
		expect(await entry.innerText()).toContain(
			`${time(new Date(Number(order.scheduled_for) * 1000))}`,
		);
		expect(await entry.getAttribute("title")).toContain(`${order.customer} · ${type}`);
		const url = page.url();
		await entry.click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await page.goBack();
		await page.waitForURL(url);
		await month().waitFor();
	});

	test("pages through the months, back to today's, and keeps the view on a reload", async () => {
		const { page } = app;
		/** Waits for the calendar of the month `offset` months from this one. */
		const shows = async (offset: number) => {
			const days = calendarDays(monthStart(offset));
			// Its last day is in no other month's calendar.
			await monthCell(days[41]).waitFor();
			await monthCell(days[0]).waitFor();
			const title = new RegExp(`^${monthName(monthStart(offset))}: \\d+ orders? scheduled\\.$`);
			await page.locator("main p", { hasText: title }).waitFor();
		};

		await page.getByRole("link", { name: "Next month" }).click();
		await page.waitForURL((url) => url.searchParams.get("date") === dayKey(monthStart(1)));
		await shows(1);
		expect(await month().locator('[role=group][aria-current="date"]').count()).toBe(
			calendarDays(monthStart(1)).some((day) => dayKey(day) === dayKey(new Date())) ? 1 : 0,
		);

		for (const offset of [0, -1]) {
			await page.getByRole("link", { name: "Previous month" }).click();
			await page.waitForURL((url) => url.searchParams.get("date") === dayKey(monthStart(offset)));
			await shows(offset);
		}

		// A reload shows the same month.
		await app.go(`/schedule?view=month&date=${dayKey(monthStart(-1))}`);
		await shows(-1);

		await page.getByRole("link", { name: "Today" }).click();
		await page.waitForURL((url) => url.search === "?view=month");
		await shows(0);
		await month()
			.locator(`[role=group][aria-current="date"][data-day="${dayKey(new Date())}"]`)
			.waitFor();
		expect(await page.getByRole("link", { name: "Today" }).getAttribute("aria-disabled")).toBe(
			"true",
		);
	});

	test("+N more opens the day, with all its orders", async () => {
		const { page } = app;
		const more = month().locator('a[aria-label*=" more on "]').first();
		const day = (await more.locator("xpath=..").getAttribute("data-day"))!;
		await more.click();
		await page.waitForURL(
			(url) => url.searchParams.get("view") === "day" && url.searchParams.get("date") === day,
		);
		const date = new Date(`${day}T00:00`);
		const section = page.locator('section[aria-label="Day"]');
		await section.waitFor();
		const orders = await ordersByDay(north.id, date, nextDay(date));
		expect(await cards(section).count()).toBe(orders.get(day)!.length);
		expect(await viewLink("Day").getAttribute("aria-current")).toBe("page");
	});
});

describe("switching views", () => {
	test("keeps the period: another month's first week and day, or today in this one", async () => {
		const { page } = app;
		const first = monthStart(1);
		const monday = calendarDays(first)[0];
		await app.go(`/schedule?view=month&date=${dayKey(first)}`);

		await viewLink("Week").click();
		await page.waitForURL((url) => url.searchParams.get("week") === dayKey(monday));
		await cell("Unassigned", monday).waitFor();
		expect(await board().isVisible()).toBe(true);
		expect(await backlog().isVisible()).toBe(true);

		await viewLink("Day").click();
		await page.waitForURL(
			(url) =>
				url.searchParams.get("view") === "day" && url.searchParams.get("date") === dayKey(monday),
		);
		await cell("Unassigned", monday).waitFor();
		// Just the one day.
		expect(await page.locator('section[aria-label="Day"] [data-day]').count()).toBe(1);

		await page.getByRole("link", { name: "Next day" }).click();
		await page.waitForURL((url) => url.searchParams.get("date") === dayKey(nextDay(monday)));
		await cell("Unassigned", nextDay(monday)).waitFor();
		await page.goBack();
		await page.waitForURL((url) => url.searchParams.get("date") === dayKey(monday));
		await cell("Unassigned", monday).waitFor();

		// In this month, the day is today.
		await app.go("/schedule?view=month");
		await viewLink("Day").click();
		await page.waitForURL((url) => url.searchParams.get("date") === dayKey(new Date()));
		await cell("Unassigned", new Date()).waitFor();
		await viewLink("Week").click();
		await page.waitForURL((url) => url.searchParams.has("week"));
		await board().waitFor();
	});

	test("an order planned in the day view shows on its day in the month", async () => {
		const { page } = app;
		// Next month's quietest day, so the order is in its cell rather than in "+N more".
		const first = monthStart(1);
		const days = calendarDays(first).filter((day) => day.getMonth() === first.getMonth());
		const orders = await ordersByDay(north.id, days[0], nextDay(days.at(-1)!));
		const target = days.reduce((quietest, day) =>
			(orders.get(dayKey(day))?.length ?? 0) < (orders.get(dayKey(quietest))?.length ?? 0)
				? day
				: quietest,
		);

		await app.go(`/schedule?view=day&date=${dayKey(target)}`);
		const number = (await cards(backlog()).first().getAttribute("data-order"))!;
		const dialog = await openDialog(number);
		// The day view suggests its day.
		expect(await dialog.getByLabel("Date").inputValue()).toBe(dayKey(target));
		await dialog.getByLabel("Time").fill("00:00");
		await app.submit(dialog.getByRole("button", { name: "Schedule" }));
		await app.toast(`${number} scheduled`);
		await dialog.waitFor({ state: "hidden" });
		await cell("Unassigned", target).locator(`[data-order="${number}"]`).waitFor();
		const planned = await orderByNumber(number, north.id);
		expect(scheduledAt(planned)).toEqual(target);

		await viewLink("Month").click();
		await page.waitForURL((url) => url.searchParams.get("date") === dayKey(first));
		const entry = monthCell(target).locator("[data-order]").first();
		expect(await entry.getAttribute("data-order")).toBe(number);
		expect(await entry.innerText()).toMatch(/^00:00/);
	});
});

test("on a phone, the month is a list of its days with orders", async () => {
	const { page } = app;
	await onPhone(page, async () => {
		await app.go("/schedule?view=month");
		await month().waitFor();
		const days = calendarDays(monthStart());
		const orders = await ordersByDay(north.id, days[0], nextDay(days[41]));
		const own = [...orders.entries()].filter(([day]) =>
			day.startsWith(dayKey(monthStart()).slice(0, 8)),
		);
		const headings = await month().locator("h2:visible").allInnerTexts();
		expect(headings.length).toBe(own.length);
		expect(headings[0]).toContain(longDay(new Date(`${own[0][0]}T00:00`)));
		expect(await month().locator("[data-order]:visible").count()).toBe(
			own.reduce((sum, [, numbers]) => sum + numbers.length, 0),
		);
		expect(await fitsWidth(page)).toBe(true);
	});
});
