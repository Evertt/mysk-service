/**
 * The parts shop: Riedel's contact shops in the customer portal (by category and search, stock and
 * checklist points) and checks out with its Parts Credit, can't pay over its balance and is refused
 * a product on request in a tampered cart; the office confirms and cancels the order. What the
 * checkout and the steps store, refuse and log is `tests/unit/server/orders.spec.ts`'s.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, useApp, users, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";
import { formatCents } from "#lib/i18n/index.ts";

import {
	balanceOf,
	customerNamed,
	movementsOf,
	nextShopNumber,
	productOf,
	shopOrderOf,
} from "./helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.riedel });

const card = (sku: string) => app.page.locator(`[data-product="${sku}"]`);
const checkout = () => app.page.locator("[data-checkout]");

/** Puts `quantity` of a product in the cart from its card. */
async function addToCart(sku: string, quantity = 1) {
	await card(sku).locator("[data-add-to-cart]").click();
	for (let i = 1; i < quantity; i++) {
		await card(sku).getByRole("button", { name: /more$/ }).click();
	}
	await checkout().locator(`[data-cart-line="${sku}"]`).waitFor();
}

/** Submits the checkout even with its button disabled, as a tampered page would, and waits. */
async function forceCheckout(page: Page) {
	const [response] = await app.expectingErrors(() =>
		Promise.all([
			page.waitForResponse(
				(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
			),
			page
				.locator("[data-checkout] form")
				.evaluate((form: HTMLFormElement) => form.requestSubmit()),
		]),
	);
	return response;
}

/** The order the contact places in this file. */
let number = "";

describe("a partner's contact in the shop", () => {
	test("browses the catalogue by category and search, with stock and checklist points", async () => {
		const { page } = app;
		await app.go("/portal");
		await page.getByRole("navigation").getByRole("link", { name: "Parts shop" }).click();
		await page.waitForURL((url) => url.pathname === "/parts-shop/portal");
		await card("SD-001").waitFor();
		expect(await page.locator("[data-product]").count()).toBe(14);
		const low = await value<number>(
			`select count(*) from shop_product p join material m on m.id = p.material_id
			 where p.organization_id = ? and p.on_request = 0 and m.stock > 0 and m.stock < 10`,
			[shltr.id],
		);
		expect(low).toBeGreaterThan(0);
		expect(await page.locator("[data-low-stock-banner]").innerText()).toContain(
			`${low} product${low === 1 ? "" : "s"} with low stock`,
		);
		// The wallet heads the shop: what's available, until when, and the way to the programme.
		const wallet = page.locator("[data-shop-credit]");
		expect(await wallet.innerText()).toContain("Wallet · parts credit available");
		expect(await wallet.innerText()).toMatch(/Valid until \d{1,2} \w{3} \d{4}/);
		expect(
			await wallet.getByRole("link", { name: "View the programme" }).getAttribute("href"),
		).toBe("/partner-programme/portal");
		// On request: no price, not to add.
		expect(await card("SD-007").innerText()).toContain("Price on request");
		expect(await card("SD-007").getByRole("button", { name: "On request" }).isDisabled()).toBe(
			true,
		);
		// Priced excluding VAT, payable with credit, with the points it fixes.
		const sd001 = await productOf("SD-001");
		expect(await card("SD-001").locator("[data-price]").innerText()).toBe(formatCents(sd001.price));
		expect(await card("SD-001").innerText()).toContain("excl. VAT");
		await card("SD-001").locator("[data-credit-eligible]").waitFor();
		await card("SD-001").getByText("Torsieveren op spanning en breuk gecontroleerd").waitFor();

		const search = page.getByRole("searchbox", { name: "Search by name or article number…" });
		await search.fill("LV-00");
		await expect.poll(() => page.locator("[data-product]").count()).toBe(6);
		await search.fill("kabelset");
		await expect.poll(() => page.locator("[data-product]").count()).toBe(1);
		await card("SD-002").waitFor();
		await search.fill("");
		await page.getByRole("button", { name: "Levellers" }).click();
		await expect.poll(() => page.locator("[data-product]").count()).toBe(6);
		await page.getByRole("button", { name: "All", exact: true }).click();
		await expect.poll(() => page.locator("[data-product]").count()).toBe(14);
		// Made for a phone.
		expect(await onPhone(page, () => fitsWidth(page))).toBe(true);
	});

	test("checks out with parts credit: the balance after, the order and its stock set aside", async () => {
		const { page } = app;
		const riedel = await customerNamed("Riedel B.V.");
		const available = await balanceOf(riedel.id);
		expect(available).toBe(227_500);
		const [cables, seal] = [await productOf("SD-002"), await productOf("SD-004")];
		await addToCart("SD-002", 2);
		await addToCart("SD-004");
		const total = 2 * cables.price + seal.price;
		expect(await checkout().locator("[data-checkout-available]").innerText()).toBe(
			formatCents(available),
		);
		expect(await checkout().locator("[data-checkout-total]").innerText()).toBe(
			`– ${formatCents(total)}`,
		);
		expect(await checkout().locator("[data-checkout-after]").innerText()).toBe(
			formatCents(available - total),
		);

		number = await nextShopNumber();
		await checkout().getByRole("button", { name: "Pay with parts credit" }).click();
		await page.waitForURL((url) => url.pathname === `/parts-shop/portal/orders/${number}`);
		await page.locator("[data-order-placed]").getByText(`Order ${number} is placed`).waitFor();
		expect(await page.locator("[data-order-placed]").innerText()).toContain(
			`${formatCents(total)} of parts credit reserved`,
		);
		expect(await shopOrderOf(number)).toMatchObject({ status: "placed", total });

		// The shop shows what's left, and the order is among the customer's.
		await page.getByRole("link", { name: "Your shop orders" }).click();
		await page.locator(`[data-client-shop-order="${number}"]`).waitFor();
		await app.go("/parts-shop/portal");
		expect(await page.locator("[data-shop-credit]").innerText()).toContain(
			formatCents(available - total),
		);
	});

	// That the server refuses it too is the spec's.
	test("can't pay for an order above the credit available", async () => {
		const riedel = await customerNamed("Riedel B.V.");
		const available = await balanceOf(riedel.id);
		const cylinder = await productOf("LV-001");
		const quantity = Math.floor(available / cylinder.price) + 1;
		expect(quantity).toBeLessThanOrEqual(cylinder.stock);
		await addToCart("LV-001", quantity);
		await checkout().locator("[data-checkout-short]").waitFor();
		expect(
			await checkout().getByRole("button", { name: "Pay with parts credit" }).isDisabled(),
		).toBe(true);
		await checkout()
			.getByRole("button", { name: `Remove ${cylinder.name}` })
			.click();
		await checkout().locator("[data-cart-empty]").waitFor();
	});

	test("is refused a product on request, also in a tampered cart", async () => {
		const { page } = app;
		const panel = await productOf("SD-007");
		await addToCart("SD-003");
		await page
			.locator('[data-checkout] input[name^="lines[0].productId"]')
			.evaluate((input: HTMLInputElement, id) => (input.value = id), String(panel.id));
		await forceCheckout(page);
		await checkout().getByText(`${panel.name} is on request: ask us for it.`).waitFor();
		expect(await movementsOf(await nextShopNumber())).toEqual([]);
	});
});

describe("the office", () => {
	test("confirms an order, and cancels it", async () => {
		expect(number).not.toBe("");
		const placed = await shopOrderOf(number);
		const { page } = await signedInPage(app, users.shltrPlanner);
		const go = async (path: string) => {
			await page.goto(new URL(path, page.url()).href);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		};
		try {
			// On the dashboard: two open orders (Riedel's confirmed one and this), one to confirm.
			await go("/");
			await page.getByText("Open shop orders").waitFor();
			await page.getByText("1 to confirm").waitFor();

			await go("/parts-shop");
			await page
				.locator(`[data-shop-order="${number}"]`)
				.getByRole("link", { name: number })
				.click();
			await page.waitForURL((url) => url.pathname === `/parts-shop/orders/${number}`);
			await page.locator(`[data-shop-line="SD-002"]`).waitFor();
			await page.locator("[data-shop-steps]").getByRole("button", { name: "Confirm" }).click();
			await expect.poll(async () => (await shopOrderOf(number)).status).toBe("confirmed");
			await page.locator('[data-shop-status="confirmed"]').first().waitFor();

			await page.locator("[data-shop-steps]").getByRole("button", { name: "Cancel order" }).click();
			const dialog = page.getByRole("alertdialog");
			expect(await dialog.innerText()).toContain(formatCents(placed.total));
			await dialog.getByRole("button", { name: "Cancel order" }).click();
			await expect.poll(async () => (await shopOrderOf(number)).status).toBe("cancelled");
			// Stored before the page has its answer: the steps go once it's refreshed the order.
			await page.locator("[data-shop-steps]").waitFor({ state: "detached" });
		} finally {
			await page.context().close();
		}
	});
});
