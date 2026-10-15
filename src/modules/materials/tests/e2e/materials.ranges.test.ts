import { describe, expect, test } from "vite-plus/test";

import {
	afresh,
	countIn,
	isRemote,
	organizations,
	remoteErrorStatus,
	tamperWithQuery,
	useApp,
	value,
} from "#e2e/app.ts";

const { north, south } = organizations;
const app = useApp();

/** How many of an organization's materials match `where`. */
const count = (where: string, args: number[] = [], organizationId: string = north.id) =>
	value<number>(`select count(*) from material m where organization_id = ? and ${where}`, [
		organizationId,
		...args,
	]);

/** The orders a material is used on, in SQL. */
const usedOn = `(select count(distinct l.order_id) from order_line l where l.material_id = m.id)`;

/** The materials the URL's parameters show, in all. */
const shownFor = async (search: string) => {
	await app.go(`/materials?${search}`);
	return app.rowCount();
};

describe("range filters on the materials list, in North", () => {
	test("at most 10 in stock, from the Filter menu", async () => {
		const { page } = app;
		const expected = await count("stock <= 10");
		expect(expected).toBeGreaterThan(0);
		await app.go(afresh("/materials"));
		await page.getByRole("button", { name: "Filter", exact: true }).click();
		// "Stock", not "Stock level".
		await page.getByRole("option", { name: "Stock", exact: true }).click();
		await page.getByLabel("Maximum", { exact: true }).fill("10");
		await page.getByRole("button", { name: "Add" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("quantity") === "..10");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected);
		const pill = app.page.locator('[data-slot="filter-pill"]', { hasText: "At most 10" });
		expect(await pill.innerText()).toMatch(/^Stock\s+At most 10/);

		// Changed in its pill: a second range, 50 to 60, then the first taken off.
		await pill.locator('[data-slot="popover-trigger"]').click();
		await page.getByLabel("Minimum", { exact: true }).fill("50");
		await page.getByLabel("Maximum", { exact: true }).fill("60");
		await page.getByRole("button", { name: "Add" }).click();
		await page.waitForURL((url) => url.searchParams.get("quantity") === "..10,50..60");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await count("(stock <= 10 or stock between 50 and 60)"));
		await page.getByRole("button", { name: "Remove At most 10" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("quantity") === "50..60");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await count("stock between 50 and 60"));
		await app.go(afresh("/materials"));
	});

	test("links combine ranges with each other and the other filters", async () => {
		expect(await shownFor("used=1..&quantity=50..")).toBe(
			await count(`${usedOn} >= 1 and stock >= 50`),
		);
		expect(await shownFor("used=0&unit=pcs")).toBe(await count(`${usedOn} = 0 and unit = 'pcs'`));
		// Prices in euros, to the cent.
		expect(await shownFor("price=..10")).toBe(await count("unit_price <= 1000"));
		expect(await shownFor("price=10.01..")).toBe(await count("unit_price >= 1001"));
		// Several values: either.
		expect(await shownFor("quantity=0,50..60")).toBe(
			await count("(stock = 0 or stock between 50 and 60)"),
		);
		// What isn't a range is ignored.
		expect(await shownFor("quantity=10..5&used=lots")).toBe(await countIn("material", north.id));
	});

	test("takes no more ranges than the list does: Add is off until one comes off", async () => {
		const { page } = app;
		await app.go(`/materials?quantity=${Array.from({ length: 10 }, (_, i) => i + 1).join(",")}`);
		await app.tableSettled();
		const pill = page.locator('[data-slot="filter-pill"]', { hasText: "Stock" }).first();
		await pill.locator('[data-slot="popover-trigger"]').click();
		await page.getByLabel("Minimum", { exact: true }).fill("50");
		expect(await page.getByTestId("range-filter-full").innerText()).toContain("up to 10");
		expect(await page.getByRole("button", { name: "Add" }).isDisabled()).toBe(true);
		await page.getByRole("button", { name: "Remove 10" }).click();
		expect(await page.getByTestId("range-filter-full").count()).toBe(0);
		await page.getByRole("button", { name: "Add" }).click();
		await page.waitForURL((url) => url.searchParams.get("quantity")?.endsWith(",50..") ?? false);
		await page.keyboard.press("Escape");
		await app.go(afresh("/materials"));
	});

	// One test per request, each loading the page afresh.
	describe("a malformed range in the list's query is refused with a 400", () => {
		type Query = Record<string, unknown>;
		test.each<Query>([
			{ stock: [{ from: 10, to: 5 }] },
			{ stock: ["..10"] },
			{ orderCount: [{ from: null, to: "3" }] },
			{ stock: Array.from({ length: 11 }, (_, i) => ({ from: i, to: i })) },
			{ stock: [null] },
			{ unitPrice: [{ from: 0.5, to: null }] },
			{ unitPrice: ["..10"] },
		])("%j", async (filters) => {
			await app.go(afresh("/materials"));
			await tamperWithQuery<Query>(app.page, "getMaterials", (arg) => ({ ...arg, filters }));
			const [response] = await app.expectingErrors(() =>
				Promise.all([
					app.page.waitForResponse((r) => isRemote(r.url(), "getMaterials")),
					app.page
						.locator("thead")
						.getByRole("button", { name: /^Material/ })
						.click(),
				]),
			);
			expect(await remoteErrorStatus(response)).toBe(400);
		});
	});
});

describe("range filters on the materials list, in South", () => {
	test("count South's materials only", async () => {
		await app.switchOrganization(south.name);
		const expected = await count("stock <= 10", [], south.id);
		expect(await shownFor("quantity=..10")).toBe(expected);
		expect(await shownFor("used=1..")).toBe(await count(`${usedOn} >= 1`, [], south.id));
	});
});
