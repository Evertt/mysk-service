import { describe, expect, test } from "vite-plus/test";

import { countIn, nextCode, organizations, rows, useApp, value, quiet } from "./app.ts";
import { addUnits, formUnits, orderId, snapshot } from "./orders-helpers.ts";

const { north } = organizations;
const app = useApp();

/** When an order is scheduled for, as stored (in seconds). */
const scheduledFor = async (id: number) =>
	new Date((await value<number>(`select scheduled_for from "order" where id = ?`, [id])) * 1000);

/**
 * The order form. What the materials module adds to it (lines, stock) is that module's e2e,
 * `src/modules/materials/tests/e2e/materials.orders.test.ts`.
 */
describe("in North", () => {
	let number: string;

	test("creating an order validates it first", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await app.submit(page.getByRole("button", { name: "Create order" }));
		expect(await app.issues()).not.toEqual([]);
		expect(app.path()).toBe("/orders/new");
		const options = await page.getByLabel("Customer").locator("option").count();
		expect(options - 1).toBe(await countIn("customer", north.id));
	});

	test("changing the customer clears the units", async () => {
		const { page } = app;
		await page.getByLabel("Customer").selectOption({ index: 2 });
		await addUnits(app, 0);
		expect(await formUnits(app)).toHaveLength(1);
		await page.getByLabel("Customer").selectOption({ index: 1 });
		expect(await formUnits(app)).toEqual([]);
	});

	test("a unit's category puts the engineers who service it first", async () => {
		const { page } = app;
		await addUnits(app, 0);
		const [unit] = await formUnits(app);
		const specialty = await value<string>(
			`select c.specialty from equipment e join equipment_category c on c.id = e.category_id
			 where e.id = ?`,
			[unit],
		);
		const fitting = await rows<{ name: string }>(
			`select name from engineer where organization_id = ? and specialty = ? and active = 1
			 order by name`,
			[north.id, specialty],
		);
		expect(fitting.length).toBeGreaterThan(0);
		const firstGroup = await page
			.getByLabel("Engineer")
			.locator("optgroup")
			.first()
			.locator("option")
			.allInnerTexts();
		expect(firstGroup).toEqual(fitting.map((engineer) => engineer.name));
	});

	test("a new order gets the next number", async () => {
		const { page } = app;
		await page.getByLabel("Type").selectOption("repair");
		await page.getByLabel("Priority").selectOption("high");
		await page.getByLabel("Description").fill("Pump leaking at the seal (test order)");
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByLabel("Engineer").selectOption({ index: 1 });
		await page.getByLabel("Scheduled for").fill("2026-10-20");
		await page.getByLabel("Time", { exact: true }).fill("13:30");
		await page.getByLabel("Labour (hours)").fill("2.5");

		const expected = await nextCode("order", "number", north.id);
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await quiet(page);
		number = app.path().split("/").pop()!;
		expect(number).toBe(expected);
		await app.toast("Order created");
		expect(await scheduledFor(await orderId(number, north.id))).toEqual(
			new Date(2026, 9, 20, 13, 30),
		);
	});

	test("its page shows the site of its unit, with what to know before going there", async () => {
		const [site] = await rows<Record<string, string | null>>(
			`select s.name, s.address, s.postal_code, s.city, s.access_notes from "order" o
			 join order_unit u on u.order_id = o.id join equipment e on e.id = u.equipment_id
			 join customer_site s on s.id = e.site_id
			 where o.number = ? and o.organization_id = ?`,
			[number, north.id],
		);
		const card = app.page.locator("[data-site]");
		await card.waitFor();
		const text = await card.innerText();
		expect(text).toContain("Site");
		expect(text).toContain(site.name);
		expect(text).toContain(site.address);
		expect(text).toContain(`${site.postal_code} ${site.city}`);
		if (site.access_notes) expect(text).toContain(site.access_notes);
	});

	test("editing it saves the changes", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await quiet(page);
		expect(await page.getByLabel("Description").inputValue()).toContain("(test order)");
		expect(await page.getByLabel("Time", { exact: true }).inputValue()).toBe("13:30");

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
		// It's still planned at the time of day it had.
		expect(await scheduledFor(await orderId(number, north.id))).toEqual(
			new Date(2026, 9, 20, 13, 30),
		);
	});

	test("its scheduled time can be changed, and the day", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		await app.go(`/orders/${number}/edit`);
		await page.getByLabel("Time", { exact: true }).fill("08:15");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		expect(await scheduledFor(id)).toEqual(new Date(2026, 9, 20, 8, 15));

		await app.go(`/orders/${number}/edit`);
		await page.getByLabel("Scheduled for").fill("2026-10-22");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		expect(await scheduledFor(id)).toEqual(new Date(2026, 9, 22, 8, 15));
	});

	describe("an invoiced order", () => {
		/** The first of North's invoiced orders, and a completed one that can still be changed. */
		let invoiced: { id: number; number: string };
		let completed: { id: number; number: string };

		test("has no edit or delete, and its edit page says why", async () => {
			const first = (status: string) =>
				rows<{ id: number; number: string }>(
					`select id, number from "order" where organization_id = ? and status = ?
					 order by id limit 1`,
					[north.id, status],
				).then(([row]) => row);
			[invoiced, completed] = [await first("invoiced"), await first("completed")];
			const { page } = app;
			await app.go(`/orders/${invoiced.number}`);
			expect(await page.getByRole("link", { name: "Edit" }).count()).toBe(0);
			expect(await page.getByRole("button", { name: "Delete" }).count()).toBe(0);

			await app.go(`/orders/${invoiced.number}/edit`);
			await page.getByText(`${invoiced.number} is invoiced`).waitFor();
			expect(await page.getByRole("button", { name: "Save order" }).count()).toBe(0);
		});

		test("saving another order's form with its id is refused", async () => {
			const { page } = app;
			await app.go(`/orders/${completed.number}/edit`);
			const before = [await snapshot(invoiced.id), await snapshot(completed.id)];
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('form input[type="hidden"][name^="id/"]')!.value =
					String(id);
			}, invoiced.id);
			await page.getByLabel("Labour (hours)").fill("99");
			await app.submit(page.getByRole("button", { name: "Save order" }));
			expect(await app.issues()).toContainEqual(
				expect.stringMatching(`${invoiced.number} is invoiced.*can't be changed`),
			);
			expect(app.path()).toBe(`/orders/${completed.number}/edit`);
			expect([await snapshot(invoiced.id), await snapshot(completed.id)]).toEqual(before);
		});

		test("deleting another order with its id is refused", async () => {
			const { page } = app;
			await app.go(`/orders/${completed.number}`);
			const before = await snapshot(invoiced.id);
			await page.getByRole("button", { name: "Delete" }).click();
			const dialog = page.getByRole("alertdialog");
			await dialog.waitFor();
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id/"]')!.value =
					String(id);
			}, invoiced.id);
			await app.submit(dialog.getByRole("button", { name: "Delete" }));
			expect(await app.issues()).toContainEqual(
				expect.stringMatching(`${invoiced.number} is invoiced.*can't be deleted`),
			);
			expect(await snapshot(invoiced.id)).toEqual(before);
			expect(await orderId(completed.number, north.id)).toBe(completed.id);
			await page.keyboard.press("Escape");
		});
	});
});
