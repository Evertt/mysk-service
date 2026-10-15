import { expect, test } from "vite-plus/test";

import { type App, hydrated, organizations, quiet, useApp } from "#e2e/app.ts";

import { activeEngineers, dayKey, orderByNumber, pageLocators, weekday } from "./helpers.ts";

const { north } = organizations;
// With the service worker, which answers the board's week from its cache.
const app = useApp({ serviceWorkers: "allow" });
const { backlog, cards, cell } = pageLocators(app);

test("with the service worker, an open board still shows another dispatcher's planning", async () => {
	const { page } = app;
	await app.go("/");
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
	const [engineer] = await activeEngineers(north.id);

	// The other dispatcher's board, ready to plan from.
	const other = await app.anotherTab();
	try {
		await other.goto(new URL("/schedule", page.url()).href);
		await hydrated(other);
		await quiet(other);

		// Opened client-side, the week comes through the worker, which keeps it: for 15 seconds it
		// answers with it without asking the server.
		await page.getByRole("link", { name: "Schedule", exact: true }).click();
		await page.waitForURL((url) => url.pathname === "/schedule");
		await quiet(page);
		const number = (await cards(backlog()).first().getAttribute("data-order"))!;

		const theirs = pageLocators({ page: other } as App);
		await theirs.backlog().locator(`[data-order="${number}"]`).waitFor();
		await other
			.getByRole("button", { name: `Schedule ${number}`, exact: true })
			.first()
			.click();
		const dialog = other.getByRole("dialog");
		await dialog.getByLabel("Engineer").selectOption(String(engineer.id));
		await dialog.getByLabel("Date").fill(dayKey(weekday(4)));
		await dialog.getByLabel("Time").fill("11:45");
		await dialog.getByRole("button", { name: "Schedule" }).click();
		await dialog.waitFor({ state: "hidden" });
		expect(await orderByNumber(number, north.id)).toMatchObject({ engineer_id: engineer.id });

		// The live event outdates the worker's answers, so the board's refresh gets the new week.
		await cell(engineer.name, weekday(4))
			.locator(`[data-order="${number}"]`)
			.waitFor({ timeout: 10_000 });
		expect(await backlog().locator(`[data-order="${number}"]`).count()).toBe(0);
	} finally {
		await other.context().close();
	}
});
