/**
 * The materials list's range filters in the page: from the Filter menu, and no more than the list
 * takes. What links with ranges list (combined, prices in euros) is `tests/unit/server/list.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { afresh, organizations, useApp, value } from "#e2e/app.ts";

const { north } = organizations;
const app = useApp();

/** How many of North's materials match `where`. */
const count = (where: string) =>
	value<number>(`select count(*) from material m where organization_id = ? and ${where}`, [
		north.id,
	]);

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
	});
});
