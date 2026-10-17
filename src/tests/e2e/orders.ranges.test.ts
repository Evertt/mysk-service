import { describe, expect, test } from "vite-plus/test";

import { type DateRange, presetRange } from "#lib/components/data-table/ranges.ts";
import { formatDate, formatNumber } from "#lib/i18n/format.ts";

import { afresh, isRemote, organizations, rows, useApp, value } from "./app.ts";
import { remoteErrorStatus, tamperWithQuery } from "./remote-functions.ts";

const { north, south } = organizations;
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
const countIn = (column: string, range: DateRange, organizationId: string = north.id, and = "") =>
	value<number>(
		`select count(*) from "order" where organization_id = ? and ${column} >= ? and ${column} < ? ${and}`,
		[organizationId, ...bounds(range)],
	);

/** The orders the URL's parameters show, in all. */
const shownFor = async (search: string) => {
	await app.go(`/orders?${search}`);
	return app.rowCount();
};

describe("range filters on the orders' dates, in North", () => {
	test("the Filter menu: a preset stays relative in the URL, days of one's own, several values, a preset as an end", async () => {
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
		expect(await app.filterPill("Scheduled").innerText()).toContain("From Today");
	});

	test("a link combines ranges with the other filters, with either end open", async () => {
		const lastMonth = presetRange("last-30-days");
		expect(await shownFor("created=last-30-days&status=quote")).toBe(
			await countIn("created_at", lastMonth, north.id, "and status = 'quote'"),
		);
		const since = today().subtract({ days: 10 }).toString();
		expect(await shownFor(`scheduled=${since}..`)).toBe(
			await countIn("scheduled_for", { from: since, to: null }),
		);
		// Unscheduled orders are in no range.
		expect(await shownFor("scheduled=..2100-01-01")).toBe(
			await value<number>(
				`select count(*) from "order" where organization_id = ? and scheduled_for is not null`,
				[north.id],
			),
		);
		// Presets as ends.
		const thisWeek = presetRange("this-week");
		const nextMonth = presetRange("next-month");
		expect(await shownFor("scheduled=this-week..next-month")).toBe(
			await countIn("scheduled_for", { from: thisWeek.from, to: nextMonth.to }),
		);
		expect(await shownFor("scheduled=..yesterday,none")).toBe(
			(await countIn("scheduled_for", presetRange("before-today"))) +
				(await value<number>(
					`select count(*) from "order" where organization_id = ? and scheduled_for is null`,
					[north.id],
				)),
		);
	});

	test("totals in euros, as priced with the modules, from the Filter menu and a link", async () => {
		const { page } = app;
		const all = await value<number>(`select count(*) from "order" where organization_id = ?`, [
			north.id,
		]);
		/** The totals the table shows on its page, in cents. */
		const shownTotals = async () =>
			(await page.locator("tbody td:nth-child(10)").allInnerTexts()).map((text) =>
				Math.round(Number(text.replace(/[^\d.-]/g, "")) * 100),
			);

		await app.go(afresh("/orders"));
		await app.openFilter("Total");
		await page.getByLabel("Minimum", { exact: true }).fill("500");
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("total") === "500..");
		await app.tableSettled();
		const over = await app.rowCount();
		expect(over).toBeGreaterThan(0);
		expect(await app.filterPill("Total").innerText()).toContain("At least €500.00");
		for (const total of await shownTotals()) expect(total).toBeGreaterThanOrEqual(50_000);

		// The rest are below, to the cent: together, every order.
		const under = await shownFor("total=..499.99");
		expect(under).toBeGreaterThan(0);
		expect(over + under).toBe(all);
		for (const total of await shownTotals()) expect(total).toBeLessThanOrEqual(49_999);

		// With the other filters, and several ranges.
		const completedOver = await shownFor("total=500..&status=completed");
		const completed = await value<number>(
			`select count(*) from "order" where organization_id = ? and status = 'completed'`,
			[north.id],
		);
		expect(completedOver + (await shownFor("total=..499.99&status=completed"))).toBe(completed);
		expect(await shownFor("total=..100,500..")).toBe(over + (await shownFor("total=..100")));

		// "Select all matching" counts what the filter keeps.
		await app.go("/orders?total=500..");
		await page.getByRole("checkbox", { name: "Select all loaded rows" }).click();
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });
		const total = formatNumber(over, "en");
		await bar.getByRole("button", { name: `Select all ${total} matching` }).click();
		await bar.getByText(`All ${total} matching selected`).waitFor();
	});

	// One test per request, each loading the page afresh. The schema's other refusals (a token, the
	// ends the wrong way round, no end, a day that doesn't exist, too many ranges, cents that aren't
	// whole) are `list-definition.spec.ts`'s.
	describe("a malformed range in the list's query is refused with a 400", () => {
		type Query = Record<string, unknown>;
		test.each<Query>([
			// The creation date can't be empty.
			{ createdAt: [null] },
			// A range of cents isn't a token.
			{ total: ["500.."] },
		])("%j", async (filters) => {
			await app.go(afresh("/orders"));
			await tamperWithQuery<Query>(app.page, "getOrders", (arg) => ({ ...arg, filters }));
			const [response] = await app.expectingErrors(() =>
				Promise.all([
					app.page.waitForResponse((r) => isRemote(r.url(), "getOrders")),
					app.page.locator('[data-slot="data-table-more"]').scrollIntoViewIfNeeded(),
				]),
			);
			expect(await remoteErrorStatus(response)).toBe(400);
		});
	});
});

describe("range filters on the orders' dates, in South", () => {
	test("count South's orders only", async () => {
		await app.switchOrganization(south.name);
		const range = presetRange("last-30-days");
		const expected = await countIn("created_at", range, south.id);
		expect(expected).toBeGreaterThan(0);
		expect(await shownFor("created=last-30-days")).toBe(expected);
		const numbers = await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and created_at >= ? and created_at < ?
			 order by created_at desc, id limit 50`,
			[south.id, ...bounds(range)],
		);
		expect(await app.page.locator("tbody td:nth-child(2)").allInnerTexts()).toEqual(
			numbers.map((row) => row.number),
		);
		const southOrders = await value<number>(
			`select count(*) from "order" where organization_id = ?`,
			[south.id],
		);
		expect((await shownFor("total=500..")) + (await shownFor("total=..499.99"))).toBe(southOrders);
	});
});
