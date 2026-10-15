import type { Page } from "playwright";
import { expect, test } from "vite-plus/test";

import { baseURL, hydrated, mobileViewport, organizations, rows, useApp, users } from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { north } = organizations;
const app = useApp({ user: users.engineer, viewport: mobileViewport });

/** The engineer the field engineer's account is linked to. */
const me = async () =>
	(
		await rows<{ id: number }>(
			`select e.id from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[users.engineer, north.id],
		)
	)[0];

/** Changes an order in the office's edit form, as a dispatcher would, and saves it. */
async function editOrder(office: Page, number: string, change: (page: Page) => Promise<void>) {
	await office.goto(`${baseURL}/orders/${number}/edit`);
	await hydrated(office);
	await change(office);
	await office.getByRole("button", { name: "Save order" }).click();
	await office.waitForURL((url) => url.pathname === `/orders/${number}`);
}

/** Marks the page, which is gone if it reloads. */
const mark = () => app.page.evaluate(() => Object.assign(window, { portalMarker: true }));
const notReloaded = () => app.page.evaluate(() => "portalMarker" in window);

test("an open portal shows what the office assigns, changes and cancels, without reloading", async () => {
	const { page } = app;
	const engineer = await me();
	// Someone else's scheduled order, which the office gives to this engineer.
	const [order] = await rows<{ number: string }>(
		`select number from "order" where organization_id = ? and status = 'scheduled'
		 and engineer_id is not null and engineer_id <> ? order by id limit 1`,
		[north.id, engineer.id],
	);
	const { number } = order;
	const card = page.locator(`a[data-order="${number}"]`);
	await app.go("/my");
	await mark();
	expect(await card.count()).toBe(0);

	const { page: office } = await signedInPage(app, users.admin);
	try {
		// Assigned to them: it shows in their list.
		await editOrder(office, number, async (form) => {
			await form.getByLabel("Engineer").selectOption(String(engineer.id));
		});
		await card.first().waitFor();

		// On the order's page, a change of its description shows too.
		await card.first().click();
		await page.waitForURL((url) => url.pathname === `/my/${number}`);
		const description = `Live update check ${Date.now()}`;
		await editOrder(office, number, (form) => form.getByLabel("Description").fill(description));
		await page.getByText(description).waitFor();

		// Back on the list, its cancellation takes it off their work.
		await page.getByRole("link", { name: "My work" }).first().click();
		await page.waitForURL((url) => url.pathname === "/my");
		await card.first().waitFor();
		await editOrder(office, number, async (form) => {
			await form.getByLabel("Status").selectOption("cancelled");
		});
		await card.waitFor({ state: "detached" });
	} finally {
		await office.context().close();
	}
	expect(await notReloaded()).toBe(true);
});
