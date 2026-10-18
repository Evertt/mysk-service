/**
 * South's orders: the switch, North's order a 404, the edit form with a North order's id refused,
 * and a new order South's. What the orders' remote functions answer South for North's ids (the
 * list, its filters, the order, its total, its other refusals) is `orders/server/tenancy.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	countIn,
	nextCode,
	organizations,
	rows,
	unbalancedStock,
	useApp,
	value,
	quiet,
} from "./app.ts";
import {
	northOnly,
	orderId,
	movementMark,
	orderMovements,
	shared,
	snapshot,
} from "./orders-helpers.ts";

const { north, south } = organizations;
const app = useApp();

describe("in South", () => {
	test("switching organization shows South's orders", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		await app.go("/orders");
		expect(await app.rowCount()).toBe(await countIn("order", south.id));
		await app.page.getByLabel("Search orders…").fill(northOnly);
		await app.tableSettled();
		expect(await app.page.getByText("No orders found").count()).toBe(1);
	});

	test("North's orders are a 404", async () => {
		expect(
			// North has it and South doesn't (SHLTR numbers its orders the same way, which is beside
			// the point here).
			await value(
				`select group_concat(organization_id) from "order"
				 where number = ? and organization_id in (?, ?)`,
				[northOnly, north.id, south.id],
			),
		).toBe(north.id);
		expect((await app.go(`/orders/${northOnly}`))?.status()).toBe(404);
		expect((await app.go(`/orders/${northOnly}/edit`))?.status()).toBe(404);
	});

	test("saving with the id of a North order is refused", async () => {
		const { page } = app;
		const victim = await orderId(northOnly, north.id);
		const own = await orderId(shared, south.id);
		const [victimBefore, ownBefore] = [await snapshot(victim), await snapshot(own)];

		await app.go(`/orders/${shared}/edit`);
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('form input[type="hidden"][name^="id/"]')!.value =
					String(id);
			}, victim);
			return app.submit(page.getByRole("button", { name: "Save order" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/orders/${shared}/edit`);
		expect(await snapshot(victim)).toEqual(victimBefore);
		expect(await snapshot(own)).toEqual(ownBefore);
	});

	test("a new order gets South's next number and South's prices", async () => {
		const { page } = app;
		await app.go("/orders/new");
		expect((await page.getByLabel("Customer").locator("option").count()) - 1).toBe(
			await countIn("customer", south.id),
		);
		await page.getByRole("button", { name: "Add material" }).click();
		const material = page.locator("tbody tr").last().getByLabel("Material");
		expect((await material.locator("option").count()) - 1).toBe(
			await countIn("material", south.id),
		);
		await material.selectOption({ index: 1 });
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Description").fill("South test order");
		// Scheduled, so its line takes stock.
		await page.getByLabel("Status").selectOption("scheduled");

		const expected = await nextCode("order", "number", south.id);
		// Its number may be a deleted order's, whose movements keep it.
		const mark = await movementMark();
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await quiet(page);
		expect(app.path()).toBe(`/orders/${expected}`);
		const [line] = await rows<{ organization_id: string; unit_price: number; price: number }>(
			`select o.organization_id, l.unit_price, m.unit_price as price from "order" o
			 join order_line l on l.order_id = o.id join material m on m.id = l.material_id
			 where o.number = ? and o.organization_id = ?`,
			[expected, south.id],
		);
		expect(line.unit_price).toBe(line.price);

		// From South's stock.
		const [movement] = await orderMovements(expected, south.id, mark);
		expect(movement).toMatchObject({ quantity: -1, kind: "consumption" });
		expect(
			await value(`select organization_id from material where id = ?`, [movement.material_id]),
		).toBe(south.id);
		expect(await unbalancedStock(south.id)).toEqual([]);
	});
});
