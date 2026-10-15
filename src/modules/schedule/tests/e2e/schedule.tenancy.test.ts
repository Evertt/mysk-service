import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value, quiet } from "#e2e/app.ts";

import {
	activeEngineers,
	backlogSize,
	dayKey,
	type Order,
	orderByNumber,
	pageLocators,
	scheduleSwitches,
	snapshot,
	thisWeeksOrders,
	weekday,
} from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { board, backlog, cards, cell, operations, settingsCard, drag, openDialog } =
	pageLocators(app);

/** The last activity entry before this file switched South's schedule on. */
let since = 0;

describe("in South, which doesn't have the schedule", () => {
	/** The URL of the board's query, as loaded in North. */
	let query: string;
	/** A North order in the backlog, which the refused requests try to plan. */
	let victim: Order;

	test("a drag on a board left open in North is refused after switching to South elsewhere", async () => {
		const { page } = app;
		// Client-side, so the board loads its week through a remote query.
		await app.go("/");
		const record = (request: { url(): string; method(): string }) => {
			if (/\/_app\/remote\/.*\/getSchedule/.test(request.url())) query = request.url();
		};
		page.on("request", record);
		await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Schedule" }).click();
		await page.waitForURL((url) => url.pathname === "/schedule");
		await backlog().waitFor();
		page.off("request", record);
		expect(query).toBeDefined();
		const card = cards(backlog()).first();
		victim = await orderByNumber((await card.getAttribute("data-order"))!, north.id);
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

	test("so is the schedule dialog on that board", async () => {
		const before = await snapshot(victim.id);
		const dialog = await openDialog(victim.number);
		await dialog.getByLabel("Date").fill(dayKey(weekday(2)));
		const result = await app.expectingErrors(() =>
			app.submit(dialog.getByRole("button", { name: "Schedule" })),
		);
		expect(result).toMatch(/"status":404/);
		expect(await snapshot(victim.id)).toEqual(before);
	});

	test("South's sidebar has no Schedule, and its pages are 404s", async () => {
		await app.go("/");
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		expect(await operations()).toEqual(["Dashboard", "Orders", "Activity"]);
		expect(
			await app.page
				.locator('[data-sidebar="content"]')
				.getByRole("link", { name: "Schedule" })
				.count(),
		).toBe(0);
		for (const path of ["/schedule", `/schedule?week=${dayKey(weekday(0))}`]) {
			const response = await app.go(path);
			expect(response?.status(), path).toBe(404);
			// The app's own 404 page, inside its layout.
			expect(await app.page.locator('[data-sidebar="content"]').count(), path).toBe(1);
		}
	});

	test("North's schedule query is refused", async () => {
		const response = await app.page.context().request.get(query);
		const body = await response.text();
		expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
		expect(body).not.toContain(victim.number);
	});
});

describe("switching the schedule on in South", () => {
	test("an owner switches it on in settings, and it comes right after Orders", async () => {
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
		await expect.poll(operations).toEqual(["Dashboard", "Orders", "Schedule", "Activity"]);
	});
});

describe("in South, with the schedule on", () => {
	let own: Order;

	test("switching organization shows South's engineers and orders only", async () => {
		await app.go("/schedule");
		const southEngineers = await activeEngineers(south.id);
		const rowLinks = await board()
			.locator('a[href^="/engineers/"]:visible')
			.evaluateAll((links) =>
				links.map((link) => Number(link.getAttribute("href")!.split("/").pop())),
			);
		const southIds = (
			await rows<{ id: number }>(`select id from engineer where organization_id = ?`, [south.id])
		).map((row) => row.id);
		expect(rowLinks.length).toBeGreaterThanOrEqual(southEngineers.length);
		expect(rowLinks.every((id) => southIds.includes(id))).toBe(true);
		expect(await cards(board()).count()).toBe(await thisWeeksOrders(south.id));
		expect(await cards(backlog()).count()).toBe(await backlogSize(south.id));
		const numbers = await cards(backlog()).evaluateAll((els) =>
			els.map((el) => el.getAttribute("data-order")!),
		);
		const southNumbers = (
			await rows<{ number: string }>(
				`select number from "order" where organization_id = ? and scheduled_for is null`,
				[south.id],
			)
		).map((row) => row.number);
		expect(numbers.every((number) => southNumbers.includes(number))).toBe(true);
		own = await orderByNumber(numbers[0], south.id);
	});

	test("scheduling North's order by its id is refused", async () => {
		const { page } = app;
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

	test("North's engineers and inactive engineers can't be assigned", async () => {
		const { page } = app;
		const before = await snapshot(own.id);
		const northEngineer = String(
			await value(`select min(id) from engineer where organization_id = ?`, [north.id]),
		);
		const [inactive] = await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 0 limit 1`,
			[south.id],
		);

		await app.go("/schedule");
		for (const [id, message] of [
			[northEngineer, "Unknown engineer"],
			[String(inactive.id), `${inactive.name} is no longer active`],
		]) {
			const dialog = await openDialog(own.number);
			await page.evaluate((id) => {
				document
					.querySelector<HTMLSelectElement>('[role="dialog"] select')!
					.add(new Option("Someone else", id));
			}, id);
			await dialog.getByLabel("Engineer").selectOption(id);
			await app.submit(dialog.getByRole("button", { name: "Schedule" }));
			expect(await app.issues()).toContain(message);
			expect(await snapshot(own.id)).toEqual(before);
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "hidden" });
		}
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
