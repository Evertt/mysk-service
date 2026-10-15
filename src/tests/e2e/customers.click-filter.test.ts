import { describe, expect, test } from "vite-plus/test";

import { afresh, countIn, organizations, rows, useApp } from "./app.ts";

const { north } = organizations;
const app = useApp();

/** The location cells of the customers table's rows. */
const locations = () =>
	app.page.locator('[data-slot="data-table"] tbody [data-column-id="country"]');

describe("clicking a customer's location filters the list, in North", () => {
	test("clicking the country filters by it, and clicking it again stops", async () => {
		const { page } = app;
		const all = await countIn("customer", north.id);
		await app.go(afresh("/customers"));
		const first = locations()
			.first()
			.getByRole("button", { name: /^Filter by / });
		const country = (await first.getAttribute("aria-label"))!.replace("Filter by ", "");
		await first.click();

		await page.waitForURL((url) => url.searchParams.has("country"));
		const code = new URL(page.url()).searchParams.get("country")!;
		const [{ count }] = await rows<{ count: number }>(
			`select count(*) as count from customer where organization_id = ? and country = ?`,
			[north.id, code],
		);
		await expect.poll(() => app.rowCount()).toBe(count);
		await app.filterPill("Country").waitFor();

		await locations()
			.first()
			.getByRole("button", { name: `Stop filtering by ${country}`, exact: true })
			.click();
		await page.waitForURL((url) => !url.searchParams.has("country"));
		await expect.poll(() => app.rowCount()).toBe(all);
	});

	test("clicking the city searches for it, and clicking it again clears the search", async () => {
		const { page } = app;
		const all = await countIn("customer", north.id);
		await app.go(afresh("/customers"));
		const first = locations()
			.first()
			.getByRole("button", { name: /^Search for / });
		const city = (await first.getAttribute("aria-label"))!.replace("Search for ", "");
		await first.click();

		const search = page.getByRole("textbox", { name: "Search customers…" });
		await expect.poll(() => search.inputValue()).toBe(city);
		await page.waitForURL((url) => url.searchParams.get("q") === city);
		expect(await app.rowCount()).toBeGreaterThan(0);
		expect(await app.rowCount()).toBeLessThan(all);

		await locations().first().getByRole("button", { name: "Clear the search" }).click();
		await expect.poll(() => search.inputValue()).toBe("");
		await expect.poll(() => app.rowCount()).toBe(all);
	});
});
