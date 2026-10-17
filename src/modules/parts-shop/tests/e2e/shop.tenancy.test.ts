/**
 * The parts shop's isolation: another customer's shop order is a 404 (also by a tampered number),
 * the portal's remote functions are no office member's and the office's no contact's, a contact
 * whose customer isn't a partner has no credit to pay with, and the tenants without the module
 * (North and South) get 404s for its pages and its remote functions.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	isRemote,
	organizations,
	remoteErrorStatus,
	tamperWithQuery,
	useApp,
	users,
} from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

const { south } = organizations;
const app = useApp({ user: users.shltrPlanner });

/** Riedel's seeded, delivered order. */
const riedelOrder = `SH-${Temporal.Now.plainDateISO().year}-007`;

/** Remote function URLs, as loaded where they're allowed, to try from where they aren't. */
const urls: Record<string, string> = {};

/** What a remote query's URL answers from `page`: its error's status, or 200. */
const statusOf = (page: import("playwright").Page, href: string) =>
	page.evaluate(async (url) => {
		const response = await fetch(url);
		const body = (await response.json()) as { type: string; error?: { status?: number } };
		return body.type === "error" ? body.error?.status : response.status;
	}, href);

describe("in SHLTR, which has the module", () => {
	test("the office's pages load their data with remote queries", async () => {
		const { page } = app;
		page.on("request", (request) => {
			for (const name of ["getShopOrders", "getShopOrder", "getShopProducts"]) {
				if (isRemote(request.url(), name)) urls[name] = request.url();
			}
		});
		await app.go("/activity");
		await page
			.locator('[data-sidebar="content"]')
			.getByRole("link", { name: "Parts shop" })
			.click();
		await page.waitForURL((url) => url.pathname === "/parts-shop");
		await page.getByRole("link", { name: "All", exact: true }).click();
		await page.getByRole("link", { name: riedelOrder }).click();
		await page.waitForURL((url) => url.pathname === `/parts-shop/orders/${riedelOrder}`);
		await page.getByRole("link", { name: "Shop orders" }).first().waitFor();
		await page.getByRole("link", { name: "Shop orders" }).first().click();
		await page.waitForURL((url) => url.pathname === "/parts-shop");
		await page.getByRole("link", { name: "Shop products" }).click();
		await page.locator('[data-shop-material="SD-001"]').waitFor();
		expect(Object.keys(urls).toSorted()).toEqual([
			"getShopOrder",
			"getShopOrders",
			"getShopProducts",
		]);
	});

	test("another customer's shop order is a 404 in the portal, also by a tampered number", async () => {
		const contact = await signedInPage(app, users.weggemans);
		const { page } = contact;
		try {
			const response = await app.expectingErrors(() =>
				page.goto(new URL(`/parts-shop/portal/orders/${riedelOrder}`, page.url()).href),
			);
			expect(response?.status()).toBe(404);
			expect(await page.locator("[data-client-order-lines]").count()).toBe(0);

			// The office's queries aren't a contact's.
			expect(urls.getShopOrder).toBeDefined();
			expect(await app.expectingErrors(() => statusOf(page, urls.getShopOrder))).toBe(403);
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

	test("the portal's remote functions are no office member's", async () => {
		const contact = await signedInPage(app, users.riedel);
		try {
			// Client-side, from the portal's navigation, so the shop loads its data with a remote query.
			await contact.page.getByRole("navigation").getByRole("link", { name: "Parts shop" }).click();
			await contact.page.locator("[data-product]").first().waitFor();
			urls.getClientShop = contact.requests.find((url) => isRemote(url, "getClientShop"))!;
		} finally {
			await contact.page.context().close();
		}
		expect(urls.getClientShop).toBeDefined();
		await app.go("/");
		expect(await app.expectingErrors(() => statusOf(app.page, urls.getClientShop))).toBe(403);
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

describe("in North and South, which don't have the module", () => {
	test("its pages are 404s, the sidebar lacks it and its remote queries are refused", async () => {
		const { page } = await signedInPage(app, users.admin);
		try {
			for (const organization of [null, south.name]) {
				if (organization) {
					await page.locator('[data-sidebar="header"] button').first().click();
					await page.getByRole("menuitem", { name: organization }).click();
					await page.waitForURL((url) => url.pathname === "/");
				}
				const sidebar = page.locator('[data-sidebar="content"]');
				await sidebar.getByRole("link", { name: "Dashboard" }).waitFor();
				expect(await sidebar.getByRole("link", { name: "Parts shop" }).count()).toBe(0);
				for (const path of [
					"/parts-shop",
					"/parts-shop/products",
					`/parts-shop/orders/${riedelOrder}`,
				]) {
					const response = await app.expectingErrors(() =>
						page.goto(new URL(path, page.url()).href),
					);
					expect(response?.status()).toBe(404);
				}
				await page.goto(new URL("/", page.url()).href);
				for (const name of ["getShopOrders", "getShopOrder", "getShopProducts"]) {
					expect(await app.expectingErrors(() => statusOf(page, urls[name]))).toBe(404);
				}
			}
		} finally {
			await page.context().close();
		}
	});
});
