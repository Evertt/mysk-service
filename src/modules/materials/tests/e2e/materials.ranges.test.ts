import { describe, expect, test } from "vite-plus/test";

import {
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
		await app.go("/materials");
		await page.getByRole("button", { name: "Filter", exact: true }).click();
		// "Stock", not "Stock level".
		await page.getByRole("option", { name: "Stock", exact: true }).click();
		await page.getByLabel("Maximum", { exact: true }).fill("10");
		await page.getByRole("button", { name: "Apply" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("quantity") === "..10");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected);
		const pill = app.page.locator('[data-slot="filter-pill"]', { hasText: "At most 10" });
		expect(await pill.innerText()).toMatch(/^Stock\s+At most 10/);

		// Changed in its pill: from 5 to 10 (both included).
		await pill.locator('[data-slot="popover-trigger"]').click();
		await page.getByLabel("Minimum", { exact: true }).fill("5");
		await page.getByRole("button", { name: "Apply" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("quantity") === "5..10");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await count("stock between 5 and 10"));
		await app.go("/materials");
	});

	test("links combine ranges with each other and the other filters", async () => {
		expect(await shownFor("used=1..&quantity=50..")).toBe(
			await count(`${usedOn} >= 1 and stock >= 50`),
		);
		expect(await shownFor("used=0&unit=pcs")).toBe(await count(`${usedOn} = 0 and unit = 'pcs'`));
		// What isn't a range is ignored.
		expect(await shownFor("quantity=10..5&used=lots")).toBe(await countIn("material", north.id));
	});

	// One test per request, each loading the page afresh.
	describe("a malformed range in the list's query is refused with a 400", () => {
		type Query = Record<string, unknown>;
		test.each<Query>([
			{ stock: [{ from: 10, to: 5 }] },
			{ stock: ["..10"] },
			{ orderCount: [{ from: null, to: "3" }] },
			{
				stock: [
					{ from: 1, to: 2 },
					{ from: 5, to: 6 },
				],
			},
		])("%j", async (filters) => {
			await app.go("/materials");
			await tamperWithQuery<Query>(app.page, "getMaterials", (arg) => ({ ...arg, filters }));
			const [response] = await app.expectingErrors(() =>
				Promise.all([
					app.page.waitForResponse((r) => isRemote(r.url(), "getMaterials")),
					app.page.getByRole("button", { name: "Go to next page" }).click(),
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
