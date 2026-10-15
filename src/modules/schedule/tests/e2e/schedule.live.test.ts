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
