/**
 * The user's time zone (see `src/lib/server/time-zone.ts`): a browser far from the server's zone
 * tells the server its own, and the server works out and shows days as the browser does: in the
 * dates it renders and in a date range filter's days.
 */
import { chromium } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { TIME_ZONE_COOKIE } from "#lib/dates.ts";

import { BROWSER_LOCALE, baseURL, hydrated, organizations, rows, useApp } from "./app.ts";

/** UTC+14, or UTC−10 on a machine that's in it: a day apart from most of the world's moments. */
const zone =
	Intl.DateTimeFormat().resolvedOptions().timeZone === "Pacific/Kiritimati"
		? "Pacific/Honolulu"
		: "Pacific/Kiritimati";

/** A moment's day in the browser's zone, `yyyy-mm-dd`. */
const dayIn = (seconds: number) =>
	new Intl.DateTimeFormat("sv-SE", { timeZone: zone, dateStyle: "short" }).format(seconds * 1000);

test("a browser in another time zone tells the server, and gets the page again in its own", async () => {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ locale: BROWSER_LOCALE, timezoneId: zone });
		await page.goto(new URL("/login", baseURL).href);
		await hydrated(page);
		// Reloaded once, now rendered in the browser's zone.
		await page.waitForFunction((zone) => document.documentElement.dataset.timeZone === zone, zone);
		const cookies = await page.context().cookies();
		expect(cookies.find((cookie) => cookie.name === TIME_ZONE_COOKIE)?.value).toBe(
			encodeURIComponent(zone),
		);
	} finally {
		await browser.close();
	}
});

describe("in a time zone a day away from the server's", () => {
	const app = useApp({ timeZone: zone });
	const { north } = organizations;

	test("the orders list shows the days the browser's zone has (the latest scheduled order's)", async () => {
		await app.go("/orders?sort=-scheduled");
		await app.tableSettled();
		const cells = await app.page
			.locator('[data-slot="table-body"] tr')
			.first()
			.locator("td[data-column-id]")
			.evaluateAll((tds: HTMLElement[]) =>
				Object.fromEntries(tds.map((td) => [td.dataset.columnId, td.innerText.trim()])),
			);
		const [order] = await rows<{ created: number }>(
			`select scheduled_for as created from "order" where organization_id = ? and number = ?`,
			[north.id, cells.number],
		);
		const expected = new Intl.DateTimeFormat("en-GB", {
			timeZone: zone,
			day: "numeric",
			month: "short",
			year: "numeric",
		}).format(order.created * 1000);
		expect(cells.scheduledFor).toBe(expected);
	});

	test("a day in a date range is the browser's day, on the server too", async () => {
		const created = await rows<{ created: number }>(
			`select created_at as created from "order" where organization_id = ?`,
			[north.id],
		);
		const perDay = new Map<string, number>();
		for (const { created: seconds } of created) {
			perDay.set(dayIn(seconds), (perDay.get(dayIn(seconds)) ?? 0) + 1);
		}
		// The busiest day, so a day's shift would change the count.
		const [day, count] = [...perDay].sort((a, b) => b[1] - a[1])[0];
		await app.go(`/orders?created=${day}`);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(count);
	});
});
