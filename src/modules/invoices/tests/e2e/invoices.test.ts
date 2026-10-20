/**
 * Invoices' pages: an order's invoice card, the new invoice form, a draft's lines, issuing, paying
 * and voiding through their dialogs, the PDF, the activity card, South's page 404 and one tampered
 * form, and the module switched off. What the server decides (the lines and totals, the dates, the
 * orders' statuses, what's logged, the refusals, tenant isolation) is
 * `../unit/server/invoices.spec.ts`'s.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { baseURL, organizations, rows, useApp, userNames, value, quiet } from "#e2e/app.ts";
import { feesDue } from "#e2e/contracts-helpers.ts";

import { cents, pageLocators, vatOf } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { sidebar, card } = pageLocators(app);
const year = new Date().getFullYear();

/** An organization's next invoice number: `INV-<this year>-<highest sequence + 1>`. */
async function nextNumber(organizationId: string) {
	const last = await value<number | null>(
		`select max(cast(substr(number, 10) as integer)) from invoice where organization_id = ?`,
		[organizationId],
	);
	return `INV-${year}-${String((last ?? 0) + 1).padStart(5, "0")}`;
}

/** A customer's completed orders that aren't on an invoice that isn't void. */
const billable = `billable as (
	select o.* from "order" o where o.status = 'completed' and not exists (
		select 1 from invoice_line l join invoice i on i.id = l.invoice_id
		where l.order_id = o.id and i.status != 'void'
	)
)`;

const billableOrders = (customerId: number) =>
	rows<{ id: number; number: string }>(
		`with ${billable} select id, number from billable where customer_id = ? order by id`,
		[customerId],
	);

const invoiceId = (number: string, organizationId: string) =>
	value<number>(`select id from invoice where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]);

const linesOf = (invoiceId: number) =>
	rows<{ description: string; amount: number; order_id: number | null }>(
		`select description, amount, order_id from invoice_line where invoice_id = ? order by id`,
		[invoiceId],
	);

/** An invoice as stored, to check that a refused request changed nothing. */
const snapshot = async (id: number) => [
	await rows(`select * from invoice where id = ?`, [id]),
	await linesOf(id),
];

// --- The page ----------------------------------------------------------------------------------

const orderBoxes = () => app.page.locator('input[name^="orderIds"]');
const itemBoxes = () => app.page.locator('input[name^="items"]');
/** The checkboxes' values (only the checked ones with `checked`), sorted (numbers numerically). */
const values = async (boxes: ReturnType<typeof orderBoxes>, checked = false) =>
	(
		await boxes.evaluateAll(
			(inputs, checked) =>
				(inputs as HTMLInputElement[])
					.filter((input) => !checked || input.checked)
					.map((input) => input.value),
			checked,
		)
	).toSorted((a, b) => a.localeCompare(b, "en", { numeric: true }));
/** The invoice's subtotal, VAT and total as shown. */
const shownTotals = async () => {
	const amounts = await app.page
		.locator("main table")
		.first()
		.locator("tfoot tr")
		.evaluateAll((rows) => rows.map((row) => row.querySelectorAll("td")[1].textContent!));
	const [subtotal, vat, total] = amounts.map(cents);
	return { subtotal, vat, total };
};
/** The totals of `lines`, as the page should show them. */
const totalsOf = (lines: { amount: number }[]) => {
	const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
	return { subtotal, vat: vatOf(subtotal), total: subtotal + vatOf(subtotal) };
};
const badges = () => app.page.locator('h1 ~ [data-slot="badge"]').allInnerTexts();

/** Opens the confirmation of an action on the invoice's page and confirms it. */
async function confirm(action: string) {
	const { page } = app;
	await page.locator("main").getByRole("button", { name: action, exact: true }).first().click();
	const dialog = page.getByRole("alertdialog");
	await dialog.waitFor();
	const result = await app.submit(dialog.getByRole("button", { name: action }));
	await dialog.waitFor({ state: "detached" });
	return result;
}

/** Creates a draft for a customer from the new invoice page, with what's checked there. */
async function createDraft(organizationId: string) {
	const { page } = app;
	const expected = await nextNumber(organizationId);
	await page.getByRole("button", { name: "Create draft" }).click();
	await page.waitForURL((url) => url.pathname === `/invoices/${expected}`);
	await quiet(page);
	return expected;
}

// --- The data ----------------------------------------------------------------------------------

/** A North customer with an active contract and completed orders to bill. */
let customer: { id: number; code: string };
/** Another North customer with completed orders to bill. */
let other: { id: number; code: string };
/** A seeded North draft, for South to tamper with. */
let northDraft: { id: number; number: string };

beforeAll(async () => {
	[customer] = await rows<typeof customer>(
		`with ${billable} select c.id, c.code from customer c where c.organization_id = ?
		 and exists (select 1 from contract k where k.customer_id = c.id
			and k.starts_on <= date('now', 'localtime') and k.ends_on >= date('now', 'localtime'))
		 and (select count(*) from billable b where b.customer_id = c.id) >= 2
		 order by c.id limit 1`,
		[north.id],
	);
	[other] = await rows<typeof other>(
		`with ${billable} select c.id, c.code from customer c where c.organization_id = ? and c.id != ?
		 and exists (select 1 from billable b where b.customer_id = c.id) order by c.id limit 1`,
		[north.id, customer.id],
	);
	[northDraft] = await rows<typeof northDraft>(
		`select id, number from invoice where organization_id = ? and status = 'draft' order by id limit 1`,
		[north.id],
	);
});

describe("in North", () => {
	let number: string;
	/** The first order on it. */
	let first: string;

	test("an order that isn't invoiced offers a new invoice for its customer", async () => {
		const { page } = app;
		[{ number: first }] = await billableOrders(customer.id);
		await app.go(`/orders/${first}`);
		const invoice = card("Invoice");
		expect(await invoice.innerText()).toContain("Not invoiced yet");
		await invoice.getByRole("link", { name: "New invoice for this customer" }).click();
		await page.waitForURL((url) => url.pathname === "/invoices/new");
		await quiet(page);
		expect(new URL(page.url()).searchParams.get("customer")).toBe(customer.code);
	});

	test("the new invoice offers the customer's completed orders and this month's fees", async () => {
		const { page } = app;
		const orders = await billableOrders(customer.id);
		const fees = await feesDue(customer.id);
		expect(fees.length).toBeGreaterThan(0);
		expect(await page.getByLabel("Customer").inputValue()).toBe(String(customer.id));
		await expect.poll(() => values(orderBoxes(), true)).toEqual(orders.map((o) => String(o.id)));
		expect(await values(itemBoxes(), true)).toEqual(fees.map((f) => f.reference));
	});

	test("creating it opens the draft, with its totals, and its orders' cards say so", async () => {
		number = await createDraft(north.id);
		await app.toast("Draft invoice created");
		await expect.poll(badges).toEqual(["Draft"]);
		expect(await shownTotals()).toEqual(totalsOf(await linesOf(await invoiceId(number, north.id))));

		await app.go(`/orders/${first}`);
		expect(await card("Invoice").innerText()).toContain(`On draft invoice ${number}`);
		expect(await card("Invoice").locator('[data-slot="badge"]').allInnerTexts()).toEqual(["Draft"]);
	});

	test("a draft takes typed-in lines, and orders can come off and go back on", async () => {
		const { page } = app;
		await app.go(`/invoices/${number}`);
		const id = await invoiceId(number, north.id);

		await page.getByLabel("Description").fill("Call-out surcharge");
		await page.getByLabel("Quantity").fill("2");
		await page.getByLabel("Unit price").fill("37.50");
		await app.submit(page.getByRole("button", { name: "Add line" }));
		await app.toast("Line added");
		expect((await linesOf(id)).at(-1)).toMatchObject({
			description: "Call-out surcharge",
			amount: 7500,
		});

		// Removing an order's line takes it off; it's offered again, and goes back on.
		const firstOrder = (await linesOf(id))[0].order_id!;
		const row = page.locator("main table").first().locator("tbody tr").first();
		await app.submit(row.getByRole("button", { name: "Remove line" }));
		await expect.poll(() => values(orderBoxes())).toEqual([String(firstOrder)]);

		await orderBoxes().check();
		await app.submit(page.getByRole("button", { name: "Add to invoice" }));
		await app.toast("Added to the invoice");
		await expect.poll(() => orderBoxes().count()).toBe(0);
		await expect.poll(() => shownTotals()).toEqual(totalsOf(await linesOf(id)));
	});

	test("issuing it shows it sent, its lines fixed", async () => {
		await confirm("Issue");
		await app.toast("Invoice issued");
		await expect.poll(badges).toEqual(["Sent"]);
		expect(await app.page.getByRole("button", { name: "Remove line" }).count()).toBe(0);
		expect(await card("Add to the invoice").count()).toBe(0);
	});

	test("its PDF downloads", async () => {
		const { page } = app;
		const link = page.getByRole("link", { name: "Download PDF" });
		expect(await link.getAttribute("href")).toBe(`/invoices/${number}/pdf`);
		const response = await page
			.context()
			.request.get(new URL(`/invoices/${number}/pdf`, baseURL).href);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("application/pdf");
		expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
	});

	test("marking it paid shows it paid, final, on its orders' cards too", async () => {
		await confirm("Mark paid");
		await app.toast("Invoice marked paid");
		await expect.poll(badges).toEqual(["Paid"]);
		expect(await app.page.getByRole("button", { name: "Void" }).count()).toBe(0);
		await app.go(`/orders/${first}`);
		expect(await card("Invoice").innerText()).toContain(`Invoiced on ${number}`);
		expect(await card("Invoice").locator('[data-slot="badge"]').allInnerTexts()).toEqual(["Paid"]);
	});

	test("its activity card has what was done to it, latest first", async () => {
		await app.go(`/invoices/${number}`);
		const log = card("Activity").getByRole("list", { name: "Activity log", exact: true });
		await log.waitFor();
		const shown = await log.locator(":scope > li").allInnerTexts();
		expect(shown[0]).toMatch(
			new RegExp(`^${userNames.admin} recorded the payment of invoice ${number}`),
		);
		expect(shown[1]).toMatch(
			new RegExp(`^${userNames.admin} issued invoice ${number}\\s+due: — →`),
		);
	});

	test("a voided invoice shows on its orders' cards, which aren't invoiced", async () => {
		const [order] = await billableOrders(other.id);
		await app.go(`/invoices/new?customer=${other.code}`);
		await expect.poll(() => values(orderBoxes(), true)).toContain(String(order.id));
		const voided = await createDraft(north.id);
		await confirm("Void");
		await app.toast("Invoice voided");
		await expect.poll(badges).toEqual(["Void"]);

		await app.go(`/orders/${order.number}`);
		const text = await card("Invoice").innerText();
		expect(text).toContain("Not invoiced yet");
		expect(text).toContain(`Voided: ${voided}`);
	});

	test("an invoiced order can't be edited or deleted", async () => {
		const { page } = app;
		await app.go(`/orders/${first}`);
		expect(await page.getByRole("link", { name: "Edit" }).count()).toBe(0);
		expect(await page.getByRole("button", { name: "Delete" }).count()).toBe(0);
		await app.go(`/orders/${first}/edit`);
		await page.getByText(`${first} is invoiced`).waitFor();
		expect(await page.getByRole("button", { name: "Save order" }).count()).toBe(0);
	});
});

describe("in South", () => {
	/** A seeded South draft with orders on it. */
	let southDraft: { id: number; number: string };

	beforeAll(async () => {
		[southDraft] = await rows<typeof southDraft>(
			`select i.id, i.number from invoice i where i.organization_id = ? and i.status = 'draft'
			 and exists (select 1 from invoice_line l where l.invoice_id = i.id and l.order_id is not null)
			 order by i.id limit 1`,
			[south.id],
		);
	});

	test("the invoicing settings save", async () => {
		const { page } = app;
		await app.switchOrganization(south.name);
		const stored = () =>
			value<number>(`select payment_term_days from invoicing_settings where organization_id = ?`, [
				south.id,
			]);
		const save = async (days: string) => {
			await app.go("/invoices/settings");
			await page.getByLabel("Payment term (days)").fill(days);
			await page.getByRole("button", { name: "Save settings" }).click();
			await page.waitForURL((url) => url.pathname === "/invoices");
			await quiet(page);
		};
		// The organization's settings link to them.
		await app.go("/settings");
		await page.locator('[data-module="invoices"]').getByRole("link", { name: "Set up" }).click();
		await page.waitForURL((url) => url.pathname === "/invoices/settings");
		const before = await stored();
		await save("14");
		expect(await stored()).toBe(14);
		// As it was, for the rest.
		await save(String(before));
	});

	test("North's invoices are 404s", async () => {
		expect((await app.go(`/invoices/${northDraft.number}`))?.status()).toBe(404);
	});

	test("issuing North's draft by its id is refused", async () => {
		const { page } = app;
		const [northBefore, ownBefore] = [await snapshot(northDraft.id), await snapshot(southDraft.id)];
		await app.go(`/invoices/${southDraft.number}`);
		await page.locator("main").getByRole("button", { name: "Issue", exact: true }).first().click();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id"]')!.value =
					String(id);
			}, northDraft.id);
			return app.submit(dialog.getByRole("button", { name: "Issue" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(await snapshot(northDraft.id)).toEqual(northBefore);
		expect(await snapshot(southDraft.id)).toEqual(ownBefore);
		await page.keyboard.press("Escape");
	});

	describe("with the module switched off", () => {
		/** An order on South's draft. */
		let order: { number: string };
		// By its name alone: the partner programme's row says it requires invoicing.
		const row = () =>
			app.page.locator("div.rounded-lg.border", {
				has: app.page.getByText("Invoicing", { exact: true }),
			});

		// Split in steps, each with a test's time: the last one, which switches the module back on for
		// the tests after it (which share the database), has to run even if one before ran out of time.
		// The PDFs', other pages' and the module's queries' 404s are the module route guard's,
		// `moduleRemote`'s and the PDF routes' (`route-guard.spec.ts`, `module-gate.spec.ts`,
		// `invoices.spec.ts`).
		test("its pages are 404s", async () => {
			[order] = await rows<{ number: string }>(
				`select o.number from "order" o join invoice_line l on l.order_id = o.id
				 where l.invoice_id = ? limit 1`,
				[southDraft.id],
			);
			await app.go("/settings");
			await row().getByRole("button", { name: "Disable" }).click();
			await row().getByText("Disabled").waitFor();
			expect(await sidebar()).not.toContain("Invoicing");
			expect((await app.go(`/invoices/${southDraft.number}`))?.status()).toBe(404);
		});

		test("and nothing of it shows on the core's pages", async () => {
			await app.go(`/orders/${order.number}`);
			expect(await card("Invoice").count()).toBe(0);
			await app.go("/");
			expect(await card("Receivables").count()).toBe(0);
			expect(await card("Overdue invoices").count()).toBe(0);
		});

		test("switched on again, it shows again", async () => {
			await app.go("/settings");
			await row().getByRole("button", { name: "Enable" }).click();
			await row()
				.getByText(/Enabled since/)
				.waitFor();
			expect(await sidebar()).toContain("Invoicing");
			await app.go(`/orders/${order.number}`);
			expect(await card("Invoice").innerText()).toContain(`On draft invoice ${southDraft.number}`);
		});
	});
});
