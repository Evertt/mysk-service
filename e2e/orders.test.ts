import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "../src/lib/format.ts";
import {
	baseURL,
	countIn,
	isRemote,
	nextCode,
	organizations,
	rows,
	unbalancedStock,
	useApp,
	value,
} from "./app.ts";

const { north, south } = organizations;
const app = useApp();

/** The order numbers on the shown page of the list. */
const shownNumbers = () =>
	app.page.locator('[data-slot="data-table"] tbody td:nth-child(2)').allInnerTexts();

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

interface Movement {
	material_id: number;
	quantity: number;
	kind: string;
	order_number: string | null;
	note: string | null;
}

/** The stock movements of an order (by its number, which they keep), oldest first. */
const orderMovements = (number: string, organizationId: string) =>
	rows<Movement>(
		`select material_id, quantity, kind, order_number, note from stock_movement
		 where order_number = ? and organization_id = ? order by id`,
		[number, organizationId],
	);

/** An order's lines as stored, in order. */
const orderLines = (id: number) =>
	rows<{ material_id: number; quantity: number }>(
		`select material_id, quantity from order_line where order_id = ? order by id`,
		[id],
	);

/** A material as stored. */
const materialById = async (id: number) =>
	(
		await rows<{ id: number; name: string; unit: string; stock: number }>(
			`select id, name, unit, stock from material where id = ?`,
			[id],
		)
	)[0];

/** Numbers that exist only in North (it has 750 orders, South 320), and in both. */
const northOnly = "ORD-2026-00750";
const shared = "ORD-2026-00320";

describe("in North", () => {
	let number: string;

	test("the seeded order lines took their materials from stock, except quotes' and cancelled ones'", async () => {
		expect(
			await value(
				`select count(*) from stock_movement where kind = 'consumption' and organization_id = ?`,
				[north.id],
			),
		).toBe(
			await value(
				`select count(*) from order_line l join "order" o on o.id = l.order_id
				 where l.organization_id = ? and o.status not in ('quote', 'cancelled')`,
				[north.id],
			),
		);
		expect(
			await value(
				`select count(*) from stock_movement s join "order" o on o.id = s.order_id
				 where s.organization_id = ? and o.status in ('quote', 'cancelled')`,
				[north.id],
			),
		).toBe(0);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("the list shows North's orders", async () => {
		await app.go("/orders");
		expect(await app.rowCount()).toBe(await countIn("order", north.id));
	});

	test("a link with filters and sorting opens the list that way", async () => {
		const { page } = app;
		// The customer with the most open orders.
		const [{ code }] = await rows<{ code: string }>(
			`select c.code from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')
			 group by c.id order by count(*) desc, c.code limit 1`,
			[north.id],
		);
		const open = await rows<{ number: string; priority: string; name: string }>(
			`select o.number, o.priority, c.name from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and c.code = ?
			 and o.status in ('quote', 'scheduled', 'in_progress')`,
			[north.id, code],
		);
		expect(open.length).toBeGreaterThan(0);
		const urgency = ["low", "normal", "high", "urgent"];
		const expected = open
			.toSorted(
				(a, b) =>
					urgency.indexOf(b.priority) - urgency.indexOf(a.priority) ||
					a.number.localeCompare(b.number),
			)
			.map((row) => row.number);

		const filtered = "status=quote,scheduled,in_progress&sort=-priority,number";
		await app.go(`/orders?customer=${code}&${filtered}`);
		expect(await app.rowCount()).toBe(open.length);
		expect(await page.locator("tbody td:nth-child(2)").allInnerTexts()).toEqual(
			expected.slice(0, 20),
		);
		const headers = await page.locator("thead").innerText();
		expect(headers).toMatch(/Priority\s*1/);
		expect(headers).toMatch(/Order\s*2/);

		// The customer filter shows the customer by name, and clears that filter only.
		const customerFilter = page.locator('[data-slot="popover-trigger"]', { hasText: "Customer" });
		await expect.poll(() => customerFilter.innerText()).toContain(open[0].name);
		await customerFilter.click();
		await page.getByRole("option", { name: "Clear filters" }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.search === `?${filtered}`);
		await app.tableSettled();
		const all = await rows(
			`select 1 from "order" where organization_id = ? and status in ('quote', 'scheduled', 'in_progress')`,
			[north.id],
		);
		expect(await app.rowCount()).toBe(all.length);
		await app.go("/orders");
	});

	test("the server sends one page at a time, in the database's order", async () => {
		const { page } = app;
		const total = await countIn("order", north.id);
		const second = await rows<{ number: string }>(
			`select number from "order" where organization_id = ?
			 order by created_at desc, id limit 20 offset 20`,
			[north.id],
		);
		await app.go("/orders");
		expect(await app.rowCount()).toBe(total);
		const [response] = await Promise.all([
			page.waitForResponse((r) => isRemote(r.url(), "getOrders")),
			page.getByRole("button", { name: "Go to next page" }).click(),
		]);
		// Just that page's orders came, not all of them.
		const sent = new Set((await response.text()).match(/ORD-\d{4}-\d{5}/g));
		expect([...sent].sort()).toEqual(second.map((row) => row.number).sort());
		await app.tableSettled();
		expect(await shownNumbers()).toEqual(second.map((row) => row.number));
		expect(await app.rowCount()).toBe(total);
		expect(await page.getByText(/^Page \d+ of \d+$/).innerText()).toBe(
			`Page 2 of ${Math.ceil(total / 20)}`,
		);
	});

	test("searching, filtering and sorting happen in the database", async () => {
		const { page } = app;
		// A word of the name of the customer with the most scheduled or running orders.
		const [{ word }] = await rows<{ word: string }>(
			`select substr(c.name, 1, instr(c.name || ' ', ' ') - 1) as word
			 from "order" o join customer c on c.id = o.customer_id
			 where o.organization_id = ? and o.status in ('scheduled', 'in_progress')
			 group by c.id order by count(*) desc, c.id limit 1`,
			[north.id],
		);
		const like = `%${word}%`;
		const expected = await rows<{ number: string }>(
			`select o.number from "order" o join customer c on c.id = o.customer_id
			 left join equipment u on u.id = o.equipment_id left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and o.status in ('scheduled', 'in_progress')
			 and (o.number like ? or c.name like ? or c.code like ? or u.manufacturer like ?
			   or u.model like ? or u.serial_number like ? or e.name like ?)
			 order by case o.priority when 'low' then 0 when 'normal' then 1 when 'high' then 2 else 3 end desc,
			   o.scheduled_for is null, o.scheduled_for, o.id`,
			[north.id, like, like, like, like, like, like, like],
		);
		expect(expected.length).toBeGreaterThan(0);

		await app.go(`/orders?status=scheduled,in_progress&sort=-priority,scheduled`);
		const search = page.getByLabel("Search orders…");
		await search.fill(word);
		await page.waitForURL((url) => url.searchParams.get("q") === word);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(expected.length);
		expect(await shownNumbers()).toEqual(expected.slice(0, 20).map((row) => row.number));

		// The status filter counts what the search and the other filters leave.
		const counts = await rows<{ status: string; n: number }>(
			`select o.status, count(*) as n from "order" o join customer c on c.id = o.customer_id
			 left join equipment u on u.id = o.equipment_id left join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? and (o.number like ? or c.name like ? or c.code like ?
			   or u.manufacturer like ? or u.model like ? or u.serial_number like ? or e.name like ?)
			 group by o.status`,
			[north.id, like, like, like, like, like, like, like],
		);
		await page.locator('[data-slot="popover-trigger"]', { hasText: "Status" }).click();
		for (const { status, n } of counts) {
			const label =
				{ in_progress: "In progress" }[status] ?? status[0].toUpperCase() + status.slice(1);
			expect(await page.getByRole("option", { name: label }).innerText()).toMatch(
				new RegExp(`${n}$`),
			);
		}
		await page.keyboard.press("Escape");
		await app.go("/orders");
	});

	test("filtering by customer and engineer, finding them by searching the filters", async () => {
		const { page } = app;
		// The customer and engineer with the most orders together.
		const [busy] = await rows<{
			code: string;
			name: string;
			engineer: number;
			engineer_name: string;
		}>(
			`select c.code, c.name, e.id as engineer, e.name as engineer_name from "order" o
			 join customer c on c.id = o.customer_id join engineer e on e.id = o.engineer_id
			 where o.organization_id = ? group by c.id, e.id order by count(*) desc, c.id, e.id limit 1`,
			[north.id],
		);
		await app.go("/orders");

		// Searching the customers finds them by name or code, North's only, at most 20.
		await page.locator('[data-slot="popover-trigger"]', { hasText: "Customer" }).click();
		const box = page.getByPlaceholder("Search customers…");
		const fragment = busy.name.slice(1, 4).toLowerCase();
		await box.fill(fragment);
		const like = `%${fragment}%`;
		const matching = await rows<{ code: string }>(
			`select code from customer where organization_id = ? and (name like ? or code like ?)
			 order by name collate nocase, id limit 20`,
			[north.id, like, like],
		);
		await expect
			.poll(() => page.getByRole("option").allInnerTexts())
			.toEqual(matching.map((row) => expect.stringContaining(row.code)));
		await box.fill(busy.code);
		await page.getByRole("option", { name: new RegExp(busy.code) }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("customer") === busy.code);
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			await value<number>(
				`select count(*) from "order" o join customer c on c.id = o.customer_id
				 where o.organization_id = ? and c.code = ?`,
				[north.id, busy.code],
			),
		);
		expect(
			await page.locator('[data-slot="popover-trigger"]', { hasText: "Customer" }).innerText(),
		).toContain(busy.name);

		await page.locator('[data-slot="popover-trigger"]', { hasText: "Engineer" }).click();
		await page.getByPlaceholder("Search engineers…").fill(busy.engineer_name);
		await page.getByRole("option", { name: busy.engineer_name }).first().click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("engineer") === String(busy.engineer));
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			await value<number>(
				`select count(*) from "order" o join customer c on c.id = o.customer_id
				 where o.organization_id = ? and c.code = ? and o.engineer_id = ?`,
				[north.id, busy.code, busy.engineer],
			),
		);
		const engineers = await page.locator("tbody td:nth-child(8)").allInnerTexts();
		expect(new Set(engineers)).toEqual(new Set([busy.engineer_name]));
		await app.go("/orders");
	});

	test("while the next page loads, the rows shown stay, dimmed", async () => {
		const { page } = app;
		await app.go("/orders");
		const before = await shownNumbers();
		const table = page.locator('[data-slot="data-table"]');
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route("**/_app/remote/**", async (route) => {
			await held;
			await route.continue();
		});
		try {
			await page.getByRole("button", { name: "Go to next page" }).click();
			await expect.poll(() => table.getAttribute("aria-busy")).toBe("true");
			expect(await shownNumbers()).toEqual(before);
			expect(await table.getByRole("progressbar").count()).toBe(1);
			await expect
				.poll(() => table.locator("tbody").evaluate((tbody) => getComputedStyle(tbody).opacity))
				.toBe("0.5");
		} finally {
			release();
			// Once the held requests have gone on.
			await page.unrouteAll({ behavior: "wait" });
		}
		await app.tableSettled();
		expect(await table.getAttribute("aria-busy")).toBeNull();
		expect(await table.getByRole("progressbar").count()).toBe(0);
		expect(await shownNumbers()).not.toEqual(before);
		await app.go("/orders");
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
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await page.waitForLoadState("networkidle");
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
		expect(await orderMovements(number, north.id)).toEqual(
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
		await page.waitForLoadState("networkidle");
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
		expect(await orderMovements(number, north.id)).toHaveLength(2);
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
		expect(await orderMovements(number, north.id)).toHaveLength(2);

		await piecesLine.getByLabel("Quantity").fill("2");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${number}`);
		const [line] = await rows<{ quantity: number; unit_price: number }>(
			`select quantity, unit_price from order_line where order_id = ? and material_id = ?`,
			[id, kilos],
		);
		expect(line.quantity).toBe(2.5);
		await page.getByText("2.5 kg").waitFor();
		expect((await orderMovements(number, north.id)).slice(2)).toMatchObject([
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
		expect((await orderMovements(number, north.id)).slice(4)).toEqual([
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
			await orderMovements(number, north.id),
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
			await orderMovements(number, north.id),
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
		expect((await orderMovements(number, north.id)).at(-1)).toEqual({
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
		const history = await orderMovements(number, north.id);
		const setStatus = async (status: string) => {
			await app.go(`/orders/${number}/edit`);
			await page.getByLabel("Status").selectOption(status);
			await page.getByRole("button", { name: "Save order" }).click();
			await page.waitForURL((url) => url.pathname === `/orders/${number}`);
			await page.waitForLoadState("networkidle");
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
		expect((await orderMovements(number, north.id)).slice(history.length)).toEqual(
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
		expect((await orderMovements(number, north.id)).slice(history.length)).toEqual([
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
		const history = await orderMovements(number, north.id);

		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		expect(await orderId(number, north.id)).toBeUndefined();
		expect((await app.go(`/orders/${number}`))?.status()).toBe(404);

		// The history keeps the order's number, without referring to the deleted order.
		const after = await orderMovements(number, north.id);
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
		// It may get the number of the order deleted above, whose history keeps that number.
		const before = [await stocks(north.id), await countIn("stock_movement", north.id)];
		await page.getByRole("button", { name: "Create order" }).click();
		await page.waitForURL(/\/orders\/ORD-/);
		await page.waitForLoadState("networkidle");
		const quote = app.path().split("/").pop()!;
		expect(await orderLines(await orderId(quote, north.id))).toHaveLength(1);
		expect([await stocks(north.id), await countIn("stock_movement", north.id)]).toEqual(before);

		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		expect(await orderId(quote, north.id)).toBeUndefined();
		expect([await stocks(north.id), await countIn("stock_movement", north.id)]).toEqual(before);
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

		test("isn't a status to choose in the form", async () => {
			const { page } = app;
			await app.go(`/orders/${completed.number}/edit`);
			const options = await page.getByLabel("Status").locator("option").allInnerTexts();
			expect(options).toContain("Completed");
			expect(options).not.toContain("Invoiced");
		});

		test("can't be chosen through a tampered form", async () => {
			const { page } = app;
			const before = await snapshot(completed.id);
			await page.evaluate(() =>
				document
					.querySelector<HTMLSelectElement>('select[name^="status"]')!
					.add(new Option("Invoiced", "invoiced")),
			);
			await page.getByLabel("Status").selectOption("invoiced");
			await app.submit(page.getByRole("button", { name: "Save order" }));
			expect(await app.issues()).not.toEqual([]);
			expect(app.path()).toBe(`/orders/${completed.number}/edit`);
			expect(await snapshot(completed.id)).toEqual(before);
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
		expect(await shownNumbers()).toEqual(expected.slice(0, 20).map((row) => row.number));
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
		await page.locator('[data-slot="popover-trigger"]', { hasText: "Customer" }).click();
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

		const issues = await app.issues();
		expect(issues).toContainEqual(expect.stringMatching(/Unknown customer/));
		expect(issues).toContainEqual(expect.stringMatching(/Unknown material/));
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

		// From South's stock.
		const [movement] = await orderMovements(expected, south.id);
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
		// South has no modules, so nothing adjusts the price.
		expect(await table.locator("tbody tr").filter({ hasText: "Covered by" }).count()).toBe(0);

		await app.go("/orders");
		await page.getByLabel("Search orders…").fill(shared);
		await app.tableSettled();
		await expect.poll(() => app.rowCount()).toBe(1);
		const row = page.locator('[data-slot="data-table"] tbody tr').first();
		expect(cents(await row.locator("td:nth-last-child(2)").innerText())).toBe(total);
	});
});

describe("in Dutch", () => {
	/** Sets the language as the language switchers do: Paraglide's cookie. */
	const speak = (locale: "en" | "nl") =>
		app.page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: locale, url: baseURL }]);

	test("the orders list is in Dutch", async () => {
		const { page } = app;
		await speak("nl");
		await app.go("/orders");
		await page.getByRole("heading", { name: "Opdrachten" }).waitFor();
		expect(await page.title()).toBe("Opdrachten");
		expect(await page.getByRole("link", { name: "Nieuwe opdracht" }).count()).toBe(1);
		expect(await page.getByPlaceholder("Opdrachten zoeken…").count()).toBe(1);
		for (const name of ["Klant", "Apparaat", "Prioriteit", "Monteur"]) {
			expect(await page.getByRole("columnheader", { name }).count(), name).toBe(1);
		}
	});

	test("an order's page is in Dutch", async () => {
		const { page } = app;
		await app.go(`/orders/${shared}`);
		expect(await page.title()).toBe(`${shared} · Opdrachten`);
		const main = await page.locator("main").innerText();
		for (const text of ["Materialen en arbeid", "Arbeid", "Totaal", "Planning", "Aangemaakt"]) {
			expect(main, text).toContain(text);
		}
	});

	test("the order form's validation is in Dutch", async () => {
		const { page } = app;
		await app.go("/orders/new");
		await app.submit(page.getByRole("button", { name: "Opdracht aanmaken" }));
		expect(await app.issues()).toEqual(
			expect.arrayContaining(["Kies een klant", "Omschrijf het werk"]),
		);
	});

	test("switching back to English", async () => {
		await speak("en");
		await app.go("/orders");
		await app.page.getByRole("heading", { name: "Orders" }).waitFor();
		expect(await app.page.title()).toBe("Orders");
	});
});
