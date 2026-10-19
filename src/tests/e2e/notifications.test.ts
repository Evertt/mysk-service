/**
 * The bells in the office's header and the engineer portal's (`notification-bell.svelte`), in
 * SHLTR: a breakdown a customer reports puts a dot on the planner's bell, whose tray shows it and
 * clears the dot; an order the office assigns to the engineer puts a dot on theirs. Which entries
 * ring whose bell, the read state and the tenant's limits are in the server spec
 * (`src/tests/unit/lib/server/notifications/notifications.spec.ts`).
 */
import type { Page } from "playwright";
import { expect, test } from "vite-plus/test";

import { baseURL, hydrated, mobileViewport, organizations, rows, useApp, users } from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.shltrPlanner });

const bell = (page: Page) => page.locator("[data-notification-bell]");
const dot = (page: Page) => page.locator("[data-notification-dot]");

/** Opens the bell's tray and waits for its entries (or that there are none), then closes it. */
async function readTray(page: Page, steps: () => Promise<void> = async () => {}) {
	await bell(page).click();
	// Read afresh each time it opens: busy until then.
	await page
		.locator('[data-notification-tray][aria-busy="false"] :is(li, [data-slot=empty])')
		.first()
		.waitFor();
	await steps();
	await page.keyboard.press("Escape");
	await page.locator("[data-notification-tray]").waitFor({ state: "detached" });
}

test("a breakdown reported in the customer portal puts a dot on the office's bell; its tray shows it and clears the dot", async () => {
	const { page } = app;
	await app.go("/");
	// What the seed left unread is seen first.
	await readTray(page);
	await expect.poll(() => dot(page).count()).toBe(0);

	const { page: customer } = await signedInPage(app, users.riedel);
	try {
		await customer.setViewportSize(mobileViewport);
		await customer.goto(`${baseURL}/portal/report`);
		await hydrated(customer);
		const unit = customer.getByLabel("Unit");
		const [choice] = await unit
			.locator("option:not([value=''])")
			.evaluateAll((options) =>
				options.slice(0, 1).map((option) => (option as HTMLOptionElement).value),
			);
		await unit.selectOption(choice);
		await customer.getByLabel("What's wrong?").fill("De roldeur blijft hangen.");
		await customer.getByText("It's at a standstill or unsafe.").click();
		await customer.getByRole("button", { name: "Report breakdown" }).click();
		await customer.waitForURL((url) => url.pathname.startsWith("/portal/orders/"));
	} finally {
		await customer.context().close();
	}
	const [reported] = await rows<{ number: string }>(
		`select o.number from "order" o join order_request r on r.order_id = o.id
		 where o.organization_id = ? order by o.id desc limit 1`,
		[shltr.id],
	);

	// The live counts bring the dot, without a reload.
	await dot(page).waitFor();
	expect(await bell(page).getAttribute("aria-label")).toBe("Show notifications, 1 new");
	await readTray(page, async () => {
		const entry = page.locator("[data-notification][data-unread]");
		await expect.poll(() => entry.count()).toBe(1);
		expect(await entry.innerText()).toContain(reported.number);
		expect(await entry.getByText("Customer report").count()).toBe(1);
		await expect.poll(() => dot(page).count()).toBe(0);
	});
	// Read: it stays read after a reload.
	await app.go("/");
	expect(await dot(page).count()).toBe(0);
});

test("an order the office assigns to the engineer puts a dot on their bell in the portal", async () => {
	const [lev] = await rows<{ id: number }>(
		`select e.id from engineer e join user u on u.id = e.user_id
		 where u.email = ? and e.organization_id = ?`,
		[users.shltrEngineer, shltr.id],
	);
	const [order] = await rows<{ number: string }>(
		`select number from "order" where organization_id = ? and status in ('quote', 'scheduled')
		 and (engineer_id is null or engineer_id <> ?) order by id desc limit 1`,
		[shltr.id, lev.id],
	);
	const { page: engineer } = await signedInPage(app, users.shltrEngineer);
	try {
		await readTray(engineer);
		await expect.poll(() => dot(engineer).count()).toBe(0);

		await app.go(`/orders/${order.number}/edit`);
		await app.page.getByLabel("Engineer").selectOption(String(lev.id));
		await app.page.getByRole("button", { name: "Save order" }).click();
		await app.page.waitForURL((url) => url.pathname === `/orders/${order.number}`);

		await dot(engineer).waitFor();
		await readTray(engineer, async () => {
			const unread = engineer.locator("[data-notification][data-unread]");
			const entry = unread.filter({ hasText: order.number });
			expect(await entry.count()).toBe(1);
			expect(await entry.innerText()).toContain("Assigned to you");
			// Linked to its page in the portal.
			expect(await entry.getByRole("link", { name: order.number }).getAttribute("href")).toBe(
				`/my/${order.number}`,
			);
		});
		await expect.poll(() => dot(engineer).count()).toBe(0);
	} finally {
		await engineer.context().close();
	}
});
