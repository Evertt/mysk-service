import { describe, expect, test } from "vite-plus/test";

// The remote functions' helpers through `app.ts`: a module may import no other `remote-functions.ts`
// than its own (`remote-functions.spec.ts`).
import {
	isRemote,
	organizations,
	remoteErrorStatus,
	rows,
	tamperWithQuery,
	useApp,
} from "#e2e/app.ts";

import { partnersOf } from "./helpers.ts";

const { north, south, shltr } = organizations;
const app = useApp();

describe("in North, which has the module", () => {
	test("a customer is looked up in the tenant: a code it doesn't have is a 404", async () => {
		const { page } = app;
		const [partner] = await partnersOf(north.id);
		await app.go("/partner-programme");
		await app.tableSettled();
		await tamperWithQuery<string>(page, "getPartnerCard", () => "CUST-9999");
		const [response] = await app.expectingErrors(() =>
			Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "getPartnerCard")),
				page.locator(`a[href="/customers/${partner.code}"]`).first().click(),
			]),
		);
		expect(await remoteErrorStatus(response)).toBe(404);
		expect(await page.locator("[data-partner-card]").count()).toBe(0);
	});

	test("another tenant's order has no classification to read", async () => {
		const { page } = app;
		const [order] = await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and status = 'scheduled' order by id limit 1`,
			[north.id],
		);
		const [shltrOrder] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? order by id limit 1`,
			[shltr.id],
		);
		await app.go(`/orders/${order.number}`);
		await tamperWithQuery<number>(page, "getOrderClassification", () => shltrOrder.id);
		const [response] = await app.expectingErrors(() =>
			Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "getOrderClassification")),
				page.getByRole("link", { name: "Edit" }).click(),
			]),
		);
		expect(await remoteErrorStatus(response)).toBe(404);
		// The rest of the form is there, the programme's part shows its failure.
		await page.getByRole("button", { name: "Save order" }).waitFor();
		expect(await page.locator("[data-partner-classification]").count()).toBe(0);
	});
});

describe("in South, which doesn't have the module", () => {
	test("its pages are 404s, the sidebar lacks it and the customer page has no card", async () => {
		const { page } = app;
		await app.go("/");
		await app.switchOrganization(south.name);
		const sidebar = page.locator('[data-sidebar="content"]');
		await sidebar.getByRole("link", { name: "Dashboard" }).waitFor();
		expect(await sidebar.getByRole("link", { name: "Partner programme" }).count()).toBe(0);
		expect(await page.locator("[data-partner-overview]").count()).toBe(0);
		// The other pages' and the module's queries' 404s are the module route guard's and
		// `moduleRemote`'s (`route-guard.spec.ts`, `remote-functions.spec.ts`).
		const response = await app.expectingErrors(() => app.go("/partner-programme"));
		expect(response?.status()).toBe(404);
		const [customer] = await rows<{ code: string }>(
			`select code from customer where organization_id = ? order by code limit 1`,
			[south.id],
		);
		await app.go(`/customers/${customer.code}`);
		await page.getByRole("heading", { level: 1 }).waitFor();
		expect(await page.locator("[data-partner-card]").count()).toBe(0);
	});
});
