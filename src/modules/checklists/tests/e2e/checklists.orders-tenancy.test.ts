/**
 * The checklists on orders between tenants: North (which has the module) sees its own on its
 * orders' and units' pages and SHLTR's nowhere, also by a tampered query; South (which hasn't)
 * has no card, column or work order page, and North's queries are refused.
 */
import { describe, expect, test } from "vite-plus/test";

import { isRemote, organizations, rows, tamperWithQuery, useApp, value } from "#e2e/app.ts";

const { north, south } = organizations;
const shltr = organizations.shltr;
const app = useApp();
const page = () => app.page;

/** The URLs of North's remote queries of checklists, as loaded in North, to try from South. */
const queries: Record<string, string> = {};
const names = ["getOrderChecklists", "getUnitChecklists", "getWorkOrder"];

/** One of North's orders with checklists, and the serial number of one of its units. */
const northern = async () =>
	(
		await rows<{ number: string; serial: string }>(
			`select o.number, e.serial_number as serial from checklist c join "order" o on o.id = c.order_id
			 join equipment e on e.id = c.equipment_id where c.organization_id = ? order by c.id limit 1`,
			[north.id],
		)
	)[0];

/** An order number of SHLTR's with checklists that North has no order of. */
const shltrOnly = () =>
	value<string>(
		`select o.number from "order" o where o.organization_id = ?
		 and exists (select 1 from checklist c where c.order_id = o.id)
		 and o.number not in (select number from "order" where organization_id = ?)
		 order by o.id limit 1`,
		[shltr.id, north.id],
	);

/** Follows a link to `href` in the page, as a click would: a client-side navigation. */
const navigate = (href: string) =>
	page().evaluate((to) => {
		const link = document.createElement("a");
		link.href = to;
		document.body.append(link);
		link.click();
		link.remove();
	}, href);

describe("in North, which has the module", () => {
	test("its order's and unit's pages show its checklists, loaded by remote queries", async () => {
		const record = (request: { url(): string }) => {
			for (const name of names) if (isRemote(request.url(), name)) queries[name] = request.url();
		};
		page().on("request", record);
		const { number, serial } = await northern();
		await app.go("/activity");
		// Client-side, so the pages load their data through remote queries.
		await navigate(`/orders/${number}`);
		await page().locator("[data-order-checklists]").waitFor();
		await page()
			.locator("[data-order-checklists]")
			.getByRole("link", { name: "Work order" })
			.click();
		await page().locator("[data-work-order]").waitFor();
		await navigate(`/equipment/${serial}`);
		await page().locator("[data-unit-inspections] [data-history]").first().waitFor();
		page().off("request", record);
		expect(Object.keys(queries).toSorted()).toEqual(names);
	});

	test("SHLTR's checklists can't be read, also by a tampered query", async () => {
		const number = await shltrOnly();
		expect(
			(await app.expectingErrors(() => app.go(`/checklists/work-orders/${number}`)))?.status(),
		).toBe(404);
		const [first, second] = await rows<{ number: string }>(
			`select distinct o.number from checklist c join "order" o on o.id = c.order_id
			 where c.organization_id = ? order by o.id limit 2`,
			[north.id],
		);
		await app.go(`/orders/${first.number}`);
		await page().locator("[data-order-checklists]").waitFor();
		const answer = page().waitForResponse((response) =>
			isRemote(response.url(), "getOrderChecklists"),
		);
		await app.expectingErrors(async () => {
			// The next order's card asks for SHLTR's order instead.
			await tamperWithQuery<string>(page(), "getOrderChecklists", () => number);
			await navigate(`/orders/${second.number}`);
			expect(await (await answer).text()).toMatch(/"status":404/);
		});
	});
});

describe("in South, which doesn't have the module", () => {
	test("an order's and a unit's pages have no checklists, the list no column", async () => {
		await app.switchOrganization(south.name);
		const [order] = await rows<{ number: string; serial: string }>(
			`select o.number, e.serial_number as serial from "order" o join order_unit u on u.order_id = o.id
			 join equipment e on e.id = u.equipment_id
			 where o.organization_id = ? and o.type = 'inspection' limit 1`,
			[south.id],
		);
		await app.go(`/orders/${order.number}`);
		await page().getByRole("heading", { name: order.number }).waitFor();
		expect(await page().locator("[data-order-checklists]").count()).toBe(0);
		await app.go(`/equipment/${order.serial}`);
		await page().getByText("Owner").first().waitFor();
		expect(await page().locator("[data-unit-inspections]").count()).toBe(0);
		// The list ignores the column's URL parameter.
		await app.go("/equipment?inspection=expired&sort=inspection");
		expect(await page().locator("thead").getByText("Inspection").count()).toBe(0);
		expect(await app.rowCount()).toBe(
			Number(await value(`select count(*) from equipment where organization_id = ?`, [south.id])),
		);
		expect((await app.go(`/checklists/work-orders/${order.number}`))?.status()).toBe(404);
	});

	test("North's remote queries are refused", async () => {
		expect(Object.keys(queries)).toHaveLength(names.length);
		for (const [name, url] of Object.entries(queries)) {
			const response = await page().context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), `${name}: ${body}`).toBe(true);
		}
	});
});
