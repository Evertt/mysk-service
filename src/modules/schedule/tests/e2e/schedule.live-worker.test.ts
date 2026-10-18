import type { Page } from "playwright";
import { expect, test } from "vite-plus/test";

import { type App, hydrated, organizations, quiet, useApp } from "#e2e/app.ts";

import { activeEngineers, dayKey, orderByNumber, pageLocators, weekday } from "./helpers.ts";

const { north } = organizations;
// With the service worker, which answers the board's week from its cache.
const app = useApp({ serviceWorkers: "allow" });
const { backlog, cards, cell } = pageLocators(app);

/**
 * Opens the board client-side, through the worker, and answers its first backlog order. With
 * `live`, waits for the board's live query to be open too (the worker answers the page's request
 * for it with the server's stream), which `quiet()` doesn't.
 */
async function openBoard({ live }: { live: boolean }) {
	const { page } = app;
	const opened =
		live &&
		page.waitForResponse(
			(response) =>
				response.url().includes("/watchSchedule") && !response.request().serviceWorker(),
		);
	await page.getByRole("link", { name: "Schedule", exact: true }).click();
	await page.waitForURL((url) => url.pathname === "/schedule");
	await quiet(page);
	await opened;
	return (await cards(backlog()).first().getAttribute("data-order"))!;
}

/** Another dispatcher plans `number` for `engineerId` on `day` at `time`, on a board of their own. */
async function planElsewhere(
	other: Page,
	plan: { number: string; engineerId: number; day: Date; time: string },
) {
	await other.goto(new URL("/schedule", app.page.url()).href);
	await hydrated(other);
	const theirs = pageLocators({ page: other } as App);
	await theirs.backlog().locator(`[data-order="${plan.number}"]`).waitFor();
	await other
		.getByRole("button", { name: `Schedule ${plan.number}`, exact: true })
		.first()
		.click();
	const dialog = other.getByRole("dialog");
	await dialog.getByLabel("Engineer").selectOption(String(plan.engineerId));
	await dialog.getByLabel("Date").fill(dayKey(plan.day));
	await dialog.getByLabel("Time").fill(plan.time);
	await dialog.getByRole("button", { name: "Schedule" }).click();
	await dialog.waitFor({ state: "hidden" });
	expect(await orderByNumber(plan.number, north.id)).toMatchObject({
		engineer_id: plan.engineerId,
	});
}

test("with the service worker, an open board still shows another dispatcher's planning", async () => {
	const { page } = app;
	await app.go("/");
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
	const [engineer] = await activeEngineers(north.id);

	// Opened client-side, the week comes through the worker, which keeps it: for 15 seconds it
	// answers with it without asking the server. Planned once the board's live query is open.
	const number = await openBoard({ live: true });
	const other = await app.anotherTab();
	try {
		await planElsewhere(other, { number, engineerId: engineer.id, day: weekday(4), time: "11:45" });
	} finally {
		await other.context().close();
	}

	// The live event outdates the worker's answers, so the board's refresh gets the new week.
	await cell(engineer.name, weekday(4))
		.locator(`[data-order="${number}"]`)
		.waitFor({ timeout: 10_000 });
	expect(await backlog().locator(`[data-order="${number}"]`).count()).toBe(0);
});

test("a change made before the board's live query opens shows too", async () => {
	const { page } = app;
	await app.go("/");
	const [engineer] = await activeEngineers(north.id);

	// The board's live query reaches the server only once the other dispatcher has planned: its
	// first answer is the change, made after the board had its week (from the worker's cache).
	const { promise: planned, resolve: release } = Promise.withResolvers<void>();
	await page.context().route(/\/watchSchedule/, async (route) => {
		await planned;
		await route.continue();
	});
	const other = await app.anotherTab();
	try {
		const number = await openBoard({ live: false });
		await planElsewhere(other, { number, engineerId: engineer.id, day: weekday(3), time: "09:30" });
		release();

		await cell(engineer.name, weekday(3))
			.locator(`[data-order="${number}"]`)
			.waitFor({ timeout: 10_000 });
		expect(await backlog().locator(`[data-order="${number}"]`).count()).toBe(0);
	} finally {
		release();
		await page.context().unrouteAll({ behavior: "ignoreErrors" });
		await other.context().close();
	}
});
