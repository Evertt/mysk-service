import { describe, expect, test } from "vite-plus/test";

import { baseURL, organizations, rows, useApp, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { dockOf, postEvents, salvoEvent, shltrOwner, shltrPlanner } from "./helpers.ts";

const { north, shltr } = organizations;
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
			const [stored] = await rows<{ token_hash: string; prefix: string }>(
				`select token_hash, prefix from integration_token where organization_id = ? and name = 'E2E feed'`,
				[shltr.id],
			);
			expect(stored.token_hash).not.toContain(token.slice(4));
			expect(token.startsWith(stored.prefix)).toBe(true);

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

	test("a planner, who's no manager, can't manage them", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		try {
			await page.goto(`${baseURL}/docks`);
			await page.locator('[data-dock="DOCK 05"]').waitFor();
			expect(await page.getByRole("link", { name: "Salvo feed" }).count()).toBe(0);
			const response = await page.goto(`${baseURL}/docks/settings`);
			expect(response?.status()).toBe(403);
			expect(
				await value<number>(
					`select count(*) from integration_token where organization_id = ? and revoked_at is null`,
					[shltr.id],
				),
			).toBeGreaterThan(0);
		} finally {
			await page.context().close();
		}
	});
});

describe("the feed", () => {
	test("refuses a dock its token's tenant doesn't have, and applies nothing of the batch", async () => {
		const before = await dockOf(shltr.id, "DOCK 06");
		const result = await postEvents([
			salvoEvent("unlock", "DOCK 06"),
			salvoEvent("lock", "DOCK 99"),
		]);
		expect(result).toMatchObject({
			status: 422,
			body: { error: "unknown_docks", docks: ["DOCK 99"] },
		});
		expect(await dockOf(shltr.id, "DOCK 06")).toEqual(before);
	});

	test("refuses a batch that isn't valid", async () => {
		const result = await postEvents([{ ...salvoEvent("lock", "DOCK 06"), extra: true }]);
		expect(result).toMatchObject({ status: 422, body: { error: "invalid_batch" } });
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
