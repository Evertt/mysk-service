/**
 * The materials' pages: the list, the dashboard's tile, a material's page with its usage and stock
 * history, the material form and the stock dialogs, and South's own materials, with North's a 404
 * and one tampered form. What the list returns and what the remote functions store, refuse and log
 * (also for South with North's ids) is `tests/unit/server/list.spec.ts`'s and `materials.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	afresh,
	countIn,
	nextCode,
	organizations,
	rows,
	useApp,
	userNames,
	value,
	quiet,
} from "#e2e/app.ts";
import { formatCents, formatNumber } from "#lib/i18n/format.ts";

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

/** Checks that searching the list for MAT-0001 shows the organization's price and usage. */
async function expectFirstMaterial(organizationId: string) {
	const first = await material("MAT-0001", organizationId);
	await search().fill("MAT-0001");
	await app.tableSettled();
	const text = (await tableRows().allInnerTexts()).map((row) => row.replace(/\s+/g, " "));
	expect(text).toHaveLength(1);
	expect(text[0]).toContain(first.name);
	expect(text[0]).toContain(formatCents(first.unit_price));
	const used = await ordersUsing(first.id);
	expect(text[0]).toContain(`${used} ${used === 1 ? "order" : "orders"}`);
	await app.page.getByRole("button", { name: "Reset" }).click();
	await app.tableSettled();
}

describe("in North", () => {
	let busy: Material;
	let sku: string;

	test("the list shows North's materials by name, 50 at a time as it scrolls", async () => {
		await app.go(afresh("/materials"));
		const total = await countIn("material", north.id);
		expect(await app.rowCount()).toBe(total);
		const shown = await names();
		expect(shown).toHaveLength(Math.min(50, total));
		expect(shown).toEqual(shown.toSorted((a, b) => a.localeCompare(b)));
		await expectFirstMaterial(north.id);
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
		const card = page.locator("[data-stat-tile]", { hasText: "Low stock" });
		expect(await card.locator("[data-stat-value]").innerText()).toBe(String(low));
		await card.getByRole("link", { name: "View" }).click();
		await page.waitForURL(
			(url) => url.pathname === "/materials" && url.search === "?stock=out,low",
		);
		await quiet(page);
		expect(await app.rowCount()).toBe(low);
		for (const row of await tableRows().allInnerTexts()) {
			expect(row).toMatch(/Out of stock|Low/);
		}
		await page.getByRole("button", { name: "Reset" }).click();
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await countIn("material", north.id));
	});

	test("sorting by usage puts the busiest first, whose page lists its orders", async () => {
		const { page } = app;
		await app.sortBy("Used on", "descending");
		const [most] = await rows<{ orders: number }>(
			`select count(distinct l.order_id) as orders from material m
			 join order_line l on l.material_id = m.id where m.organization_id = ?
			 group by m.id order by orders desc limit 1`,
			[north.id],
		);
		expect(await tableRows().first().innerText()).toContain(`${most.orders} orders`);

		await tableRows().first().locator("td a").click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await quiet(page);
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

	test("a new material gets the next SKU", async () => {
		const { page } = app;
		await app.go("/materials/new");
		await page.getByLabel("Name", { exact: true }).fill(testName);
		await page.getByLabel("Unit", { exact: true }).selectOption("pcs");
		await page.getByLabel("Unit price").fill("12.5");
		await page.getByLabel("Opening stock").fill("4");
		const expected = await nextCode("material", "sku", north.id);
		await page.getByRole("button", { name: "Create material" }).click();
		await page.waitForURL(/\/materials\/MAT-\d{4}$/);
		await quiet(page);
		sku = app.path().split("/").pop()!;
		expect(sku).toBe(expected);
		await app.toast("Material created");

		await page.getByRole("heading", { name: testName }).waitFor();
		const text = await main();
		expect(text).toContain("€12.50");
		expect(text).toContain("4 pcs");
		expect(text).toContain("Low");
		expect(text).toContain("Not used yet");

		// The stock it starts with is its opening balance, by whoever created it.
		expect(await history()).toEqual([
			expect.stringMatching(new RegExp(`Opening balance \\+4 pcs 4 pcs ${userNames.admin}`)),
		]);
	});

	test("editing it saves the changes, including the unit while it's unused, but not the stock", async () => {
		const { page } = app;
		await page.getByRole("link", { name: "Edit" }).click();
		await page.waitForURL(/\/edit$/);
		await quiet(page);
		expect(await page.getByLabel("Name", { exact: true }).inputValue()).toBe(testName);
		expect(await page.getByLabel("Unit", { exact: true }).inputValue()).toBe("pcs");
		expect(Number(await page.getByLabel("Unit price").inputValue())).toBe(12.5);
		expect(await page.getByLabel(/stock/i).count()).toBe(0);

		await page.getByLabel("Unit", { exact: true }).selectOption("m");
		await page.getByLabel("Unit price").fill("3.99");
		await page.getByRole("button", { name: "Save material" }).click();
		await page.waitForURL((url) => url.pathname === `/materials/${sku}`);
		await quiet(page);
		await app.toast("Material saved");
		// The redirect shows the cached material first and refreshes it right after.
		await expect.poll(main).toContain("€3.99");
		const text = await main();
		expect(text).toContain("4 m");
		expect(text).toContain("Low");
	});

	test("receiving stock adds it, with a note", async () => {
		const { page } = app;
		const dialog = await openDialog("Receive stock");
		await dialog.getByLabel(/^Quantity/).fill("8.75");
		await dialog.getByLabel("Note").fill("Delivery 1234");
		await app.submit(dialog.getByRole("button", { name: "Receive" }));
		await app.toast("Stock received");
		await dialog.waitFor({ state: "hidden" });
		await page.getByText("12.75 m").first().waitFor();
		expect((await history())[0]).toMatch(
			new RegExp(`Received Delivery 1234 \\+8\\.75 m 12\\.75 m ${userNames.admin}`),
		);
	});

	test("a count records the difference as an adjustment, with the reason", async () => {
		const { page } = app;
		const dialog = await openDialog("Count / adjust");
		const counted = dialog.getByLabel(/^Counted/);
		expect(await counted.inputValue()).toBe("12.75");
		await dialog.getByLabel("Reason").fill("Yearly count");
		await counted.fill("10");
		await dialog.getByText("Records −2.75 m.").waitFor();
		await app.submit(dialog.getByRole("button", { name: "Adjust stock" }));
		await app.toast("Stock adjusted");
		await page.getByText("−2.75 m").first().waitFor();
		expect(await history()).toEqual([
			expect.stringMatching(
				new RegExp(`Count adjustment Yearly count −2\\.75 m 10 m ${userNames.admin}`),
			),
			expect.stringMatching(/Received .* \+8\.75 m 12\.75 m/),
			expect.stringMatching(/Opening balance \+4 m 4 m/),
		]);
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
		await app.go(afresh("/materials"));
		expect(await app.rowCount()).toBe(await countIn("material", south.id));
		await expectFirstMaterial(south.id);
	});

	test("North's own SKU is a 404", async () => {
		expect(northOnly.name).toBe(testName);
		expect(await material(northOnly.sku, south.id)).toBeUndefined();
		expect((await app.go(`/materials/${northOnly.sku}`))?.status()).toBe(404);
		expect((await app.go(`/materials/${northOnly.sku}/edit`))?.status()).toBe(404);
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
});
