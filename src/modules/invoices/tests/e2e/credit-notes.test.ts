/**
 * Credit notes' pages: crediting an invoice in part and in full, a standalone credit note, issuing
 * and settling them through their dialogs, what an invoice's page then shows, the list and the
 * dashboard's card. What the server decides (the lines and amounts, never more than is left, the
 * statuses, settling an invoice, what's logged, the refusals, tenant isolation, the PDF) is
 * `../unit/server/credit-notes.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { countIn, organizations, quiet, rows, useApp, value } from "#e2e/app.ts";
import { formatCents } from "#lib/i18n/index.ts";

import { cents, pageLocators, vatOf } from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { card } = pageLocators(app);
const year = new Date().getFullYear();

/** An organization's next credit note number: `CN-<this year>-<highest sequence + 1>`. */
async function nextNumber(organizationId: string) {
	const last = await value<number | null>(
		`select max(cast(substr(number, 9) as integer)) from credit_note where organization_id = ?`,
		[organizationId],
	);
	return `CN-${year}-${String((last ?? 0) + 1).padStart(4, "0")}`;
}

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

/** The invoice's total, as its page shows it. */
const shownTotal = async () =>
	cents(
		await app.page
			.locator("main table")
			.first()
			.locator("tfoot tr")
			.last()
			.locator("td")
			.nth(1)
			.innerText(),
	);

describe("in North", () => {
	/** The paid invoice credited in part, and its credit note. */
	let paid: { id: number; number: string };
	let partial: string;

	test("a paid invoice is credited in part: a draft against the line", async () => {
		const { page } = app;
		paid = await uncredited(north.id, "paid");
		await app.go(`/invoices/${paid.number}`);
		const credits = card("Credit notes");
		expect(await credits.innerText()).toContain("No credit notes yet.");
		await credits.getByRole("link", { name: "Create credit note" }).click();
		await page.waitForURL((url) => url.pathname === `/invoices/${paid.number}/credit`);

		const [line] = await rows<{ id: number; amount: number }>(
			`select id, amount from invoice_line where invoice_id = ? and amount >= 10000 order by id limit 1`,
			[paid.id],
		);
		// In one submit (that more than is left is refused is the server spec's).
		await chooseCredit(new Map([[line.id, "25.00"]]), "Returned part");
		partial = await createDraft(north.id);
		await expect.poll(badges).toEqual(["Draft"]);
		expect(await page.locator("[data-credit-reason]").innerText()).toBe("Reason: Returned part");
	});

	test("issued and settled: refunded, and the invoice's page lists it", async () => {
		// Without a reload, while a link on the page is preloaded: committing the issue's refresh
		// then left the page frozen under the preload's fork, and "Mark settled" didn't open
		// (docs/upstream-bugs/README.md, 12).
		await card("Activity").getByRole("link", { name: "View all" }).hover();
		await confirm("Issue");
		await app.toast("Credit note issued");
		await expect.poll(badges).toEqual(["Sent"]);
		expect(await card("Invoice").innerText()).toContain("to refund");

		await confirm("Mark settled");
		await app.toast("Credit note marked settled");
		await expect.poll(badges).toEqual(["Settled"]);

		// With what's credited and what's left.
		const credited = -(2500 + vatOf(2500));
		await app.go(`/invoices/${paid.number}`);
		const credits = card("Credit notes");
		await credits.locator(`[data-credit-note="${partial}"]`).waitFor();
		expect(cents(await credits.locator("[data-credited]").innerText())).toBe(credited);
		expect(cents(await credits.locator("[data-remaining]").innerText())).toBe(
			(await shownTotal()) + credited,
		);
	});

	test("a sent invoice credited in full is paid by its credit note", async () => {
		const { page } = app;
		const sent = await uncredited(north.id, "sent");
		await app.go(`/invoices/${sent.number}/credit`);
		// Everything left starts checked, at what's left: that credits it in full.
		await page.getByLabel("Reason").fill("Billed by mistake");
		await createDraft(north.id);
		await confirm("Issue");
		await app.toast("Credit note issued");
		await expect.poll(badges).toEqual(["Settled"]);

		await app.go(`/invoices/${sent.number}`);
		await expect.poll(badges).toEqual(["Paid"]);
		const credits = card("Credit notes");
		expect(cents(await credits.locator("[data-remaining]").innerText())).toBe(0);
		// Nothing's left to credit.
		expect(await credits.getByRole("link", { name: "Create credit note" }).count()).toBe(0);
		await app.go(`/invoices/${sent.number}/credit`);
		await page.getByText("Nothing to credit").waitFor();
	});

	test("a standalone credit note: typed in, more lines on its draft, issued to refund", async () => {
		const { page } = app;
		const [customer] = await rows<{ code: string }>(
			`select code from customer where organization_id = ? order by id limit 1`,
			[north.id],
		);
		await app.go(`/invoices/credit-notes/new?customer=${customer.code}`);
		await page.getByLabel("Reason", { exact: true }).fill("Goodwill after a repeat breakdown");
		await page.getByLabel("Description").fill("Goodwill");
		await page.getByLabel("Amount to credit").fill("40");
		await createDraft(north.id);

		await page.getByLabel("Description").fill("Travel costs back");
		await page.getByLabel("Quantity").fill("2");
		await page.getByLabel("Unit price").fill("10");
		await app.submit(page.getByRole("button", { name: "Add line" }));
		await app.toast("Line added");
		await page.locator("main table").first().getByText("Travel costs back").waitFor();

		await confirm("Issue");
		await app.toast("Credit note issued");
		expect(await card("Mark settled").innerText()).toContain(formatCents(6000 + vatOf(6000)));
	});

	test("the credit notes' list shows North's", async () => {
		const { page } = app;
		await app.go("/invoices");
		await page.getByRole("link", { name: "Credit notes" }).click();
		await page.waitForURL((url) => url.pathname === "/invoices/credit-notes");
		await quiet(page);
		expect(await app.rowCount()).toBe(await countIn("credit_note", north.id));
	});

	test("the dashboard owes what's left to pay, and what's to refund", async () => {
		await app.go("/");
		const receivables = card("Receivables");
		await expect.poll(() => receivables.locator("dd[data-amount]").count()).toBe(2);
		expect(await receivables.locator("[data-refunds]").innerText()).toMatch(
			/^€[\d,.]+ to refund on \d+ credit notes?$/,
		);
	});
});
