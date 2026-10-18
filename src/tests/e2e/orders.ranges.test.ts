/**
 * The range filters of the orders list, from its Filter menu: a date preset that stays relative in
 * the URL, several values, days of one's own, a preset as an end, and an amount in euros. What
 * `getOrders` keeps for each range (also from a link, combined, and in South) is
 * `orders/server/ranges.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { type DateRange, presetRange } from "#lib/components/data-table/ranges.ts";
import { formatDate } from "#lib/i18n/format.ts";

import { afresh, organizations, useApp, value } from "./app.ts";

const { north } = organizations;
const app = useApp();

/** The moment a day starts, in seconds, in the machine's time zone (the test server's). */
const start = (day: Temporal.PlainDate) =>
	day.toZonedDateTime(Temporal.Now.timeZoneId()).epochMilliseconds / 1000;

/** A range of days in SQL: from the first day's start, before the start of the day after the last. */
const bounds = ({ from, to }: DateRange) => [
	from === null ? -1e12 : start(Temporal.PlainDate.from(from)),
	to === null ? 1e12 : start(Temporal.PlainDate.from(to).add({ days: 1 })),
];

/** Today, the machine's. */
const today = () => Temporal.Now.plainDateISO();

/** How many of an organization's orders have `column` (a date) in a range of days. */
const countIn = (column: string, range: DateRange) =>
	value<number>(
		`select count(*) from "order" where organization_id = ? and ${column} >= ? and ${column} < ?`,
		[north.id, ...bounds(range)],
	);

describe("range filters on the orders' dates, in North", () => {
	test("the Filter menu: a preset stays relative in the URL, several values, days of one's own, a preset as an end, euros", async () => {
		const { page } = app;
		const options = page.locator('[data-slot="command-list"]');
		const soon = await countIn("scheduled_for", presetRange("next-7-days"));
		expect(soon).toBeGreaterThan(0);
		await app.go(afresh("/orders"));

		// A preset, which shows what it means.
		await app.openFilter("Scheduled");
		await options.getByRole("option", { name: /^Next 7 days/ }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("scheduled") === "next-7-days");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(soon);
		expect(await app.filterPill("Scheduled").innerText()).toContain("Next 7 days");
		// Every order shown is scheduled in the next seven days.
		const { from, to } = presetRange("next-7-days");
		const first = Temporal.PlainDate.from(from!);
		const last = Temporal.PlainDate.from(to!);
		const dates = await page.locator("tbody td:nth-child(9)").allInnerTexts();
		const days = new Set(
			Array.from({ length: 7 }, (_, i) => formatDate(first.add({ days: i }), "en")),
		);
		for (const date of dates) expect(days.has(date), date).toBe(true);
		expect(days.has(formatDate(last, "en"))).toBe(true);
		// Taken off by its pill's button.
		const pill = app.filterPill("Scheduled");
		const all = await value<number>(`select count(*) from "order" where organization_id = ?`, [
			north.id,
		]);
		await pill.getByRole("button", { name: "Remove the Scheduled filter" }).click();
		await page.waitForURL((url) => !url.searchParams.has("scheduled"));
		await app.tableSettled();
		expect(await app.rowCount()).toBe(all);

		// Several values: unscheduled, or in the next seven days.
		const unscheduled = await value<number>(
			`select count(*) from "order" where organization_id = ? and scheduled_for is null`,
			[north.id],
		);
		expect(unscheduled).toBeGreaterThan(0);
		await app.openFilter("Scheduled");
		await options.getByRole("option", { name: /^Unscheduled/ }).click();
		await options.getByRole("option", { name: /^Next 7 days/ }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("scheduled") === "none,next-7-days");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(unscheduled + soon);
		expect(await pill.innerText()).toContain("Unscheduled, Next 7 days");
		// One taken off in the pill, by its own button.
		await pill.locator('[data-slot="popover-trigger"]').click();
		await page.getByRole("button", { name: "Remove Unscheduled" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("scheduled") === "next-7-days");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(soon);
		await pill.getByRole("button", { name: "Remove the Scheduled filter" }).click();
		await page.waitForURL((url) => !url.searchParams.has("scheduled"));
		await app.tableSettled();

		// Days of one's own, with a summary in the pill.
		const range = {
			from: today().subtract({ days: 20 }).toString(),
			to: today().subtract({ days: 6 }).toString(),
		};
		const inRange = await countIn("scheduled_for", range);
		expect(inRange).toBeGreaterThan(0);
		await app.openFilter("Scheduled");
		await page.getByLabel("From: date").fill(range.from);
		await page.getByLabel("To: date").fill(range.to);
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL(
			(url) => url.searchParams.get("scheduled") === `${range.from}..${range.to}`,
		);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(inRange);
		// (Intl puts thin spaces around the dash.)
		const spaced = (text: string) => text.replace(/\s+/g, " ");
		expect(spaced(await pill.innerText())).toContain(
			spaced(
				formatDate.range(
					Temporal.PlainDate.from(range.from),
					Temporal.PlainDate.from(range.to),
					"en",
				),
			),
		);
		await pill.getByRole("button", { name: "Remove the Scheduled filter" }).click();
		await page.waitForURL((url) => !url.searchParams.has("scheduled"));
		await app.tableSettled();

		// A preset as an end.
		const fromToday = await countIn("scheduled_for", { from: today().toString(), to: null });
		expect(fromToday).toBeGreaterThan(0);
		await app.openFilter("Scheduled");
		await page.getByLabel("From", { exact: true }).selectOption({ label: "Today" });
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("scheduled") === "today..");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(fromToday);
		expect(await pill.innerText()).toContain("From Today");
		await pill.getByRole("button", { name: "Remove the Scheduled filter" }).click();
		await page.waitForURL((url) => !url.searchParams.has("scheduled"));
		await app.tableSettled();

		// An amount in euros, on the totals (which orders it keeps is `ranges.spec.ts`'s).
		await app.openFilter("Total");
		await page.getByLabel("Minimum", { exact: true }).fill("500");
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("total") === "500..");
		await app.tableSettled();
		expect(await app.rowCount()).toBeLessThan(all);
		expect(await app.filterPill("Total").innerText()).toContain("At least €500.00");
	});
});
