import { describe, expect, test } from "vite-plus/test";

import { type DateRange, dayStart, presetRange } from "#lib/components/data-table/ranges.ts";
import { addDays, nextDay, toDateInput } from "#lib/dates.ts";
import { formatDate, formatNumber } from "#lib/i18n/format.ts";

import { isRemote, organizations, rows, useApp, value } from "./app.ts";
import { remoteErrorStatus, tamperWithQuery } from "./remote-functions.ts";

const { north, south } = organizations;
const app = useApp();

/** A range of days in SQL: from the first day's start, before the start of the day after the last. */
const bounds = ({ from, to }: DateRange) => [
	from === null ? -1e12 : dayStart(from).getTime() / 1000,
	to === null ? 1e12 : nextDay(dayStart(to)).getTime() / 1000,
];

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
	test("a preset from the Filter menu stays relative in the URL, and shows what it means", async () => {
		const { page } = app;
		const expected = await countIn("scheduled_for", presetRange("next-7-days"));
		expect(expected).toBeGreaterThan(0);
		await app.go("/orders");

		await app.openFilter("Scheduled");
		await page.getByRole("option", { name: /^Next 7 days/ }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("scheduled") === "next-7-days");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected);
		expect(await app.filterPill("Scheduled").innerText()).toContain("Next 7 days");

		// Every order shown is scheduled in the next seven days.
		const { from, to } = presetRange("next-7-days");
		const first = dayStart(from!);
		const last = dayStart(to!);
		const dates = await page.locator("tbody td:nth-child(9)").allInnerTexts();
		const days = new Set(Array.from({ length: 7 }, (_, i) => formatDate(addDays(first, i), "en")));
		for (const date of dates) expect(days.has(date), date).toBe(true);
		expect(days.has(formatDate(last, "en"))).toBe(true);
	});

	test("days of one's own, from the Filter menu, with a summary in the pill", async () => {
		const { page } = app;
		const today = new Date();
		const range = { from: toDateInput(addDays(today, -20)), to: toDateInput(addDays(today, -6)) };
		const expected = await countIn("scheduled_for", range);
		expect(expected).toBeGreaterThan(0);
		await app.go("/orders");

		await app.openFilter("Scheduled");
		await page.getByLabel("From", { exact: true }).fill(range.from);
		await page.getByLabel("To", { exact: true }).fill(range.to);
		await page.getByRole("button", { name: "Apply" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL(
			(url) => url.searchParams.get("scheduled") === `${range.from}..${range.to}`,
		);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected);
		const pill = app.filterPill("Scheduled");
		// (Intl puts thin spaces around the dash.)
		const spaced = (text: string) => text.replace(/\s+/g, " ");
		expect(spaced(await pill.innerText())).toContain(
			spaced(formatDate.range(dayStart(range.from), dayStart(range.to), "en")),
		);

		// Taken off by its pill's button.
		await pill.getByRole("button", { name: "Remove the Scheduled filter" }).click();
		await page.waitForURL((url) => !url.searchParams.has("scheduled"));
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			await value<number>(`select count(*) from "order" where organization_id = ?`, [north.id]),
		);
	});

	test("a link combines ranges with the other filters, with either end open", async () => {
		const lastMonth = presetRange("last-30-days");
		expect(await shownFor("created=last-30-days&status=quote")).toBe(
			await countIn("created_at", lastMonth, north.id, "and status = 'quote'"),
		);
		const since = toDateInput(addDays(new Date(), -10));
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
	});

	test("a link's range that isn't one is ignored", async () => {
		const all = await value<number>(`select count(*) from "order" where organization_id = ?`, [
			north.id,
		]);
		for (const bad of ["2026-13-01..", "2026-10-07..2026-10-01", "soon", "1..5"]) {
			expect(await shownFor(`scheduled=${bad}`), bad).toBe(all);
			expect(await app.filterPill("Scheduled").count()).toBe(0);
		}
	});

	test("a bulk action on all the matching orders acts on those in the range only", async () => {
		const { page } = app;
		const range = presetRange("last-30-days");
		const [from, to] = bounds(range);
		const matching = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and created_at >= ? and created_at < ?`,
			[north.id, from, to],
		);
		// More than fit on a page.
		expect(matching.length).toBeGreaterThan(20);
		const inRange = new Set(matching.map((o) => o.id));
		const [engineer] = await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 1 order by id limit 1`,
			[north.id],
		);
		/** Every order of every organization with its engineer. */
		const engineers = () =>
			rows<{ id: number; engineer_id: number | null }>(
				`select id, engineer_id from "order" order by id`,
			);
		const before = await engineers();

		await app.go("/orders?created=last-30-days");
		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });
		const total = formatNumber(matching.length, "en");
		await bar.getByRole("button", { name: `Select all ${total} matching` }).click();
		await bar.getByText(`All ${total} matching selected`).waitFor();
		await bar.getByRole("button", { name: "Assign engineer" }).click();
		const dialog = page.getByRole("alertdialog");
		const field = dialog.getByLabel("Engineer");
		await field.locator("option", { hasText: engineer.name }).waitFor({ state: "attached" });
		await field.selectOption({ label: engineer.name });
		await dialog.getByRole("button", { name: "Apply" }).click();
		await app.toast("updated");

		// The orders created in the range were assigned (those that may be); no other changed.
		const after = await engineers();
		const changed = after.filter((o, i) => o.engineer_id !== before[i].engineer_id);
		expect(changed.length).toBeGreaterThan(0);
		for (const order of changed) {
			expect(inRange.has(order.id), String(order.id)).toBe(true);
			expect(order.engineer_id).toBe(engineer.id);
		}
	});

	// One test per request, each loading the page afresh.
	describe("a malformed range in the list's query is refused with a 400", () => {
		type Query = Record<string, unknown>;
		test.each<Query>([
			{ scheduledFor: ["this-week"] },
			{ scheduledFor: [{ from: "2026-10-07", to: "2026-10-01" }] },
			{ scheduledFor: [{ from: null, to: null }] },
			{ scheduledFor: [{ from: "2026-02-30", to: null }] },
			{
				createdAt: [
					{ from: "2026-10-01", to: null },
					{ from: null, to: "2026-09-01" },
				],
			},
		])("%j", async (filters) => {
			await app.go("/orders");
			await tamperWithQuery<Query>(app.page, "getOrders", (arg) => ({ ...arg, filters }));
			const [response] = await app.expectingErrors(() =>
				Promise.all([
					app.page.waitForResponse((r) => isRemote(r.url(), "getOrders")),
					app.page.getByRole("button", { name: "Go to next page" }).click(),
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
			 order by created_at desc, id limit 20`,
			[south.id, ...bounds(range)],
		);
		expect(await app.page.locator("tbody td:nth-child(2)").allInnerTexts()).toEqual(
			numbers.map((row) => row.number),
		);
	});
});
