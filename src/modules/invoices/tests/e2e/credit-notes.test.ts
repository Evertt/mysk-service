import { describe, expect, test } from "vite-plus/test";

import {
	baseURL,
	countIn,
	isRemote,
	organizations,
	quiet,
	rows,
	useApp,
	userNames,
	value,
} from "#e2e/app.ts";
import { formatCents } from "#lib/i18n/index.ts";

import { cents, pageLocators, today, vatOf } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { sidebar, card } = pageLocators(app);
const year = new Date().getFullYear();

// --- The records -------------------------------------------------------------------------------

/** An organization's next credit note number: `CN-<this year>-<highest sequence + 1>`. */
async function nextNumber(organizationId: string) {
	const last = await value<number | null>(
		`select max(cast(substr(number, 9) as integer)) from credit_note where organization_id = ?`,
		[organizationId],
	);
	return `CN-${year}-${String((last ?? 0) + 1).padStart(4, "0")}`;
}

const creditOf = (number: string, organizationId: string) =>
	rows<{
		id: number;
		status: string;
		customer_id: number;
		invoice_id: number | null;
		vat_rate: number;
		reason: string;
		issued_on: string | null;
		settled_on: string | null;
	}>(`select * from credit_note where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]).then(([row]) => row);

const creditLinesOf = (creditNoteId: number) =>
	rows<{
		id: number;
		description: string;
		quantity: number;
		unit_price: number;
		amount: number;
		invoice_line_id: number | null;
		order_id: number | null;
	}>(`select * from credit_note_line where credit_note_id = ? order by id`, [creditNoteId]);

const invoiceOf = (number: string, organizationId: string) =>
	rows<{ id: number; status: string; vat_rate: number; paid_on: string | null }>(
		`select id, status, vat_rate, paid_on from invoice where number = ? and organization_id = ?`,
		[number, organizationId],
	).then(([row]) => row);

const invoiceLinesOf = (invoiceId: number) =>
	rows<{ id: number; description: string; amount: number; order_id: number | null }>(
		`select id, description, amount, order_id from invoice_line where invoice_id = ? order by id`,
		[invoiceId],
	);

/** One of the tenant's invoices of `status` with no credit notes, and a line worth € 100 or more. */
const uncredited = (organizationId: string, status: string) =>
	rows<{ id: number; number: string }>(
		`select i.id, i.number from invoice i where i.organization_id = ? and i.status = ?
		 and not exists (select 1 from credit_note c where c.invoice_id = i.id)
		 and exists (select 1 from invoice_line l where l.invoice_id = i.id and l.amount >= 10000)
		 and not exists (select 1 from invoice_line l where l.invoice_id = i.id and l.amount < 0)
		 order by i.id desc limit 1`,
		[organizationId, status],
	).then(([row]) => row);

/** A credit note's totals as stored: its lines' sum, and with VAT at its rate. */
async function totalOf(creditNoteId: number) {
	const [row] = await rows<{ subtotal: number; vat_rate: number }>(
		`select coalesce(sum(l.amount), 0) as subtotal, c.vat_rate from credit_note c
		 left join credit_note_line l on l.credit_note_id = c.id where c.id = ?`,
		[creditNoteId],
	);
	return row.subtotal + vatOf(row.subtotal, row.vat_rate);
}

/** The activity log's entries about a record (as subject or parent), oldest first. */
const activityAbout = (type: string, id: number, organizationId: string) =>
	rows<{ action: string; user_name: string; subject_type: string; note: string | null }>(
		`select action, user_name, subject_type, note from activity
		 where organization_id = ? and ((subject_type = ? and subject_id = ?)
		 or (parent_type = ? and parent_id = ?)) order by id`,
		[organizationId, type, String(id), type, String(id)],
	);

/** A credit note and its lines as stored, to check that a refused request changed nothing. */
const snapshot = async (id: number) => [
	await rows(`select * from credit_note where id = ?`, [id]),
	await creditLinesOf(id),
];

// --- The page ----------------------------------------------------------------------------------

const badges = () => app.page.locator('h1 ~ [data-slot="badge"]').allInnerTexts();

/** Opens the confirmation of an action on the page and confirms it. */
async function confirm(action: string) {
	const { page } = app;
	await page.locator("main").getByRole("button", { name: action, exact: true }).first().click();
	const dialog = page.getByRole("alertdialog");
	await dialog.waitFor();
	const result = await app.submit(dialog.getByRole("button", { name: action }));
	await dialog.waitFor({ state: "detached" });
	return result;
}

/** On an invoice's credit page: credits only `amounts` (euros, by line id), for `reason`. */
async function chooseCredit(amounts: Map<number, string>, reason: string) {
	const { page } = app;
	const lines = page.locator("[data-credit-lines] tbody tr");
	await lines.first().waitFor();
	for (const row of await lines.all()) {
		const id = Number(await row.getAttribute("data-line"));
		const box = row.locator('input[type="checkbox"]');
		if (amounts.has(id)) {
			await box.check();
			await row.getByRole("spinbutton").fill(amounts.get(id)!);
		} else {
			await box.uncheck();
		}
	}
	await page.getByLabel("Reason").fill(reason);
}

/** Submits a new credit note's form and waits for its draft's page. */
async function createDraft(organizationId: string) {
	const { page } = app;
	const expected = await nextNumber(organizationId);
	await page.getByRole("button", { name: "Create draft" }).click();
	await page.waitForURL((url) => url.pathname === `/invoices/credit-notes/${expected}`);
	await quiet(page);
	await app.toast("Draft credit note created");
	return expected;
}

// --- The tests ---------------------------------------------------------------------------------

describe("in North", () => {
	/** The paid invoice credited in part, and its credit note. */
	let paid: { id: number; number: string };
	let partial: string;
	/** The sent invoice credited in full. */
	let sent: { id: number; number: string };
	let standalone: string;

	test("a paid invoice is credited in part: a draft against the line, at the invoice's rate", async () => {
		const { page } = app;
		paid = await uncredited(north.id, "paid");
		await app.go(`/invoices/${paid.number}`);
		const credits = card("Credit notes");
		expect(await credits.innerText()).toContain("No credit notes yet.");
		await credits.getByRole("link", { name: "Create credit note" }).click();
		await page.waitForURL((url) => url.pathname === `/invoices/${paid.number}/credit`);

		const [line] = (await invoiceLinesOf(paid.id)).filter((each) => each.amount >= 10_000);
		// More than the line is refused, and nothing is made: by the server too, past the input's max.
		const before = await countIn("credit_note", north.id);
		await page
			.locator(`[data-line="${line.id}"]`)
			.getByRole("spinbutton")
			.evaluate((input) => input.removeAttribute("max"));
		await chooseCredit(new Map([[line.id, String(line.amount / 100 + 1)]]), "Returned part");
		await app.submit(page.getByRole("button", { name: "Create draft" }));
		expect(await app.issues()).toContainEqual(
			expect.stringContaining(`at most ${formatCents(line.amount)} is left to credit`),
		);
		expect(await countIn("credit_note", north.id)).toBe(before);

		await chooseCredit(new Map([[line.id, "25.00"]]), "Returned part");
		partial = await createDraft(north.id);
		await expect.poll(badges).toEqual(["Draft"]);
		const stored = await creditOf(partial, north.id);
		const invoice = await invoiceOf(paid.number, north.id);
		expect(stored).toMatchObject({
			status: "draft",
			invoice_id: paid.id,
			vat_rate: invoice.vat_rate,
			reason: "Returned part",
			issued_on: null,
		});
		expect(await creditLinesOf(stored.id)).toEqual([
			expect.objectContaining({
				description: line.description,
				quantity: 1,
				unit_price: -2500,
				amount: -2500,
				invoice_line_id: line.id,
				order_id: line.order_id,
			}),
		]);
		expect(await page.locator("[data-credit-reason]").innerText()).toBe("Reason: Returned part");
	});

	test("issued and settled: refunded, while the invoice stays paid", async () => {
		await confirm("Issue");
		await app.toast("Credit note issued");
		expect(await creditOf(partial, north.id)).toMatchObject({ status: "sent", issued_on: today() });
		await expect.poll(badges).toEqual(["Sent"]);
		expect(await card("Invoice").innerText()).toContain("to refund");

		await confirm("Mark settled");
		await app.toast("Credit note marked settled");
		expect(await creditOf(partial, north.id)).toMatchObject({
			status: "paid",
			settled_on: today(),
		});
		await expect.poll(badges).toEqual(["Settled"]);
		expect((await invoiceOf(paid.number, north.id)).status).toBe("paid");

		// The invoice's page lists it, with what's credited and what's left.
		const { id } = await creditOf(partial, north.id);
		const credited = await totalOf(id);
		expect(credited).toBe(-(2500 + vatOf(2500)));
		await app.go(`/invoices/${paid.number}`);
		const credits = card("Credit notes");
		await credits.locator(`[data-credit-note="${partial}"]`).waitFor();
		expect(cents(await credits.locator("[data-credited]").innerText())).toBe(credited);
		const total = cents(
			await app.page
				.locator("main table")
				.first()
				.locator("tfoot tr")
				.last()
				.locator("td")
				.nth(1)
				.innerText(),
		);
		expect(cents(await credits.locator("[data-remaining]").innerText())).toBe(total + credited);
	});

	test("the activity log has the credit note's life, on the invoice's card too", async () => {
		const { id } = await creditOf(partial, north.id);
		const entries = await activityAbout("credit_note", id, north.id);
		expect(entries.map((entry) => entry.action)).toEqual(["created", "issued", "settled"]);
		expect(new Set(entries.map((entry) => entry.user_name))).toEqual(new Set([userNames.admin]));
		const onInvoice = await activityAbout("invoice", paid.id, north.id);
		expect(
			onInvoice
				.filter((entry) => entry.subject_type === "credit_note")
				.map((entry) => entry.action),
		).toEqual(["created", "issued", "settled"]);

		await app.go(`/invoices/credit-notes/${partial}`);
		const log = card("Activity").getByRole("list", { name: "Activity log", exact: true });
		await log.waitFor();
		expect((await log.locator(":scope > li").first().innerText()).replace(/\s+/g, " ")).toMatch(
			new RegExp(`^${userNames.admin} settled credit note ${partial}`),
		);
	});

	test("its PDF downloads", async () => {
		const response = await app.page
			.context()
			.request.get(new URL(`/invoices/credit-notes/${partial}/pdf`, baseURL).href);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("application/pdf");
		expect(response.headers()["content-disposition"]).toContain(`${partial}.pdf`);
		expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
	});

	test("a sent invoice credited in full is paid by its credit note", async () => {
		const { page } = app;
		sent = await uncredited(north.id, "sent");
		await app.go(`/invoices/${sent.number}/credit`);
		// Everything left starts checked, at what's left: that credits it in full.
		await page.getByLabel("Reason").fill("Billed by mistake");
		const number = await createDraft(north.id);
		const { id } = await creditOf(number, north.id);
		// Lines of nothing have nothing to credit.
		const lines = (await invoiceLinesOf(sent.id)).filter((line) => line.amount !== 0);
		const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
		expect((await creditLinesOf(id)).map((line) => [line.invoice_line_id, line.amount])).toEqual(
			lines.map((line) => [line.id, -line.amount]),
		);
		expect(await totalOf(id)).toBe(-(subtotal + vatOf(subtotal)));

		await confirm("Issue");
		await app.toast("Credit note issued");
		expect(await creditOf(number, north.id)).toMatchObject({
			status: "paid",
			issued_on: today(),
			settled_on: today(),
		});
		expect(await invoiceOf(sent.number, north.id)).toMatchObject({
			status: "paid",
			paid_on: today(),
		});
		const logged = await activityAbout("invoice", sent.id, north.id);
		expect(logged.at(-2)).toMatchObject({
			action: "paid",
			subject_type: "invoice",
			note: `Credited in full, with ${number}`,
		});

		await app.go(`/invoices/${sent.number}`);
		await expect.poll(badges).toEqual(["Paid"]);
		const credits = card("Credit notes");
		expect(cents(await credits.locator("[data-remaining]").innerText())).toBe(0);
		// Nothing's left to credit.
		expect(await credits.getByRole("link", { name: "Create credit note" }).count()).toBe(0);
		await app.go(`/invoices/${sent.number}/credit`);
		await page.getByText("Nothing to credit").waitFor();
	});

	test("an invoice with credit notes can't be voided", async () => {
		const [credited] = await rows<{ id: number; number: string }>(
			`select i.id, i.number from invoice i join credit_note c on c.invoice_id = i.id
			 where i.organization_id = ? and i.status = 'sent' and c.status = 'sent' limit 1`,
			[north.id],
		);
		await app.go(`/invoices/${credited.number}`);
		await app.page.locator("main").getByRole("button", { name: "Void", exact: true }).click();
		const dialog = app.page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Void" }));
		await dialog.getByText(/has credit notes/).waitFor();
		await app.page.keyboard.press("Escape");
		expect((await invoiceOf(credited.number, north.id)).status).toBe("sent");
	});

	test("a standalone credit note: typed in, more lines on its draft, issued to refund", async () => {
		const { page } = app;
		const [customer] = await rows<{ id: number; code: string }>(
			`select id, code from customer where organization_id = ? order by id limit 1`,
			[north.id],
		);
		await app.go(`/invoices/credit-notes/new?customer=${customer.code}`);
		await page.getByLabel("Reason", { exact: true }).fill("Goodwill after a repeat breakdown");
		await page.getByLabel("Description").fill("Goodwill");
		await page.getByLabel("Amount to credit").fill("40");
		standalone = await createDraft(north.id);
		const { id } = await creditOf(standalone, north.id);

		await page.getByLabel("Description").fill("Travel costs back");
		await page.getByLabel("Quantity").fill("2");
		await page.getByLabel("Unit price").fill("10");
		await app.submit(page.getByRole("button", { name: "Add line" }));
		await app.toast("Line added");
		expect((await creditLinesOf(id)).map((line) => [line.description, line.amount])).toEqual([
			["Goodwill", -4000],
			["Travel costs back", -2000],
		]);
		expect(await creditOf(standalone, north.id)).toMatchObject({
			customer_id: customer.id,
			invoice_id: null,
			status: "draft",
		});

		await confirm("Issue");
		await app.toast("Credit note issued");
		expect(await creditOf(standalone, north.id)).toMatchObject({ status: "sent", vat_rate: 21 });
		expect(await card("Mark settled").innerText()).toContain(formatCents(6000 + vatOf(6000)));
	});

	test("the credit notes' list shows North's, and the invoices' list what's credited", async () => {
		const { page } = app;
		await app.go("/invoices");
		await page.getByRole("link", { name: "Credit notes" }).click();
		await page.waitForURL((url) => url.pathname === "/invoices/credit-notes");
		await quiet(page);
		expect(await app.rowCount()).toBe(await countIn("credit_note", north.id));
		await app.go(`/invoices/credit-notes?status=sent`);
		expect(await app.rowCount()).toBe(
			await value<number>(
				`select count(*) from credit_note where organization_id = ? and status = 'sent'`,
				[north.id],
			),
		);

		await app.go(`/invoices?row=1`);
		await app.loadAllRows();
		const row = page.locator("tbody tr", { hasText: paid.number });
		expect(await row.innerText()).toContain(formatCents(-(2500 + vatOf(2500))));
	});

	test("the dashboard owes what's left to pay, and what's to refund", async () => {
		/** Per sent invoice: its total, and its issued credit notes' totals. */
		const sentInvoices = await rows<{
			id: number;
			subtotal: number;
			vat_rate: number;
			due_on: string;
		}>(
			`select i.id, i.vat_rate, i.due_on, coalesce((select sum(amount) from invoice_line l
			 where l.invoice_id = i.id), 0) as subtotal from invoice i
			 where i.organization_id = ? and i.status = 'sent'`,
			[north.id],
		);
		const credits = await rows<{
			invoice_id: number | null;
			status: string;
			subtotal: number;
			vat_rate: number;
		}>(
			`select c.invoice_id, c.status, c.vat_rate, coalesce((select sum(amount) from credit_note_line l
			 where l.credit_note_id = c.id), 0) as subtotal from credit_note c
			 where c.organization_id = ? and c.status in ('sent', 'paid')`,
			[north.id],
		);
		const withVat = (subtotal: number, rate: number) => subtotal + vatOf(subtotal, rate);
		const remaining = (invoice: (typeof sentInvoices)[number]) => {
			const own = credits.filter((credit) => credit.invoice_id === invoice.id);
			const subtotal = own.reduce((sum, credit) => sum + credit.subtotal, invoice.subtotal);
			if (subtotal <= 0) return 0;
			return Math.max(
				0,
				own.reduce(
					(sum, credit) => sum + withVat(credit.subtotal, credit.vat_rate),
					withVat(invoice.subtotal, invoice.vat_rate),
				),
			);
		};
		const owed = (list: typeof sentInvoices) => list.reduce((sum, i) => sum + remaining(i), 0);
		const refunds = credits.filter(
			(credit) =>
				credit.status === "sent" &&
				!sentInvoices.some((invoice) => invoice.id === credit.invoice_id),
		);
		expect(refunds.length).toBeGreaterThan(0);

		await app.go("/");
		const receivables = card("Receivables");
		const amounts = receivables.locator("dd[data-amount]");
		await expect.poll(() => amounts.count()).toBe(2);
		expect((await amounts.allInnerTexts()).map(cents)).toEqual([
			owed(sentInvoices),
			owed(sentInvoices.filter((i) => i.due_on < today())),
		]);
		const toRefund = refunds.reduce(
			(sum, credit) => sum - withVat(credit.subtotal, credit.vat_rate),
			0,
		);
		expect(await receivables.locator("[data-refunds]").innerText()).toBe(
			`${formatCents(toRefund)} to refund on ${refunds.length} credit note${refunds.length === 1 ? "" : "s"}`,
		);
	});

	test("in Dutch, it's a creditnota", async () => {
		const { page } = app;
		await page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: "nl", url: baseURL }]);
		try {
			await app.go(`/invoices/credit-notes/${partial}`);
			await page.getByText(`Creditnota ${partial}`).first().waitFor();
			await expect.poll(badges).toEqual(["Verrekend"]);
		} finally {
			await page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: "en", url: baseURL }]);
		}
	});
});

describe("in South", () => {
	/** North's newest credit note, and a draft of North's to tamper with. */
	let northNewest: { id: number; number: string };
	let northDraft: { id: number; number: string };
	let southDraft: string;

	test("North's credit notes are 404s, their PDFs too", async () => {
		const { page } = app;
		// A draft of North's, made in North.
		await app.go(`/invoices/credit-notes/new`);
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Reason", { exact: true }).fill("North's draft");
		await page.getByLabel("Description").fill("Goodwill");
		await page.getByLabel("Amount to credit").fill("10");
		const number = await createDraft(north.id);
		northDraft = { id: (await creditOf(number, north.id)).id, number };
		[northNewest] = await rows<{ id: number; number: string }>(
			`select id, number from credit_note where organization_id = ? order by id desc limit 1`,
			[north.id],
		);
		// A number South doesn't have.
		expect(await creditOf(northNewest.number, south.id)).toBeUndefined();

		await app.switchOrganization(south.name);
		expect((await app.go(`/invoices/credit-notes/${northNewest.number}`))?.status()).toBe(404);
		const pdf = await page
			.context()
			.request.get(new URL(`/invoices/credit-notes/${northNewest.number}/pdf`, baseURL).href);
		expect(pdf.status()).toBe(404);
		await app.go(`/activity?type=credit_note&id=${northNewest.id}`);
		expect(await page.getByText("No activity").count()).toBe(1);
	});

	test("issuing or voiding North's draft by its id is refused", async () => {
		const { page } = app;
		await app.go(`/invoices/credit-notes/new`);
		await page.getByLabel("Customer").selectOption({ index: 1 });
		await page.getByLabel("Reason", { exact: true }).fill("South's draft");
		await page.getByLabel("Description").fill("Goodwill");
		await page.getByLabel("Amount to credit").fill("10");
		southDraft = await createDraft(south.id);

		for (const action of ["Issue", "Void"]) {
			// Afresh, without the other dialog.
			await app.go(`/invoices/credit-notes/${southDraft}`);
			const [northBefore, ownBefore] = [
				await snapshot(northDraft.id),
				await snapshot((await creditOf(southDraft, south.id)).id),
			];
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
			expect(result, action).toMatch(/"status":404/);
			expect(await snapshot(northDraft.id)).toEqual(northBefore);
			expect(await snapshot((await creditOf(southDraft, south.id)).id)).toEqual(ownBefore);
			await page.keyboard.press("Escape");
		}
	});

	test("a North line can't be removed from South's draft, nor a North invoice credited", async () => {
		const { page } = app;
		const [northLine] = await creditLinesOf(northDraft.id);
		const before = await snapshot(northDraft.id);
		await app.go(`/invoices/credit-notes/${southDraft}`);
		const result = await app.expectingErrors(async () => {
			await page.evaluate((lineId) => {
				document.querySelector<HTMLInputElement>(
					'main table input[type="hidden"][name^="id"]',
				)!.value = String(lineId);
			}, northLine.id);
			return app.submit(page.getByRole("button", { name: "Remove line" }).first());
		});
		expect(result).toMatch(/"status":404/);
		expect(await snapshot(northDraft.id)).toEqual(before);

		// South's paid invoice's credit page, with North's invoice's id and line.
		const southPaid = await uncredited(south.id, "paid");
		const [northInvoice] = await rows<{ id: number }>(
			`select id from invoice where organization_id = ? and status = 'paid' order by id limit 1`,
			[north.id],
		);
		const [northInvoiceLine] = await invoiceLinesOf(northInvoice.id);
		const credits = await countIn("credit_note", north.id);
		await app.go(`/invoices/${southPaid.number}/credit`);
		await page.getByLabel("Reason").fill("Tampered");
		await page.evaluate((id) => {
			document.querySelector<HTMLInputElement>('input[name^="invoiceId"]')!.value = String(id);
		}, northInvoice.id);
		const tampered = await app.expectingErrors(() =>
			app.submit(page.getByRole("button", { name: "Create draft" })),
		);
		expect(tampered).toMatch(/"status":404/);

		await app.go(`/invoices/${southPaid.number}/credit`);
		await page.getByLabel("Reason").fill("Tampered");
		await page.evaluate((id) => {
			document.querySelector<HTMLInputElement>('input[name^="lines[0].lineId"]')!.value =
				String(id);
		}, northInvoiceLine.id);
		await app.submit(page.getByRole("button", { name: "Create draft" }));
		expect(await app.issues()).toContainEqual("Only the invoice's own lines can be credited");
		expect(await countIn("credit_note", north.id)).toBe(credits);
		expect(
			await value(`select count(*) from credit_note_line where invoice_line_id = ?`, [
				northInvoiceLine.id,
			]),
		).toBe(0);
	});

	describe("with the module switched off", () => {
		/** The module's queries that the credit notes' pages made, opened client-side. */
		const queries: string[] = [];
		const row = () =>
			app.page.locator("div.rounded-lg.border", {
				has: app.page.getByText("Invoicing", { exact: true }),
			});

		test("opened client-side, the credit notes' pages load through remote queries", async () => {
			const { page } = app;
			const record = (request: { url(): string }) => {
				for (const name of ["getCreditNotes", "getCreditNote"]) {
					if (isRemote(request.url(), name)) queries.push(request.url());
				}
			};
			page.on("request", record);
			await app.go("/invoices");
			await page.getByRole("link", { name: "Credit notes" }).click();
			await page.waitForURL((url) => url.pathname === "/invoices/credit-notes");
			await page.locator("tbody tr a", { hasText: southDraft }).first().click();
			await page.waitForURL((url) => url.pathname === `/invoices/credit-notes/${southDraft}`);
			await quiet(page);
			page.off("request", record);
			expect(queries.length).toBeGreaterThanOrEqual(2);
		});

		test("its pages, PDFs and queries are 404s", async () => {
			const { page } = app;
			const southPaid = await uncredited(south.id, "paid");
			await app.go("/settings");
			await row().getByRole("button", { name: "Disable" }).click();
			await row().getByText("Disabled").waitFor();
			try {
				expect(await sidebar()).not.toContain("Invoicing");
				for (const path of [
					"/invoices/credit-notes",
					"/invoices/credit-notes/new",
					`/invoices/credit-notes/${southDraft}`,
					`/invoices/${southPaid.number}/credit`,
				]) {
					expect((await app.go(path))?.status(), path).toBe(404);
				}
				const pdf = await page
					.context()
					.request.get(new URL(`/invoices/credit-notes/${southDraft}/pdf`, baseURL).href);
				expect(pdf.status()).toBe(404);
				for (const url of queries) {
					const response = await page.context().request.get(url);
					const body = await response.text();
					expect(response.status() === 404 || /"status":404/.test(body), body).toBe(true);
					expect(body).not.toContain(southDraft);
				}
			} finally {
				await app.go("/settings");
				await row().getByRole("button", { name: "Enable" }).click();
				await row()
					.getByText(/Enabled since/)
					.waitFor();
			}
		});
	});
});
