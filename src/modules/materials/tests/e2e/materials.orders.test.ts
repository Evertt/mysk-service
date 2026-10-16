import { describe, expect, test } from "vite-plus/test";

import { nextCode, organizations, rows, unbalancedStock, useApp, value, quiet } from "#e2e/app.ts";
import {
	addUnits,
	movementMark,
	orderId,
	orderLines,
	orderMovements,
	snapshot,
} from "#e2e/orders-helpers.ts";
import { formatNumber } from "#lib/i18n/format.ts";

const { north } = organizations;
const app = useApp();

/** When an order is scheduled for, as stored (in seconds). */
const scheduledFor = async (id: number) =>
	new Date((await value<number>(`select scheduled_for from "order" where id = ?`, [id])) * 1000);

/** Every material's stock in an organization, by id. */
const stocks = async (organizationId: string) =>
	new Map(
		(
			await rows<{ id: number; stock: number }>(
				`select id, stock from material where organization_id = ?`,
				[organizationId],
			)
		).map((row) => [row.id, row.stock]),
	);

/** A material as stored. */
const materialById = async (id: number) =>
	(
		await rows<{ id: number; name: string; unit: string; stock: number }>(
			`select id, name, unit, stock from material where id = ?`,
			[id],
		)
	)[0];

/**
 * The materials' part of the order form (`orders.form`, saved through `orders.saving`): lines, and
 * the stock that follows them and the order's status. The order form itself is core's, in
 * `src/tests/e2e/orders.test.ts`.
 */
describe("in North, an order's materials", () => {
	let number: string;
	/** The newest movement before the test order was made, so its number's earlier history isn't its own. */
	let since = 0;

	test("the order lines took their materials from stock, except quotes' and cancelled ones'", async () => {
		// Per order and material, not by counting movements: other files on this worker may have
		// changed orders first, e.g. raised a line's quantity (a movement more, no line more) or
		// cancelled an order (its movements stay, with returns that even them out).
		expect(
			await rows(
				`select o.number, entry.material_id, round(sum(entry.quantity), 2) as difference from (
					select l.order_id, l.material_id, l.quantity from order_line l
					join "order" o on o.id = l.order_id
					where l.organization_id = ? and o.status not in ('quote', 'cancelled')
					union all
					select order_id, material_id, quantity from stock_movement
					where organization_id = ? and order_id is not null
				) entry join "order" o on o.id = entry.order_id
				group by entry.order_id, entry.material_id having round(sum(entry.quantity), 2) <> 0`,
				[north.id, north.id],
			),
			"orders whose movements don't add up to their lines",
		).toEqual([]);
		expect(
			await value(
				`select count(*) from stock_movement where kind = 'consumption' and organization_id = ?`,
				[north.id],
			),
		).toBeGreaterThan(1000);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("a new order gets its material lines", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await addUnits(app, 0);
		await page.getByLabel("Type").selectOption("repair");
		await page.getByLabel("Priority").selectOption("high");
		await page.getByLabel("Description").fill("Pump leaking at the seal (test order)");
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByLabel("Engineer").selectOption({ index: 1 });
		await page.getByLabel("Scheduled for").fill("2026-10-20");
		await page.getByLabel("Time", { exact: true }).fill("13:30");
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
		const before = await stocks(north.id);
		since = await movementMark();
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await quiet(page);
		number = app.path().split("/").pop()!;
		expect(number).toBe(expected);
		await app.toast("Order created");

		const id = await orderId(number, north.id);
		expect(await scheduledFor(id)).toEqual(new Date(2026, 9, 20, 13, 30));
		expect(await value(`select count(*) from order_line where order_id = ?`, [id])).toBe(2);
		const lines = page
			.locator("table")
			.first()
			.locator("tbody tr")
			.filter({ hasNotText: "Labour" });
		expect(await lines.count()).toBe(2);

		// The lines took their materials from stock, recorded with the order.
		const stored = await orderLines(id);
		expect(await orderMovements(number, north.id, since)).toEqual(
			stored.map((line) => ({
				material_id: line.material_id,
				quantity: -line.quantity,
				kind: "consumption",
				order_number: number,
				note: null,
			})),
		);
		const after = await stocks(north.id);
		for (const line of stored) {
			expect(after.get(line.material_id)).toBeCloseTo(
				before.get(line.material_id)! - line.quantity,
				2,
			);
		}
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("editing it saves the changes", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await quiet(page);
		expect(await page.getByLabel("Description").inputValue()).toContain("(test order)");
		expect(await page.locator("tbody tr").count()).toBe(2);
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
		// The same lines take no more stock.
		expect(await orderMovements(number, north.id, since)).toHaveLength(2);
		// It's still planned at the time of day it had.
		expect(await scheduledFor(await orderId(number, north.id))).toEqual(
			new Date(2026, 9, 20, 13, 30),
		);
	});

	test("the lines are checked in the browser, before anything is sent", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		const before = await snapshot(id);
		await app.go(`/orders/${number}/edit`);
		// Past the browser's own check of the minimum, to see the app's.
		await page
			.locator("form")
			.last()
			.evaluate((form: HTMLFormElement) => (form.noValidate = true));
		const posts: string[] = [];
		const record = (request: { method(): string; url(): string }) => {
			if (request.method() === "POST") posts.push(request.url());
		};
		page.on("request", record);
		try {
			await page.locator("tbody tr").first().getByLabel("Quantity").fill("0");
			await page.getByRole("button", { name: "Save order" }).click();
			await expect.poll(() => app.issues()).toEqual(["More than 0"]);

			// A line without a material, too.
			await page.getByRole("button", { name: "Add material" }).click();
			await page.getByRole("button", { name: "Save order" }).click();
			// (The lines' issues are listed in one field error, a line each.)
			await expect
				.poll(async () => (await app.issues()).join("\n").split("\n").toSorted())
				.toEqual(["Choose a material", "More than 0"]);
		} finally {
			page.off("request", record);
		}
		expect(posts).toEqual([]);
		expect(app.path()).toBe(`/orders/${number}/edit`);
		expect(await snapshot(id)).toEqual(before);
	});

	test("the server checks the lines too, when the browser doesn't", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		const before = await snapshot(id);
		await app.go(`/orders/${number}/edit`);
		await page.locator("tbody tr").first().getByLabel("Quantity").fill("-1");
		// Posted the way a browser without JavaScript would, so nothing checks it before the server.
		const { status, html } = await page.evaluate(async () => {
			const form = document.querySelector<HTMLFormElement>("form:has(button[type=submit])")!;
			const body = new URLSearchParams(
				[...new FormData(form)].map(([name, value]) => [name, String(value)]),
			);
			const headers = { accept: "text/html" };
			const response = await fetch(form.action, { method: "POST", body, headers });
			return { status: response.status, html: await response.text() };
		});
		expect(status).toBe(200);
		expect(html).toContain("More than 0");
		expect(await snapshot(id)).toEqual(before);
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
		expect(await orderMovements(number, north.id, since)).toHaveLength(2);

		await piecesLine.getByLabel("Quantity").fill("2");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		const [line] = await rows<{ quantity: number; unit_price: number }>(
			`select quantity, unit_price from order_line where order_id = ? and material_id = ?`,
			[id, kilos],
		);
		expect(line.quantity).toBe(2.5);
		await page.getByText("2.5 kg").waitFor();
		expect((await orderMovements(number, north.id, since)).slice(2)).toMatchObject([
			{ material_id: kilos, quantity: -2.5, kind: "consumption" },
			{ material_id: pieces, quantity: -2, kind: "consumption" },
		]);
	});

	test("changing a line's quantity takes or returns the difference", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		const lines = await orderLines(id);
		expect(lines).toHaveLength(4);
		const before = await stocks(north.id);

		await app.go(`/orders/${number}/edit`);
		const rowsInForm = page.locator("tbody tr");
		await rowsInForm.nth(0).getByLabel("Quantity").fill("1");
		await rowsInForm.nth(2).getByLabel("Quantity").fill("4");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await app.toast("Order saved");

		const returned = lines[0].quantity - 1;
		expect((await orderMovements(number, north.id, since)).slice(4)).toEqual([
			{
				material_id: lines[0].material_id,
				quantity: returned,
				kind: "return",
				order_number: number,
				note: null,
			},
			{
				material_id: lines[2].material_id,
				quantity: -1.5,
				kind: "consumption",
				order_number: number,
				note: null,
			},
		]);
		const after = await stocks(north.id);
		expect(after.get(lines[0].material_id)).toBe(before.get(lines[0].material_id)! + returned);
		expect(after.get(lines[2].material_id)).toBeCloseTo(before.get(lines[2].material_id)! - 1.5, 2);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("taking more than is in stock is refused, naming the material and what's available", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		const lines = await orderLines(id);
		const before = [
			await snapshot(id),
			await stocks(north.id),
			await orderMovements(number, north.id, since),
		];

		// A line already on the order can have the stock plus what it took already.
		const onOrder = await materialById(lines[0].material_id);
		await app.go(`/orders/${number}/edit`);
		const rowsInForm = page.locator("tbody tr");
		await rowsInForm
			.nth(0)
			.getByLabel("Quantity")
			.fill(String(Math.round((onOrder.stock + 2) * 100) / 100));
		await app.submit(page.getByRole("button", { name: "Save order" }));
		const available = formatNumber(onOrder.stock + lines[0].quantity);
		expect(await app.issues()).toEqual([
			`Only ${available} ${onOrder.unit} of ${onOrder.name} in stock`,
		]);
		expect(app.path()).toBe(`/orders/${number}/edit`);

		// A new line can have the stock.
		const [scarce] = await rows<{ id: number }>(
			`select id from material where organization_id = ? and unit = 'pcs' and stock > 0
			 and id not in (select material_id from order_line where order_id = ?)
			 order by stock limit 1`,
			[north.id, id],
		);
		const other = await materialById(scarce.id);
		await rowsInForm.nth(0).getByLabel("Quantity").fill(String(lines[0].quantity));
		await page.getByRole("button", { name: "Add material" }).click();
		await rowsInForm.last().getByLabel("Material").selectOption(String(other.id));
		await rowsInForm
			.last()
			.getByLabel("Quantity")
			.fill(String(other.stock + 1));
		await app.submit(page.getByRole("button", { name: "Save order" }));
		expect(await app.issues()).toEqual([
			`Only ${formatNumber(other.stock)} pcs of ${other.name} in stock`,
		]);

		// Nothing changed: not the order, not the stock, not its history.
		expect([
			await snapshot(id),
			await stocks(north.id),
			await orderMovements(number, north.id, since),
		]).toEqual(before);
	});

	test("removing a line returns its material", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		const lines = await orderLines(id);
		const before = await stocks(north.id);

		await app.go(`/orders/${number}/edit`);
		await page.getByRole("button", { name: "Remove line" }).nth(2).click();
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		await app.toast("Order saved");

		expect(await orderLines(id)).toHaveLength(3);
		expect((await orderMovements(number, north.id, since)).at(-1)).toEqual({
			material_id: lines[2].material_id,
			quantity: lines[2].quantity,
			kind: "return",
			order_number: number,
			note: null,
		});
		expect((await stocks(north.id)).get(lines[2].material_id)).toBeCloseTo(
			before.get(lines[2].material_id)! + lines[2].quantity,
			2,
		);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("cancelling it returns its materials, and reopening it takes them again", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		const lines = await orderLines(id);
		const before = await stocks(north.id);
		const history = await orderMovements(number, north.id, since);
		const setStatus = async (status: string) => {
			await app.go(`/orders/${number}/edit`);
			await page.getByLabel("Status").selectOption(status);
			await page.getByRole("button", { name: "Save order" }).click();
			await page.waitForURL((url) => url.pathname === `/orders/${number}`);
			await quiet(page);
		};
		const moved = (kind: string, sign: number) =>
			lines.map((line) => ({
				material_id: line.material_id,
				quantity: sign * line.quantity,
				kind,
				order_number: number,
				note: null,
			}));

		await setStatus("cancelled");
		expect((await orderMovements(number, north.id, since)).slice(history.length)).toEqual(
			moved("return", 1),
		);
		const cancelled = await stocks(north.id);
		for (const line of lines) {
			expect(cancelled.get(line.material_id)).toBeCloseTo(
				before.get(line.material_id)! + line.quantity,
				2,
			);
		}

		await setStatus("scheduled");
		expect((await orderMovements(number, north.id, since)).slice(history.length)).toEqual([
			...moved("return", 1),
			...moved("consumption", -1),
		]);
		const reopened = await stocks(north.id);
		for (const line of lines) {
			expect(reopened.get(line.material_id)).toBeCloseTo(before.get(line.material_id)!, 2);
		}
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("deleting it removes it and returns its materials, after which it's a 404", async () => {
		const { page } = app;
		const id = await orderId(number, north.id);
		const lines = await orderLines(id);
		const before = await stocks(north.id);
		const history = await orderMovements(number, north.id, since);

		/** The arguments of the queries the page asks for, as sent. */
		const asked: string[] = [];
		const record = (request: { url(): string; method(): string }) => {
			const url = new URL(request.url());
			if (!url.pathname.includes("/_app/remote/") || request.method() !== "GET") return;
			asked.push(Buffer.from(url.searchParams.get("payload") ?? "", "base64url").toString());
		};
		page.on("request", record);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		await page.getByLabel("Search orders…").waitFor();
		await app.tableSettled();
		page.off("request", record);
		// The page it leaves doesn't ask about the order again (it would only hear it's gone, and
		// the parts of the page that show their errors would), and the list it lands on is fresh:
		// the order, the latest, would be on its first page.
		expect(asked.filter((argument) => argument.includes(number))).toEqual([]);
		expect(await page.getByRole("link", { name: number }).count()).toBe(0);
		expect(await orderId(number, north.id)).toBeUndefined();
		expect((await app.go(`/orders/${number}`))?.status()).toBe(404);

		// The history keeps the order's number, without referring to the deleted order.
		const after = await orderMovements(number, north.id, since);
		expect(after.slice(0, history.length)).toEqual(history);
		expect(after.slice(history.length)).toEqual(
			lines.map((line) => ({
				material_id: line.material_id,
				quantity: line.quantity,
				kind: "return",
				order_number: number,
				note: "Order deleted",
			})),
		);
		expect(await value(`select count(*) from stock_movement where order_id = ?`, [id])).toBe(0);
		const stocksAfter = await stocks(north.id);
		for (const line of lines) {
			expect(stocksAfter.get(line.material_id)).toBeCloseTo(
				before.get(line.material_id)! + line.quantity,
				2,
			);
		}
		expect(await unbalancedStock(north.id)).toEqual([]);

		// The material's history still shows it, by number.
		const sku = await value<string>(`select sku from material where id = ?`, [
			lines[0].material_id,
		]);
		await app.go(`/materials/${sku}`);
		await page.getByText(`${number} (deleted)`).first().waitFor();
	});

	test("a quote's lines take no stock, so deleting it returns none", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Description").fill("Quote for a new pump (test order)");
		await page.getByRole("button", { name: "Add material" }).click();
		await page.locator("tbody tr").last().getByLabel("Material").selectOption({ index: 1 });
		expect(await page.getByLabel("Status").inputValue()).toBe("quote");
		const mark = await movementMark();
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await quiet(page);
		const quote = app.path().split("/").pop()!;
		const id = await orderId(quote, north.id);
		expect(await orderLines(id)).toHaveLength(1);
		// Only this order's movements say whether it took stock: North's stock as a whole is also
		// changed by other files on this worker (and, under load, late), so it isn't compared. Its
		// number may be a deleted order's, whose history keeps it, hence the mark.
		expect(await orderMovements(quote, north.id, mark)).toEqual([]);

		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		expect(await orderId(quote, north.id)).toBeUndefined();
		expect(await orderMovements(quote, north.id, mark)).toEqual([]);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});
});
