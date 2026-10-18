/**
 * What a customer's contact can't see or do in the customer portal: another customer's orders,
 * units, locations and work orders (also by a tampered number, id or QR token), another tenant's,
 * and the office's and engineer portal's pages and remote functions; and that the office doesn't
 * get the customer portal.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import {
	baseURL,
	hydrated,
	mobileViewport,
	organizations,
	remoteErrorStatus,
	isRemote,
	rows,
	tamperWithQuery,
	useApp,
	users,
} from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { north, shltr, south } = organizations;
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

/** A unit of a tenant's, and its code's token. */
const unitIn = async (organizationId: string) =>
	(
		await rows<{ serial_number: string; qr_token: string }>(
			`select serial_number, qr_token from equipment where organization_id = ? order by id limit 1`,
			[organizationId],
		)
	)[0];

/** How many orders a tenant has, to see that a refused report made none. */
const orderCount = async () =>
	(await rows<{ n: number }>(`select count(*) as n from "order"`))[0].n;

/** Opens `/q/<token>`: the status it answers with. */
async function scan(page: Page, token: string) {
	const response = await page.goto(`${baseURL}/q/${token}`);
	await hydrated(page);
	return response?.status();
}

describe("another customer's records are a 404 for a customer's contact", () => {
	test("their order, unit, location and work order pages", async () => {
		const order = await doneOrderOf("Weggemans Logistiek");
		const unit = await unitOf("Weggemans Logistiek");
		for (const path of [
			`/portal/orders/${order.number}`,
			`/portal/equipment/${unit.serial_number}`,
			`/portal/locations/${unit.location_id}`,
			`/checklists/portal/work-orders/${order.number}`,
		]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
	});

	test("their units' and locations' QR codes, and other tenants'", async () => {
		const unit = await unitOf("Weggemans Logistiek");
		const [location] = await rows<{ qr_token: string }>(
			`select qr_token from equipment_location where id = ?`,
			[unit.location_id],
		);
		expect(await scan(app.page, unit.qr_token)).toBe(404);
		expect(await scan(app.page, location.qr_token)).toBe(404);
		expect(await scan(app.page, (await unitIn(north.id)).qr_token)).toBe(404);
		expect(await scan(app.page, (await unitIn(south.id)).qr_token)).toBe(404);
		// A report form of another customer's unit, by its serial number in the link.
		expect((await app.go(`/portal/report?unit=${unit.serial_number}`))?.status()).toBe(404);
	});

	test("a tampered query of their order", async () => {
		const other = await doneOrderOf("Weggemans Logistiek");
		const [southern] = await rows<{ number: string }>(
			`select number from "order" where organization_id = ? limit 1`,
			[south.id],
		);
		for (const victim of [other.number, southern.number]) {
			await app.go("/portal/orders");
			// Opening one of their own orders asks for the victim instead.
			await tamperWithQuery<string>(app.page, "getPortalOrder", () => victim);
			const answer = app.page.waitForResponse((response) =>
				isRemote(response.url(), "getPortalOrder"),
			);
			await app.expectingErrors(async () => {
				await app.page.locator("main [data-order]").first().click();
				expect(await remoteErrorStatus(await answer), victim).toBe(404);
			});
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

describe("a customer's contact of another tenant", () => {
	test("sees their own customer only, and none of SHLTR's", async () => {
		const { page } = await signedInPage(app, users.northCustomer);
		try {
			expect(new URL(page.url()).pathname).toBe("/portal");
			const [first] = await rows<{ name: string }>(
				`select name from customer where organization_id = ? order by id limit 1`,
				[north.id],
			);
			expect(await page.locator("header").innerText()).toContain(first.name);
			const riedel = await doneOrderOf("Riedel B.V.");
			const response = await page.goto(`${baseURL}/portal/orders/${riedel.number}`);
			expect(response?.status()).toBe(404);
			expect(await scan(page, (await unitIn(shltr.id)).qr_token)).toBe(404);
		} finally {
			await page.context().close();
		}
	});
});
