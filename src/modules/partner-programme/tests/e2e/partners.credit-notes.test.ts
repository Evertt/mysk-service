import { describe, expect, test } from "vite-plus/test";

import { fixture, organizations, quiet, rows, useApp, users, value } from "#e2e/app.ts";
import { formatCents } from "#lib/i18n/index.ts";
import { formatEuros } from "#modules/partner-programme/display.ts";
import { creditValidUntil, figuresFrom } from "#modules/partner-programme/model.ts";

import {
	figuresFromDatabase,
	lastYear,
	nonPartnerOf,
	partnersOf,
	rulesOf,
	thisYear,
	today,
} from "./helpers.ts";

const { north, shltr } = organizations;
const app = useApp();

/**
 * A partner of this file's own in SHLTR, whose last year is closed with its choice still to make:
 * a customer that wasn't one, made a partner early last year, closed at BRONZE (Pakhuis 7's
 * figures as seeded; Pakhuis 7 itself is the portal's, whose contact chooses for it). Written
 * as a fixture: the app accepts a partner only as of today, and closes a year only for the
 * partners it had by its end.
 */
async function waitingPartner() {
	const customer = await nonPartnerOf(shltr.id);
	const rules = await rulesOf(shltr.id, lastYear);
	const figures = figuresFrom(rules.tiers, 6_410_000, { cash: 5_250_000, credit: 5_250_000 });
	expect(figures.level).not.toBeNull();
	await fixture(
		`insert into partner_account (organization_id, customer_id, accepted_on) values (?, ?, ?)`,
		[shltr.id, customer.id, `${lastYear}-02-20`],
	);
	await fixture(
		`insert into partner_bonus_year (organization_id, customer_id, year, status, partner_revenue,
		 bonus_revenue_cash, bonus_revenue_credit, level, cash_rate, credit_rate, cash_amount,
		 credit_amount, credit_valid_until, finalised_at)
		 values (?, ?, ?, 'finalised', ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
		[
			shltr.id,
			customer.id,
			lastYear,
			figures.partnerRevenue,
			figures.bonusRevenue.cash,
			figures.bonusRevenue.credit,
			figures.level!.level,
			figures.level!.cashRate,
			figures.level!.creditRate,
			figures.bonus.cash,
			figures.bonus.credit,
			creditValidUntil(lastYear, rules.creditValidYears).toString(),
		],
	);
	return customer;
}

/** The partner programme's card on a customer's page. */
const card = () => app.page.locator("[data-partner-card]");
const dialog = () => app.page.getByRole("alertdialog");

/** Opens the confirmation of an action on a credit note's page and confirms it. */
async function confirm(action: string) {
	const { page } = app;
	await page.locator("main").getByRole("button", { name: action, exact: true }).first().click();
	await dialog().waitFor();
	await app.submit(dialog().getByRole("button", { name: action }));
	await dialog().waitFor({ state: "detached" });
}

describe("in North, a credit note on a partner's paid invoice", () => {
	test("is taken off its Partner Omzet once it's settled", async () => {
		const { page } = app;
		const [partner] = await partnersOf(north.id);
		const [line] = await rows<{ id: number; number: string }>(
			`select l.id, i.number from invoice_line l join invoice i on i.id = l.invoice_id
			 left join partner_order_classification c on c.order_id = l.order_id
			 where i.organization_id = ? and i.customer_id = ? and i.status = 'paid'
			 and l.order_id is not null and l.amount >= 10000
			 and (c.eligibility is null or c.eligibility != 'excluded')
			 order by i.id desc limit 1`,
			[north.id, partner.id],
		);
		const before = await figuresFromDatabase(north.id, partner.id, thisYear);
		expect(before.partnerRevenue).toBeGreaterThanOrEqual(5000);

		await app.go(`/invoices/${line.number}/credit`);
		const rowsShown = page.locator("[data-credit-lines] tbody tr");
		await rowsShown.first().waitFor();
		for (const row of await rowsShown.all()) {
			const box = row.locator('input[type="checkbox"]');
			if (Number(await row.getAttribute("data-line")) === line.id) {
				await row.getByRole("spinbutton").fill("50");
			} else {
				await box.uncheck();
			}
		}
		await page.getByLabel("Reason").fill("Returned part");
		await page.getByRole("button", { name: "Create draft" }).click();
		await page.waitForURL((url) => url.pathname.startsWith("/invoices/credit-notes/CN-"));
		await quiet(page);
		await confirm("Issue");
		// Not while it's only sent: the revenue counts what's settled.
		expect((await figuresFromDatabase(north.id, partner.id, thisYear)).partnerRevenue).toBe(
			before.partnerRevenue,
		);
		await confirm("Mark settled");

		const after = await figuresFromDatabase(north.id, partner.id, thisYear);
		expect(after.partnerRevenue).toBe(before.partnerRevenue - 5000);
		await app.go(`/customers/${partner.code}`);
		await expect
			.poll(() => card().locator("[data-partner-revenue]").innerText())
			.toBe(formatEuros(after.partnerRevenue));
	});
});

describe("in SHLTR, a partner's cash bonus", () => {
	test("is paid out with a credit note: Weggemans Logistiek's, as seeded", async () => {
		const { page } = app;
		await page.context().clearCookies();
		await app.signIn(users.shltrOwner);
		const [weggemans] = await rows<{ code: string; number: string }>(
			`select c.code, n.number from customer c join partner_bonus_year y on y.customer_id = c.id
			 join partner_bonus_credit_note p on p.bonus_year_id = y.id
			 join credit_note n on n.id = p.credit_note_id
			 where c.organization_id = ? and c.name = 'Weggemans Logistiek'`,
			[shltr.id],
		);
		expect(weggemans.number).toMatch(/^CN-/);
		await app.go(`/customers/${weggemans.code}`);
		const year = card().locator(`[data-closed-year="${lastYear}"]`);
		await year.locator(`[data-bonus-credit-note="${weggemans.number}"]`).waitFor();
		expect(await year.getByRole("button", { name: "Create credit note" }).count()).toBe(0);
	});

	test("chosen, the office makes its credit note: a draft for the cash, linked to the year", async () => {
		const { page } = app;
		const partner = await waitingPartner();
		const closed = async () =>
			(
				await rows<{ id: number; choice: string | null; cash_amount: number }>(
					`select id, choice, cash_amount from partner_bonus_year where customer_id = ? and year = ?`,
					[partner.id, lastYear],
				)
			)[0];
		expect((await closed()).choice).toBeNull();
		expect((await closed()).cash_amount).toBeGreaterThan(0);
		const revenue = await figuresFromDatabase(shltr.id, partner.id, thisYear);

		await app.go(`/customers/${partner.code}`);
		const year = card().locator(`[data-closed-year="${lastYear}"]`);
		await year.getByRole("button", { name: /^Cash bonus/ }).click();
		await app.submit(dialog().getByRole("button", { name: "Choose Cash bonus" }));
		await app.toast("Cash bonus chosen");
		const { id, cash_amount: cash } = await closed();

		await app.submit(year.getByRole("button", { name: "Create credit note" }));
		await app.toast("Credit note made: issue it from its page");
		const [made] = await rows<{
			id: number;
			number: string;
			status: string;
			customer_id: number;
			invoice_id: number | null;
			reason: string;
		}>(
			`select n.id, n.number, n.status, n.customer_id, n.invoice_id, n.reason
			 from partner_bonus_credit_note p join credit_note n on n.id = p.credit_note_id
			 where p.bonus_year_id = ?`,
			[id],
		);
		expect(made).toMatchObject({
			status: "draft",
			customer_id: partner.id,
			invoice_id: null,
			reason: `Partner Bonus ${lastYear}`,
		});
		expect(
			await rows(`select amount, source from credit_note_line where credit_note_id = ?`, [made.id]),
		).toEqual([{ amount: -cash, source: `partner-programme:bonus:${id}` }]);
		expect(
			await value(
				`select count(*) from activity where organization_id = ? and subject_type = 'partner_bonus_year'
				 and subject_id = ? and action = 'credited'`,
				[shltr.id, String(id)],
			),
		).toBe(1);

		// The card links to it; there's no second one to make.
		const shown = year.locator(`[data-bonus-credit-note="${made.number}"]`);
		await shown.waitFor();
		expect(await shown.innerText()).toContain("draft");
		expect(await year.getByRole("button", { name: "Create credit note" }).count()).toBe(0);

		// Issued and refunded on its page.
		await shown.getByRole("link", { name: made.number }).click();
		await page.waitForURL((url) => url.pathname === `/invoices/credit-notes/${made.number}`);
		await quiet(page);
		await confirm("Issue");
		await confirm("Mark settled");
		expect(
			await rows(`select status, settled_on from credit_note where id = ?`, [made.id]),
		).toEqual([{ status: "paid", settled_on: today.toString() }]);

		// A payout isn't a return: this year's revenue is as it was.
		expect(await figuresFromDatabase(shltr.id, partner.id, thisYear)).toEqual(revenue);
		await app.go(`/customers/${partner.code}`);
		await expect
			.poll(() => year.locator(`[data-bonus-credit-note="${made.number}"]`).innerText())
			.toContain(`settled · ${formatCents(-(cash + Math.round((cash * 21) / 100)))}`);
		expect(await card().locator("[data-partner-revenue]").innerText()).toBe(
			formatEuros(revenue.partnerRevenue),
		);
	});
});
