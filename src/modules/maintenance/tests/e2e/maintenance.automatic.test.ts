import { describe, expect, test } from "vite-plus/test";

import {
	countIn,
	organizations,
	rows,
	runDailyJobs,
	sentMail,
	users,
	useApp,
	value,
} from "#e2e/app.ts";
import { automaticHorizon, defaultLeadDays, finishedStatuses } from "#modules/maintenance/model.ts";

import { dayKey, pageLocators, plansOf, today, unitWithoutPlan } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, dialog } = pageLocators(app);

/** The settings page's parts. */
const autoCreate = () => app.page.getByRole("checkbox", { name: "Create orders automatically" });
const remind = () => app.page.getByRole("checkbox", { name: "Email customers" });
const save = () => app.page.getByRole("button", { name: "Save settings" });

/** The tenant's stored settings, if any. */
const settingsOf = async (organizationId: string) =>
	(
		await rows<{ auto_create: number; lead_days: number; remind_customers: number }>(
			`select auto_create, lead_days, remind_customers from maintenance_settings
			 where organization_id = ?`,
			[organizationId],
		)
	)[0];

/**
 * How many of the tenant's plans the daily run makes an order for today: active, due within the
 * default lead time, and without an open last order (`dueForAutomaticOrder()`).
 */
const dueForOrders = async (organizationId: string) =>
	Number(
		await value(
			`select count(*) from maintenance_plan p left join "order" o on o.id = p.last_order_id
			 where p.organization_id = ? and p.paused = 0 and p.next_due_on < ?
			 and (o.id is null or o.status in (select value from json_each(?)))`,
			[
				organizationId,
				dayKey(automaticHorizon(today, defaultLeadDays)),
				JSON.stringify(finishedStatuses),
			],
		),
	);

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
		await app.submit(save());
		await page.waitForURL((url) => url.pathname === "/maintenance");
		expect(await settingsOf(north.id)).toEqual({
			auto_create: 1,
			lead_days: defaultLeadDays,
			remind_customers: 0,
		});
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity where organization_id = ?
			 and subject_type = 'maintenance_settings' order by id desc limit 1`,
			[north.id],
		);
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes)).toEqual({ autoCreate: [false, true] });
	});

	test("the run makes the orders of the plans that are due, once", async () => {
		const due = await dueForOrders(north.id);
		expect(due).toBeGreaterThan(0);
		const orders = await countIn("order", north.id);
		const southOrders = await countIn("order", south.id);

		const first = await runDailyJobs();
		expect(first.reports[north.id]).toEqual({ "maintenance.orders": due });
		expect(await countIn("order", north.id)).toBe(orders + due);
		expect(await dueForOrders(north.id)).toBe(0);

		// Again: nothing more.
		const second = await runDailyJobs();
		expect(second.reports[north.id]).toEqual({ "maintenance.orders": 0 });
		expect(await countIn("order", north.id)).toBe(orders + due);

		// South (with the module or without, but not with automatic orders) gets none.
		expect(first.reports[south.id]).toEqual({});
		expect(await countIn("order", south.id)).toBe(southOrders);
	});

	test("the orders and the plans are logged as made automatically", async () => {
		const { page } = app;
		const [order] = await rows<{ user_id: string | null; user_name: string }>(
			`select user_id, user_name from activity where organization_id = ?
			 and subject_type = 'order' and action = 'created' order by id desc limit 1`,
			[north.id],
		);
		expect(order).toEqual({ user_id: null, user_name: "" });
		const [plan] = await rows<{ user_id: string | null; changes: string }>(
			`select user_id, changes from activity where organization_id = ?
			 and subject_type = 'maintenancePlan' order by id desc limit 1`,
			[north.id],
		);
		expect(plan.user_id).toBeNull();
		expect(Object.keys(JSON.parse(plan.changes)).toSorted()).toEqual(["lastOrder", "nextDueOn"]);

		await app.go("/activity");
		await page.getByText("Fieldworks (automatic)").first().waitFor();
		// The settings page says when the run made them.
		await app.go("/maintenance/settings");
		await page.getByText("0 orders created").waitFor();
	});

	test("with reminders on, the customer of a new order gets an email", async () => {
		const { page } = app;
		await app.go("/maintenance/settings");
		await remind().click();
		await app.submit(save());
		await page.waitForURL((url) => url.pathname === "/maintenance");
		expect((await settingsOf(north.id)).remind_customers).toBe(1);

		const unit = await addDuePlan("Reminder check");
		const [customer] = await rows<{ email: string }>(`select email from customer where id = ?`, [
			unit.customer_id,
		]);
		const before = sentMail(customer.email).length;
		const { reports } = await runDailyJobs();
		expect(reports[north.id]).toEqual({ "maintenance.orders": 1 });
		const [plan] = await plansOf(unit.id);
		expect(plan.last_order_id).not.toBeNull();
		const mails = sentMail(customer.email).slice(before);
		expect(mails).toHaveLength(1);
		// The cron's request names no language, so the mail is in the app's fallback, Dutch.
		expect(mails[0].subject).toBe(`Onderhoud gepland voor apparaat ${unit.serial_number}`);
		expect(mails[0].text).toContain("Reminder check");
	});

	// That a run then makes no orders is `automatic.spec.ts`'s; turned off, they make none for the
	// files after this one on its database.
	test("turned off again", async () => {
		const { page } = app;
		await app.go("/maintenance/settings");
		await autoCreate().click();
		await app.submit(save());
		await page.waitForURL((url) => url.pathname === "/maintenance");
		expect((await settingsOf(north.id)).auto_create).toBe(0);
	});

	test("only a manager may change the settings", async () => {
		const { page } = app;
		await app.go("/maintenance/settings");
		// The form with automatic orders on, as the planner will submit it (not saved here).
		await autoCreate().click();
		const form = await page
			.locator("form", { has: save() })
			.evaluate((element: HTMLFormElement) => ({
				action: element.action,
				fields: [...new FormData(element)].map(([name, value]) => [name, value as string]),
			}));
		expect(form.fields.length).toBeGreaterThan(1);

		await page.context().clearCookies();
		await app.signIn(users.planner);
		await app.go("/maintenance/settings");
		await page.getByText("Only owners and admins can change these settings.").waitFor();
		expect(await save().count()).toBe(0);

		// Submitted the way a browser without JavaScript would.
		const status = await app.expectingErrors(() =>
			page.evaluate(async ({ action, fields }) => {
				const body = new URLSearchParams(fields);
				return (await fetch(action, { method: "POST", body, headers: { accept: "text/html" } }))
					.status;
			}, form),
		);
		expect(status).toBe(403);
		expect((await settingsOf(north.id)).auto_create).toBe(0);
	});
});
