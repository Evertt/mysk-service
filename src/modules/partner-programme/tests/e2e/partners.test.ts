/**
 * The partner programme's pages in North: the partners list and the dashboard's card, a partner's
 * figures on its customer page, accepting a customer, an order's classification in the order form,
 * a year's rules and closing last year with a partner's choice of credit. What accepting, saving
 * the rules and the managers' forms store, refuse (a planner) and log is
 * `tests/unit/server/partners.spec.ts`'s; the figures, closing and the wallet `programme.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp } from "#e2e/app.ts";
import { formatCents, formatWholeEuros } from "#lib/i18n/index.ts";

import {
	closedYears,
	figuresFromDatabase,
	lastYear,
	nonPartnerOf,
	partnersOf,
	thisYear,
	walletOf,
} from "./helpers.ts";

const { north } = organizations;
const app = useApp();

/** The partner programme's card on a customer's page. */
const card = () => app.page.locator("[data-partner-card]");
const dialog = () => app.page.getByRole("alertdialog");

describe("in North, which has the module", () => {
	test("lists the partners, from the sidebar", async () => {
		const { page } = app;
		await app.go("/");
		await page
			.locator('[data-sidebar="content"]')
			.getByRole("link", { name: "Partner programme" })
			.click();
		await page.waitForURL((url) => url.pathname === "/partner-programme");
		await app.tableSettled();
		expect(await app.rowCount()).toBe((await partnersOf(north.id)).length);
		// The dashboard's card counts them too.
		await app.go("/");
		await expect
			.poll(() => page.locator("[data-partner-overview]").innerText())
			.toContain(`${(await partnersOf(north.id)).length} partners`);
	});

	test("shows a partner's figures on its customer page, as its paid invoices add up", async () => {
		const [partner] = await partnersOf(north.id);
		const figures = await figuresFromDatabase(north.id, partner.id, thisYear);
		await app.go(`/customers/${partner.code}`);
		await card().waitFor();
		expect(await card().locator("[data-partner-revenue]").innerText()).toBe(
			formatWholeEuros(figures.partnerRevenue),
		);
		expect(await card().locator("[data-bonus-revenue]").innerText()).toBe(
			formatWholeEuros(figures.bonusRevenue.cash),
		);
		expect(await card().locator("[data-expected-cash]").innerText()).toBe(
			formatCents(figures.bonus.cash),
		);
		expect(await card().locator("[data-expected-credit]").innerText()).toBe(
			formatCents(figures.bonus.credit),
		);
		if (figures.progress) {
			expect(await card().locator("[data-progress]").innerText()).toContain(
				`${figures.progress.percent}%`,
			);
		}
		await card().getByText("Not yet available · after the year closes").waitFor();
	});

	test("accepts a customer into the programme", async () => {
		const customer = await nonPartnerOf(north.id);
		await app.go(`/customers/${customer.code}`);
		await app.submit(card().getByRole("button", { name: "Accept as partner" }));
		await app.toast(`${customer.name} is a partner now.`);
		await card().getByText(`Partner bonus ${thisYear}`).waitFor();
		expect(await card().getByRole("button", { name: "Accept as partner" }).count()).toBe(0);
	});

	test("classifies an order's revenue in the order form", async () => {
		const { page } = app;
		const [order] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o join partner_account p on p.customer_id = o.customer_id
			 where o.organization_id = ? and o.status = 'scheduled' and not exists
			 (select 1 from partner_order_classification c where c.order_id = o.id) order by o.id limit 1`,
			[north.id],
		);
		await app.go(`/orders/${order.number}/edit`);
		const part = page.locator("[data-partner-classification]");
		await part.getByLabel("Revenue category").selectOption({ label: "Regular parts" });
		await part.getByLabel("Counts for the bonus").selectOption({ label: "Partly" });
		await part.getByLabel("Share that counts (%)").fill("40");
		await app.submit(page.getByRole("button", { name: "Save order" }));
		await page.waitForURL((url) => url.pathname === `/orders/${order.number}`);
		const classified = () =>
			rows(
				`select category, eligibility, share from partner_order_classification where order_id = ?`,
				[order.id],
			);
		expect(await classified()).toEqual([
			{ category: "regular_parts", eligibility: "partial", share: 40 },
		]);
		// What's logged, and that back to the defaults it has none of its own: `programme.spec.ts`'s.
	});

	test("edits a year's rules", async () => {
		const { page } = app;
		await app.go(`/partner-programme/settings/${lastYear}`);
		const form = page.locator("[data-rules-form]");
		// The first level from € 100 on, at 2.75 % cash.
		await form.getByLabel("Partner revenue from", { exact: true }).first().fill("100");
		await form.getByLabel("Cash bonus", { exact: true }).first().fill("2.75");
		await form
			.getByLabel("Tenders / net-net for the cash bonus")
			.selectOption({ label: "By agreement" });
		await app.submit(form.getByRole("button", { name: "Save rules" }));
		await app.toast(`The rules of ${lastYear} are saved`);
		// Shown as saved: the form's euros and percentages, back from cents and basis points.
		await app.go(`/partner-programme/settings/${lastYear}`);
		expect(
			await page
				.locator("[data-rules-form]")
				.getByLabel("Cash bonus", { exact: true })
				.first()
				.inputValue(),
		).toBe("2.75");
	});

	test("closes last year after a preview, and records a partner's choice of credit", async () => {
		const { page } = app;
		const partners = (await partnersOf(north.id)).filter(
			(partner) => partner.accepted_on <= `${lastYear}-12-31`,
		);
		await app.go(`/partner-programme/settings/${lastYear}/close`);
		const preview = page.locator("[data-close-preview]");
		await expect.poll(() => preview.locator("tbody tr").count()).toBe(partners.length);
		const expected = await figuresFromDatabase(north.id, partners[0].id, lastYear);
		expect(await preview.locator(`[data-partner="${partners[0].code}"]`).innerText()).toContain(
			formatWholeEuros(expected.partnerRevenue),
		);

		await page.getByRole("button", { name: `Close ${lastYear}` }).click();
		await app.submit(dialog().getByRole("button", { name: `Close ${lastYear}` }));
		await app.toast(`${lastYear} is closed`);
		const closed = await closedYears(north.id, lastYear);
		expect(closed.map((row) => row.customer_id).toSorted((a, b) => a - b)).toEqual(
			partners.map((partner) => partner.id).toSorted((a, b) => a - b),
		);

		// The partner with the most credit chooses it: it goes into its wallet.
		const best = closed.toSorted((a, b) => b.credit_amount - a.credit_amount)[0];
		expect(best.credit_amount).toBeGreaterThan(0);
		const partner = partners.find((each) => each.id === best.customer_id)!;
		await app.go(`/customers/${partner.code}`);
		const year = card().locator(`[data-closed-year="${lastYear}"]`);
		await year
			.getByRole("button", { name: `Parts credit: ${formatCents(best.credit_amount)}` })
			.click();
		await app.submit(dialog().getByRole("button", { name: "Choose Parts credit" }));
		await app.toast("Parts credit chosen");
		expect(await walletOf(partner.id)).toEqual([
			{
				kind: "award",
				amount: best.credit_amount,
				valid_until: `${thisYear}-12-31`,
				note: `Parts credit for ${lastYear}`,
			},
		]);
		await expect
			.poll(() => card().locator("[data-wallet-available]").innerText())
			.toBe(formatCents(best.credit_amount));
		await year.getByText(`Chosen: Parts credit, ${formatCents(best.credit_amount)}`).waitFor();
		expect(await year.getByRole("button", { name: /^Cash bonus/ }).count()).toBe(0);
		expect(
			(await closedYears(north.id, lastYear)).find((row) => row.customer_id === partner.id)?.choice,
		).toBe("credit");
	});
});
