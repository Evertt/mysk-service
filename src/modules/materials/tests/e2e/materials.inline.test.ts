import { describe, expect, test } from "vite-plus/test";

import { organizations, quiet, rows, unbalancedStock, useApp, value } from "#e2e/app.ts";
import { movementMark, orderId, orderMovements, snapshot } from "#e2e/orders-helpers.ts";
import { formatNumber } from "#lib/i18n/format.ts";

const { north } = organizations;
const app = useApp();

/**
 * The status in the orders list (core's, `src/tests/e2e/orders.inline.test.ts`) changes an order
 * through the same save hook as the order form, so materials refuses it for want of stock.
 */
describe("in North, changing an order's status in the list", () => {
	test("is refused when its materials aren't in stock, and the status goes back", async () => {
		const { page } = app;
		const [scarce] = await rows<{ id: number; name: string; stock: number }>(
			`select id, name, stock from material where organization_id = ? and unit = 'pcs'
			 order by stock, id limit 1`,
			[north.id],
		);

		// A quote takes no stock, so it may have more than there is.
		await app.go("/orders/new");
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Description").fill("Quote for more parts than in stock (test order)");
		await page.getByRole("button", { name: "Add material" }).click();
		const line = page.locator("tbody tr").last();
		await line.getByLabel("Material").selectOption(String(scarce.id));
		await line.getByLabel("Quantity").fill(String(scarce.stock + 5));
		const mark = await movementMark();
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await quiet(page);
		const number = app.path().split("/").pop()!;
		const id = (await orderId(number, north.id))!;
		const before = await snapshot(id);

		await app.go(`/orders?q=${number}`);
		const row = page.locator('[data-slot="data-table"] tbody tr', { hasText: number });
		await row.getByRole("button", { name: `Status of ${number}: Quote` }).click();
		await page.getByRole("option", { name: "In progress" }).click();

		await app.toast(`Only ${formatNumber(scarce.stock)} pcs of ${scarce.name} in stock`);
		await row.getByRole("button", { name: `Status of ${number}: Quote` }).waitFor();
		expect(await snapshot(id)).toEqual(before);
		expect(await value(`select status from "order" where id = ?`, [id])).toBe("quote");
		expect(await orderMovements(number, north.id, mark)).toEqual([]);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});
});
