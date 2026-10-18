/**
 * Automatic orders end to end: a manager turns them on on the module's settings page, the cron's
 * daily run makes the orders of the plans that are due, the settings page says so, and with
 * reminders on the customer gets an email, in the app's fallback language as the cron's request
 * names none. What the run decides (which plans, once, logged as the system, only in its tenant,
 * emails only when wanted) is `../unit/server/automatic.spec.ts`'s, the cron's token
 * `daily.spec.ts`'s, and the settings' manager gate and log `plans.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, runDailyJobs, sentMail, useApp } from "#e2e/app.ts";
import { defaultLeadDays } from "#modules/maintenance/model.ts";

import { dayKey, pageLocators, today, unitWithoutPlan } from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { card, dialog } = pageLocators(app);

/** The settings page's parts. */
const autoCreate = () => app.page.getByRole("checkbox", { name: "Create orders automatically" });
const remind = () => app.page.getByRole("checkbox", { name: "Email customers" });
const save = () => app.page.getByRole("button", { name: "Save settings" });

/** Saves the settings page and waits for the due list it goes back to. */
async function saveSettings() {
	await app.submit(save());
	await app.page.waitForURL((url) => url.pathname === "/maintenance");
}

/** Adds a plan due today to a unit of North's without one, through its card; returns the unit. */
async function addDuePlan(description: string) {
	const unit = await unitWithoutPlan(north.id);
	await app.go(`/equipment/${unit.serial_number}`);
	await card().getByRole("button", { name: "Add plan" }).click();
	await dialog().getByLabel("Description").fill(description);
	await dialog().getByLabel("Next due on").fill(dayKey(today));
	await app.submit(dialog().getByRole("button", { name: "Save plan" }));
	await app.toast("Plan saved");
	return unit;
}

describe("automatic orders", () => {
	test("a manager turns them on, on the module's settings page", async () => {
		const { page } = app;
		await app.go("/maintenance");
		await page.getByRole("link", { name: "Settings" }).click();
		await page.waitForURL((url) => url.pathname === "/maintenance/settings");
		expect(await autoCreate().isChecked()).toBe(false);
		expect(await page.getByLabel("Days ahead").inputValue()).toBe(String(defaultLeadDays));
		await page.getByText("Not yet").waitFor();

		await autoCreate().click();
		await saveSettings();
	});

	test("the daily run makes the orders of the plans that are due, as the settings page says", async () => {
		const { reports } = await runDailyJobs();
		const made = reports[north.id]["maintenance.orders"];
		expect(made).toBeGreaterThan(0);
		await app.go("/maintenance/settings");
		await app.page.getByText(new RegExp(`\\b${made} orders? created`)).waitFor();
	});

	test("with reminders on, the customer of a new order gets an email", async () => {
		await app.go("/maintenance/settings");
		await remind().click();
		await saveSettings();

		const unit = await addDuePlan("Reminder check");
		const [customer] = await rows<{ email: string }>(`select email from customer where id = ?`, [
			unit.customer_id,
		]);
		const before = sentMail(customer.email).length;
		const { reports } = await runDailyJobs();
		expect(reports[north.id]).toEqual({ "maintenance.orders": 1 });
		const mails = sentMail(customer.email).slice(before);
		expect(mails).toHaveLength(1);
		// The cron's request names no language, so the mail is in the app's fallback, Dutch.
		expect(mails[0].subject).toBe(`Onderhoud gepland voor apparaat ${unit.serial_number}`);
		expect(mails[0].text).toContain("Reminder check");
	});

	// Turned off, the run makes no orders for the files after this one on its database.
	test("turned off again", async () => {
		await app.go("/maintenance/settings");
		await autoCreate().click();
		await remind().click();
		await saveSettings();
		expect(
			await rows(
				`select auto_create, remind_customers from maintenance_settings where organization_id = ?`,
				[north.id],
			),
		).toEqual([{ auto_create: 0, remind_customers: 0 }]);
	});
});
