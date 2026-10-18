/**
 * The parts shop's isolation: another customer's shop order is a 404 (also by a tampered number),
 * a contact whose customer isn't a partner has no shop, and a tenant without the module gets 404s
 * for its pages. That the portal's remote functions are no office member's, the office's no
 * contact's, and none a tenant's without the module, is `remote-functions.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { isRemote, remoteErrorStatus, tamperWithQuery, useApp, users } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

const app = useApp({ user: users.shltrPlanner });

/** Riedel's seeded, delivered order. */
const riedelOrder = `SH-${Temporal.Now.plainDateISO().year}-007`;

describe("in SHLTR, which has the module", () => {
	test("another customer's shop order is a 404 in the portal, also by a tampered number", async () => {
		const contact = await signedInPage(app, users.weggemans);
		const { page } = contact;
		try {
			const response = await app.expectingErrors(() =>
				page.goto(new URL(`/parts-shop/portal/orders/${riedelOrder}`, page.url()).href),
			);
			expect(response?.status()).toBe(404);
			expect(await page.locator("[data-client-order-lines]").count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});

	test("Riedel's order query, tampered to another number, is a 404", async () => {
		const contact = await signedInPage(app, users.riedel);
		const { page } = contact;
		try {
			await page.goto(new URL("/parts-shop/portal/orders", page.url()).href);
			await page.locator(`[data-client-shop-order="${riedelOrder}"]`).waitFor();
			await tamperWithQuery<string>(page, "getClientShopOrder", () => "SH-1999-001");
			const [response] = await app.expectingErrors(() =>
				Promise.all([
					page.waitForResponse((r) => isRemote(r.url(), "getClientShopOrder")),
					page.locator(`[data-client-shop-order="${riedelOrder}"]`).click(),
				]),
			);
			expect(await remoteErrorStatus(response)).toBe(404);
		} finally {
			await page.context().close();
		}
	});
});

describe("a contact whose customer isn't a partner, in a tenant without the module", () => {
	test("has no shop in the portal: its pages are 404s", async () => {
		const { page } = await signedInPage(app, users.northCustomer);
		try {
			await page.locator("[data-customer-portal]").waitFor();
			expect(
				await page.getByRole("navigation").getByRole("link", { name: "Parts shop" }).count(),
			).toBe(0);
			const response = await app.expectingErrors(() =>
				page.goto(new URL("/parts-shop/portal", page.url()).href),
			);
			expect(response?.status()).toBe(404);
		} finally {
			await page.context().close();
		}
	});
});

// The other pages' 404s are the module route guard's (`route-guard.spec.ts`).
describe("in North, which doesn't have the module", () => {
	test("its pages are 404s, and the sidebar lacks it", async () => {
		const { page } = await signedInPage(app, users.admin);
		try {
			const sidebar = page.locator('[data-sidebar="content"]');
			await sidebar.getByRole("link", { name: "Dashboard" }).waitFor();
			expect(await sidebar.getByRole("link", { name: "Parts shop" }).count()).toBe(0);
			const response = await app.expectingErrors(() =>
				page.goto(new URL(`/parts-shop/orders/${riedelOrder}`, page.url()).href),
			);
			expect(response?.status()).toBe(404);
		} finally {
			await page.context().close();
		}
	});
});
