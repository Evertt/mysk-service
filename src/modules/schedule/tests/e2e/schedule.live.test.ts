import type { Locator } from "playwright";
import { expect, test } from "vite-plus/test";

import { type App, hydrated, organizations, useApp } from "#e2e/app.ts";

import { activeEngineers, dayKey, orderByNumber, pageLocators, weekday } from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { backlog, cards, cell } = pageLocators(app);

test("an open board shows what another dispatcher plans, without reloading", async () => {
	await app.go("/schedule");
	// Gone if the page reloads.
	await app.page.evaluate(() => Object.assign(window, { boardMarker: true }));
	const number = (await cards(backlog()).first().getAttribute("data-order"))!;
	const [engineer] = await activeEngineers(north.id);

	// Another dispatcher plans it, on a board of their own.
	const other = await app.anotherTab();
	try {
		await other.goto(new URL("/schedule", app.page.url()).href);
		await hydrated(other);
		const theirs = pageLocators({ page: other } as App);
		await theirs.backlog().locator(`[data-order="${number}"]`).waitFor();
		await other
			.getByRole("button", { name: `Schedule ${number}`, exact: true })
			.first()
			.click();
		const dialog = other.getByRole("dialog");
		await dialog.getByLabel("Engineer").selectOption(String(engineer.id));
		await dialog.getByLabel("Date").fill(dayKey(weekday(3)));
		await dialog.getByLabel("Time").fill("10:15");
		await dialog.getByRole("button", { name: "Schedule" }).click();
		await dialog.waitFor({ state: "hidden" });
	} finally {
		await other.context().close();
	}
	expect(await orderByNumber(number, north.id)).toMatchObject({ engineer_id: engineer.id });

	// The first board moved it from the backlog to the engineer's day by itself.
	await cell(engineer.name, weekday(3)).locator(`[data-order="${number}"]`).waitFor();
	expect(await backlog().locator(`[data-order="${number}"]`).count()).toBe(0);
	expect(await app.page.evaluate(() => "boardMarker" in window)).toBe(true);
});

test("moves made in quick succession stay where they were dropped", async () => {
	const { page } = app;
	await app.go("/schedule");
	const [, engineer] = await activeEngineers(north.id);
	const [first, second] = await Promise.all(
		[0, 1].map(async (i) => (await cards(backlog()).nth(i).getAttribute("data-order"))!),
	);
	// The board's own move answers with the week; a refresh on the live event asks for it again.
	// Those answers come 2 seconds after the server read them, so a refresh that the first move's
	// event started is still on its way, with the week from before the second, when that's done.
	await page.route(/\/_app\/remote\/[^/]+\/getSchedule/, async (route) => {
		const response = await route.fetch();
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		await route.fulfill({ response });
	});
	try {
		const firstCell = cell(engineer.name, weekday(1));
		const secondCell = cell(engineer.name, weekday(2));
		/** Drops an order on a cell and waits for the move's answer, not for anything after it. */
		const drop = async (number: string, target: Locator) => {
			const [response] = await Promise.all([
				page.waitForResponse((r) => r.url().includes("/moveOrder")),
				backlog().locator(`[data-order="${number}"]`).dragTo(target),
			]);
			expect(await response.text()).not.toMatch(/"type":"error"/);
		};
		// The first move's live event has the board ask for the week again, which takes a while.
		const refreshing = page.waitForRequest(/\/getSchedule/);
		await drop(first, firstCell);
		await refreshing;
		await drop(second, secondCell);
		expect(await orderByNumber(second, north.id)).toMatchObject({ engineer_id: engineer.id });

		// Once every answer is in, both are where they were dropped.
		await page.waitForTimeout(5_000);
		expect(await firstCell.locator(`[data-order="${first}"]`).count()).toBe(1);
		expect(await secondCell.locator(`[data-order="${second}"]`).count()).toBe(1);
		expect(await backlog().locator(`[data-order="${second}"]`).count()).toBe(0);
	} finally {
		await page.unroute(/\/_app\/remote\/[^/]+\/getSchedule/);
	}
});
