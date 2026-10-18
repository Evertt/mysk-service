/**
 * The schedule and tenants: a board left open in North refuses a drag once the user switched to
 * South, which hasn't the module; South switches it on, can't schedule North's order by its id
 * (one tampered form), and switches it off again. That South's board and month show its own
 * records only, and its dialog refuses North's or inactive engineers, is the module's
 * `tests/unit/server/schedule.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value, quiet } from "#e2e/app.ts";

import {
	type Order,
	orderByNumber,
	pageLocators,
	scheduleSwitches,
	snapshot,
	weekday,
} from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { backlog, cards, cell, operations, settingsCard, drag, openDialog } = pageLocators(app);

/** The last activity entry before this file switched South's schedule on. */
let since = 0;

// That the module's queries and its other forms refuse a tenant without it is `moduleRemote`'s
// (`remote-functions.spec.ts`), and that its other pages are 404s the module route guard's
// (`route-guard.spec.ts`).
describe("in South, which doesn't have the schedule", () => {
	test("a drag on a board left open in North is refused after switching to South elsewhere", async () => {
		const { page } = app;
		await app.go("/schedule");
		await backlog().waitFor();
		const card = cards(backlog()).first();
		/** A North order in the backlog, which the refused request tries to plan. */
		const victim = await orderByNumber((await card.getAttribute("data-order"))!, north.id);
		const before = await snapshot(victim.id);

		const other = await app.anotherTab();
		await other.goto(new URL("/", page.url()).href);
		await quiet(other);
		await other.locator('[data-sidebar="header"] button').first().click();
		await other.getByRole("menuitem", { name: south.name }).click();
		// The tab is at / already, so wait for the switch itself: the header names South.
		await other.locator('[data-sidebar="header"]').getByText(south.name).waitFor();
		await other.context().close();

		const target = cell("Unassigned", weekday(3));
		const result = await app.expectingErrors(() => drag(card, target));
		expect(result).toMatch(/404/);
		// The toast says what the server said.
		await app.toast("Not found");
		// The card goes back to the backlog.
		await backlog().locator(`[data-order="${victim.number}"]`).waitFor();
		expect(await snapshot(victim.id)).toEqual(before);
	});

	test("South's sidebar has no Schedule, and its page is a 404", async () => {
		await app.go("/");
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		expect(await operations()).toEqual(["Dashboard", "Orders", "Activity"]);
		expect(
			await app.page
				.locator('[data-sidebar="content"]')
				.getByRole("link", { name: "Schedule" })
				.count(),
		).toBe(0);
		const response = await app.go("/schedule?view=month");
		expect(response?.status()).toBe(404);
		// The app's own 404 page, inside its layout.
		expect(await app.page.locator('[data-sidebar="content"]').count()).toBe(1);
	});
});

describe("switching the schedule on in South", () => {
	// Where it goes in the sidebar is `nav.spec.ts`'s.
	test("an owner switches it on in settings", async () => {
		await app.go("/settings");
		const card = settingsCard();
		expect(await card.innerText()).toContain("Disabled");
		since = await value<number>("select coalesce(max(id), 0) from activity");
		await app.submit(card.getByRole("button", { name: "Enable" }));
		await card.getByText(/Enabled since/).waitFor();
		expect(
			await rows(
				`select module_id from organization_module where organization_id = ? and module_id = 'schedule'`,
				[south.id],
			),
		).toEqual([{ module_id: "schedule" }]);
		expect(await scheduleSwitches(south.id, since)).toEqual([{ action: "module_enabled" }]);
	});
});

describe("in South, with the schedule on", () => {
	test("scheduling North's order by its id is refused", async () => {
		const { page } = app;
		await app.go("/schedule");
		await backlog().waitFor();
		const own = await orderByNumber(
			(await cards(backlog()).first().getAttribute("data-order"))!,
			south.id,
		);
		const victim = (
			await rows<Order>(
				`select id, number, status, engineer_id, scheduled_for from "order"
				 where organization_id = ? and status = 'quote' limit 1`,
				[north.id],
			)
		)[0];
		const [victimBefore, ownBefore] = [await snapshot(victim.id), await snapshot(own.id)];

		const dialog = await openDialog(own.number);
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="dialog"] input[name^="id"]')!.value =
					String(id);
			}, victim.id);
			return app.submit(dialog.getByRole("button", { name: "Schedule" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(await snapshot(victim.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
		await page.keyboard.press("Escape");
	});

	test("switching it off again hides it, and keeps the orders' plans", async () => {
		const plans = () =>
			rows(
				`select id, engineer_id, scheduled_for from "order" where organization_id = ? order by id`,
				[south.id],
			);
		const before = await plans();
		await app.go("/settings");
		const card = settingsCard();
		await app.submit(card.getByRole("button", { name: "Disable" }));
		await card.getByText("Disabled").waitFor();
		expect(
			await rows(
				`select module_id from organization_module where organization_id = ? and module_id = 'schedule'`,
				[south.id],
			),
		).toEqual([]);
		expect(await scheduleSwitches(south.id, since)).toEqual([
			{ action: "module_enabled" },
			{ action: "module_disabled" },
		]);
		await expect.poll(operations).toEqual(["Dashboard", "Orders", "Activity"]);
		expect((await app.go("/schedule"))?.status()).toBe(404);
		expect(await plans()).toEqual(before);
	});
});
