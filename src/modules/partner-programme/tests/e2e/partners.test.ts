import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, runDailyJobs, useApp, users, value } from "#e2e/app.ts";
import { formatCents } from "#lib/i18n/index.ts";
import { formatEuros } from "#modules/partner-programme/display.ts";

import {
	closedYears,
	figuresFromDatabase,
	lastYear,
	logged,
	nonPartnerOf,
	partnersOf,
	rulesOf,
	thisYear,
	today,
	walletOf,
} from "./helpers.ts";

const { north, shltr } = organizations;
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
			formatEuros(figures.partnerRevenue),
		);
		expect(await card().locator("[data-bonus-revenue]").innerText()).toBe(
			formatEuros(figures.bonusRevenue.cash),
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
		const [account] = await rows<{ accepted_on: string; accepted_by: string }>(
			`select accepted_on, accepted_by from partner_account where customer_id = ?`,
			[customer.id],
		);
		const admin = await value<string>(`select id from user where email = ?`, [users.admin]);
		expect(account).toEqual({ accepted_on: today.toString(), accepted_by: admin });
		await card().getByText(`Partner bonus ${thisYear}`).waitFor();
		expect(await logged(north.id, "partner", "accepted")).toBe(1);
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
		expect(await logged(north.id, "partner_classification")).toBe(1);

		// Back to the defaults: no classification of its own.
		await app.go(`/orders/${order.number}/edit`);
		await part.getByLabel("Revenue category").selectOption({ index: 0 });
		await part.getByLabel("Counts for the bonus").selectOption({ index: 0 });
		await app.submit(page.getByRole("button", { name: "Save order" }));
		await page.waitForURL((url) => url.pathname === `/orders/${order.number}`);
		expect(await classified()).toEqual([]);
	});

	test("only a manager may change the rules, close a year or accept a partner", async () => {
		const { page } = app;
		/** A form on the page as a browser without JavaScript would submit it. */
		const formOf = (form: ReturnType<typeof page.locator>) =>
			form.evaluate((element: HTMLFormElement) => ({
				action: element.action,
				fields: [...new FormData(element)].map(([name, value]) => [name, value as string]),
			}));
		const post = (form: { action: string; fields: string[][] }) =>
			app.expectingErrors(() =>
				page.evaluate(async ({ action, fields }) => {
					const body = new URLSearchParams(fields);
					const response = await fetch(action, {
						method: "POST",
						body,
						headers: { accept: "text/html" },
					});
					return response.status;
				}, form),
			);

		await app.go(`/partner-programme/years/${lastYear}`);
		const rules = await formOf(page.locator("[data-rules-form]"));
		await app.go(`/partner-programme/years/${lastYear}/close`);
		await page.getByRole("button", { name: `Close ${lastYear}` }).click();
		const close = await formOf(dialog().locator("form"));
		await dialog().getByRole("button", { name: "Cancel" }).click();
		const customer = await nonPartnerOf(north.id);
		await app.go(`/customers/${customer.code}`);
		const accept = await formOf(card().locator("form"));
		const before = await rulesOf(north.id, lastYear);

		await page.context().clearCookies();
		await app.signIn(users.planner);
		// The rules to read, the partners' cards without a manager's buttons.
		await app.go(`/partner-programme/years/${lastYear}`);
		await page.getByText("Only owners and admins change the rules.").waitFor();
		expect(await page.getByRole("button", { name: "Save rules" }).count()).toBe(0);
		await app.go(`/partner-programme/years/${lastYear}/close`);
		await page.locator("[data-close-preview]").waitFor();
		expect(await page.getByRole("button", { name: `Close ${lastYear}` }).count()).toBe(0);
		const [partner] = await partnersOf(north.id);
		await app.go(`/customers/${partner.code}`);
		await card().waitFor();
		expect(await card().getByRole("button", { name: "Add to wallet" }).count()).toBe(0);
		await app.go(`/customers/${customer.code}`);
		await page.getByText(customer.name).first().waitFor();
		expect(await card().count()).toBe(0);

		expect(await post(rules)).toBe(403);
		expect(await post(close)).toBe(403);
		expect(await post(accept)).toBe(403);
		expect(await rulesOf(north.id, lastYear)).toEqual(before);
		expect(await closedYears(north.id, lastYear)).toEqual([]);
		expect(await nonPartnerOf(north.id)).toEqual(customer);

		await page.context().clearCookies();
		await app.signIn(users.admin);
	});

	test("edits a year's rules", async () => {
		const { page } = app;
		await app.go(`/partner-programme/years/${lastYear}`);
		const form = page.locator("[data-rules-form]");
		// The first level from € 100 on, at 2.75 % cash.
		await form.getByLabel("Partner revenue from", { exact: true }).first().fill("100");
		await form.getByLabel("Cash bonus", { exact: true }).first().fill("2.75");
		await form
			.getByLabel("Tenders / net-net for the cash bonus")
			.selectOption({ label: "By agreement" });
		await app.submit(form.getByRole("button", { name: "Save rules" }));
		await app.toast(`The rules of ${lastYear} are saved`);
		const rules = await rulesOf(north.id, lastYear);
		expect(rules.tiers[0]).toMatchObject({ threshold: 10_000, cashRate: 275 });
		expect(rules.categories.find((rule) => rule.category === "tenders")?.cash).toBe("by_agreement");
		expect(await logged(north.id, "partner_programme_year", "updated")).toBe(1);
		// This year's are as they were.
		expect((await rulesOf(north.id, thisYear)).tiers[0].threshold).toBe(100_000);
	});

	test("closes last year after a preview, and records a partner's choice of credit", async () => {
		const { page } = app;
		const partners = (await partnersOf(north.id)).filter(
			(partner) => partner.accepted_on <= `${lastYear}-12-31`,
		);
		await app.go(`/partner-programme/years/${lastYear}/close`);
		const preview = page.locator("[data-close-preview]");
		await expect.poll(() => preview.locator("tbody tr").count()).toBe(partners.length);
		const expected = await figuresFromDatabase(north.id, partners[0].id, lastYear);
		expect(await preview.locator(`[data-partner="${partners[0].code}"]`).innerText()).toContain(
			formatEuros(expected.partnerRevenue),
		);

		await page.getByRole("button", { name: `Close ${lastYear}` }).click();
		await app.submit(dialog().getByRole("button", { name: `Close ${lastYear}` }));
		await app.toast(`${lastYear} is closed`);
		const closed = await closedYears(north.id, lastYear);
		expect(closed.map((row) => row.customer_id).toSorted((a, b) => a - b)).toEqual(
			partners.map((partner) => partner.id).toSorted((a, b) => a - b),
		);
		const first = closed.find((row) => row.customer_id === partners[0].id)!;
		expect(first.partner_revenue).toBe(expected.partnerRevenue);
		expect(first.credit_amount).toBe(expected.bonus.credit);
		expect(await logged(north.id, "partner_bonus_year", "finalised")).toBe(partners.length);

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

describe("the daily job", () => {
	test("expires credit past its date, once", async () => {
		const [vermeer] = await rows<{ id: number }>(
			`select id from customer where organization_id = ? and name = 'Vermeer Logistiek'`,
			[shltr.id],
		);
		const first = await runDailyJobs();
		expect(first.status).toBe(200);
		// The credit of the year before last that wasn't spent (another file may have run the job).
		const expiries = (await walletOf(vermeer.id)).filter((entry) => entry.kind === "expiry");
		expect(expiries).toMatchObject([{ amount: -40_000, valid_until: `${lastYear}-12-31` }]);
		const again = await runDailyJobs();
		expect(again.reports[shltr.id]?.["partner-programme.expired"]).toBeUndefined();
		expect((await walletOf(vermeer.id)).filter((entry) => entry.kind === "expiry")).toHaveLength(1);
		// North has nothing past its date.
		expect(again.reports[north.id]?.["partner-programme.expired"]).toBeUndefined();
	});
});
