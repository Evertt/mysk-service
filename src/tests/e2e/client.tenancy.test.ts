/**
 * What a customer's contact can't see or do in the customer portal: another customer's order and
 * work order pages are a 404, a report form with another customer's unit id is refused, and the
 * office's and engineer portal's pages send them to the portal; the office doesn't get the
 * customer portal. Another customer's units, locations and QR codes, tampered queries, another
 * tenant's contact and records are `routes/(customer)/portal/portal.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, hydrated, mobileViewport, rows, useApp, users } from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const app = useApp({ user: users.riedel, viewport: mobileViewport });

/** One of `customer`'s orders that's done, with a completed checklist if it has one. */
const doneOrderOf = async (customer: string) =>
	(
		await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o join customer c on c.id = o.customer_id
			 where c.name = ? and o.status in ('completed', 'invoiced') order by
			 exists (select 1 from checklist k where k.order_id = o.id) desc, o.id limit 1`,
			[customer],
		)
	)[0];

/** One of `customer`'s units with a location, and its code's token. */
const unitOf = async (customer: string) =>
	(
		await rows<{ id: number; serial_number: string; qr_token: string; location_id: number }>(
			`select e.id, e.serial_number, e.qr_token, e.location_id from equipment e
			 join customer c on c.id = e.customer_id
			 where c.name = ? and e.location_id is not null order by e.id limit 1`,
			[customer],
		)
	)[0];

/** How many orders a tenant has, to see that a refused report made none. */
const orderCount = async () =>
	(await rows<{ n: number }>(`select count(*) as n from "order"`))[0].n;

describe("another customer's records are a 404 for a customer's contact", () => {
	test("their order and work order pages", async () => {
		const order = await doneOrderOf("Weggemans Logistiek");
		for (const path of [
			`/portal/orders/${order.number}`,
			`/checklists/portal/work-orders/${order.number}`,
		]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
	});

	test("a report of their unit, by a tampered unit id, is refused and makes no order", async () => {
		const other = await unitOf("Weggemans Logistiek");
		const before = await orderCount();
		await app.go("/portal/report");
		const select = app.page.getByLabel("Unit");
		const [own] = await select
			.locator("option:not([value=''])")
			.evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
		await select.selectOption(own);
		await app.page.getByLabel("What's wrong?").fill("Niet van ons");
		// The chosen option names the other customer's unit instead.
		await select.evaluate((element, id) => {
			(element as HTMLSelectElement).selectedOptions[0].value = String(id);
		}, other.id);
		const result = await app.submit(app.page.getByRole("button", { name: "Report breakdown" }));
		expect(result).toContain("Choose one of your units.");
		expect(await orderCount()).toBe(before);
	});
});

describe("the office and the engineer portal aren't a customer's contact's", () => {
	test("their pages send them to the customer portal", async () => {
		for (const path of ["/", "/orders", "/customers", "/settings/members", "/schedule", "/my"]) {
			await app.go(path);
			expect(app.path(), path).toBe("/portal");
		}
	});

	// That the office's and the engineer portal's remote functions refuse them with a 403 is
	// `session.spec.ts`'s ("are refused by the office's remote functions with a 403").
});

describe("the customer portal isn't the office's", () => {
	// Its remote functions refuse office members: `remote-functions.spec.ts` ("forCustomers").
	test("its pages send office members to the office", async () => {
		const office = await signedInPage(app, users.shltrPlanner);
		try {
			await office.page.goto(`${baseURL}/portal`);
			await hydrated(office.page);
			expect(new URL(office.page.url()).pathname).toBe("/");
		} finally {
			await office.page.context().close();
		}
	});
});
