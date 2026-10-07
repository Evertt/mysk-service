import { describe, expect, test } from "vite-plus/test";

import { countIn, nextCode, organizations, rows, useApp, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

/** An order and its lines as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select o.*, (select group_concat(material_id || 'x' || quantity || '@' || unit_price)
		 from order_line where order_id = o.id) as lines from "order" o where id = ?`,
		[id],
	);
const orderId = (number: string, organizationId: string) =>
	value<number>(`select id from "order" where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]);

/** Numbers that exist only in North (it has 750 orders, South 320), and in both. */
const northOnly = "ORD-2026-00750";
const shared = "ORD-2026-00320";

describe("in North", () => {
	let number: string;

	test("the list shows North's orders", async () => {
		await app.go("/orders");
		expect(await app.rowCount()).toBe(await countIn("order", north.id));
	});

	test("creating an order validates it first", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await app.submit(page.getByRole("button", { name: "Create order" }));
		expect(await app.issues()).not.toEqual([]);
		expect(app.path()).toBe("/orders/new");
		const options = await page.getByLabel("Customer").locator("option").count();
		expect(options - 1).toBe(await countIn("customer", north.id));
	});

	test("changing the customer clears the equipment", async () => {
		const { page } = app;
		await page.getByLabel("Customer").selectOption({ index: 2 });
		await page.getByLabel("Equipment").selectOption({ index: 1 });
		await page.getByLabel("Customer").selectOption({ index: 1 });
		expect(await page.getByLabel("Equipment").inputValue()).toBe("");
	});

	test("a new order gets the next number and its material lines", async () => {
		const { page } = app;
		await page.getByLabel("Equipment").selectOption({ index: 1 });
		await page.getByLabel("Type").selectOption("repair");
		await page.getByLabel("Priority").selectOption("high");
		await page.getByLabel("Description").fill("Pump leaking at the seal (test order)");
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByLabel("Engineer").selectOption({ index: 1 });
		await page.getByLabel("Scheduled for").fill("2026-10-20");
		await page.getByLabel("Labour (hours)").fill("2.5");
		for (const [material, quantity] of [
			[3, "4"],
			[5, "2"],
			[8, "1"],
		] as const) {
			await page.getByRole("button", { name: "Add material" }).click();
			const line = page.locator("tbody tr").last();
			await line.getByLabel("Material").selectOption({ index: material });
			await line.getByLabel("Quantity").fill(quantity);
		}
		await page.getByRole("button", { name: "Remove line" }).nth(1).click();

		const expected = await nextCode("order", "number", north.id);
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await page.waitForLoadState("networkidle");
		number = app.path().split("/").pop()!;
		expect(number).toBe(expected);
		await app.toast("Order created");

		const id = await orderId(number, north.id);
		expect(await value(`select count(*) from order_line where order_id = ?`, [id])).toBe(2);
		const lines = page
			.locator("table")
			.first()
			.locator("tbody tr")
			.filter({ hasNotText: "Labour" });
		expect(await lines.count()).toBe(2);
	});

	test("editing it saves the changes", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		expect(await page.getByLabel("Description").inputValue()).toContain("(test order)");
		expect(await page.locator("tbody tr").count()).toBe(2);

		await page.getByLabel("Status").selectOption("completed");
		await page.getByLabel("Labour (hours)").fill("4");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		const [order] = await rows<{ status: string; labor_hours: number; completed_at: unknown }>(
			`select status, labor_hours, completed_at from "order" where number = ? and organization_id = ?`,
			[number, north.id],
		);
		expect(order).toMatchObject({ status: "completed", labor_hours: 4 });
		expect(order.completed_at).not.toBeNull();
	});

	test("lines take decimals in kilos, metres and litres, but whole pieces", async () => {
		const { page } = app;
		const pick = (unit: string) =>
			value<number>(`select min(id) from material where organization_id = ? and unit = ?`, [
				north.id,
				unit,
			]);
		const [kilos, pieces] = [await pick("kg"), await pick("pcs")];
		const addLine = async (materialId: number, quantity: string) => {
			await page.getByRole("button", { name: "Add material" }).click();
			const line = page.locator("tbody tr").last();
			await line.getByLabel("Material").selectOption(String(materialId));
			await line.getByLabel("Quantity").fill(quantity);
			return line;
		};
		const id = await orderId(number, north.id);
		const before = await snapshot(id);

		await app.go(`/orders/${number}/edit`);
		await addLine(kilos, "2.5");
		const piecesLine = await addLine(pieces, "1.5");
		expect(await piecesLine.getByLabel("Quantity").getAttribute("step")).toBe("1");
		// Past the browser's own check of the step, to see the app's.
		await page
			.locator("form")
			.last()
			.evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await app.submit(page.getByRole("button", { name: "Save order" }));
		expect(await app.issues()).toEqual(["Whole pieces only"]);
		expect(await snapshot(id)).toEqual(before);

		await piecesLine.getByLabel("Quantity").fill("2");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		const [line] = await rows<{ quantity: number; unit_price: number }>(
			`select quantity, unit_price from order_line where order_id = ? and material_id = ?`,
			[id, kilos],
		);
		expect(line.quantity).toBe(2.5);
		await page.getByText("2.5 kg").waitFor();
	});

	test("deleting it removes it, after which it's a 404", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		expect(await orderId(number, north.id)).toBeUndefined();
		expect((await app.go(`/orders/${number}`))?.status()).toBe(404);
	});
});

describe("in South", () => {
	test("switching organization shows South's orders", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		await app.go("/orders");
		expect(await app.rowCount()).toBe(await countIn("order", south.id));
		await app.page.getByLabel("Search orders…").fill(northOnly);
		expect(await app.page.getByText("No orders found").count()).toBe(1);
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

		const issues = await app.issues();
		expect(issues).toContainEqual(expect.stringMatching(/Unknown customer/));
		expect(issues).toContainEqual(expect.stringMatching(/Unknown material/));
		expect(app.path()).toBe(`/orders/${shared}/edit`);
		expect(await snapshot(own)).toEqual(before);
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

		const expected = await nextCode("order", "number", south.id);
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await page.waitForLoadState("networkidle");
		expect(app.path()).toBe(`/orders/${expected}`);
		const [line] = await rows<{ organization_id: string; unit_price: number; price: number }>(
			`select o.organization_id, l.unit_price, m.unit_price as price from "order" o
			 join order_line l on l.order_id = o.id join material m on m.id = l.material_id
			 where o.number = ? and o.organization_id = ?`,
			[expected, south.id],
		);
		expect(line.unit_price).toBe(line.price);
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
		// South has no modules, so nothing adjusts the price.
		expect(await table.locator("tbody tr").filter({ hasText: "Covered by" }).count()).toBe(0);

		await app.go("/orders");
		await page.getByLabel("Search orders…").fill(shared);
		await expect.poll(() => app.rowCount()).toBe(1);
		const row = page.locator('[data-slot="data-table"] tbody tr').first();
		expect(cents(await row.locator("td:nth-last-child(2)").innerText())).toBe(total);
	});
});
