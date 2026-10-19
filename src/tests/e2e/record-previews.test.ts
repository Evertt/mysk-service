/**
 * Record links' hover cards (`RecordLink`, `src/lib/components/record-link/`): resting the pointer
 * on a link to an order, customer, unit or engineer shows the record's card, read from the same
 * batch query as its page (`getOrder`, …; their answers are the server specs'). One test per link
 * component. The tests open cards at once (`openPreviewsAtOnce` in `app.ts`), but for the one that
 * checks the half-second wait.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { previewDelayKey } from "#lib/components/record-link/preview-delay.ts";

import {
	baseURL,
	hydrated,
	mobileViewport,
	newContext,
	organizations,
	rows,
	signInContext,
	useApp,
	users,
	value,
} from "./app.ts";

const { north } = organizations;
const app = useApp({ user: users.planner });

/** The open hover card. */
const card = (page: Page) => page.locator("[data-record-preview]");

/** Moves the pointer off every link, so the open card closes. */
async function restElsewhere(page: Page) {
	await page.mouse.move(0, 0);
	await card(page).waitFor({ state: "detached" });
}

/** A North order with units, an engineer and a customer, the latest. */
async function anOrder() {
	const [order] = await rows<{
		number: string;
		customer: string;
		code: string;
		engineer_id: number;
		engineer: string;
		serial: string;
	}>(
		`select o.number, c.name as customer, c.code, e.id as engineer_id, e.name as engineer,
		 u.serial_number as serial
		 from "order" o join customer c on c.id = o.customer_id join engineer e on e.id = o.engineer_id
		 join order_unit ou on ou.order_id = o.id and ou.position = 0
		 join equipment u on u.id = ou.equipment_id
		 where o.organization_id = ? order by o.created_at desc, o.id desc limit 1`,
		[north.id],
	);
	return order;
}

describe("in the office", () => {
	test("an order's link in the orders table shows the order, with its customer", async () => {
		const { page } = app;
		await app.go("/orders");
		await app.tableSettled();
		const link = page.locator('[data-slot="data-table"] a[href*="/orders/ORD-"]').first();
		const number = (await link.innerText()).trim();
		const customer = await value<string>(
			`select c.name from "order" o join customer c on c.id = o.customer_id
			 where o.number = ? and o.organization_id = ?`,
			[number, north.id],
		);
		// Still a link, for screen readers too.
		expect(await link.getAttribute("role")).toBeNull();

		await link.hover();
		const shown = page.locator(`[data-order-preview="${number}"]`);
		await shown.waitFor();
		expect(await shown.innerText()).toContain(customer);
		await restElsewhere(page);
	});

	test("an order's page shows its customer's, unit's and engineer's cards", async () => {
		const { page } = app;
		const order = await anOrder();
		await app.go(`/orders/${order.number}`);

		const openOrders = await value<number>(
			`select count(*) from "order" where customer_id = (select id from customer where code = ?
			 and organization_id = ?) and status in ('quote', 'scheduled', 'in_progress')`,
			[order.code, north.id],
		);
		await page.getByRole("link", { name: order.customer, exact: true }).first().hover();
		const customer = page.locator(`[data-customer-preview="${order.code}"]`);
		await customer.waitFor();
		expect(await customer.innerText()).toMatch(new RegExp(`Open orders\\s+${openOrders}`));
		await restElsewhere(page);

		await page.locator(`a[href$="/equipment/${order.serial}"]`).first().hover();
		await page.locator(`[data-equipment-preview="${order.serial}"]`).waitFor();
		await restElsewhere(page);

		const engineerOpen = await value<number>(
			`select count(*) from "order" where engineer_id = ?
			 and status in ('quote', 'scheduled', 'in_progress')`,
			[order.engineer_id],
		);
		await page.getByRole("link", { name: order.engineer, exact: true }).first().hover();
		const engineer = page.locator(`[data-engineer-preview="${order.engineer_id}"]`);
		await engineer.waitFor();
		expect(await engineer.innerText()).toMatch(new RegExp(`Open orders\\s+${engineerOpen}`));
		await restElsewhere(page);
	});

	test("a card opens only once the pointer rested on the link half a second", async () => {
		const { page } = app;
		await page.evaluate((key) => sessionStorage.setItem(key, "500"), previewDelayKey);
		try {
			// The links read the delay when the page loads.
			await app.go("/orders");
			await app.tableSettled();
			const links = page.locator('[data-slot="data-table"] a[href*="/orders/ORD-"]');

			// Passing over a link on the way elsewhere opens nothing.
			await links.nth(0).hover();
			await page.waitForTimeout(150);
			await page.mouse.move(0, 0);
			await page.waitForTimeout(600);
			expect(await card(page).count()).toBe(0);

			// Resting on it does, after the wait.
			await links.nth(1).hover();
			await page.waitForTimeout(250);
			expect(await card(page).count()).toBe(0);
			await card(page).waitFor();
			await restElsewhere(page);
		} finally {
			await page.evaluate((key) => sessionStorage.setItem(key, "0"), previewDelayKey);
		}
	});
});

describe("where there are no cards", () => {
	test("a touch screen's links open their pages, not cards", async () => {
		const browser = app.page.context().browser()!;
		const context = await newContext(browser, {
			viewport: mobileViewport,
			isMobile: true,
			hasTouch: true,
			storageState: await app.page.context().storageState(),
		});
		try {
			const page = await context.newPage();
			const order = await anOrder();
			await page.goto(`${baseURL}/orders/${order.number}`);
			await hydrated(page);
			await page.getByRole("link", { name: order.customer, exact: true }).first().hover();
			await page.waitForTimeout(300);
			expect(await card(page).count()).toBe(0);
		} finally {
			await context.close();
		}
	});

	test("the engineer portal's links have none", async () => {
		const browser = app.page.context().browser()!;
		const context = await newContext(browser, { viewport: { width: 1440, height: 1000 } });
		try {
			await signInContext(context, users.engineer);
			const page = await context.newPage();
			await page.goto(`${baseURL}/my`);
			await hydrated(page);
			const link = page.locator('a[href*="/my/ORD-"]').first();
			await link.hover();
			await page.waitForTimeout(300);
			expect(await card(page).count()).toBe(0);
			expect(await page.locator("[data-link-preview-trigger]").count()).toBe(0);
		} finally {
			await context.close();
		}
	});
});
