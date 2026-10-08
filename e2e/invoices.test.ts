import { beforeAll, describe, expect, test } from "vite-plus/test";

import { formatCents, formatNumber } from "../src/lib/format.ts";
import { baseURL, countIn, organizations, rows, useApp, value, userNames } from "./app.ts";

const { north, south } = organizations;
const app = useApp();
const year = new Date().getFullYear();

// --- What invoices are, as `#lib/components/invoicing/invoice.ts` defines it ------------------

/** Cents, rounded half away from zero. */
const round = (cents: number) => Math.sign(cents) * Math.round(Math.abs(cents));
/** The VAT on a subtotal: the rate in percent, rounded once on the sum. */
const vatOf = (subtotal: number, rate = 21) => round((subtotal * rate) / 100);

/** Today at midnight, in seconds like the database's timestamps. */
const today = () => {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
};
/** `days` after today at midnight, in seconds. */
const daysFromToday = (days: number) => {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).getTime() / 1000;
};

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

/** The contract that covered each order (see `e2e/contracts.test.ts`). */
const covered = `covered as (
	select o.id as order_id, k.level,
		row_number() over (partition by o.id order by k.response_hours, k.id) as n
	from "order" o join contract_equipment ce on ce.equipment_id = o.equipment_id
	join contract k on k.id = ce.contract_id and k.organization_id = o.organization_id
	where o.type != 'installation' and k.starts_on <= o.created_at and o.created_at < k.ends_on + 86400
)`;

const billableOrders = (customerId: number) =>
	rows<{ id: number; number: string }>(
		`with ${billable} select id, number from billable where customer_id = ? order by id`,
		[customerId],
	);

/** This month's fee of each of the customer's active contracts (they start on the 1st). */
async function feesDue(customerId: number) {
	const now = new Date();
	const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
	const active = await rows<{ id: number; monthly_fee: number }>(
		`select id, monthly_fee from contract where customer_id = ?
		 and starts_on <= unixepoch() and ends_on + 86400 > unixepoch() order by id`,
		[customerId],
	);
	return active.map((c) => ({ reference: `contracts:${c.id}:${month}`, fee: c.monthly_fee }));
}

const invoiceOf = (number: string, organizationId: string) =>
	rows<{
		id: number;
		status: string;
		customer_id: number;
		vat_rate: number;
		payment_term_days: number;
		issued_on: number | null;
		due_on: number | null;
		paid_on: number | null;
		voided_at: number | null;
	}>(`select * from invoice where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]).then(([row]) => row);

const linesOf = (invoiceId: number) =>
	rows<{
		id: number;
		description: string;
		quantity: number;
		unit_price: number;
		amount: number;
		order_id: number | null;
		source: string | null;
	}>(`select * from invoice_line where invoice_id = ? order by id`, [invoiceId]);

const statusesOf = async (orderIds: number[]) =>
	(
		await rows<{ status: string }>(
			`select status from "order" where id in (${orderIds.map(() => "?").join(",")})`,
			orderIds,
		)
	).map((row) => row.status);

/** The activity log's entries about a record (as subject or parent), oldest first. */
const activityAbout = (type: string, id: number, organizationId: string) =>
	rows<{
		action: string;
		user_name: string;
		subject_type: string;
		subject_label: string;
		changes: string | null;
		note: string | null;
	}>(
		`select action, user_name, subject_type, subject_label, changes, note from activity
		 where organization_id = ? and ((subject_type = ? and subject_id = ?)
		 or (parent_type = ? and parent_id = ?)) order by id`,
		[organizationId, type, String(id), type, String(id)],
	);

/** An invoice and its lines as stored, to check that a refused request changed nothing. */
const snapshot = async (id: number) => [
	await rows(`select * from invoice where id = ?`, [id]),
	await linesOf(id),
];

// --- The page ----------------------------------------------------------------------------------

const sidebar = () => app.page.locator('[data-sidebar="content"]').innerText();
/** A card on the page, by its title. */
const card = (title: string) =>
	app.page.locator('main [data-slot="card"]', {
		has: app.page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }),
	});
/** An amount as shown, e.g. `-€1,234.50`, in cents. */
const cents = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, "")) * 100);
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
	await page.waitForLoadState("networkidle");
	return expected;
}

// --- The data ----------------------------------------------------------------------------------

/** A North customer with an active contract and completed orders to bill, one of them covered. */
let customer: { id: number; code: string };
/** Another North customer with completed orders to bill. */
let other: { id: number; code: string };
/** A seeded North draft, for South to tamper with. */
let northDraft: { id: number; number: string };
/** The North invoice that was issued and paid, whose activity South mustn't see. */
let paidInvoice: number;

beforeAll(async () => {
	[customer] = await rows<typeof customer>(
		`with ${billable}, ${covered} select c.id, c.code from customer c where c.organization_id = ?
		 and exists (select 1 from contract k where k.customer_id = c.id
			and k.starts_on <= unixepoch() and k.ends_on + 86400 > unixepoch())
		 and (select count(*) from billable b where b.customer_id = c.id) >= 2
		 and exists (select 1 from billable b join covered v on v.order_id = b.id and v.n = 1
			where b.customer_id = c.id and v.level in ('standard', 'premium') and b.labor_hours > 0)
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
	let orderIds: number[];

	test("the sidebar lists the module and the list shows North's invoices", async () => {
		await app.go("/invoices");
		expect(await sidebar()).toContain("Invoicing");
		expect(await app.rowCount()).toBe(await countIn("invoice", north.id));
	});

	test("the dashboard's link lists the overdue invoices", async () => {
		const overdue = Number(
			await value(
				`select count(*) from invoice where organization_id = ? and status = 'sent' and due_on < ?`,
				[north.id, today()],
			),
		);
		expect(overdue).toBeGreaterThan(0);
		await app.go("/");
		await card("Overdue invoices").getByRole("link", { name: "View all" }).click();
		await app.page.waitForURL((url) => url.pathname === "/invoices");
		await expect.poll(() => app.rowCount()).toBe(overdue);
		const shown = await app.page
			.locator('[data-slot="data-table"] tbody [data-slot="badge"]')
			.allInnerTexts();
		expect(new Set(shown)).toEqual(new Set(["Overdue"]));
	});

	test("the dashboard adds up what's outstanding and overdue, with VAT", async () => {
		const sent = await rows<{ subtotal: number; vat_rate: number; due_on: number }>(
			`select i.vat_rate, i.due_on, coalesce((select sum(amount) from invoice_line l
			 where l.invoice_id = i.id), 0) as subtotal from invoice i
			 where i.organization_id = ? and i.status = 'sent'`,
			[north.id],
		);
		const total = (list: typeof sent) =>
			list.reduce((sum, i) => sum + i.subtotal + vatOf(i.subtotal, i.vat_rate), 0);
		await app.go("/");
		const amounts = await card("Receivables").locator("dd.text-3xl").allInnerTexts();
		expect(amounts.map(cents)).toEqual([
			total(sent),
			total(sent.filter((i) => i.due_on < today())),
		]);
	});

	test("an order that isn't invoiced offers a new invoice for its customer", async () => {
		const { page } = app;
		const [first] = await billableOrders(customer.id);
		await app.go(`/orders/${first.number}`);
		const invoice = card("Invoice");
		expect(await invoice.innerText()).toContain("Not invoiced yet");
		await invoice.getByRole("link", { name: "New invoice for this customer" }).click();
		await page.waitForURL((url) => url.pathname === "/invoices/new");
		await page.waitForLoadState("networkidle");
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

	test("creating it makes a draft with the next number, priced like the orders' pages", async () => {
		const orders = await billableOrders(customer.id);
		const fees = await feesDue(customer.id);
		number = await createDraft(north.id);
		await app.toast("Draft invoice created");
		expect(await badges()).toEqual(["Draft"]);

		const stored = await invoiceOf(number, north.id);
		expect(stored).toMatchObject({
			status: "draft",
			customer_id: customer.id,
			vat_rate: 21,
			payment_term_days: 30,
			issued_on: null,
			due_on: null,
		});
		const lines = await linesOf(stored.id);
		orderIds = orders.map((o) => o.id);
		const billed = new Set(lines.flatMap((l) => (l.order_id ? [l.order_id] : [])));
		expect([...billed].toSorted((a, b) => a - b)).toEqual(orderIds);
		// Each line's amount is its quantity times its unit price.
		for (const line of lines) expect(line.amount).toBe(round(line.quantity * line.unit_price));

		// A covered order shows what its contract includes as a line of its own.
		const discounts = lines.filter((l) => l.order_id && l.description.startsWith("Covered by"));
		expect(discounts.length).toBeGreaterThan(0);
		for (const line of discounts) expect(line.amount).toBeLessThan(0);

		// The fees, at the contracts' monthly fee.
		expect(
			lines.filter((l) => l.source).map((l) => ({ reference: l.source, fee: l.unit_price })),
		).toEqual(fees);

		const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
		expect(await shownTotals()).toEqual({
			subtotal,
			vat: vatOf(subtotal),
			total: subtotal + vatOf(subtotal),
		});

		// Each order's lines add up to the total on the order's page.
		for (const order of orders) {
			await app.go(`/orders/${order.number}`);
			const total = cents(
				await card("Materials and labour").locator("tfoot td").last().innerText(),
			);
			const billed = lines
				.filter((l) => l.order_id === order.id)
				.reduce((sum, l) => sum + l.amount, 0);
			expect(billed, order.number).toBe(total);
		}
		const text = await card("Invoice").innerText();
		expect(text).toContain(`On draft invoice ${number}`);
		expect(await card("Invoice").locator('[data-slot="badge"]').allInnerTexts()).toEqual(["Draft"]);
	});

	test("a draft takes typed-in lines, and orders can come off and go back on", async () => {
		const { page } = app;
		await app.go(`/invoices/${number}`);
		const { id } = await invoiceOf(number, north.id);

		await page.getByLabel("Description").fill("Call-out surcharge");
		await page.getByLabel("Quantity").fill("2");
		await page.getByLabel("Unit price").fill("37.50");
		await app.submit(page.getByRole("button", { name: "Add line" }));
		await app.toast("Line added");
		expect((await linesOf(id)).at(-1)).toMatchObject({
			description: "Call-out surcharge",
			quantity: 2,
			unit_price: 3750,
			amount: 7500,
			order_id: null,
			source: null,
		});

		// Removing an order takes its lines (price and discount) off; it's offered again.
		const first = (await linesOf(id))[0].order_id!;
		const row = page.locator("main table").first().locator("tbody tr").first();
		await app.submit(row.getByRole("button", { name: "Remove line" }));
		await expect
			.poll(async () => (await linesOf(id)).filter((l) => l.order_id === first).length)
			.toBe(0);
		await expect.poll(() => values(orderBoxes())).toEqual([String(first)]);

		await orderBoxes().check();
		await app.submit(page.getByRole("button", { name: "Add to invoice" }));
		await app.toast("Added to the invoice");
		expect((await linesOf(id)).some((l) => l.order_id === first)).toBe(true);
		await expect.poll(() => orderBoxes().count()).toBe(0);

		const lines = await linesOf(id);
		const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
		await expect
			.poll(() => shownTotals())
			.toEqual({
				subtotal,
				vat: vatOf(subtotal),
				total: subtotal + vatOf(subtotal),
			});
	});

	test("issuing it dates it, fixes its due date and invoices its orders", async () => {
		await confirm("Issue");
		await app.toast("Invoice issued");
		const stored = await invoiceOf(number, north.id);
		expect(stored).toMatchObject({
			status: "sent",
			issued_on: today(),
			due_on: daysFromToday(30),
			vat_rate: 21,
		});
		expect(await statusesOf(orderIds)).toEqual(orderIds.map(() => "invoiced"));
		expect(await badges()).toEqual(["Sent"]);
		expect(await app.page.getByRole("button", { name: "Remove line" }).count()).toBe(0);
		expect(await card("Add to the invoice").count()).toBe(0);
	});

	test("a sent invoice's lines can't be removed, even through a draft's form", async () => {
		const { page } = app;
		const { id } = await invoiceOf(number, north.id);
		const [line] = await linesOf(id);
		const before = await snapshot(id);
		await app.go(`/invoices/${northDraft.number}`);
		const result = await app.expectingErrors(async () => {
			await page.evaluate((lineId) => {
				const input = document.querySelector<HTMLInputElement>(
					'main table input[type="hidden"][name^="id"]',
				)!;
				input.value = String(lineId);
			}, line.id);
			return app.submit(
				page.locator("main table").first().getByRole("button", { name: "Remove line" }).first(),
			);
		});
		expect(result).toContain(`${number} has been issued`);
		expect(await snapshot(id)).toEqual(before);
	});

	test("its PDF downloads", async () => {
		const { page } = app;
		await app.go(`/invoices/${number}`);
		const link = page.getByRole("link", { name: "Download PDF" });
		expect(await link.getAttribute("href")).toBe(`/invoices/${number}/pdf`);
		const response = await page
			.context()
			.request.get(new URL(`/invoices/${number}/pdf`, baseURL).href);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("application/pdf");
		expect(response.headers()["content-disposition"]).toContain(`${number}.pdf`);
		expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
	});

	test("marking it paid records today", async () => {
		await confirm("Mark paid");
		await app.toast("Invoice marked paid");
		expect(await invoiceOf(number, north.id)).toMatchObject({ status: "paid", paid_on: today() });
		expect(await badges()).toEqual(["Paid"]);
		// Paid is final.
		expect(await app.page.getByRole("button", { name: "Void" }).count()).toBe(0);
		const [order] = await rows<{ number: string }>(`select number from "order" where id = ?`, [
			orderIds[0],
		]);
		await app.go(`/orders/${order.number}`);
		expect(await card("Invoice").innerText()).toContain(`Invoiced on ${number}`);
		expect(await card("Invoice").locator('[data-slot="badge"]').allInnerTexts()).toEqual(["Paid"]);
	});

	test("the activity log has what was done to it and its orders, on its page too", async () => {
		const { id } = await invoiceOf(number, north.id);
		paidInvoice = id;
		const entries = await activityAbout("invoice", id, north.id);
		expect(new Set(entries.map((e) => e.user_name))).toEqual(new Set([userNames.admin]));
		expect(entries.filter((e) => e.subject_type === "invoice").map((e) => e.action)).toEqual([
			"created",
			"issued",
			"paid",
		]);
		const issued = entries.find((e) => e.action === "issued")!;
		expect(Object.keys(JSON.parse(issued.changes!))).toEqual(["dueOn"]);
		// Lines added and removed, by their description, with their amount.
		expect(entries.find((e) => e.subject_label === "Call-out surcharge")).toMatchObject({
			action: "created",
			subject_type: "invoice_line",
			note: `${formatNumber(2)} × ${formatCents(3750)} = ${formatCents(7500)}`,
		});
		const lines = entries.filter((e) => e.subject_type === "invoice_line");
		expect(lines.filter((e) => e.action === "deleted").length).toBeGreaterThan(0);
		expect(lines.filter((e) => e.action === "created").length).toBeGreaterThan(1);

		// Issuing it invoiced its orders, which their logs say.
		for (const orderId of orderIds) {
			const [entry] = (await activityAbout("order", orderId, north.id)).slice(-1);
			expect(entry).toMatchObject({ action: "updated", note: `Invoice ${number}` });
			expect(JSON.parse(entry.changes!)).toEqual({ status: ["completed", "invoiced"] });
		}

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

	test("voiding a sent invoice puts its orders back to completed, to bill again", async () => {
		const { page } = app;
		const orders = await billableOrders(other.id);
		const ids = orders.map((o) => o.id);
		await app.go(`/invoices/new?customer=${other.code}`);
		await expect.poll(() => values(orderBoxes(), true)).toEqual(ids.map(String));
		const voided = await createDraft(north.id);
		await confirm("Issue");
		expect(await statusesOf(ids)).toEqual(ids.map(() => "invoiced"));

		await confirm("Void");
		await app.toast("Invoice voided");
		const stored = await invoiceOf(voided, north.id);
		expect(stored.status).toBe("void");
		expect(stored.voided_at).not.toBeNull();
		// It keeps its lines, but they no longer count.
		expect((await linesOf(stored.id)).length).toBeGreaterThan(0);
		expect(await statusesOf(ids)).toEqual(ids.map(() => "completed"));
		expect(await badges()).toEqual(["Void"]);

		await app.go(`/orders/${orders[0].number}`);
		const text = await card("Invoice").innerText();
		expect(text).toContain("Not invoiced yet");
		expect(text).toContain(`Voided: ${voided}`);
		await app.go(`/invoices/new?customer=${other.code}`);
		await expect.poll(() => values(orderBoxes(), true)).toEqual(ids.map(String));
		expect(await page.getByRole("button", { name: "Create draft" }).count()).toBe(1);
	});

	test("an invoiced order can't be edited or deleted", async () => {
		const { page } = app;
		const [order] = await rows<{ number: string }>(`select number from "order" where id = ?`, [
			orderIds[0],
		]);
		await app.go(`/orders/${order.number}`);
		expect(await page.getByRole("link", { name: "Edit" }).count()).toBe(0);
		expect(await page.getByRole("button", { name: "Delete" }).count()).toBe(0);
		await app.go(`/orders/${order.number}/edit`);
		await page.getByText(`${order.number} is invoiced`).waitFor();
		expect(await page.getByRole("button", { name: "Save order" }).count()).toBe(0);
	});

	test("an order on a draft can't be deleted", async () => {
		const { page } = app;
		const [order] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o join invoice_line l on l.order_id = o.id
			 where l.invoice_id = ? order by o.id limit 1`,
			[northDraft.id],
		);
		await app.go(`/orders/${order.number}`);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Delete" }));
		expect(await app.issues()).toContainEqual(expect.stringMatching(/such as an invoice/));
		expect(await value(`select count(*) from "order" where id = ?`, [order.id])).toBe(1);
		await page.keyboard.press("Escape");
	});
});

describe("in South, which has invoicing but no contracts", () => {
	let number: string;
	let southCustomer: { id: number; code: string };
	/** One of its orders, left off the draft to tamper with. */
	let leftOut: number;

	test("South's invoice has no contract fees", async () => {
		const { page } = app;
		await app.switchOrganization(south.name);
		[southCustomer] = await rows<typeof southCustomer>(
			`with ${billable} select c.id, c.code from customer c where c.organization_id = ?
			 and (select count(*) from billable b where b.customer_id = c.id) >= 2 order by c.id limit 1`,
			[south.id],
		);
		const orders = await billableOrders(southCustomer.id);
		await app.go(`/invoices/new?customer=${southCustomer.code}`);
		await expect.poll(() => values(orderBoxes(), true)).toEqual(orders.map((o) => String(o.id)));
		expect(await itemBoxes().count()).toBe(0);

		leftOut = orders.at(-1)!.id;
		await orderBoxes()
			.and(page.locator(`[value="${leftOut}"]`))
			.uncheck();
		number = await createDraft(south.id);
		const { id } = await invoiceOf(number, south.id);
		const lines = await linesOf(id);
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.filter((l) => l.source !== null)).toEqual([]);
		expect(lines.some((l) => l.order_id === leftOut)).toBe(false);
	});

	test("changing the invoicing settings logs the change", async () => {
		const { page } = app;
		const save = async (days: string) => {
			await app.go("/invoices/settings");
			await page.getByLabel("Payment term (days)").fill(days);
			await page.getByRole("button", { name: "Save settings" }).click();
			await page.waitForURL((url) => url.pathname === "/invoices");
			await page.waitForLoadState("networkidle");
		};
		const before = await value<number>(
			`select payment_term_days from invoicing_settings where organization_id = ?`,
			[south.id],
		);
		await save("14");
		const [entry] = await rows<{ action: string; subject_label: string; changes: string }>(
			`select action, subject_label, changes from activity where organization_id = ?
			 and subject_type = 'invoicing_settings' order by id desc limit 1`,
			[south.id],
		);
		expect(entry).toMatchObject({ action: "updated", subject_label: "" });
		expect(JSON.parse(entry.changes)).toEqual({ paymentTermDays: [before, 14] });

		await app.go("/activity?type=invoicing_settings");
		const feed = page.getByRole("list", { name: "Activity log", exact: true });
		await feed.waitFor();
		expect((await feed.locator(":scope > li").first().innerText()).replace(/\s+/g, " ")).toMatch(
			new RegExp(
				`^${userNames.admin} updated invoicing settings payment term: ${before} days → 14 days`,
			),
		);
		expect(
			await feed.getByRole("link", { name: "invoicing settings" }).first().getAttribute("href"),
		).toBe("/invoices/settings");
		// As it was, for the rest.
		await save(String(before));
	});

	test("a North customer is refused", async () => {
		const { page } = app;
		const before = await countIn("invoice", south.id);
		await app.go(`/invoices/new?customer=${southCustomer.code}`);
		await orderBoxes().first().waitFor();
		const select = 'select[name^="customerId"]';
		await page.evaluate(
			({ select, customerId }) =>
				document
					.querySelector<HTMLSelectElement>(select)!
					.add(new Option("North customer", customerId)),
			{ select, customerId: String(customer.id) },
		);
		// Separately: Svelte puts the select back on its value when its options change.
		await page.evaluate(
			({ select, customerId }) =>
				(document.querySelector<HTMLSelectElement>(select)!.value = customerId),
			{ select, customerId: String(customer.id) },
		);
		await app.submit(page.getByRole("button", { name: "Create draft" }));
		expect(await app.issues()).toContainEqual(expect.stringMatching(/Unknown customer/));
		expect(await countIn("invoice", south.id)).toBe(before);
	});

	test("North's invoices are 404s, their PDFs too", async () => {
		const { page } = app;
		expect(await invoiceOf(northDraft.number, south.id)).toBeUndefined();
		expect((await app.go(`/invoices/${northDraft.number}`))?.status()).toBe(404);
		const response = await page
			.context()
			.request.get(new URL(`/invoices/${northDraft.number}/pdf`, baseURL).href);
		expect(response.status()).toBe(404);
		expect(response.headers()["content-type"]).not.toBe("application/pdf");

		// Nor is their activity, by their id.
		await app.go(`/activity?type=invoice&id=${paidInvoice}`);
		expect(await page.getByText("No activity").count()).toBe(1);
	});

	test("a North order can't be added to South's draft", async () => {
		const { page } = app;
		const [northOrder] = await rows<{ id: number }>(
			`with ${billable} select id from billable where organization_id = ? order by id limit 1`,
			[north.id],
		);
		const { id } = await invoiceOf(number, south.id);
		const before = await snapshot(id);
		await app.go(`/invoices/${number}`);
		const box = orderBoxes().and(page.locator(`[value="${leftOut}"]`));
		await box.check();
		await box.evaluate(
			(input, value) => ((input as HTMLInputElement).value = value),
			String(northOrder.id),
		);
		await app.submit(page.getByRole("button", { name: "Add to invoice" }));
		expect(await app.issues()).toContainEqual(
			expect.stringMatching(/completed orders that aren't billed/),
		);
		expect(await snapshot(id)).toEqual(before);
		expect(
			await value(`select count(*) from invoice_line where order_id = ?`, [northOrder.id]),
		).toBe(0);
	});

	for (const action of ["Issue", "Void"]) {
		test(`${action === "Issue" ? "issuing" : "voiding"} North's draft by its id is refused`, async () => {
			const { page } = app;
			const [northBefore, ownBefore] = [
				await snapshot(northDraft.id),
				await snapshot((await invoiceOf(number, south.id)).id),
			];
			await app.go(`/invoices/${number}`);
			await page.locator("main").getByRole("button", { name: action, exact: true }).first().click();
			const dialog = page.getByRole("alertdialog");
			await dialog.waitFor();
			const result = await app.expectingErrors(async () => {
				await page.evaluate((id) => {
					document.querySelector<HTMLInputElement>(
						'[role="alertdialog"] input[name^="id"]',
					)!.value = String(id);
				}, northDraft.id);
				return app.submit(dialog.getByRole("button", { name: action }));
			});
			expect(result).toMatch(/"status":404/);
			expect(await snapshot(northDraft.id)).toEqual(northBefore);
			expect(await snapshot((await invoiceOf(number, south.id)).id)).toEqual(ownBefore);
			await page.keyboard.press("Escape");
		});
	}

	test("with the module switched off, its pages are 404s and nothing of it shows", async () => {
		const { page } = app;
		const [order] = await rows<{ number: string }>(
			`select o.number from "order" o join invoice_line l on l.order_id = o.id
			 join invoice i on i.id = l.invoice_id where i.number = ? and i.organization_id = ? limit 1`,
			[number, south.id],
		);
		await app.go(`/orders/${order.number}`);
		expect(await card("Invoice").innerText()).toContain(`On draft invoice ${number}`);
		// Opened client-side, the invoice's page loads its Activity card through a remote query.
		const queries: string[] = [];
		const record = (request: { url(): string }) => {
			if (request.url().includes("/getSubjectActivity")) queries.push(request.url());
		};
		page.on("request", record);
		await card("Invoice").getByRole("link", { name: number }).click();
		await page.waitForURL((url) => url.pathname === `/invoices/${number}`);
		await card("Activity").getByRole("list", { name: "Activity log", exact: true }).waitFor();
		page.off("request", record);
		expect(queries.length).toBeGreaterThan(0);

		await app.go("/settings");
		const row = page.locator("div.rounded-lg.border", { hasText: "Invoicing" });
		await row.getByRole("button", { name: "Disable" }).click();
		await row.getByText("Disabled").waitFor();
		expect(await sidebar()).not.toContain("Invoicing");

		for (const path of [
			"/invoices",
			"/invoices/new",
			"/invoices/settings",
			`/invoices/${number}`,
		]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
		const pdf = await page.context().request.get(new URL(`/invoices/${number}/pdf`, baseURL).href);
		expect(pdf.status()).toBe(404);
		// The invoice's activity too.
		for (const url of queries) {
			const response = await page.context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
			expect(body).not.toContain(number);
		}
		await app.go(`/orders/${order.number}`);
		expect(await card("Invoice").count()).toBe(0);
		await app.go("/");
		expect(await card("Receivables").count()).toBe(0);
		expect(await card("Overdue invoices").count()).toBe(0);

		await app.go("/settings");
		await row.getByRole("button", { name: "Enable" }).click();
		await row.getByText(/Enabled since/).waitFor();
		expect(await sidebar()).toContain("Invoicing");
		await app.go(`/orders/${order.number}`);
		expect(await card("Invoice").innerText()).toContain(`On draft invoice ${number}`);
	});
});
