/**
 * The condition settings page in North: "Plan critical units automatically", off at first, turned
 * on by a manager, back to the Connect page; after the daily run, the page says when it last ran
 * and how many orders it made. What the settings store and log, and what the daily run plans
 * (each critical unit in care without an open order, once, nothing in South), is
 * `automatic.spec.ts`'s; that critical stays below attention is `schemas.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, runDailyJobs, useApp } from "#e2e/app.ts";

const { north } = organizations;
const app = useApp();

const autoPlan = () =>
	app.page.getByRole("checkbox", { name: "Plan critical units automatically" });
const save = () => app.page.getByRole("button", { name: "Save settings" });

describe("the settings", () => {
	test("a manager turns automatic planning on", async () => {
		const { page } = app;
		await app.go("/condition");
		await page.getByRole("link", { name: "Settings" }).click();
		await page.waitForURL((url) => url.pathname === "/condition/settings");
		expect(await autoPlan().isChecked()).toBe(false);
		expect(await page.getByLabel("Critical below (%)").inputValue()).toBe("40");
		expect(await page.getByLabel("Attention below (%)").inputValue()).toBe("70");
		await autoPlan().click();
		await app.submit(save());
		await page.waitForURL((url) => url.pathname === "/condition");
	});

	test("say when the daily run last planned, and how many orders it made", async () => {
		const { status, reports } = await runDailyJobs();
		expect(status).toBe(200);
		const made = reports[north.id]["condition.orders"];
		await app.go("/condition/settings");
		expect(await autoPlan().isChecked()).toBe(true);
		await app.page.getByText(new RegExp(`: ${made} orders?`)).waitFor();
	});
});
