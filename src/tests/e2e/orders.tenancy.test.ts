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
	orderLines,
	movementMark,
	orderMovements,
	shared,
	shownNumbers,
	snapshot,
} from "./orders-helpers.ts";
import { tamperWithCommand } from "./remote-functions.ts";

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

	test("the list never shows North's orders, whatever its filters say", async () => {
		// A customer code only North has, and one both have.
		const northCode = await value<string>(
			`select code from customer where organization_id = ?
			 and code not in (select code from customer where organization_id = ?) order by code limit 1`,
			[north.id, south.id],
		);
		const sharedCode = await value<string>(
			`select code from customer where organization_id = ?
			 and code in (select code from customer where organization_id = ?) order by code limit 1`,
			[south.id, north.id],
		);
		const northEngineer = await value<number>(
			`select engineer_id from "order" where organization_id = ? and engineer_id is not null limit 1`,
			[north.id],
		);
		await app.go(`/orders?customer=${northCode}`);
		expect(await app.rowCount()).toBe(0);
		await app.go(`/orders?engineer=${northEngineer}`);
		expect(await app.rowCount()).toBe(0);

		await app.go(`/orders?customer=${sharedCode}`);
		const expected = await rows<{ number: string }>(
			`select o.number from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and c.code = ? order by o.created_at desc, o.id`,
			[south.id, sharedCode],
		);
		expect(expected.length).toBeGreaterThan(0);
		expect(await app.rowCount()).toBe(expected.length);
		expect(await shownNumbers(app)).toEqual(expected.slice(0, 50).map((row) => row.number));
	});

	test("the customer filter offers South's customers only", async () => {
		const { page } = app;
		const own = new Set(
			(
				await rows<{ code: string }>(`select code from customer where organization_id = ?`, [
					south.id,
				])
			).map((row) => row.code),
		);
		const northOnlyName = await value<string>(
			`select name from customer where organization_id = ?
			 and name not in (select name from customer where organization_id = ?) order by id limit 1`,
			[north.id, south.id],
		);
		await app.go("/orders");
		await app.openFilter("Customer");
		const box = page.getByPlaceholder("Search customers…");
		await box.fill("CUST");
		await expect.poll(() => page.getByRole("option").count()).toBe(Math.min(own.size, 20));
		for (const option of await page.getByRole("option").allInnerTexts()) {
			expect(own.has(option.match(/CUST-\d+/)![0]), option).toBe(true);
		}
		await box.fill(northOnlyName);
		await page.getByText("No results found.").waitFor();
		expect(await page.getByRole("option").count()).toBe(0);
		await page.keyboard.press("Escape");
	});

	test("North's orders are a 404", async () => {
		expect(
			await value(`select group_concat(organization_id) from "order" where number = ?`, [
				northOnly,
			]),
		).toBe(north.id);
		expect((await app.go(`/orders/${northOnly}`))?.status()).toBe(404);
		expect((await app.go(`/orders/${northOnly}/edit`))?.status()).toBe(404);
	});

	test("a number both have shows South's order", async () => {
		const [own, other] = await rows<{ organization_id: string; name: string }>(
			`select o.organization_id, c.name from "order" o join customer c on c.id = o.customer_id
			 where o.number = ? order by o.organization_id = ? desc`,
			[shared, south.id],
		);
		expect(own.organization_id).toBe(south.id);
		await app.go(`/orders/${shared}`);
		const text = await app.page.locator("main").innerText();
		expect(text).toContain(own.name);
		expect(text).not.toContain(other.name);
		await app.go(`/orders/${shared}/edit`);
		expect(await app.page.getByLabel("Customer").locator("option:checked").innerText()).toContain(
			own.name,
		);
	});

	test("saving with the id of a North order is refused", async () => {
		const { page } = app;
		const victim = await orderId(northOnly, north.id);
		const own = await orderId(shared, south.id);
		const [victimBefore, ownBefore] = [await snapshot(victim), await snapshot(own)];

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

	test("North's customers and materials are rejected", async () => {
		const { page } = app;
		const own = await orderId(shared, south.id);
		const before = await snapshot(own);
		const customerId = String(
			await value(`select min(id) from customer where organization_id = ?`, [north.id]),
		);
		const materialId = String(
			await value(`select min(id) from material where organization_id = ?`, [north.id]),
		);

		await app.go(`/orders/${shared}/edit`);
		await page.getByRole("button", { name: "Add material" }).click();
		await page.evaluate(
			({ customerId, materialId }) => {
				document
					.querySelector<HTMLSelectElement>('select[name^="customerId/"]')!
					.add(new Option("North customer", customerId));
				[...document.querySelectorAll<HTMLSelectElement>("tbody select")]
					.at(-1)!
					.add(new Option("North material", materialId));
			},
			{ customerId, materialId },
		);
		// Select them like a user would, so the form's own state follows.
		await page.getByLabel("Customer").selectOption(customerId);
		await page.locator("tbody tr").last().getByLabel("Material").selectOption(materialId);
		await app.submit(page.getByRole("button", { name: "Save order" }));

		expect(await app.issues()).toContainEqual(expect.stringMatching(/Unknown customer/));
		// The order's own fields are checked first, the modules' parts (its materials) once they're
		// right: saving them needs the order.
		await page.getByLabel("Customer").selectOption(String(before[0].customer_id));
		await app.submit(page.getByRole("button", { name: "Save order" }));
		expect(await app.issues()).toContainEqual(expect.stringMatching(/Unknown material/));
		expect(app.path()).toBe(`/orders/${shared}/edit`);
		expect(await snapshot(own)).toEqual(before);
		// North's material kept its stock: its order with that number still holds what it held.
		expect(await unbalancedStock(north.id)).toEqual([]);
		const northern = await orderId(shared, north.id);
		const status = await value<string>(`select status from "order" where id = ?`, [northern]);
		expect(await orderMovements(shared, north.id)).toEqual(
			["quote", "cancelled"].includes(status)
				? []
				: (await orderLines(northern)).map((line) => ({
						material_id: line.material_id,
						quantity: -line.quantity,
						kind: "consumption",
						order_number: shared,
						note: null,
					})),
		);
	});

	test("deleting with the id of a North order is refused", async () => {
		const { page } = app;
		const victim = await orderId(northOnly, north.id);
		const own = await orderId(shared, south.id);
		const [victimBefore, ownBefore] = [await snapshot(victim), await snapshot(own)];

		await app.go(`/orders/${shared}`);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id/"]')!.value =
					String(id);
			}, victim);
			return app.submit(dialog.getByRole("button", { name: "Delete" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/orders/${shared}`);
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

	test("an order's total is its materials and labour, the same on its page and in the list", async () => {
		const { page } = app;
		const [order] = await rows<{
			materials: number;
			labor_hours: number;
			hourly_rate: number | null;
		}>(
			`select o.labor_hours, e.hourly_rate, (select sum(round(l.quantity * l.unit_price))
			 from order_line l where l.order_id = o.id) as materials
			 from "order" o left join engineer e on e.id = o.engineer_id where o.number = ? and o.organization_id = ?`,
			[shared, south.id],
		);
		const total =
			(order.materials ?? 0) + Math.round(order.labor_hours * (order.hourly_rate ?? 8500));
		const cents = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, "")) * 100);

		await app.go(`/orders/${shared}`);
		const table = page.locator("main table").first();
		expect(cents(await table.locator("tfoot td").last().innerText())).toBe(total);
		// South has invoices and materials but not contracts, the only module that adjusts prices.
		expect(await table.locator("tbody tr").filter({ hasText: "Covered by" }).count()).toBe(0);

		await app.go("/orders");
		await page.getByLabel("Search orders…").fill(shared);
		await app.tableSettled();
		await expect.poll(() => app.rowCount()).toBe(1);
		const row = page.locator('[data-slot="data-table"] tbody tr').first();
		expect(cents(await row.locator("td:nth-last-child(2)").innerText())).toBe(total);
	});

	test("a bulk action with the ids of North's orders leaves them alone", async () => {
		const { page } = app;
		const victims = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'quote' order by id limit 2`,
			[north.id],
		);
		const before = await Promise.all(victims.map((victim) => snapshot(victim.id)));
		await app.go("/orders?status=quote&sort=number");
		const own = await orderId((await shownNumbers(app))[0], south.id);
		const ownBefore = await snapshot(own);

		await page
			.locator('[data-slot="data-table"] tbody tr')
			.first()
			.getByRole("checkbox", { name: "Select row" })
			.click();
		await page.getByRole("button", { name: "Change status" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByLabel("Status").selectOption({ label: "Cancelled" });
		// The command goes out with North's ids instead of the selected order's.
		await tamperWithCommand<{ status: string }>(app.page, "bulkSetOrderStatus", (arg) => ({
			...arg,
			target: { ids: victims.map((victim) => victim.id) },
		}));
		await app.expectingErrors(async () => {
			await dialog.getByRole("button", { name: "Apply" }).click();
			await app.toast("2 not found");
		});

		for (const [i, victim] of victims.entries()) {
			expect(await snapshot(victim.id)).toEqual(before[i]);
		}
		expect(await snapshot(own)).toEqual(ownBefore);
	});
});
