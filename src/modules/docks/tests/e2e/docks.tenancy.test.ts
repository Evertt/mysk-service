/**
 * The docks and tenants: SHLTR's manager makes a feed token on the settings page, which the feed
 * takes until it's revoked, and a planner reads them there; North, without the module, has
 * none of its pages and cards. What the feed answers (a dock the tenant hasn't, a batch that isn't
 * valid, a missing or revoked token), how a token is stored, and that a planner may not manage
 * them, is `tests/unit/server/feed.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, organizations, rows, useApp } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { postEvents, shltrOwner, shltrPlanner } from "./helpers.ts";

const { north } = organizations;
// North's admin: North doesn't have the module.
const app = useApp();

describe("SHLTR's integration tokens", () => {
	test("a manager makes one, which the feed then takes, and revokes it", async () => {
		const { page } = await signedInPage(app, shltrOwner);
		try {
			await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Docks" }).click();
			await page.locator('[data-dock="DOCK 05"]').waitFor();
			await page.getByRole("link", { name: "Salvo feed" }).click();
			await page.waitForURL((url) => url.pathname === "/docks/settings");
			// The seeded demo token is listed by its name and first characters only.
			await page.locator('[data-token="Salvo Barneveld (demo)"]').waitFor();

			await page.getByLabel("Name").fill("E2E feed");
			await page.getByRole("button", { name: "New token" }).click();
			const shown = page.locator("[data-new-token]");
			await shown.waitFor();
			const token = (await shown.textContent())!.trim();
			expect(token).toMatch(/^fwi_[0-9a-f]{40}$/);
			expect((await postEvents([], token)).status).toBe(200);

			const row = page.locator('[data-token="E2E feed"]');
			await row.waitFor();
			await row.getByRole("button", { name: "Revoke" }).click();
			await row.getByText("Revoked").waitFor();
			expect((await postEvents([], token)).status).toBe(401);
		} finally {
			await page.context().close();
		}
	});

	test("a planner, who's no manager, reads them, but makes and revokes none", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		try {
			// The organization's settings link to the module's, as the board does.
			await page.goto(`${baseURL}/settings`);
			await page.locator('[data-module="docks"]').getByRole("link", { name: "Set up" }).waitFor();
			await page.goto(`${baseURL}/docks`);
			await page.locator('[data-dock="DOCK 05"]').waitFor();
			await page.getByRole("link", { name: "Salvo feed" }).click();
			await page.waitForURL((url) => url.pathname === "/docks/settings");
			await page.locator("[data-managers-only]").waitFor();
			await page.locator('[data-token="Salvo Barneveld (demo)"]').waitFor();
			expect(await page.getByLabel("Name").count()).toBe(0);
			expect(await page.getByRole("button", { name: "Revoke" }).count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});
});

describe("in North, which doesn't have the module", () => {
	test("its pages are 404s, the sidebar lacks it, and the cards on core pages are empty", async () => {
		const { page } = app;
		await app.go("/");
		const sidebar = page.locator('[data-sidebar="content"]');
		await sidebar.getByRole("link", { name: "Dashboard" }).waitFor();
		expect(await sidebar.getByRole("link", { name: "Docks" }).count()).toBe(0);
		expect((await app.expectingErrors(() => app.go("/docks")))?.status()).toBe(404);

		const [unit] = await rows<{ serial_number: string; code: string }>(
			`select e.serial_number, c.code from equipment e join customer c on c.id = e.customer_id
			 where e.organization_id = ? order by e.id limit 1`,
			[north.id],
		);
		await app.go(`/equipment/${unit.serial_number}`);
		await page.getByRole("heading", { level: 1 }).waitFor();
		expect(await page.locator("[data-dock-usage]").count()).toBe(0);
		await app.go(`/customers/${unit.code}`);
		await page.getByRole("heading", { level: 1 }).waitFor();
		expect(await page.locator("[data-docks-card]").count()).toBe(0);
	});
});
