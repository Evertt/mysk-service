import { describe, expect, test } from "vite-plus/test";

import { formatCents, formatNumber } from "../src/lib/format.ts";
import {
	countIn,
	nextCode,
	organizations,
	rows,
	unbalancedStock,
	useApp,
	users,
	value,
} from "./app.ts";

const { north, south } = organizations;
const app = useApp();

interface Material {
	id: number;
	organization_id: string;
	sku: string;
	name: string;
	unit: string;
	unit_price: number;
	stock: number;
}

/** A material as stored, by SKU in an organization. */
const material = async (sku: string, organizationId: string) =>
	(
		await rows<Material>(`select * from material where sku = ? and organization_id = ?`, [
			sku,
			organizationId,
		])
	)[0];
/** A material as stored, by id, to check that a refused request changed nothing. */
const snapshot = (id: number) => rows(`select * from material where id = ?`, [id]);
/** The number of orders that use a material. */
const ordersUsing = async (id: number) =>
	Number(
		await value(`select count(distinct order_id) from order_line where material_id = ?`, [id]),
	);
/** The number of orders using a material that hold stock: not quotes, nor cancelled orders. */
const ordersHolding = async (id: number) =>
	Number(
		await value(
			`select count(distinct l.order_id) from order_line l join "order" o on o.id = l.order_id
			 where l.material_id = ? and o.status not in ('quote', 'cancelled')`,
			[id],
		),
	);

interface Movement {
	kind: string;
	quantity: number;
	note: string | null;
	order_number: string | null;
	user: string | null;
}

/** A material's stock movements as stored, newest first. */
const movements = (materialId: number) =>
	rows<Movement>(
		`select s.kind, s.quantity, s.note, s.order_number, u.email as user
		 from stock_movement s left join user u on u.id = s.user_id
		 where s.material_id = ? order by s.created_at desc, s.id desc`,
		[materialId],
	);

/** The rows of the stock history on a material's page, as text. */
const history = async () =>
	(
		await app.page
			.locator('[data-slot="card"]', { hasText: "Stock history" })
			.locator("tbody tr")
			.allInnerTexts()
	).map((row) => row.replace(/\s+/g, " "));

/** Opens one of the stock dialogs on a material's page. */
async function openDialog(button: "Receive stock" | "Count / adjust") {
	await app.page.getByRole("button", { name: button }).click();
	const dialog = app.page.getByRole("dialog");
	await dialog.waitFor();
	return dialog;
}

const testName = "Test gasket (materials check)";

/** The names in the table, in order. */
const names = () => app.page.locator("tbody td a").allInnerTexts();
const tableRows = () => app.page.locator("tbody tr");
const search = () => app.page.getByLabel("Search materials…");
const main = async () => (await app.page.locator("main").innerText()).replace(/\s+/g, " ");

/** Opens a faceted filter and ticks options. */
async function filter(title: string, ...options: RegExp[]) {
	const { page } = app;
	await page.locator('[data-slot="popover-trigger"]', { hasText: title }).click();
	for (const option of options) await page.getByRole("option", { name: option }).click();
	await page.keyboard.press("Escape");
}

/** Sorts the table by a column through its header menu. */
async function sortBy(column: string, direction: "Ascending" | "Descending") {
	const { page } = app;
	await page.locator("thead").getByRole("button", { name: column }).click();
	await page.getByRole("menuitem", { name: direction }).click();
}

/** Checks that searching the list for MAT-0001 shows the organization's price and usage. */
async function expectFirstMaterial(organizationId: string) {
	const first = await material("MAT-0001", organizationId);
	await search().fill("MAT-0001");
	const text = (await tableRows().allInnerTexts()).map((row) => row.replace(/\s+/g, " "));
	expect(text).toHaveLength(1);
	expect(text[0]).toContain(first.name);
	expect(text[0]).toContain(formatCents(first.unit_price));
	const used = await ordersUsing(first.id);
	expect(text[0]).toContain(`${used} ${used === 1 ? "order" : "orders"}`);
	await app.page.getByRole("button", { name: "Reset" }).click();
}

describe("in North", () => {
	let busy: Material;
	let sku: string;

	test("every material's stock is the sum of its movements", async () => {
		expect(await unbalancedStock(north.id)).toEqual([]);
		// An opening balance per material, and the lines of orders that hold stock.
		expect(await countIn("stock_movement", north.id)).toBeGreaterThan(
			Number(
				await value(
					`select count(*) from order_line l join "order" o on o.id = l.order_id
					 where l.organization_id = ? and o.status not in ('quote', 'cancelled')`,
					[north.id],
				),
			),
		);
	});

	test("the list shows North's materials by name, 20 per page", async () => {
		await app.go("/materials");
		const total = await countIn("material", north.id);
		expect(await app.rowCount()).toBe(total);
		const shown = await names();
		expect(shown).toHaveLength(Math.min(20, total));
		expect(shown).toEqual(shown.toSorted((a, b) => a.localeCompare(b)));
		await expectFirstMaterial(north.id);
	});

	test("the list pages", async () => {
		const { page } = app;
		const total = await countIn("material", north.id);
		const pages = Math.ceil(total / 20);
		expect(await page.getByText(`Page 1 of ${pages}`).count()).toBe(1);
		await page.getByRole("button", { name: "Go to next page" }).click();
		expect(await page.getByText(`Page 2 of ${pages}`).count()).toBe(1);
		expect(await tableRows().count()).toBe(Math.min(20, total - 20));
		await page.getByRole("button", { name: "Go to previous page" }).click();
	});

	test("searching finds materials by SKU and by name", async () => {
		const { page } = app;
		const third = await material("MAT-0003", north.id);
		await search().fill("MAT-0003");
		expect(await names()).toEqual([third.name]);

		await search().fill("refrigerant");
		const refrigerants = await rows<{ name: string }>(
			`select name from material where organization_id = ? and name like '%refrigerant%' order by name`,
			[north.id],
		);
		expect(refrigerants.length).toBeGreaterThan(0);
		expect((await names()).toSorted()).toEqual(refrigerants.map((row) => row.name).toSorted());
		await page.getByRole("button", { name: "Reset" }).click();
	});

	test("filtering by unit shows only those", async () => {
		await filter("Unit", /Litres/);
		const litres = Number(
			await value(`select count(*) from material where organization_id = ? and unit = 'l'`, [
				north.id,
			]),
		);
		expect(litres).toBeGreaterThan(0);
		expect(await app.rowCount()).toBe(litres);
		for (const row of await tableRows().allInnerTexts()) expect(row).toContain("Litres");
		await app.page.getByRole("button", { name: "Reset" }).click();
	});

	test("filtering by stock level shows the low and out of stock ones", async () => {
		await filter("Stock level", /Out of stock/, /^Low/);
		const low = Number(
			await value(
				`select count(*) from material where organization_id = ?
				 and stock < case unit when 'pcs' then 10 else 50 end`,
				[north.id],
			),
		);
		expect(await app.rowCount()).toBe(low);
		for (const row of await tableRows().allInnerTexts()) {
			expect(row).toMatch(/Out of stock|Low/);
		}
		await app.page.getByRole("button", { name: "Reset" }).click();
	});

	test("the dashboard counts the low and out of stock ones, and links to them", async () => {
		const { page } = app;
		const low = Number(
			await value(
				`select count(*) from material where organization_id = ?
				 and stock < case unit when 'pcs' then 10 else 50 end`,
				[north.id],
			),
		);
		expect(low).toBeGreaterThan(0);
		await app.go("/");
		const card = page.locator('[data-slot="card"]', { hasText: "Low stock" });
		expect(await card.locator('[data-slot="card-title"]').innerText()).toBe(String(low));
		await card.getByRole("link", { name: "View" }).click();
		await page.waitForURL(
			(url) => url.pathname === "/materials" && url.search === "?stock=out,low",
		);
		await page.waitForLoadState("networkidle");
		expect(await app.rowCount()).toBe(low);
		for (const row of await tableRows().allInnerTexts()) {
			expect(row).toMatch(/Out of stock|Low/);
		}
		await page.getByRole("button", { name: "Reset" }).click();
		expect(await app.rowCount()).toBe(await countIn("material", north.id));
	});

	test("the list keeps its sorting, page and filters in the URL, through reloads and back", async () => {
		const { page } = app;
		const total = await countIn("material", north.id);
		const priced = await rows<{ name: string; unit: string }>(
			`select name, unit from material where organization_id = ? order by unit_price desc, name`,
			[north.id],
		);
		expect(total).toBeGreaterThan(20);
		const search = () => new URL(page.url()).search;
		const pageOf = (pages: number) => page.getByText(new RegExp(`^Page \\d+ of ${pages}$`));

		await app.go("/materials");
		await sortBy("Unit price", "Descending");
		await page.waitForURL(() => search() === "?sort=-price");
		const first = await names();
		await page.getByRole("button", { name: "Go to next page" }).click();
		await page.waitForURL(() => search() === "?sort=-price&page=2");
		const second = await names();
		expect(second).toHaveLength(Math.min(20, total - 20));

		// A reload shows the same page, already when rendered on the server.
		const html = await (await page.request.get(page.url())).text();
		expect(html).toContain(`Page 2 of ${Math.ceil(total / 20)}`);
		await page.reload();
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		expect(await names()).toEqual(second);
		expect(await pageOf(Math.ceil(total / 20)).innerText()).toBe(
			`Page 2 of ${Math.ceil(total / 20)}`,
		);

		// Filtering goes back to the first page.
		await filter("Unit", /Litres/);
		await page.waitForURL(() => search() === "?unit=l&sort=-price");
		// Each choice is a step back.
		await filter("Unit", /Kilograms/);
		await page.waitForURL(() => search() === "?unit=l,kg&sort=-price");
		const litresAndKilos = priced.filter((row) => ["l", "kg"].includes(row.unit));
		expect(await app.rowCount()).toBe(litresAndKilos.length);
		expect((await names()).toSorted()).toEqual(litresAndKilos.map((row) => row.name).toSorted());

		// Shift-click adds a column to the sort.
		await page
			.locator("thead")
			.getByRole("button", { name: /^Material/ })
			.click({ modifiers: ["Shift"] });
		await page.waitForURL(() => search() === "?unit=l,kg&sort=-price,name");
		await expect.poll(() => page.locator("thead").innerText()).toMatch(/Unit price\s*1/);

		// Back and forward retrace the steps.
		await page.goBack();
		await page.waitForURL(() => search() === "?unit=l,kg&sort=-price");
		await page.goBack();
		await page.waitForURL(() => search() === "?unit=l&sort=-price");
		await page.goBack();
		await page.waitForURL(() => search() === "?sort=-price&page=2");
		await expect.poll(names).toEqual(second);
		expect(
			await page.locator('[data-slot="popover-trigger"]', { hasText: "Unit" }).innerText(),
		).toBe("Unit");
		await page.goBack();
		await page.waitForURL(() => search() === "?sort=-price");
		await expect.poll(names).toEqual(first);
		await page.goForward();
		await page.waitForURL(() => search() === "?sort=-price&page=2");
		await expect.poll(names).toEqual(second);

		// A link with the state in it opens the list that way; unknown values are ignored.
		await app.go("/materials?unit=pcs,bogus&sort=name&size=50&q=filter");
		const filters = priced
			.filter((row) => row.unit === "pcs" && /filter/i.test(row.name))
			.map((row) => row.name)
			.toSorted((a, b) => a.localeCompare(b));
		expect(filters.length).toBeGreaterThan(0);
		expect(await names()).toEqual(filters);
		expect(search()).toBe("?unit=pcs,bogus&sort=name&size=50&q=filter");
		expect(await page.getByLabel("Search materials…").inputValue()).toBe("filter");
		expect(await page.getByRole("button", { name: "Rows per page" }).innerText()).toBe("50");

		await app.go("/materials");
	});

	test("sorting by unit price puts the most expensive first", async () => {
		await sortBy("Unit price", "Descending");
		const prices = (await tableRows().allInnerTexts()).map((row) =>
			Number(/€([\d,]+\.\d\d)/.exec(row)![1].replaceAll(",", "")),
		);
		expect(prices).toEqual(prices.toSorted((a, b) => b - a));
		const highest = await value<number>(
			`select max(unit_price) from material where organization_id = ?`,
			[north.id],
		);
		expect(prices[0]).toBe(highest / 100);
	});

	test("sorting by usage puts the busiest first, whose page lists its orders", async () => {
		const { page } = app;
		await sortBy("Used on", "Descending");
		const [most] = await rows<{ orders: number }>(
			`select count(distinct l.order_id) as orders from material m
			 join order_line l on l.material_id = m.id where m.organization_id = ?
			 group by m.id order by orders desc limit 1`,
			[north.id],
		);
		expect(await tableRows().first().innerText()).toContain(`${most.orders} orders`);

		await tableRows().first().locator("td a").click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await page.waitForLoadState("networkidle");
		busy = await material(app.path().split("/").pop()!, north.id);
		expect(await ordersUsing(busy.id)).toBe(most.orders);
		await page.getByRole("heading", { name: busy.name }).waitFor();
		const usage = page.locator("table").first().locator("tbody tr");
		expect(await usage.count()).toBe(most.orders);
		expect(await usage.first().locator('a[href^="/orders/"]').innerText()).toMatch(/^ORD-/);
	});

	test("its stock history lists every movement, newest first, with the orders", async () => {
		const stored = await movements(busy.id);
		const shown = await history();
		expect(shown).toHaveLength(stored.length);
		// The newest row ends at the current stock; the oldest is the opening balance.
		expect(shown[0]).toContain(`${formatNumber(busy.stock)} ${busy.unit}`);
		expect(shown.at(-1)).toContain("Opening balance");
		const consumed = stored.filter((m) => m.kind === "consumption");
		expect(consumed.length).toBeGreaterThanOrEqual(await ordersHolding(busy.id));
		const card = app.page.locator('[data-slot="card"]', { hasText: "Stock history" });
		expect(await card.locator('a[href^="/orders/"]').count()).toBe(consumed.length);
	});

	test("a material that's used on orders can't be deleted", async () => {
		const { page } = app;
		const before = await snapshot(busy.id);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Delete" }));
		expect(await dialog.locator('[data-slot="field-error"]').innerText()).toContain(
			`This material is used on ${await ordersUsing(busy.id)} orders`,
		);
		expect(app.path()).toBe(`/materials/${busy.sku}`);
		expect(await snapshot(busy.id)).toEqual(before);
		await page.keyboard.press("Escape");
	});

	test("nor can its unit change", async () => {
		const { page } = app;
		const before = await snapshot(busy.id);
		await app.go(`/materials/${busy.sku}/edit`);
		const unit = page.getByLabel("Unit", { exact: true });
		expect(await unit.inputValue()).toBe(busy.unit);
		await unit.selectOption(busy.unit === "kg" ? "l" : "kg");
		await app.submit(page.getByRole("button", { name: "Save material" }));
		expect(await app.issues()).toContainEqual(
			`Can't change the unit: ${await ordersUsing(busy.id)} orders count this material in ${busy.unit}`,
		);
		expect(app.path()).toBe(`/materials/${busy.sku}/edit`);
		expect(await snapshot(busy.id)).toEqual(before);
	});

	test("creating a material validates it first", async () => {
		const { page } = app;
		const before = await countIn("material", north.id);
		await app.go("/materials/new");
		await page.getByLabel("Unit price").fill("");
		await page.getByLabel("Opening stock").fill("-3");
		// The browser's own checks stop the form first.
		await page.getByRole("button", { name: "Create material" }).click();
		expect(await page.locator("form :invalid").count()).toBeGreaterThan(0);
		expect(app.path()).toBe("/materials/new");

		// Without them, the server's.
		await page
			.locator("form")
			.last()
			.evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await page.getByLabel("Name", { exact: true }).fill("   ");
		await app.submit(page.getByRole("button", { name: "Create material" }));
		expect((await app.issues()).toSorted()).toEqual(
			["Can't be negative", "Enter a price", "Name the material"].toSorted(),
		);
		expect(app.path()).toBe("/materials/new");
		expect(await countIn("material", north.id)).toBe(before);
	});

	test("a name that's taken (in any case) is refused", async () => {
		const { page } = app;
		const before = await countIn("material", north.id);
		await page.getByLabel("Name", { exact: true }).fill(busy.name.toUpperCase());
		await page.getByLabel("Unit price").fill("12.5");
		await page.getByLabel("Opening stock").fill("4");
		await app.submit(page.getByRole("button", { name: "Create material" }));
		expect(await app.issues()).toEqual([`${busy.sku} already has this name`]);
		expect(await countIn("material", north.id)).toBe(before);
	});

	test("a new material gets the next SKU", async () => {
		const { page } = app;
		await page.getByLabel("Name", { exact: true }).fill(testName);
		await page.getByLabel("Unit", { exact: true }).selectOption("pcs");
		const expected = await nextCode("material", "sku", north.id);
		await page.getByRole("button", { name: "Create material" }).click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await page.waitForLoadState("networkidle");
		sku = app.path().split("/").pop()!;
		expect(sku).toBe(expected);
		await app.toast("Material created");
		expect(await material(sku, north.id)).toMatchObject({
			name: testName,
			unit: "pcs",
			unit_price: 1250,
			stock: 4,
		});

		await page.getByRole("heading", { name: testName }).waitFor();
		const text = await main();
		expect(text).toContain("€12.50");
		expect(text).toContain("4 pcs");
		expect(text).toContain("Low");
		expect(text).toContain("Not used yet");

		// The stock it starts with is its opening balance, by whoever created it.
		const { id } = await material(sku, north.id);
		expect(await movements(id)).toEqual([
			{ kind: "opening_balance", quantity: 4, note: null, order_number: null, user: users.admin },
		]);
		expect(await history()).toEqual([expect.stringMatching(/Opening balance \+4 pcs 4 pcs Avery/)]);
	});

	test("editing it saves the changes, including the unit while it's unused, but not the stock", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await page.waitForLoadState("networkidle");
		expect(await page.getByLabel("Name", { exact: true }).inputValue()).toBe(testName);
		expect(await page.getByLabel("Unit", { exact: true }).inputValue()).toBe("pcs");
		expect(Number(await page.getByLabel("Unit price").inputValue())).toBe(12.5);
		expect(await page.getByLabel(/stock/i).count()).toBe(0);

		await page.getByLabel("Unit", { exact: true }).selectOption("m");
		await page.getByLabel("Unit price").fill("3.99");
		await page.getByRole("button", { name: "Save material" }).click();
		await page.waitForURL((url) => url.pathname === `/materials/${sku}`);
		await page.waitForLoadState("networkidle");
		await app.toast("Material saved");
		expect(await material(sku, north.id)).toMatchObject({ unit: "m", unit_price: 399, stock: 4 });
		const text = await main();
		expect(text).toContain("€3.99");
		expect(text).toContain("4 m");
		expect(text).toContain("Low");
	});

	test("receiving stock adds it, with a note", async () => {
		const { page } = app;
		const { id } = await material(sku, north.id);
		const dialog = await openDialog("Receive stock");
		await dialog.getByLabel(/^Quantity/).fill("8.75");
		await dialog.getByLabel("Note").fill("Delivery 1234");
		await app.submit(dialog.getByRole("button", { name: "Receive" }));
		await app.toast("Stock received");
		await dialog.waitFor({ state: "hidden" });
		expect(await material(sku, north.id)).toMatchObject({ stock: 12.75 });
		expect((await movements(id))[0]).toEqual({
			kind: "receipt",
			quantity: 8.75,
			note: "Delivery 1234",
			order_number: null,
			user: users.admin,
		});
		await page.getByText("12.75 m").first().waitFor();
		expect((await history())[0]).toMatch(/Received Delivery 1234 \+8\.75 m 12\.75 m Avery Admin/);
	});

	test("receiving needs a quantity", async () => {
		const { id } = await material(sku, north.id);
		const before = await movements(id);
		const dialog = await openDialog("Receive stock");
		await dialog.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await dialog.getByLabel(/^Quantity/).fill("0");
		await app.submit(dialog.getByRole("button", { name: "Receive" }));
		expect(await dialog.locator('[data-slot="field-error"]').allInnerTexts()).toEqual([
			"More than 0",
		]);
		expect(await movements(id)).toEqual(before);
		await app.page.keyboard.press("Escape");
		await dialog.waitFor({ state: "hidden" });
	});

	test("a count records the difference as an adjustment, with the reason", async () => {
		const { page } = app;
		const { id } = await material(sku, north.id);
		const dialog = await openDialog("Count / adjust");
		const counted = dialog.getByLabel(/^Counted/);
		expect(await counted.inputValue()).toBe("12.75");

		// A reason is required, and a count that matches changes nothing.
		await dialog.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await app.submit(dialog.getByRole("button", { name: "Adjust stock" }));
		expect(await dialog.locator('[data-slot="field-error"]').allInnerTexts()).toEqual([
			"Say why the stock differs",
		]);
		await dialog.getByLabel("Reason").fill("Yearly count");
		await app.submit(dialog.getByRole("button", { name: "Adjust stock" }));
		expect(await dialog.locator('[data-slot="field-error"]').allInnerTexts()).toEqual([
			"That's the stock already",
		]);
		expect(await movements(id)).toHaveLength(2);

		await counted.fill("10");
		await dialog.getByText("Records −2.75 m.").waitFor();
		await app.submit(dialog.getByRole("button", { name: "Adjust stock" }));
		await app.toast("Stock adjusted");
		expect(await material(sku, north.id)).toMatchObject({ stock: 10 });
		expect((await movements(id))[0]).toEqual({
			kind: "adjustment",
			quantity: -2.75,
			note: "Yearly count",
			order_number: null,
			user: users.admin,
		});
		await page.getByText("−2.75 m").first().waitFor();
		expect(await history()).toEqual([
			expect.stringMatching(/Count adjustment Yearly count −2\.75 m 10 m Avery Admin/),
			expect.stringMatching(/Received .* \+8\.75 m 12\.75 m/),
			expect.stringMatching(/Opening balance \+4 m 4 m/),
		]);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("counting nothing left is fine, but never below zero", async () => {
		const { id } = await material(sku, north.id);
		const dialog = await openDialog("Count / adjust");
		await dialog.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await dialog.getByLabel(/^Counted/).fill("-1");
		await dialog.getByLabel("Reason").fill("Lost");
		await app.submit(dialog.getByRole("button", { name: "Adjust stock" }));
		expect(await dialog.locator('[data-slot="field-error"]').allInnerTexts()).toEqual([
			"Can't be negative",
		]);
		expect(await movements(id)).toHaveLength(3);

		await dialog.getByLabel(/^Counted/).fill("0");
		await app.submit(dialog.getByRole("button", { name: "Adjust stock" }));
		await app.toast("Stock adjusted");
		expect(await material(sku, north.id)).toMatchObject({ stock: 0 });
		await app.page.getByText("Out of stock").first().waitFor();
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("pieces are only received whole, and a history in part pieces keeps its unit", async () => {
		const { page } = app;

		// The history has 8.75 m, which isn't whole pieces.
		await app.go(`/materials/${sku}/edit`);
		await page.getByLabel("Unit", { exact: true }).selectOption("pcs");
		await app.submit(page.getByRole("button", { name: "Save material" }));
		expect(await app.issues()).toEqual(["Whole pieces only: the stock history has part pieces"]);
		expect(await material(sku, north.id)).toMatchObject({ unit: "m", stock: 0 });

		// A material in pieces takes whole ones only.
		const pieces = await material("MAT-0004", north.id);
		expect(pieces.unit).toBe("pcs");
		const before = await movements(pieces.id);
		await app.go("/materials/MAT-0004");
		const dialog = await openDialog("Receive stock");
		expect(await dialog.getByLabel(/^Quantity/).getAttribute("step")).toBe("1");
		// Past the browser's own check of the step, to see the app's.
		await dialog.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await dialog.getByLabel(/^Quantity/).fill("1.5");
		await app.submit(dialog.getByRole("button", { name: "Receive" }));
		expect(await dialog.locator('[data-slot="field-error"]').allInnerTexts()).toEqual([
			"Whole pieces only",
		]);
		expect(await material("MAT-0004", north.id)).toEqual(pieces);
		expect(await movements(pieces.id)).toEqual(before);
		await page.keyboard.press("Escape");
	});

	test("an unknown SKU is a 404", async () => {
		expect((await app.go("/materials/MAT-9999"))?.status()).toBe(404);
		expect((await app.go("/materials/MAT-9999/edit"))?.status()).toBe(404);
	});
});

describe("in South", () => {
	/** The material created in North, which South doesn't have. */
	let northOnly: Material;

	test("switching organization shows South's materials", async () => {
		[northOnly] = await rows<Material>(
			`select * from material where name = ? and organization_id = ?`,
			[testName, north.id],
		);
		await app.switchOrganization(south.name);
		await app.go("/materials");
		expect(await app.rowCount()).toBe(await countIn("material", south.id));
		await expectFirstMaterial(south.id);
	});

	test("North's own SKU is a 404", async () => {
		expect(northOnly.name).toBe(testName);
		expect(await material(northOnly.sku, south.id)).toBeUndefined();
		expect((await app.go(`/materials/${northOnly.sku}`))?.status()).toBe(404);
		expect((await app.go(`/materials/${northOnly.sku}/edit`))?.status()).toBe(404);
	});

	test("a SKU both have shows South's material", async () => {
		const { page } = app;
		const own = await material("MAT-0001", south.id);
		const other = await material("MAT-0001", north.id);
		expect(own.unit_price).not.toBe(other.unit_price);
		await app.go("/materials/MAT-0001");
		const text = await main();
		expect(text).toContain(formatCents(own.unit_price));
		expect(text).not.toContain(formatCents(other.unit_price));
		expect(await page.locator("table").first().locator("tbody tr").count()).toBe(
			await ordersUsing(own.id),
		);
		// Its stock history is South's own.
		const shown = await history();
		expect(shown).toHaveLength((await movements(own.id)).length);
		expect(shown[0]).toContain(`${formatNumber(own.stock)} ${own.unit}`);
	});

	test("receiving or counting stock with the id of a North material is refused", async () => {
		const { page } = app;
		const own = await material("MAT-0001", south.id);
		const [victimBefore, ownBefore] = [await snapshot(northOnly.id), await snapshot(own.id)];
		const [victimMovements, ownMovements] = [
			await movements(northOnly.id),
			await movements(own.id),
		];

		for (const [button, fill] of [
			["Receive stock", { label: /^Quantity/, value: "5" }],
			["Count / adjust", { label: /^Counted/, value: "999" }],
		] as const) {
			// A refused request shows the error page.
			await app.go("/materials/MAT-0001");
			const dialog = await openDialog(button);
			await dialog.getByLabel(fill.label).fill(fill.value);
			if (button === "Count / adjust") await dialog.getByLabel("Reason").fill("Tampered");
			const result = await app.expectingErrors(async () => {
				await page.evaluate((id) => {
					document.querySelector<HTMLInputElement>('[role="dialog"] input[name^="id"]')!.value =
						String(id);
				}, northOnly.id);
				return app.submit(dialog.locator('button[type="submit"]'));
			});
			expect(result).toMatch(/"status":404/);
		}
		expect(app.path()).toBe("/materials/MAT-0001");
		expect(await snapshot(northOnly.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
		expect(await movements(northOnly.id)).toEqual(victimMovements);
		expect(await movements(own.id)).toEqual(ownMovements);
	});

	test("saving with the id of a North material is refused", async () => {
		const { page } = app;
		const own = await material("MAT-0002", south.id);
		const [victimBefore, ownBefore] = [await snapshot(northOnly.id), await snapshot(own.id)];

		await app.go("/materials/MAT-0002/edit");
		await page.getByLabel("Name", { exact: true }).fill("Tampered name");
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('form input[type="hidden"][name^="id"]')!.value =
					String(id);
			}, northOnly.id);
			return app.submit(page.getByRole("button", { name: "Save material" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe("/materials/MAT-0002/edit");
		expect(await snapshot(northOnly.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});

	test("deleting with the id of a North material is refused", async () => {
		const { page } = app;
		const own = await material("MAT-0001", south.id);
		const [victimBefore, ownBefore] = [await snapshot(northOnly.id), await snapshot(own.id)];

		await app.go("/materials/MAT-0001");
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id"]')!.value =
					String(id);
			}, northOnly.id);
			return app.submit(dialog.getByRole("button", { name: "Delete" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe("/materials/MAT-0001");
		expect(await snapshot(northOnly.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});

	test("a new material gets South's next SKU, and may use a name only North has", async () => {
		const { page } = app;
		const expected = await nextCode("material", "sku", south.id);
		await app.go("/materials/new");
		await page.getByLabel("Name", { exact: true }).fill(testName);
		await page.getByLabel("Unit", { exact: true }).selectOption("pcs");
		await page.getByLabel("Unit price").fill("8.25");
		await page.getByLabel("Opening stock").fill("12");
		await page.getByRole("button", { name: "Create material" }).click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await page.waitForLoadState("networkidle");
		expect(app.path()).toBe(`/materials/${expected}`);
		expect(await material(expected, south.id)).toMatchObject({
			name: testName,
			unit_price: 825,
			stock: 12,
		});
		await page.getByRole("heading", { name: testName }).waitFor();
		const text = await main();
		expect(text).toContain("€8.25");
		expect(text).toContain("12 pcs");
	});

	test("deleting it removes only South's, after which it's a 404", async () => {
		const { page } = app;
		const deleted = app.path().split("/").pop()!;
		const { id } = await material(deleted, south.id);
		expect(await movements(id)).toHaveLength(1);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/materials");
		expect(await material(deleted, south.id)).toBeUndefined();
		// Its stock history goes with it.
		expect(await movements(id)).toEqual([]);
		expect(await snapshot(northOnly.id)).toHaveLength(1);
		expect((await app.go(`/materials/${deleted}`))?.status()).toBe(404);
		expect(await unbalancedStock(south.id)).toEqual([]);
	});
});
