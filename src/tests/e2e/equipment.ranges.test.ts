import { describe, expect, test } from "vite-plus/test";

import { presetRange } from "#lib/components/data-table/ranges.ts";

import { afresh, organizations, useApp, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

/** How many of an organization's units match `where`. */
const count = (where: string, args: (number | string)[] = [], organizationId: string = north.id) =>
	value<number>(`select count(*) from equipment e where organization_id = ? and ${where}`, [
		organizationId,
		...args,
	]);

/** A unit's open orders, in SQL. */
const openOrders = `(select count(*) from "order" o join order_unit ou on ou.order_id = o.id where ou.equipment_id = e.id
	and o.status in ('quote', 'scheduled', 'in_progress'))`;

/** Today, as the database has days: `yyyy-mm-dd`. */
const today = () => Temporal.Now.plainDateISO().toString();

/** The units the URL's parameters show, in all. */
const shownFor = async (search: string) => {
	await app.go(`/equipment?${search}`);
	return app.rowCount();
};

describe("range filters on the equipment list, in North", () => {
	test("out of warranty, from the Filter menu: a preset that stays relative", async () => {
		const { page } = app;
		const expected = await count("warranty_until < ?", [today()]);
		expect(expected).toBeGreaterThan(0);
		await app.go(afresh("/equipment"));
		await app.openFilter("Warranty");
		await page
			.locator('[data-slot="command-list"]')
			.getByRole("option", { name: /^Before today/ })
			.click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("warranty") === "before-today");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected);
		expect(await app.filterPill("Warranty").innerText()).toContain("Before today");
	});

	test("units with open orders, from the Filter menu: a minimum", async () => {
		const { page } = app;
		const expected = await count(`${openOrders} >= 1`);
		expect(expected).toBeGreaterThan(0);
		await app.go(afresh("/equipment"));
		await app.openFilter("Open orders");
		await page.getByLabel("Minimum", { exact: true }).fill("1");
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("open-orders") === "1..");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected);
		expect(await app.filterPill("Open orders").innerText()).toContain("At least 1");
	});

	test("links combine ranges with each other and the other filters", async () => {
		const thisYear = presetRange("this-year");
		const lastYear = presetRange("last-year").from!;
		expect(await shownFor(`installed=${lastYear}..&open-orders=..0`)).toBe(
			await count(`installed_at >= ? and ${openOrders} <= 0`, [lastYear]),
		);
		const chiller = await value<number>(
			`select id from equipment_category where organization_id = ? and name = 'Koelmachine'`,
			[north.id],
		);
		expect(await shownFor(`warranty=this-year&category=${chiller}`)).toBe(
			await count("warranty_until between ? and ? and category_id = ?", [
				thisYear.from!,
				thisYear.to!,
				chiller,
			]),
		);
		// What isn't a range is ignored.
		expect(await shownFor("open-orders=some&installed=2026-02-30")).toBe(await count("1"));
	});
});

describe("range filters on the equipment list, in South", () => {
	test("count South's units only", async () => {
		await app.switchOrganization(south.name);
		const expected = await count("warranty_until < ?", [today()], south.id);
		expect(expected).toBeGreaterThan(0);
		expect(await shownFor("warranty=before-today")).toBe(expected);
		expect(await shownFor("open-orders=1..")).toBe(await count(`${openOrders} >= 1`, [], south.id));
	});
});
