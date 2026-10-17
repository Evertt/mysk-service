import { describe, expect, test } from "vite-plus/test";

import { baseURL, countIn, organizations, rows, useApp, value } from "#e2e/app.ts";

import { cents, pageLocators, today, vatOf } from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { sidebar, card } = pageLocators(app);

describe("in North", () => {
	test("the sidebar lists the module and the list shows North's invoices", async () => {
		await app.go("/invoices");
		expect(await sidebar()).toContain("Invoicing");
		expect(await app.rowCount()).toBe(await countIn("invoice", north.id));
	});

	test("the customer filter lists the customers with invoices, found by name or code", async () => {
		const { page } = app;
		const customers = await rows<{ code: string; name: string; n: number }>(
			`select c.code, c.name, count(*) as n from invoice i join customer c on c.id = i.customer_id
			 where i.organization_id = ? group by c.id order by n desc, c.code`,
			[north.id],
		);
		const [busiest] = customers;
		await app.go("/invoices");
		await app.openFilter("Customer");
		// The options come from a query of their own.
		await expect.poll(() => page.getByRole("option").count()).toBe(customers.length);
		await page.getByPlaceholder("Customer").fill(busiest.code);
		const option = page.getByRole("option", { name: new RegExp(busiest.code) });
		expect(await option.innerText()).toMatch(new RegExp(`${busiest.n}$`));
		await option.click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("customer") === busiest.code);
		await expect.poll(() => app.rowCount()).toBe(busiest.n);
		await app.go(`/invoices?customer=${busiest.code}`);
		expect(await app.rowCount()).toBe(busiest.n);
		await app.go("/invoices");
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

	test("the dashboard adds up what's outstanding and overdue, with VAT, less credit notes", async () => {
		const sent = await rows<{ id: number; subtotal: number; vat_rate: number; due_on: string }>(
			`select i.id, i.vat_rate, i.due_on, coalesce((select sum(amount) from invoice_line l
			 where l.invoice_id = i.id), 0) as subtotal from invoice i
			 where i.organization_id = ? and i.status = 'sent'`,
			[north.id],
		);
		// Their issued credit notes (the seed has one on a sent invoice), each with VAT of its own.
		const credits = await rows<{ invoice_id: number; subtotal: number; vat_rate: number }>(
			`select c.invoice_id, c.vat_rate, coalesce((select sum(amount) from credit_note_line l
			 where l.credit_note_id = c.id), 0) as subtotal from credit_note c
			 where c.organization_id = ? and c.status in ('sent', 'paid') and c.invoice_id is not null`,
			[north.id],
		);
		expect(credits.some((credit) => sent.some((i) => i.id === credit.invoice_id))).toBe(true);
		const credited = (invoice: { id: number }) =>
			credits
				.filter((credit) => credit.invoice_id === invoice.id)
				.reduce(
					(sum, credit) => sum + credit.subtotal + vatOf(credit.subtotal, credit.vat_rate),
					0,
				);
		const total = (list: typeof sent) =>
			list.reduce((sum, i) => sum + i.subtotal + vatOf(i.subtotal, i.vat_rate) + credited(i), 0);
		await app.go("/");
		// The card is the invoicing module's part of the dashboard.
		const amounts = card("Receivables").locator("dd[data-amount]");
		await expect.poll(() => amounts.count()).toBe(2);
		expect((await amounts.allInnerTexts()).map(cents)).toEqual([
			total(sent),
			total(sent.filter((i) => i.due_on < today())),
		]);
	});

	test("selected invoices are marked paid, except those that aren't sent", async () => {
		const { page } = app;
		const pick = (status: string) =>
			rows<{ id: number; number: string }>(
				`select id, number from invoice where organization_id = ? and status = ?
				 order by id desc limit 1`,
				[north.id, status],
			).then(([row]) => row);
		const [sent, draft] = [await pick("sent"), await pick("draft")];
		const before = await rows(`select * from invoice where id = ?`, [draft.id]);

		await app.go("/invoices?row=1");
		await app.loadAllRows();
		for (const { number } of [sent, draft]) {
			await page.locator("tbody tr", { hasText: number }).getByRole("checkbox").click();
		}
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });
		await bar.getByRole("button", { name: "Mark paid" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByText("Applies to 1 of the 2 selected; the others are skipped.").waitFor();
		await dialog.getByRole("button", { name: "Mark paid" }).click();

		await app.toast("1 marked paid, 1 skipped", `${draft.number} is a draft`);
		expect(
			await rows(`select status, paid_on is not null as paid from invoice where id = ?`, [sent.id]),
		).toEqual([{ status: "paid", paid: 1 }]);
		expect(await rows(`select * from invoice where id = ?`, [draft.id])).toEqual(before);
		expect(
			await value(
				`select action from activity where organization_id = ? and subject_type = 'invoice'
				 and subject_id = ? order by id desc limit 1`,
				[north.id, String(sent.id)],
			),
		).toBe("paid");
	});
});

describe("in Dutch", () => {
	test("the invoices read in Dutch", async () => {
		const { page } = app;
		// As the language menus switch it: Paraglide's cookie, read on every request.
		await page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: "nl", url: baseURL }]);
		await app.go("/invoices");
		await page.getByRole("heading", { name: "Facturen" }).waitFor();
		expect(await page.getByRole("link", { name: "Nieuwe factuur" }).count()).toBe(1);
		expect(await page.locator("thead").getByText("Vervaldatum").count()).toBe(1);
		await page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: "en", url: baseURL }]);
	});
});
